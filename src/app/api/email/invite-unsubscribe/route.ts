import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { isServiceConfigured } from "@/lib/supabase/config";
import { verifyInviteUnsubscribe } from "@/lib/email/unsubscribe";

/**
 * "Don't send me invitations": the link in a town's invitation to a
 * contractor who isn't on PMRFP (lib/town-jobs). GET = the link; POST = the
 * inbox's one-click button (RFC 8058). The invitation's address goes on the
 * do-not-contact list (email_suppressions, reason 'unsubscribe'), which
 * every invite, digest and lifecycle send checks first.
 */
async function unsubscribe(request: Request): Promise<boolean> {
  const url = new URL(request.url);
  const inviteId = url.searchParams.get("i");
  if (!verifyInviteUnsubscribe(inviteId, url.searchParams.get("t")) || !isServiceConfigured()) return false;
  const db = createServiceClient();
  const { data } = await db.from("town_invites").select("email_key").eq("id", inviteId!).maybeSingle<{ email_key: string }>();
  if (!data?.email_key) return false;
  const { error } = await db
    .from("email_suppressions")
    .upsert({ email_key: data.email_key, reason: "unsubscribe", detail: "town invitation" }, { onConflict: "email_key", ignoreDuplicates: true });
  if (error) console.error("[invite-unsubscribe] failed:", error.message);
  return !error;
}

export async function GET(request: Request) {
  const ok = await unsubscribe(request);
  const msg = ok
    ? "Done. PMRFP won't send you invitations or other emails at this address."
    : "That link isn't valid. Email info@pmrfp.com and we'll remove you by hand.";
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
