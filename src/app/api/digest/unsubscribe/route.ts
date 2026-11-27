import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { isServiceConfigured } from "@/lib/supabase/config";
import { verifyDigestUnsubscribe } from "@/lib/email/unsubscribe";
import { localizePath, hasLocale } from "@/i18n/config";

import { vpsAppDatabase } from "@/lib/d1/http-binding";
import { UUID } from "@/lib/d1/contracts";
import { customerAppAuthority } from "../../../../../workers/d1-api/customer-signup";

export const dynamic = "force-dynamic";

/**
 * One-click unsubscribe from the free weekly email. GET = the link in the
 * footer (lands on /weekly-email?unsubscribed=1); POST = RFC 8058 one-click
 * from the inbox's own button (List-Unsubscribe-Post). Signed per
 * subscriber, no login. Takes effect at once: the cron only sends to active
 * subscribers.
 */
async function unsubscribe(request: Request): Promise<{ ok: boolean; lang: string }> {
  const url = new URL(request.url);
  const id = url.searchParams.get("s");
  if (!id || !UUID.test(id) || !verifyDigestUnsubscribe(id, url.searchParams.get("t"))) return { ok: false, lang: "en" };
  const now = new Date().toISOString();
  if (process.env.PMRFP_VPS_CUSTOMER_ENGINE === "d1") {
    const result = await vpsAppDatabase().prepare(`UPDATE digest_subscribers
      SET status=CASE WHEN status='bounced' THEN status ELSE 'unsubscribed' END,
          unsubscribed_at=CASE WHEN status='bounced' THEN unsubscribed_at ELSE coalesce(unsubscribed_at,?) END,
          updated_at=? WHERE id=? AND ${customerAppAuthority} RETURNING lang`).bind(now,now,id).first<{lang:string}>();
    return { ok: Boolean(result), lang: result?.lang ?? "en" };
  }
  if (!isServiceConfigured()) return { ok: false, lang: "en" };
  const { data, error } = await createServiceClient()
    .from("digest_subscribers")
    .update({ status: "unsubscribed", unsubscribed_at: now, updated_at: now })
    .eq("id", id!)
    .neq("status", "bounced")
    .select("lang")
    .maybeSingle<{ lang: string }>();
  if (error) console.error("[digest] unsubscribe failed:", error.message);
  return { ok: !error, lang: data?.lang ?? "en" };
}

export async function GET(request: Request) {
  const { ok, lang } = await unsubscribe(request);
  const path = localizePath("/weekly-email", hasLocale(lang) ? lang : "en");
  return NextResponse.redirect(new URL(`${path}?${ok ? "unsubscribed=1" : "invalid=1"}`, new URL(request.url).origin), 303);
}

export async function POST(request: Request) {
  const { ok } = await unsubscribe(request);
  return NextResponse.json({ ok }, { status: ok ? 200 : 400 });
}
