import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { isServiceConfigured } from "@/lib/supabase/config";
import { verifyContractUnsubscribe } from "@/lib/email/unsubscribe";

/**
 * Contract Renewal Calendar opt-out (lib/contracts): the PM stops the
 * renewal digest (notification_preferences.contract_reminders = false).
 * GET = the link; POST = the inbox's one-click button (RFC 8058).
 */
async function unsubscribe(request: Request): Promise<boolean> {
  const url = new URL(request.url);
  const userId = url.searchParams.get("u");
  if (!verifyContractUnsubscribe(userId, url.searchParams.get("t")) || !userId || !isServiceConfigured()) return false;
  const { error } = await createServiceClient()
    .from("notification_preferences")
    .upsert({ user_id: userId, contract_reminders: false }, { onConflict: "user_id" });
  if (error) console.error("[contract-unsubscribe]", error.message);
  return !error;
}

export async function GET(request: Request) {
  const done = await unsubscribe(request);
  const msg = done
    ? "Done. You won't get contract renewal reminders any more. The calendar in your dashboard still shows every end date."
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
  return NextResponse.json({ ok: done }, { status: done ? 200 : 400 });
}
