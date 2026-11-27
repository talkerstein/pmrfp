import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { isServiceConfigured } from "@/lib/supabase/config";
import { suppressionFromEvent, verifySvixSignature } from "@/lib/digest/webhook";
import { engagementFromEvent } from "@/lib/lifecycle/engagement";
import { vpsAppDatabase } from "@/lib/d1/http-binding";
import { useD1Lifecycle } from "@/lib/lifecycle/d1";
import { customerAppAuthority } from "@/lib/d1/contracts";

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
  const native = useD1Lifecycle();
  if (!secret || (!native && !isServiceConfigured())) return NextResponse.json({ skipped: "not configured" }, { status: 503 });
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
  // Opens / clicks on lifecycle emails (only sent by Resend when tracking is on).
  const eng = engagementFromEvent(event);
  if (eng) {
    if (native) {
      try {
        const write = await vpsAppDatabase().prepare(`UPDATE lifecycle_sends SET ${eng.field}=?
          WHERE resend_id=? AND ${eng.field} IS NULL AND ${customerAppAuthority}`)
          .bind(new Date().toISOString(), eng.emailId).run();
        if (!write.success) throw new Error("Email event unavailable");
        return NextResponse.json({ engagement: eng.field });
      } catch {
        return NextResponse.json({ error: "Email event unavailable" }, { status: 503 });
      }
    }
    const { error } = await createServiceClient()
      .from("lifecycle_sends")
      .update({ [eng.field]: new Date().toISOString() })
      .eq("resend_id", eng.emailId)
      .is(eng.field, null);
    if (error) console.error("[resend-webhook] engagement failed:", error.message);
    return NextResponse.json({ engagement: eng.field });
  }

  const s = suppressionFromEvent(event);
  if (!s) return NextResponse.json({ ignored: true });
  if (native) {
    try {
      const db = vpsAppDatabase();
      const emails = JSON.stringify(s.emails);
      const result = await db.batch([
        db.prepare(`INSERT INTO email_suppressions(email_key,reason,detail) SELECT value,?,? FROM json_each(?)
          WHERE ${customerAppAuthority} ON CONFLICT(email_key) DO NOTHING`).bind(s.reason, s.detail, emails),
        db.prepare(`UPDATE digest_subscribers SET status='bounced',updated_at=? WHERE email_key IN (SELECT value FROM json_each(?))
          AND status<>'bounced' AND ${customerAppAuthority}`).bind(new Date().toISOString(), emails),
      ]);
      if (result.length !== 2 || result.some(row => !row.success)) throw new Error("Email event unavailable");
      return NextResponse.json({ suppressed: s.emails.length });
    } catch {
      return NextResponse.json({ error: "Email event unavailable" }, { status: 503 });
    }
  }

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
