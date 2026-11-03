import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { isServiceConfigured } from "@/lib/supabase/config";
import { verifyRosterInviteUnsubscribe } from "@/lib/roster/unsubscribe";

/**
 * The After-Hours Vendor Roster invite's opt-out (lib/roster). GET = the
 * link; POST = the inbox's one-click button (RFC 8058). The address goes on
 * the do-not-contact list (email_suppressions), which every PMRFP send
 * checks first.
 */
async function unsubscribe(request: Request): Promise<boolean> {
  const url = new URL(request.url);
  const id = url.searchParams.get("i");
  if (!verifyRosterInviteUnsubscribe(id, url.searchParams.get("t")) || !id || !isServiceConfigured()) return false;
  const db = createServiceClient();
  const { data } = await db.from("emergency_roster_invites").select("email_key").eq("id", id).maybeSingle<{ email_key: string }>();
  const key = data?.email_key?.trim().toLowerCase();
  if (!key) return false;
  const { error } = await db
    .from("email_suppressions")
    .upsert({ email_key: key, reason: "unsubscribe", detail: "after-hours roster invite" }, { onConflict: "email_key", ignoreDuplicates: true });
  if (error) console.error("[roster-unsubscribe]", error.message);
  return !error;
}

export async function GET(request: Request) {
  const done = await unsubscribe(request);
  const msg = done
    ? "Done. PMRFP won't send invitations or other emails to this address."
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
