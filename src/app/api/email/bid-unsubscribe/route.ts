import { isVpsLiveCustomerAuth } from "@/lib/d1/staging-config";
import { vpsAppDatabase } from "@/lib/d1/http-binding";
import { UUID } from "@/lib/d1/contracts";
import { customerAppAuthority } from "../../../../../workers/d1-api/customer-signup";
import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { isServiceConfigured } from "@/lib/supabase/config";
import { verifyBidUnsubscribe } from "@/lib/bid-compare/unsubscribe";

/**
 * A bidder's opt-out from a Bid Comparison Sheet email (lib/bid-compare:
 * the award notice, the "join PMRFP" invite). GET = the link; POST = the
 * inbox's one-click button (RFC 8058). The bid's address goes on the
 * do-not-contact list (email_suppressions), which every PMRFP send checks
 * first.
 */
async function unsubscribe(request: Request): Promise<boolean> {
  const url = new URL(request.url);
  const id = url.searchParams.get("i");
  if (!verifyBidUnsubscribe(id, url.searchParams.get("t")) || !id) return false;
  if (isVpsLiveCustomerAuth()) {
    if (!UUID.test(id)) return false;
    const db = vpsAppDatabase();
    const result = await db.prepare(`INSERT INTO email_suppressions(email_key,reason,detail)
      SELECT lower(trim(contact_email)),'unsubscribe','bid comparison' FROM bid_comparison_bids
      WHERE id=? AND contact_email IS NOT NULL AND ${customerAppAuthority}
      ON CONFLICT(email_key) DO UPDATE SET email_key=excluded.email_key RETURNING email_key`).bind(id).first().catch(() => null);
    return Boolean(result);
  }
  if (!isServiceConfigured()) return false;
  const db = createServiceClient();
  const { data } = await db.from("bid_comparison_bids").select("contact_email").eq("id", id).maybeSingle<{ contact_email: string | null }>();
  const key = data?.contact_email?.trim().toLowerCase();
  if (!key) return false;
  const { error } = await db
    .from("email_suppressions")
    .upsert({ email_key: key, reason: "unsubscribe", detail: "bid comparison" }, { onConflict: "email_key", ignoreDuplicates: true });
  if (error) console.error("[bid-unsubscribe]", error.message);
  return !error;
}

export async function GET(request: Request) {
  const done = await unsubscribe(request);
  const msg = done
    ? "Done. PMRFP won't send emails to this address any more."
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
