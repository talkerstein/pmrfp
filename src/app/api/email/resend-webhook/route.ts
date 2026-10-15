import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { isServiceConfigured } from "@/lib/supabase/config";
import { suppressionFromEvent, verifySvixSignature } from "@/lib/digest/webhook";

export const dynamic = "force-dynamic";

/**
 * Resend delivery webhook → the suppression list. Hard bounces and spam
 * complaints add the address to email_suppressions (every marketing send
 * skips those) and mark a weekly-email subscriber as bounced. Signed by
 * Resend (Svix); set RESEND_WEBHOOK_SECRET (whsec_…) from the Resend
 * dashboard. Without it this endpoint does nothing.
 */
export async function POST(request: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret || !isServiceConfigured()) return NextResponse.json({ skipped: "not configured" }, { status: 503 });
  const body = await request.text();
  const ok = verifySvixSignature(
    secret,
    {
      id: request.headers.get("svix-id"),
      timestamp: request.headers.get("svix-timestamp"),
      signature: request.headers.get("svix-signature"),
    },
    body,
  );
  if (!ok) return NextResponse.json({ error: "bad signature" }, { status: 401 });

  let event: unknown;
  try {
    event = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: "bad body" }, { status: 400 });
  }
  const s = suppressionFromEvent(event);
  if (!s) return NextResponse.json({ ignored: true });

  const db = createServiceClient();
  const rows = s.emails.map((email_key) => ({ email_key, reason: s.reason, detail: s.detail }));
  const { error } = await db.from("email_suppressions").upsert(rows, { onConflict: "email_key", ignoreDuplicates: true });
  if (error) console.error("[resend-webhook] suppression failed:", error.message);
  await db
    .from("digest_subscribers")
    .update({ status: "bounced", updated_at: new Date().toISOString() })
    .in("email_key", s.emails);
  return NextResponse.json({ suppressed: s.emails.length });
}
