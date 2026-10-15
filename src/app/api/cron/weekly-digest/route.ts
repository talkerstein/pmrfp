import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { isServiceConfigured } from "@/lib/supabase/config";
import { listRfps } from "@/lib/data/rfps";
import { getCategories } from "@/lib/data/taxonomy";
import { getMajorProjects } from "@/lib/major-projects/data";
import { buildWeeklyDigest, renderWeeklyDigest, type DigestSubscriber } from "@/lib/digest/build";
import { bucketForMinute, isSendable, weeklyDigestEnabled, type DigestLang } from "@/lib/digest/config";
import { digestUnsubscribeUrl } from "@/lib/email/unsubscribe";
import { sendDigestEmail } from "@/lib/email/send";
import { sponsorEmailBlock } from "@/lib/sponsors/email";
import { getSponsorSnapshot } from "@/lib/sponsors/data";
import { countImpression, flushImpressions } from "@/lib/sponsors/impressions";
import { torontoDay } from "@/lib/sponsors/model";
import { SITE } from "@/lib/site";
import { regionName, tradeName } from "@/i18n/terms";

export const maxDuration = 60;

/**
 * The free weekly email (Vercel cron, Tuesdays at 14:05/14:20/14:35/14:50
 * UTC). Each run takes one quarter of the subscribers (send_bucket), so the
 * sends are spread over an hour.
 *
 * Guard rails:
 *  - Sends NOTHING unless WEEKLY_DIGEST_ENABLED is on. `?dry=1` reports who
 *    would get what without sending or writing, flag or not.
 *  - Confirmed (active) subscribers only; never a suppressed address
 *    (bounce, complaint, manual); never twice inside 6 days; linked accounts
 *    that turned opportunity emails off are skipped.
 *  - The board, major projects and taxonomy load ONCE per run from the
 *    shared cached snapshots, never per subscriber.
 *  - Country-first content (lib/digest/build); a week with nothing for a
 *    subscriber sends nothing.
 *  - Recorded before sending, so a slow send can't cause a resend loop.
 */
const MAX_PER_RUN = 400;

interface SubRow {
  id: string;
  email: string;
  email_key: string;
  country: "CA" | "US";
  province: string;
  trades: string[] | null;
  lang: DigestLang;
  status: "pending" | "active" | "unsubscribed" | "bounced";
  consent_at: string;
  user_id: string | null;
  last_sent_at: string | null;
  sends: number;
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const url = new URL(request.url);
  const dry = url.searchParams.get("dry") === "1";
  if (!dry && !weeklyDigestEnabled()) return NextResponse.json({ skipped: "WEEKLY_DIGEST_ENABLED is off" });
  if (!isServiceConfigured()) return NextResponse.json({ skipped: "no service client" });

  const param = url.searchParams.get("bucket");
  const bucket = param !== null && /^[0-3]$/.test(param) ? Number(param) : bucketForMinute(new Date().getUTCMinutes());
  const db = createServiceClient();
  const now = Date.now();
  const sixDaysAgo = new Date(now - 6 * 86_400_000).toISOString();

  const { data: rows, error } = await db
    .from("digest_subscribers")
    .select("id,email,email_key,country,province,trades,lang,status,consent_at,user_id,last_sent_at,sends")
    .eq("status", "active")
    .eq("send_bucket", bucket)
    .or(`last_sent_at.is.null,last_sent_at.lt."${sixDaysAgo}"`)
    .order("last_sent_at", { ascending: true, nullsFirst: true })
    .limit(MAX_PER_RUN);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const subs = (rows ?? []) as SubRow[];
  if (!subs.length) return NextResponse.json({ bucket, sent: 0, reason: "nobody due" });

  const keys = subs.map((s) => s.email_key);
  const [{ data: supp }, { data: profiles }] = await Promise.all([
    db.from("email_suppressions").select("email_key").in("email_key", keys),
    db.from("users_profile").select("id,email").in("email", keys),
  ]);
  const suppressed = new Set(((supp ?? []) as { email_key: string }[]).map((r) => r.email_key));
  // Lazy account link: the same address signed up for an account.
  const userByEmail = new Map(((profiles ?? []) as { id: string; email: string }[]).map((p) => [p.email.toLowerCase(), p.id]));
  const userIds = [...new Set(subs.map((s) => s.user_id ?? userByEmail.get(s.email_key)).filter((x): x is string => Boolean(x)))];
  const { data: prefs } = userIds.length
    ? await db.from("notification_preferences").select("user_id,new_rfps,channel_email").in("user_id", userIds)
    : { data: [] };
  const optedOut = new Set(
    ((prefs ?? []) as { user_id: string; new_rfps: string; channel_email: boolean }[])
      .filter((p) => p.new_rfps === "off" || p.channel_email === false)
      .map((p) => p.user_id),
  );

  // Shared cached snapshots, once per run.
  const [rfps, projects, categories, paidSponsors] = await Promise.all([
    listRfps().catch(() => []),
    getMajorProjects().catch(() => []),
    getCategories().catch(() => []),
    getSponsorSnapshot().catch(() => []),
  ]);
  const tradeSlugByName = new Map(categories.map((c) => [c.name, c.slug]));
  const tradeNameBySlug = new Map(categories.map((c) => [c.slug, c.name]));
  const data = { today: torontoDay(), rfps, projects, tradeSlugByName };
  const base = (process.env.NEXT_PUBLIC_SITE_URL || SITE.url).replace(/\/$/, "");

  let sent = 0;
  let empty = 0;
  let skipped = 0;
  const preview: { province: string; country: string; open: number; awards: number; projects: number }[] = [];
  for (const s of subs) {
    const userId = s.user_id ?? userByEmail.get(s.email_key) ?? null;
    if (!isSendable({ status: s.status, emailKey: s.email_key, lastSentAt: s.last_sent_at }, suppressed, now) || (userId && optedOut.has(userId))) {
      skipped++;
      continue;
    }
    const sub: DigestSubscriber = { id: s.id, country: s.country, province: s.province, trades: s.trades ?? [], lang: s.lang, consentAt: s.consent_at };
    const digest = buildWeeklyDigest(sub, data);
    if (digest.empty) {
      empty++;
      continue;
    }
    if (preview.length < 25) preview.push({ province: s.province, country: s.country, open: digest.openTotal, awards: digest.awardsTotal, projects: digest.projects.length });
    const unsub = digestUnsubscribeUrl(base, s.id);
    if (!unsub) {
      skipped++;
      continue;
    }
    if (dry) {
      sent++;
      continue;
    }
    const { error: markError } = await db
      .from("digest_subscribers")
      .update({ last_sent_at: new Date().toISOString(), sends: (s.sends ?? 0) + 1, ...(userId && !s.user_id ? { user_id: userId } : {}) })
      .eq("id", s.id);
    if (markError) {
      skipped++;
      continue;
    }
    const sponsorHtml = sponsorEmailBlock(
      { placement: "digest_email", categories: sub.trades, anyTrade: !sub.trades.length, market: sub.country, province: sub.province, seed: s.id },
      base,
      paidSponsors,
      (u) => countImpression({ sponsor: u.id, placement: u.placement, trade: u.trade, region: u.region }),
    );
    const email = renderWeeklyDigest(sub, digest, {
      base,
      unsubscribeUrl: unsub,
      placeName: regionName(sub.province, sub.lang),
      tradeNames: sub.trades.map((t) => tradeNameBySlug.get(t)).filter((x): x is string => Boolean(x)).map((n) => tradeName(n, sub.lang)),
      contactEmail: SITE.email,
      sponsorHtml,
    });
    await sendDigestEmail(s.email, email, sub.lang, unsub);
    sent++;
  }

  if (!dry) await flushImpressions(true);
  return NextResponse.json(dry ? { dry: true, bucket, wouldSend: sent, empty, skipped, preview } : { bucket, sent, empty, skipped });
}
