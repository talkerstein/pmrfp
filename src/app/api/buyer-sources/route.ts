import { NextResponse } from "next/server";
import { HONEYPOT, buyerSourceRequestSchema, toRequestRow } from "@/lib/buyers/source-requests";
import { createServiceClient } from "@/lib/supabase/service";
import { isServiceConfigured } from "@/lib/supabase/config";
import { isMissingTableError } from "@/lib/entitlement/trial";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { METHOD_WORDS, notifyAdminOfSourceRequest } from "@/lib/buyers/admin-notify";

/**
 * "List your tenders on PMRFP, free" (POST, JSON) from /for-public-buyers.
 * Same-origin only, rate-limited per IP, honeypot. Stores the request in
 * buyer_source_requests with the service role, tells admins in-app
 * (notifications → /admin/buyer-sources) and emails the admin inbox
 * (ADMIN_NOTIFICATION_EMAIL, else info@pmrfp.com; lib/buyers/admin-notify).
 * Nothing is sent to the requester.
 *
 * When the table isn't there yet (migration 20261021000010 pending) or
 * Supabase isn't configured, it answers 503 with `fallback: "email"` and the
 * form shows a mailto: info@pmrfp.com link instead.
 */
export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && new URL(origin).host !== new URL(request.url).host) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const limited = await checkRateLimit(request, "buyer-source");
  if (limited) return rateLimitResponse(limited);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  // Honeypot: accept silently, store nothing.
  if (body && typeof body === "object" && String((body as Record<string, unknown>)[HONEYPOT] ?? "").trim()) return NextResponse.json({ ok: true });

  const parsed = buyerSourceRequestSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Validation failed", issues: parsed.error.flatten() }, { status: 422 });

  if (!isServiceConfigured()) return NextResponse.json({ error: "Not available", fallback: "email" }, { status: 503 });
  const db = createServiceClient();
  const { data, error } = await db.from("buyer_source_requests").insert(toRequestRow(parsed.data)).select("id").single<{ id: string }>();
  if (error || !data) {
    if (isMissingTableError(error)) return NextResponse.json({ error: "Not available", fallback: "email" }, { status: 503 });
    console.error("[buyer-sources] insert failed:", error?.message);
    return NextResponse.json({ error: "Could not save your request", fallback: "email" }, { status: 500 });
  }
  await notifyAdmins(db, parsed.data.organization, parsed.data.method).catch((err) =>
    console.error("[buyer-sources] admin notification failed:", err instanceof Error ? err.message : err),
  );
  await notifyAdminOfSourceRequest(db, {
    organization: parsed.data.organization,
    contactName: parsed.data.contactName,
    workEmail: parsed.data.workEmail,
    tendersUrl: parsed.data.tendersUrl,
    method: parsed.data.method,
    provinceCode: parsed.data.provinceCode,
    buyerSlug: parsed.data.buyerSlug || null,
  });
  return NextResponse.json({ ok: true });
}

/** In-app notification for every active admin. */
async function notifyAdmins(db: ReturnType<typeof createServiceClient>, organization: string, method: string) {
  const { data: admins } = await db
    .from("users_profile")
    .select("id,status")
    .in("primary_role", ["admin", "super_admin"])
    .limit(50);
  const ids = ((admins ?? []) as { id: string; status: string | null }[]).filter((a) => a.status === "active").map((a) => a.id);
  if (!ids.length) return;
  await db.from("notifications").insert(
    ids.map((user_id) => ({
      user_id,
      type: "buyer_source_request",
      title: "A public buyer wants to list its tenders",
      message: `${organization.slice(0, 120)} asked to list its tenders on PMRFP (${METHOD_WORDS[method] ?? method}). Review it before anything is imported.`,
      link_url: "/admin/buyer-sources",
    })),
  );
}
