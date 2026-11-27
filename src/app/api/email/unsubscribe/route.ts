import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { isServiceConfigured } from "@/lib/supabase/config";
import { verifyUnsubscribe } from "@/lib/email/unsubscribe";
import { vpsAppDatabase } from "@/lib/d1/http-binding";
import { unsubscribeD1Opportunities } from "@/lib/d1/saved-alerts";

const privateHeaders = { "cache-control": "private, no-store", "referrer-policy": "no-referrer" };

/**
 * One-click unsubscribe from opportunity emails (the free weekly tender
 * digest). GET = link in the email; POST = RFC 8058 one-click from the
 * inbox's own "Unsubscribe" button (List-Unsubscribe-Post). Writes
 * notification_preferences.new_rfps = 'off', which the digest checks.
 */
async function unsubscribe(request: Request): Promise<boolean> {
  const url = new URL(request.url);
  const userId = url.searchParams.get("u");
  const token = url.searchParams.get("t");
  if (!userId || !token || !/^[a-zA-Z0-9_-]{43}$/.test(token)) return false;
  const verified = verifyUnsubscribe(userId, token);
  if (process.env.PMRFP_VPS_CUSTOMER_ENGINE === "d1") {
    try {
      const legacyDigest = verified ? undefined : createHash("sha256").update(token).digest("hex");
      return await unsubscribeD1Opportunities(vpsAppDatabase(), userId, legacyDigest);
    } catch {
      console.error("[unsubscribe] D1 update unavailable");
      return false;
    }
  }
  if (!verified || !isServiceConfigured()) return false;
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
    { status: ok ? 200 : 400, headers: { ...privateHeaders, "content-type": "text/html; charset=utf-8" } },
  );
}

export async function POST(request: Request) {
  const ok = await unsubscribe(request);
  return NextResponse.json({ ok }, { status: ok ? 200 : 400, headers: privateHeaders });
}
