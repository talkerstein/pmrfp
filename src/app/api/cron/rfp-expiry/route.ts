import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { isServiceConfigured } from "@/lib/supabase/config";
import { sendRfpExpiryNotice } from "@/lib/email/send";
import { cronAuthFailure } from "@/lib/cron-auth";
import { vpsAppDatabase } from "@/lib/d1/http-binding";
import { previewD1RfpExpiry, sweepD1RfpExpiry } from "@/lib/d1/rfp-expiry";

/**
 * Daily RFP auto-expiry with a PM grace period (Vercel cron).
 *
 * Phase A — a published RFP's deadline has passed and we haven't asked yet:
 *   email the posting PM ("still active? keep it live") and stamp
 *   expiry_notice_sent_at so we never double-ask.
 * Phase B — the PM got that email 7+ days ago and never revived it: flip
 *   status -> 'expired', closed_at = now. (Clicking "keep it live" pushes the
 *   deadline out 30 days AND clears the stamp, so revived RFPs never reach B.)
 *
 * Past-deadline RFPs stay on the public board but render grayed-out as
 * "Closed" (proof of real activity; see lib/data/rfps.ts) until this cron
 * archives them after the grace window. This cron owns the status + PM nudge.
 * Protect with CRON_SECRET if set.
 */
export async function GET(request: Request) {
  const status = cronAuthFailure(request.headers.get("authorization"));
  if (status) {
    return NextResponse.json({ error: status === 401 ? "Unauthorized" : "Cron unavailable" }, { status });
  }
  const dry = new URL(request.url).searchParams.get("dry") === "1";
  if (process.env.PMRFP_VPS_CUSTOMER_ENGINE === "d1") {
    const base = process.env.NEXT_PUBLIC_SITE_URL || "https://pmrfp.com";
    if (!dry && !(process.env.PMRFP_SMTP_ENABLED === "enabled" || process.env.RESEND_API_KEY)) {
      return NextResponse.json({ error: "Expiry email unavailable" }, { status: 503 });
    }
    try {
      if (dry) return NextResponse.json(await previewD1RfpExpiry(vpsAppDatabase()));
      const { expired, claimed } = await sweepD1RfpExpiry(vpsAppDatabase());
      let notified = 0;
      for (const row of claimed) {
        if (!row.email) continue;
        const keepUrl = new URL("/api/rfp/keep-alive", base);
        keepUrl.searchParams.set("token", row.keep_alive_token);
        await sendRfpExpiryNotice(row.email, { title: row.title, slug: row.slug, keepUrl: keepUrl.href });
        notified++;
      }
      return NextResponse.json({ expired, notified });
    } catch {
      return NextResponse.json({ error: "Expiry sweep unavailable" }, { status: 503 });
    }
  }
  if (dry) return NextResponse.json({ dry: true, skipped: "Preview requires D1" }, { status: 503 });
  if (!isServiceConfigured()) return NextResponse.json({ skipped: "no service client" });

  const supabase = createServiceClient();
  const now = new Date();
  const nowIso = now.toISOString();
  const today = nowIso.slice(0, 10);
  const graceCutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const base = process.env.NEXT_PUBLIC_SITE_URL || "https://pmrfp.com";

  // ── Phase B: auto-expire after the 7-day grace elapsed with no revival.
  const { data: toExpire } = await supabase
    .from("rfp_posts")
    .select("id")
    .eq("status", "published")
    .lt("deadline", today)
    .not("expiry_notice_sent_at", "is", null)
    .lt("expiry_notice_sent_at", graceCutoff)
    .limit(200);
  let expired = 0;
  for (const r of (toExpire ?? []) as { id: string }[]) {
    const { error } = await supabase
      .from("rfp_posts")
      .update({ status: "expired", closed_at: nowIso })
      .eq("id", r.id)
      .eq("status", "published"); // guard against a concurrent status change
    if (!error) expired++;
  }

  // ── Phase A: deadline just passed, PM not yet asked → email + stamp.
  const { data: toNotify } = await supabase
    .from("rfp_posts")
    .select("id,title,slug,keep_alive_token,posted_by_user_id")
    .eq("status", "published")
    .lt("deadline", today)
    .is("expiry_notice_sent_at", null)
    .not("posted_by_user_id", "is", null)
    .limit(200);
  const rows = (toNotify ?? []) as NotifyRow[];

  const userIds = [...new Set(rows.map((r) => r.posted_by_user_id).filter(Boolean) as string[])];
  const { data: profiles } = await supabase
    .from("users_profile")
    .select("id,email")
    .in("id", userIds.length ? userIds : ["__"]);
  const emailById = new Map(
    (profiles ?? []).map((p: { id: string; email: string }) => [p.id, p.email]),
  );

  let notified = 0;
  for (const r of rows) {
    // Stamp first (idempotency) so a slow/failed send can't cause a re-ask loop.
    const { error } = await supabase
      .from("rfp_posts")
      .update({ expiry_notice_sent_at: nowIso })
      .eq("id", r.id)
      .is("expiry_notice_sent_at", null);
    if (error) continue;
    const email = r.posted_by_user_id ? emailById.get(r.posted_by_user_id) : undefined;
    if (!email) continue;
    await sendRfpExpiryNotice(email, {
      title: r.title,
      slug: r.slug,
      keepUrl: `${base}/api/rfp/keep-alive?token=${r.keep_alive_token}`,
    });
    notified++;
  }

  return NextResponse.json({ expired, notified });
}

interface NotifyRow {
  id: string;
  title: string;
  slug: string;
  keep_alive_token: string;
  posted_by_user_id: string | null;
}
