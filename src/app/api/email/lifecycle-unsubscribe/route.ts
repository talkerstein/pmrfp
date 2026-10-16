import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { isServiceConfigured } from "@/lib/supabase/config";
import { verifyLifecycleUnsubscribe } from "@/lib/email/unsubscribe";

export const dynamic = "force-dynamic";

/**
 * One-click unsubscribe from the lifecycle emails (onboarding tips, trial
 * and offer emails; lib/lifecycle). GET = the link in the email; POST = RFC
 * 8058 one-click from the inbox's own "Unsubscribe" button. Writes
 * notification_preferences.lifecycle_emails = false, which stops every
 * remaining step. Alerts and account emails are separate.
 */
async function unsubscribe(request: Request): Promise<boolean> {
  const url = new URL(request.url);
  const userId = url.searchParams.get("u");
  if (!verifyLifecycleUnsubscribe(userId, url.searchParams.get("t")) || !isServiceConfigured()) return false;
  const { error } = await createServiceClient()
    .from("notification_preferences")
    .upsert({ user_id: userId, lifecycle_emails: false }, { onConflict: "user_id" });
  if (error) console.error("[lifecycle-unsubscribe] failed:", error.message);
  return !error;
}

export async function GET(request: Request) {
  const ok = await unsubscribe(request);
  const msg = ok
    ? "You're unsubscribed from PMRFP tips and offers. Your alerts and account emails are unaffected. / Vous êtes désabonné des conseils et offres de PMRFP. / Canceló la suscripción a los consejos y ofertas de PMRFP."
    : "That unsubscribe link isn't valid. Email info@pmrfp.com and we'll remove you by hand.";
  return new NextResponse(
    `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>PMRFP</title>` +
      `<div style="font-family:Arial,sans-serif;max-width:520px;margin:64px auto;padding:0 16px;color:#282B59">` +
      `<h1 style="font-size:20px">PMRFP</h1><p>${msg}</p><p><a href="https://pmrfp.com" style="color:#282B59">pmrfp.com</a></p></div>`,
    { status: ok ? 200 : 400, headers: { "content-type": "text/html; charset=utf-8" } },
  );
}

export async function POST(request: Request) {
  const ok = await unsubscribe(request);
  return NextResponse.json({ ok }, { status: ok ? 200 : 400 });
}
