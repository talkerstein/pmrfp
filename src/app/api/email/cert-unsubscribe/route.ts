import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { isServiceConfigured } from "@/lib/supabase/config";
import { verifyCertUnsubscribe } from "@/lib/email/unsubscribe";

/**
 * Vendor Insurance Tracker opt-outs (lib/vendor-certs). GET = the link;
 * POST = the inbox's one-click button (RFC 8058).
 *   k=vendor  the vendor's address goes on the do-not-contact list
 *             (email_suppressions), which every PMRFP send checks first.
 *   k=digest  the PM stops the expiry digest
 *             (notification_preferences.cert_reminders = false).
 */
async function unsubscribe(request: Request): Promise<"vendor" | "digest" | null> {
  const url = new URL(request.url);
  const kind = url.searchParams.get("k");
  const id = url.searchParams.get("i");
  if (!verifyCertUnsubscribe(kind, id, url.searchParams.get("t")) || !id || !isServiceConfigured()) return null;
  const db = createServiceClient();
  if (kind === "digest") {
    const { error } = await db.from("notification_preferences").upsert({ user_id: id, cert_reminders: false }, { onConflict: "user_id" });
    if (error) console.error("[cert-unsubscribe] digest", error.message);
    return error ? null : "digest";
  }
  const { data } = await db.from("vendor_certificates").select("contact_email").eq("id", id).maybeSingle<{ contact_email: string | null }>();
  const key = data?.contact_email?.trim().toLowerCase();
  if (!key) return null;
  const { error } = await db
    .from("email_suppressions")
    .upsert({ email_key: key, reason: "unsubscribe", detail: "vendor certificate request" }, { onConflict: "email_key", ignoreDuplicates: true });
  if (error) console.error("[cert-unsubscribe] vendor", error.message);
  return error ? null : "vendor";
}

export async function GET(request: Request) {
  const done = await unsubscribe(request);
  const msg =
    done === "digest"
      ? "Done. You won't get vendor certificate reminders any more. The tracker in your dashboard still shows every expiry."
      : done === "vendor"
        ? "Done. PMRFP won't send certificate requests or other emails to this address."
        : "That link isn't valid. Email info@pmrfp.com and we'll remove you by hand.";
  return new NextResponse(
    `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>PMRFP</title>` +
      `<div style="font-family:Arial,sans-serif;max-width:520px;margin:64px auto;padding:0 16px;color:#282B59">` +
      `<h1 style="font-size:20px">PMRFP</h1><p>${msg}</p><p><a href="https://pmrfp.com" style="color:#282B59">pmrfp.com</a></p></div>`,
    { status: done ? 200 : 400, headers: { "content-type": "text/html; charset=utf-8" } },
  );
}

export async function POST(request: Request) {
  const done = await unsubscribe(request);
  return NextResponse.json({ ok: Boolean(done) }, { status: done ? 200 : 400 });
}
