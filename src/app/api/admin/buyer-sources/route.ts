import { NextResponse } from "next/server";
import { getSession, isAdminRole } from "@/lib/access/access";
import { isServiceConfigured, isSupabaseConfigured } from "@/lib/supabase/config";
import { createServiceClient } from "@/lib/supabase/service";
import { isMissingTableError } from "@/lib/entitlement/trial";
import { logAudit } from "@/lib/audit";
import { approvalPermissionRow, decisionSchema } from "@/lib/buyers/source-requests";
import { seedRefused } from "@/lib/buyers/permissions";

interface RequestRow {
  id: string;
  organization: string;
  contact_name: string;
  work_email: string;
  province_code: string;
  feed_url: string | null;
  status: string;
}

/**
 * Admin: decide a "list your tenders free" request (POST JSON).
 *   approve → buyer_permissions: status yes + method (the registry the cron
 *             checks), request approved. Refused for a buyer the code seed
 *             logs as "no" (that's a code change, on purpose).
 *   reject  → request rejected.
 *   note    → admin notes only.
 * Admins only (not suspended), same-origin only. Nothing is imported until a
 * city source config exists for the buyer (lib/tenders/city-sources).
 */
export async function POST(request: Request) {
  if (!isSupabaseConfigured() || !isServiceConfigured()) return NextResponse.json({ error: "Not available" }, { status: 503 });
  const session = await getSession().catch(() => null);
  if (!session || !isAdminRole(session.profile.primary_role) || session.profile.status === "suspended") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const origin = request.headers.get("origin");
  if (origin && new URL(origin).host !== new URL(request.url).host) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = decisionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 422 });
  const d = parsed.data;
  const db = createServiceClient();

  const { data: req, error: readErr } = await db
    .from("buyer_source_requests")
    .select("id,organization,contact_name,work_email,province_code,feed_url,status")
    .eq("id", d.id)
    .maybeSingle<RequestRow>();
  if (readErr) {
    if (isMissingTableError(readErr)) return NextResponse.json({ error: "Run supabase/migrations/20261021000010_buyer_sources.sql first" }, { status: 503 });
    return NextResponse.json({ error: readErr.message }, { status: 500 });
  }
  if (!req) return NextResponse.json({ error: "Request not found" }, { status: 404 });

  const now = new Date().toISOString();
  if (d.action === "note") {
    const { error } = await db.from("buyer_source_requests").update({ admin_notes: d.notes || null, updated_at: now }).eq("id", d.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (d.action === "approve") {
    if (seedRefused(d.buyerSlug)) {
      return NextResponse.json(
        { error: `${d.buyerSlug} declined to be listed (logged in briefs/outreach/do-not-list.csv). If they've changed their mind in writing, update PERMISSION_SEED in src/lib/buyers/permissions.ts first.` },
        { status: 409 },
      );
    }
    const row = approvalPermissionRow(req, { buyerSlug: d.buyerSlug, method: d.method, notes: d.notes }, now.slice(0, 10), session.userId);
    const { error } = await db.from("buyer_permissions").upsert(row, { onConflict: "buyer_slug" });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const status = d.action === "approve" ? "approved" : "rejected";
  const { error } = await db
    .from("buyer_source_requests")
    .update({ status, admin_notes: d.notes || null, decided_by: session.userId, decided_at: now, updated_at: now })
    .eq("id", d.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await logAudit({
    actorUserId: session.userId,
    action: `buyer_source.${d.action}`,
    entityType: "buyer_source_requests",
    entityId: d.id,
    metadata: d.action === "approve" ? { buyerSlug: d.buyerSlug, method: d.method } : {},
  });
  return NextResponse.json({ ok: true, status });
}
