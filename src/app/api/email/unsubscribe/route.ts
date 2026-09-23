import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { isServiceConfigured } from "@/lib/supabase/config";
import { verifyUnsubscribe } from "@/lib/email/unsubscribe";

/**
 * One-click unsubscribe from opportunity emails (the free weekly tender
 * digest). GET = link in the email; POST = RFC 8058 one-click from the
 * inbox's own "Unsubscribe" button (List-Unsubscribe-Post). Writes
 * notification_preferences.new_rfps = 'off', which the digest checks.
 */
async function unsubscribe(request: Request): Promise<boolean> {
  const url = new URL(request.url);
  const userId = url.searchParams.get("u");
  if (!verifyUnsubscribe(userId, url.searchParams.get("t")) || !isServiceConfigured()) return false;
  const { error } = await createServiceClient()
    .from("notification_preferences")
    .upsert({ user_id: userId, new_rfps: "off" }, { onConflict: "user_id" });
  if (error) console.error("[unsubscribe] failed:", error.message);
  return !error;
}

export async function GET(request: Request) {
  const ok = await unsubscribe(request);
  const msg = ok
    ? "You're unsubscribed from PMRFP opportunity emails. Account and billing emails are unaffected."
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
