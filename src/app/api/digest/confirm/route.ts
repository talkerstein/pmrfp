import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { isServiceConfigured } from "@/lib/supabase/config";
import { confirmTokenValid } from "@/lib/digest/config";
import { localizePath, hasLocale } from "@/i18n/config";

import { vpsAppDatabase } from "@/lib/d1/http-binding";
import { UUID } from "@/lib/d1/contracts";
import { customerAppAuthority } from "../../../../../workers/d1-api/customer-signup";

export const dynamic = "force-dynamic";

/**
 * Double opt-in: the link in the confirmation email. A valid, unexpired
 * token turns the sign-up active (recording when), then lands on
 * /weekly-email in the subscriber's language. Anything else lands there with
 * ?invalid=1 and changes nothing.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const id = url.searchParams.get("s") ?? "";
  const token = url.searchParams.get("t");
  const to = (lang: string, q: string) => NextResponse.redirect(new URL(`${localizePath("/weekly-email", hasLocale(lang) ? lang : "en")}?${q}`, url.origin), 303);
  if (!UUID.test(id)) return to("en", "invalid=1");
  if (process.env.PMRFP_VPS_CUSTOMER_ENGINE === "d1") {
    const db = vpsAppDatabase();
    const sub = await db.prepare(`SELECT status,lang,confirm_token_hash,confirm_sent_at FROM digest_subscribers
      WHERE id=? AND ${customerAppAuthority}`).bind(id)
      .first<{status:string;lang:string;confirm_token_hash:string|null;confirm_sent_at:string|null}>();
    if (!sub) return to("en", "invalid=1");
    if (sub.status === "active") return to(sub.lang, "confirmed=1");
    if (sub.status !== "pending" || !confirmTokenValid(token, sub.confirm_token_hash, sub.confirm_sent_at)) return to(sub.lang, "invalid=1");
    const now = new Date().toISOString();
    const confirmed = await db.prepare(`UPDATE digest_subscribers
      SET status='active',confirmed_at=?,confirm_token_hash=NULL,updated_at=?,unsubscribed_at=NULL,
          user_id=coalesce(user_id,(SELECT u.id FROM users_profile u WHERE lower(trim(u.email))=digest_subscribers.email_key AND u.status='active' LIMIT 1))
      WHERE id=? AND status='pending' AND confirm_token_hash=? AND ${customerAppAuthority}
        AND NOT EXISTS (SELECT 1 FROM email_suppressions e WHERE e.email_key=digest_subscribers.email_key)
      RETURNING id`).bind(now,now,id,sub.confirm_token_hash).first();
    return to(sub.lang, confirmed ? "confirmed=1" : "invalid=1");
  }
  if (!isServiceConfigured()) return to("en", "invalid=1");

  const db = createServiceClient();
  const { data: sub } = await db
    .from("digest_subscribers")
    .select("id,status,lang,confirm_token_hash,confirm_sent_at")
    .eq("id", id)
    .maybeSingle<{ id: string; status: string; lang: string; confirm_token_hash: string | null; confirm_sent_at: string | null }>();
  if (!sub) return to("en", "invalid=1");
  if (sub.status === "active") return to(sub.lang, "confirmed=1");
  if (sub.status !== "pending" || !confirmTokenValid(token, sub.confirm_token_hash, sub.confirm_sent_at)) return to(sub.lang, "invalid=1");

  const now = new Date().toISOString();
  const { error } = await db
    .from("digest_subscribers")
    .update({ status: "active", confirmed_at: now, confirm_token_hash: null, updated_at: now })
    .eq("id", id)
    .eq("status", "pending");
  if (error) {
    console.error("[digest] confirm failed:", error.message);
    return to(sub.lang, "invalid=1");
  }
  return to(sub.lang, "confirmed=1");
}
