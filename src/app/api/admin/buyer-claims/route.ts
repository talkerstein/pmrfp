import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSession, isAdminRole } from "@/lib/access/access";
import { isServiceConfigured, isSupabaseConfigured } from "@/lib/supabase/config";
import { createServiceClient } from "@/lib/supabase/service";
import { logAudit } from "@/lib/audit";
import { decideBuyerClaim } from "@/lib/towns/claims";
import { LOCALES } from "@/i18n/config";

const decisionSchema = z.object({
  action: z.enum(["approve", "reject"]),
  id: z.string().uuid(),
  /** Also trust the claimant's email domain for this buyer (never a free mailbox). */
  trustDomain: z.boolean().optional(),
  notes: z.string().trim().max(2000).optional(),
});

/**
 * Admin: decide a public buyer's page claim (POST JSON), from
 * /admin/buyer-sources. Approving verifies the page (or, when someone
 * already manages it, turns the claim into a join request to them).
 * Admins only (not suspended), same-origin only. No email is sent.
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
  const result = await decideBuyerClaim(db, {
    claimId: d.id,
    adminId: session.userId,
    approve: d.action === "approve",
    trustDomain: Boolean(d.trustDomain),
    notes: d.notes || null,
    now: new Date().toISOString(),
  });
  if (!result.ok) {
    const status = result.reason === "not_found" ? 404 : result.reason === "not_pending" ? 409 : 500;
    return NextResponse.json({ error: result.reason }, { status });
  }
  const { data: claim } = await db.from("buyer_claims").select("buyer_key").eq("id", d.id).maybeSingle<{ buyer_key: string }>();
  if (claim?.buyer_key && result.status === "verified") for (const l of LOCALES) revalidatePath(`/${l}/buyers/${claim.buyer_key}`);
  await logAudit({
    actorUserId: session.userId,
    action: `buyer_claim.admin_${d.action}`,
    entityType: "buyer_claims",
    entityId: d.id,
    metadata: { result: result.status, trustDomain: Boolean(d.trustDomain), buyerKey: claim?.buyer_key ?? null },
  });
  return NextResponse.json({ ok: true, status: result.status });
}
