import { NextResponse } from "next/server";
import { expandRegionIds, type RegionNode } from "@/lib/data/region-tree";
import { createServiceClient } from "@/lib/supabase/service";
import { isServiceConfigured } from "@/lib/supabase/config";
import { sendTenderDigest } from "@/lib/email/send";
import { unsubscribeUrl } from "@/lib/email/unsubscribe";
import { displayTitle } from "@/lib/tenders/title";
import { sponsorEmailBlock } from "@/lib/sponsors/email";
import { getSponsorSnapshot } from "@/lib/sponsors/data";
import { countImpression, flushImpressions } from "@/lib/sponsors/impressions";
import { dominantPlace } from "@/lib/sponsors/model";
import { freeDigestMatches, orgCountries, regionCountryMap } from "@/lib/alerts/country";
import { activeTrialOrgIds } from "@/lib/entitlement/server";
import { pmJobAlertKey } from "@/lib/pm-jobs/alerts";
import { isPmJobSource } from "@/lib/pm-jobs/rules";
import { weeklyFollowItems } from "@/lib/follows/alerts-server";
import { weeklyFollowSection } from "@/lib/follows/alerts";
import { weeklyFollowSectionHtml } from "@/lib/follows/email-copy";
import { buyerFollowAlertsEnabled } from "@/lib/follows/rules";

export const maxDuration = 60;

/**
 * Weekly free-trade tender digest (Vercel cron, Mondays 13:30 UTC).
 *
 * The public-tender feed fills the board daily, but only PAID members get
 * alerts — free trades never find out work exists in their trade, so they
 * never have a reason to upgrade. This tells each free trade how many open
 * tenders matching their categories were posted in the last week, lists the
 * top few, and links to Trade Pro.
 *
 * Guard rails:
 *  - Refuses to send (dry runs still work) until BUSINESS_MAILING_ADDRESS is
 *    set — CASL requires a mailing address in commercial email.
 *  - Once per user per 6 days, recorded as a 'tender_digest' notification
 *    (also shows in-app) — safe even if the route is triggered repeatedly.
 *  - Skips anyone with notification_preferences new_rfps='off' or email off,
 *    and every org with an active/comped subscription.
 *  - Caps recipients per run.
 *  - Country-first: a company only hears about tenders in the country it
 *    works in (lib/alerts/country), never the other side of the border.
 *  - "From buyers you follow" (PMRFP for Towns, Part B1): what the buyers
 *    and towns a free member follows listed this week (lib/follows). A
 *    member whose trades had nothing new still gets the email when a
 *    followed buyer did.
 * `?dry=1` reports who would get what without sending or writing.
 */
const MAX_RECIPIENTS = 300;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isServiceConfigured()) return NextResponse.json({ skipped: "no service client" });

  const dry = new URL(request.url).searchParams.get("dry") === "1";
  const mailingAddress = process.env.BUSINESS_MAILING_ADDRESS?.trim();
  if (!dry && !mailingAddress) {
    return NextResponse.json({ skipped: "BUSINESS_MAILING_ADDRESS not set (required by CASL)" });
  }

  const supabase = createServiceClient();
  const now = Date.now();
  const today = new Date(now).toISOString().slice(0, 10);
  const weekAgo = new Date(now - 7 * 86_400_000).toISOString();
  const sixDaysAgo = new Date(now - 6 * 86_400_000).toISOString();
  const base = (process.env.NEXT_PUBLIC_SITE_URL || "https://pmrfp.com").replace(/\/$/, "");

  const [{ data: rfps }, { data: orgs }, { data: subs }, { data: regions }] = await Promise.all([
    supabase
      .from("rfp_posts")
      .select("id,title,slug,deadline,region_id,province,published_at,source_type, rfp_categories(category_id, trade_categories(name))")
      .eq("status", "published")
      .eq("is_demo", false)
      .gte("published_at", weekAgo)
      .order("deadline", { ascending: true, nullsFirst: false })
      .limit(500),
    supabase
      .from("organizations")
      .select("id,name,province,country")
      .in("organization_type", ["trade_company", "supplier"])
      .eq("is_demo", false)
      .eq("status", "active"),
    supabase.from("subscriptions").select("organization_id,status"),
    supabase.from("regions").select("id,slug,parent_id,country"),
  ]);

  const weekAhead = new Date(now + 7 * 86_400_000).toISOString().slice(0, 10);
  const openRfps = ((rfps ?? []) as unknown as RfpRow[])
    .filter((r) => !r.deadline || r.deadline >= today)
    .map((r) => ({ ...r, title: displayTitle(r.title, r.source_type).title }));
  if (!openRfps.length) return NextResponse.json({ sent: 0, reason: "no new open tenders this week" });

  const paid = new Set(
    ((subs ?? []) as { organization_id: string; status: string }[])
      .filter((s) => s.status === "active" || s.status === "comped")
      .map((s) => s.organization_id),
  );
  // Companies on a running 14-day trial get the Trade Pro alerts instead.
  for (const id of await activeTrialOrgIds(supabase)) paid.add(id);
  const freeOrgs = ((orgs ?? []) as { id: string; name: string; province: string | null; country: string | null }[]).filter((o) => !paid.has(o.id));
  const orgIds = freeOrgs.map((o) => o.id);
  if (!orgIds.length) return NextResponse.json({ sent: 0, reason: "no free trades" });
  const regionRows = (regions ?? []) as { id: string; slug: string; country: string | null }[];
  // Listings filed under a whole country reach every company in that country (the country check below keeps them there).
  const nationalIds = new Set(regionRows.filter((r) => r.slug === "canada" || r.slug === "united-states").map((r) => r.id));
  const countryByRegion = regionCountryMap(regionRows);

  const [{ data: orgCats }, { data: orgRegs }, { data: members }] = await Promise.all([
    supabase.from("organization_categories").select("organization_id,category_id").in("organization_id", orgIds),
    supabase.from("organization_regions").select("organization_id,region_id").in("organization_id", orgIds),
    supabase.from("organization_members").select("organization_id,user_id").in("organization_id", orgIds),
  ]);
  const catsByOrg = group((orgCats ?? []) as Pair[], "organization_id", "category_id");
  // Serving a region means serving everything under it (Ontario → Toronto).
  const tree = (regions ?? []) as RegionNode[];
  const regsByOrg = new Map(
    [...group((orgRegs ?? []) as Pair[], "organization_id", "region_id")].map(([org, ids]) => [org, expandRegionIds(ids, tree)]),
  );
  const usersByOrg = group((members ?? []) as Pair[], "organization_id", "user_id");
  const ownRegsByOrg = group((orgRegs ?? []) as Pair[], "organization_id", "region_id");

  const userIds = [...new Set(((members ?? []) as Pair[]).map((m) => m.user_id as string))];
  const [{ data: profiles }, { data: prefs }, { data: recent }] = await Promise.all([
    supabase.from("users_profile").select("id,email,status").in("id", userIds.length ? userIds : ["__"]),
    supabase.from("notification_preferences").select("user_id,new_rfps,channel_email").in("user_id", userIds.length ? userIds : ["__"]),
    supabase
      .from("notifications")
      .select("user_id")
      .eq("type", "tender_digest")
      .gte("created_at", sixDaysAgo)
      .in("user_id", userIds.length ? userIds : ["__"]),
  ]);
  const emailById = new Map(
    ((profiles ?? []) as { id: string; email: string; status: string }[])
      .filter((p) => p.email && p.status !== "suspended")
      .map((p) => [p.id, p.email]),
  );
  const optedOut = new Set(
    ((prefs ?? []) as { user_id: string; new_rfps: string; channel_email: boolean }[])
      .filter((p) => p.new_rfps === "off" || p.channel_email === false)
      .map((p) => p.user_id),
  );
  const alreadySent = new Set(((recent ?? []) as { user_id: string }[]).map((r) => r.user_id));
  // PM jobs a person already got by same-day email (lib/pm-jobs, lead_alert_log "pmjob:<id>") don't come again here.
  const pmJobKeys = openRfps.filter((r) => isPmJobSource(r.source_type)).map((r) => pmJobAlertKey(r.id));
  const sentPmJobs = new Set<string>();
  if (pmJobKeys.length) {
    const { data: logRows } = await supabase.from("lead_alert_log").select("user_id,lead_key").in("lead_key", pmJobKeys).limit(20_000);
    for (const l of (logRows ?? []) as { user_id: string; lead_key: string }[]) sentPmJobs.add(`${l.user_id}|${l.lead_key.slice("pmjob:".length)}`);
  }

  // Free members' followed buyers: their listings this week (nobody follows anything: nothing more is read).
  const followed = await weeklyFollowItems(supabase, { userIds, since: weekAgo, today });
  const sameDay = buyerFollowAlertsEnabled();
  const slugById = new Map(openRfps.map((r) => [r.id, r.slug]));

  let sent = 0;
  let withFollows = 0;
  const paidSponsors = await getSponsorSnapshot();
  const preview: { org: string; count: number; trade: string }[] = [];
  for (const org of freeOrgs) {
    const cats = catsByOrg.get(org.id);
    const orgUsers = usersByOrg.get(org.id) ?? new Set<string>();
    const follows = [...orgUsers].some((u) => followed.byUser.has(u));
    if (!cats?.size && !follows) continue;
    const regs = regsByOrg.get(org.id) ?? new Set<string>();
    const countries = orgCountries(org, ownRegsByOrg.get(org.id) ?? [], countryByRegion);
    const orgMatches = cats?.size ? freeDigestMatches(openRfps, { categories: cats, regions: regs, countries }, nationalIds, countryByRegion) : [];
    if (!orgMatches.length && !follows) continue;

    // Label by the trade that matched most often ("snow removal tenders").
    const counts = new Map<string, number>();
    for (const r of orgMatches)
      for (const c of r.rfp_categories)
        if (cats?.has(c.category_id) && c.trade_categories?.name)
          counts.set(c.trade_categories.name, (counts.get(c.trade_categories.name) ?? 0) + 1);
    const trade = ([...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "commercial").toLowerCase();
    preview.push({ org: org.name, count: orgMatches.length, trade });
    // Sponsor slot: this trade × the province most of these tenders are in.
    const place = dominantPlace(orgMatches.map((m) => ({ province: m.province })));

    for (const userId of orgUsers) {
      const email = emailById.get(userId);
      if (!email || optedOut.has(userId) || alreadySent.has(userId) || sent >= MAX_RECIPIENTS) continue;
      const unsub = unsubscribeUrl(base, userId);
      if (!unsub) continue;
      const matches = sentPmJobs.size ? orgMatches.filter((m) => !sentPmJobs.has(`${userId}|${m.id}`)) : orgMatches;
      const shown = matches.slice(0, 5);
      // PM jobs this person already got by email don't come again in the follow section either.
      const sentRfp = new Set([...sentPmJobs].filter((k) => k.startsWith(`${userId}|`)).map((k) => `${userId}|${slugById.get(k.slice(userId.length + 1)) ?? ""}`));
      const fromFollows = weeklyFollowSection(followed.byUser.get(userId), { alreadyListed: new Set(shown.map((m) => m.id)), sentRfp, userId });
      if (!matches.length && !fromFollows.length) continue;
      if (fromFollows.length) withFollows++;
      if (dry) {
        sent++;
        continue;
      }
      // Record first — a slow/failed send must never cause a resend loop.
      const { error } = await supabase.from("notifications").insert({
        user_id: userId,
        type: "tender_digest",
        title: matches.length ? `${matches.length} new ${trade} tender${matches.length === 1 ? "" : "s"} this week` : "New bids from buyers you follow",
        message: [...shown.map((m) => m.title), ...fromFollows.map((f) => f.listing.title)].slice(0, 3).join(" · "),
        link_url: matches.length ? "/rfps" : "/dashboard/following",
      });
      if (error) continue;
      alreadySent.add(userId);
      await sendTenderDigest(email, {
        count: matches.length,
        tradeLabel: trade,
        items: shown.map((m) => ({ title: m.title, slug: m.slug, deadline: m.deadline })),
        followedHtml: weeklyFollowSectionHtml(
          base,
          fromFollows.map((f) => ({ title: f.listing.title, slug: f.listing.slug, deadline: f.listing.deadline, buyer: f.keys.map((k) => followed.names.get(k)).find(Boolean) ?? "" })),
          { sameDay },
        ),
        closingSoon: matches.filter((m) => m.deadline && m.deadline <= weekAhead).length,
        // Monthly first: the one trade that has paid chose monthly.
        upgradeUrl: `${base}/dashboard/billing?plan=pro&interval=monthly`,
        annualUrl: `${base}/dashboard/billing?plan=pro&interval=annual`,
        unsubscribeUrl: unsub,
        mailingAddress: mailingAddress!,
        sponsorHtml: sponsorEmailBlock(
          { placement: "digest_email", categories: [trade], market: place.country, province: place.province, seed: userId },
          base,
          paidSponsors,
          (u) => countImpression({ sponsor: u.id, placement: u.placement, trade: u.trade, region: u.region }),
        ),
      });
      sent++;
    }
  }

  if (!dry) await flushImpressions(true);
  return NextResponse.json(dry ? { dry: true, wouldSend: sent, withFollows, orgs: preview } : { sent, withFollows, orgs: preview.length });
}

type Pair = Record<string, string>;
interface RfpRow {
  id: string;
  title: string;
  source_type: string | null;
  slug: string;
  deadline: string | null;
  region_id: string | null;
  province: string | null;
  rfp_categories: { category_id: string; trade_categories: { name: string } | null }[];
}

function group(rows: Pair[], key: string, val: string): Map<string, Set<string>> {
  const m = new Map<string, Set<string>>();
  for (const r of rows) {
    const s = m.get(r[key]) ?? new Set<string>();
    s.add(r[val]);
    m.set(r[key], s);
  }
  return m;
}
