import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { isServiceConfigured } from "@/lib/supabase/config";
import { verifyForumUnsubscribe } from "@/lib/forum/notify-rules";

/**
 * One-click unsubscribe from forum reply emails only (GET = the link in the
 * email; POST = RFC 8058 one-click from the inbox). Sets
 * notification_preferences.forum_replies = 'off'. Other emails are unaffected.
 */
async function unsubscribe(request: Request): Promise<boolean> {
  const url = new URL(request.url);
  const userId = url.searchParams.get("u");
  if (!verifyForumUnsubscribe(userId, url.searchParams.get("t")) || !isServiceConfigured()) return false;
  const { error } = await createServiceClient().from("notification_preferences").upsert({ user_id: userId, forum_replies: "off" }, { onConflict: "user_id" });
  if (error) console.error("[forum/unsubscribe] failed:", error.message);
  return !error;
}

export async function GET(request: Request) {
  const ok = await unsubscribe(request);
  const msg = ok
    ? "You won't get emails about replies to your forum threads any more. You can turn them back on from any thread you started."
    : "That unsubscribe link isn't valid. Email info@pmrfp.com and we'll turn these emails off by hand.";
  return new NextResponse(
    `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>PMRFP</title>` +
      `<div style="font-family:Arial,sans-serif;max-width:520px;margin:64px auto;padding:0 16px;color:#282B59">` +
      `<h1 style="font-size:20px">PMRFP Forum</h1><p>${msg}</p><p><a href="https://pmrfp.com/forum" style="color:#282B59">pmrfp.com/forum</a></p></div>`,
    { status: ok ? 200 : 400, headers: { "content-type": "text/html; charset=utf-8" } },
  );
}

export async function POST(request: Request) {
  const ok = await unsubscribe(request);
  return NextResponse.json({ ok }, { status: ok ? 200 : 400 });
}
