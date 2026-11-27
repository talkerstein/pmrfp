import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { isServiceConfigured } from "@/lib/supabase/config";
import { sendDailyMatches } from "@/lib/email/send";
import { unsubscribeUrl } from "@/lib/email/unsubscribe";
import { expandRegionIds, type RegionNode } from "@/lib/data/region-tree";
import { buildDigests, digestSubject, type DigestRfp } from "@/lib/alerts/digest";
import { displayTitle } from "@/lib/tenders/title";
import { sponsorEmailBlock } from "@/lib/sponsors/email";
import { getSponsorSnapshot } from "@/lib/sponsors/data";
import { countImpression, flushImpressions } from "@/lib/sponsors/impressions";
import { dominantPlace } from "@/lib/sponsors/model";
import { listingCountry, orgCountries, regionCountryMap } from "@/lib/alerts/country";
import type { CountryCode } from "@/lib/visitor-geo";
import {
  awardLine,
  recentAwardsByUser,
  toDigestAward,
  type AwardRow,
  type DigestAward,
} from "@/lib/alerts/awards";
import {
  majorProjectAlertsEnabled,
  projectAlertLine,
  projectAlertsFor,
  projectEvents,
  type ProjectAlert,
  type ProjectAlertRow,
} from "@/lib/major-projects/alerts";
import { compactDollars } from "@/lib/data/fomo";
import { activeTrialOrgIds } from "@/lib/entitlement/server";
import { leadAlertsEnabled } from "@/lib/leads/alerts";

import type { D1Binding } from "@/lib/d1/contracts";
import { vpsAppDatabase } from "@/lib/d1/http-binding";
import { inList, readD1, readD1ByIds, requireD1LifecycleAuthority } from "@/lib/lifecycle/d1";
import { customerAppAuthority } from "../../../../../workers/d1-api/customer-signup";
import { projectIsPublic } from "@/lib/major-projects/data";

export const maxDuration = 60;

interface RfpRow {
  id: string;
  title: string;
  source_type: string | null;
  slug: string;
  summary: string | null;
  deadline: string | null;
  region_id: string | null;
  province: string | null;
  rfp_categories: { category_id: string; trade_categories: { name: string } | null }[];
}
type Pair = Record<string, string>;

type LegacyDb = ReturnType<typeof createServiceClient>;
type Db = LegacyDb | D1Binding;
function isD1(db: Db): db is D1Binding { return "prepare" in db; }
const allowedMailbox = `NOT EXISTS (SELECT 1 FROM email_suppressions e WHERE e.email_key=lower(trim(u.email)))
  AND NOT EXISTS (SELECT 1 FROM digest_subscribers d WHERE d.email_key=lower(trim(u.email)) AND d.status IN ('unsubscribed','bounced'))`;

async function read<T>(db: Db, sql: string, params: string[], legacy: (db: LegacyDb) => PromiseLike<{ data: unknown }>) {
  return isD1(db) ? await readD1<T>(db, sql, ...params) : ((await legacy(db)).data ?? []) as T[];
}
async function forIds<T>(db: Db, ids: string[], sql: string, legacy: (db: LegacyDb, ids: string[]) => PromiseLike<{ data: unknown }>, ...params: string[]) {
  if (!ids.length) return [];
  return isD1(db) ? await readD1ByIds<T>(db, ids, sql, ...params) : ((await legacy(db, ids)).data ?? []) as T[];
}

function categories(field: "name" | "slug") {
  return `(SELECT json_group_array(json_object('category_id',c.category_id,'trade_categories',
    CASE WHEN t.id IS NULL THEN NULL ELSE json_object('${field}',t.${field}) END))
    FROM rfp_categories c LEFT JOIN trade_categories t ON t.id=c.category_id WHERE c.rfp_id=r.id) AS rfp_categories`;
}

/**
 * Daily match digest for paying members (Vercel cron, 13:00 UTC — after the
 * Canadian and U.S. tender imports). For RFPs published in the last ~26h,
 * each member gets ONE email listing every new match in their trades and
 * regions (a region covers everything under it). Honors opt-outs
 * (notification_preferences new_rfps='off' / email off), never repeats an RFP
 * (notifications log), and uses the plain-English bid summary when one
 * exists. A digest also carries up to 3 "recently awarded near you" public
 * contracts (lib/alerts/awards). `?dry=1` returns per-member counts without sending.
 * Protect with CRON_SECRET if set.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const native = process.env.PMRFP_VPS_CUSTOMER_ENGINE === "d1";
  if ((native && !secret) || (secret && request.headers.get("authorization") !== `Bearer ${secret}`)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!native && !isServiceConfigured()) return NextResponse.json({ skipped: "no service client" });
  const params = new URL(request.url).searchParams;
  const dry = params.get("dry") === "1";
  // Dry runs may look further back to exercise matching; real sends are always 26h.
  const hours = dry ? Math.min(Number(params.get("hours")) || 26, 24 * 14) : 26;

  const db = native ? vpsAppDatabase() : createServiceClient();
  if (isD1(db)) await requireD1LifecycleAuthority(db);
  const today = new Date().toISOString().slice(0, 10);
  const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

  const rfpRows = await read<Omit<RfpRow, "rfp_categories"> & { rfp_categories: string | RfpRow["rfp_categories"] }>(db,
    `SELECT r.id,r.title,r.slug,r.summary,r.deadline,r.region_id,r.province,r.source_type,${categories("name")}
      FROM rfp_posts r WHERE r.status='published' AND r.is_demo=0 AND julianday(r.published_at)>=julianday(?)
      AND (deadline IS NULL OR date(deadline)>=date(?)) ORDER BY julianday(r.published_at) DESC,id LIMIT 1000`,
    [since,today], supabase => supabase
    .from("rfp_posts")
    .select("id,title,slug,summary,deadline,region_id,province,source_type, rfp_categories(category_id, trade_categories(name))")
    .eq("status", "published")
    .gte("published_at", since)
    // Never alert on something already closed — incl. past public contracts,
    // whose "deadline" is their award date.
    .or(`deadline.is.null,deadline.gte.${today}`)
    .limit(1000));
  const rows: RfpRow[] = rfpRows.map(row => ({ ...row, rfp_categories: typeof row.rfp_categories === "string" ? JSON.parse(row.rfp_categories) : row.rfp_categories }));
  if (!rows.length) return NextResponse.json({ dry, sent: 0, reason: "no recent RFPs" });

  const paidSubs = await read<Pair>(db, `SELECT s.organization_id FROM subscriptions s JOIN organizations o ON o.id=s.organization_id
    WHERE s.status IN ('active','comped') AND o.status='active' AND o.is_demo=0`, [],
    supabase => supabase.from("subscriptions").select("organization_id").in("status", ["active", "comped"]));
  // A running 14-day trial gets what Trade Pro gets (lib/entitlement).
  const trialOrgIds = isD1(db) ? (await readD1<Pair>(db, `SELECT t.organization_id FROM trade_trials t
    JOIN organizations o ON o.id=t.organization_id WHERE o.status='active' AND o.is_demo=0
    AND julianday(t.started_at)<=julianday('now') AND julianday(t.ends_at)>julianday('now')`)).map(r => r.organization_id)
    : await activeTrialOrgIds(db);
  const paidOrgIds = [...new Set([...((paidSubs ?? []) as Pair[]).map((s) => s.organization_id), ...trialOrgIds])];
  if (!paidOrgIds.length) return NextResponse.json({ dry, sent: 0, reason: "no paid orgs" });

  type Region = RegionNode & { name: string; country: string | null; province?: string | null };
  type Check = { rfp_id: string; result: string | { plainSummary?: string } | null };
  const [orgCats, orgRegs, members, tree, checks] = await Promise.all([
    forIds<Pair>(db, paidOrgIds, `SELECT organization_id,category_id FROM organization_categories WHERE organization_id ${inList}`,
      (supabase, ids) => supabase.from("organization_categories").select("organization_id,category_id").in("organization_id", ids)),
    forIds<Pair>(db, paidOrgIds, `SELECT organization_id,region_id FROM organization_regions WHERE organization_id ${inList}`,
      (supabase, ids) => supabase.from("organization_regions").select("organization_id,region_id").in("organization_id", ids)),
    forIds<Pair>(db, paidOrgIds, `SELECT organization_id,user_id FROM organization_members WHERE organization_id ${inList}`,
      (supabase, ids) => supabase.from("organization_members").select("organization_id,user_id").in("organization_id", ids)),
    read<Region>(db, "SELECT id,name,parent_id,country,province FROM regions", [], supabase => supabase.from("regions").select("id,name,parent_id,country,province")),
    forIds<Check>(db, rows.map(row => row.id), `SELECT rfp_id,result FROM rfp_bid_checks WHERE rfp_id ${inList} AND result IS NOT NULL`,
      (supabase, ids) => supabase.from("rfp_bid_checks").select("rfp_id,result").in("rfp_id", ids).not("result", "is", null)),
  ]);
  const countryByRegion = regionCountryMap(tree);
  const regionName = new Map(tree.map((r) => [r.id, r.name]));
  const plain = new Map(
    checks.map((c) => [
      c.rfp_id,
      (typeof c.result === "string" ? JSON.parse(c.result) : c.result)?.plainSummary ?? null,
    ]),
  );
  const rfps: DigestRfp[] = rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    title: displayTitle(r.title, r.source_type).title,
    deadline: r.deadline,
    regionId: r.region_id,
    regionName: r.region_id ? regionName.get(r.region_id) ?? null : null,
    categoryIds: r.rfp_categories.map((c) => c.category_id),
    categoryNames: r.rfp_categories.map((c) => c.trade_categories?.name ?? ""),
    summary: plain.get(r.id) ?? r.summary,
    country: listingCountry(r, countryByRegion),
  }));

  const userIds = [...new Set(members.map(m => m.user_id))];
  const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const [profiles, prefs, recent] = await Promise.all([
    forIds<{ id: string; email: string; status: string }>(db, userIds,
      `SELECT id,email,status FROM users_profile u WHERE id ${inList} AND status='active' AND ${allowedMailbox}`,
      (supabase, ids) => supabase.from("users_profile").select("id,email,status").in("id", ids)),
    forIds<{ user_id: string; new_rfps: string; channel_email: boolean | 0 | 1 }>(db, userIds,
      `SELECT user_id,new_rfps,channel_email FROM notification_preferences WHERE user_id ${inList}`,
      (supabase, ids) => supabase.from("notification_preferences").select("user_id,new_rfps,channel_email").in("user_id", ids)),
    forIds<{ user_id: string; link_url: string }>(db, userIds,
      `SELECT user_id,link_url FROM notifications WHERE user_id ${inList} AND type='rfp_alert' AND julianday(created_at)>=julianday(?)`,
      (supabase, ids) => supabase.from("notifications").select("user_id,link_url").eq("type", "rfp_alert").gte("created_at", weekAgo).in("user_id", ids),
      weekAgo),
  ]);

  const ownRegions = group((orgRegs ?? []) as Pair[], "organization_id", "region_id");
  const membership = {
    paidOrgIds,
    catsByOrg: group((orgCats ?? []) as Pair[], "organization_id", "category_id"),
    regionsByOrg: new Map(
      [...group((orgRegs ?? []) as Pair[], "organization_id", "region_id")].map(([org, regionIds]) => [
        org,
        expandRegionIds(regionIds, tree),
      ]),
    ),
    usersByOrg: group((members ?? []) as Pair[], "organization_id", "user_id"),
    // Country-first: a company only gets listings from the countries it serves.
    countriesByOrg: new Map(
      paidOrgIds.map((org) => [org, orgCountries({}, ownRegions.get(org) ?? [], countryByRegion)]),
    ),
  };
  const digests = buildDigests({
    rfps,
    ...membership,
    emailByUser: new Map(
      ((profiles ?? []) as { id: string; email: string; status: string }[])
        .filter((p) => p.email && p.status !== "suspended")
        .map((p) => [p.id, p.email]),
    ),
    optedOut: new Set(
      ((prefs ?? []) as { user_id: string; new_rfps: string; channel_email: boolean | 0 | 1 }[])
        .filter((p) => p.new_rfps === "off" || p.channel_email === false || p.channel_email === 0)
        .map((p) => p.user_id),
    ),
    alreadySent: new Set(
      ((recent ?? []) as { user_id: string; link_url: string }[]).map(
        (n) => `${n.user_id}|${n.link_url.replace(/^\/rfps\//, "")}`,
      ),
    ),
  });

  // "Recently awarded near you": award notices that landed in the same window.
  // Only rides along with a digest that's going out anyway — never its own email.
  const awardsByUser = digests.length
    ? await recentAwards(db, { since, today, countryByRegion, ...membership })
    : new Map<string, DigestAward[]>();

  // "Major projects near you" (behind MAJOR_PROJECT_ALERTS=1): also only
  // rides along with a digest that's going out anyway. Once the lead alerts
  // are on (LEAD_ALERTS_ENABLED, cron/lead-alerts) they carry projects
  // instead, so a member never gets the same project in two emails.
  const projectsByUser =
    digests.length && majorProjectAlertsEnabled() && !leadAlertsEnabled()
      ? await majorProjectAlertsByUser(db, {
          userIds: digests.map((d) => d.userId),
          tree,
          ...membership,
        })
      : new Map<string, ProjectAlert[]>();

  if (dry) {
    return NextResponse.json({
      dry: true,
      recentRfps: rfps.length,
      members: digests.map((d) => ({
        matches: d.items.length,
        recentAwards: awardsByUser.get(d.userId)?.length ?? 0,
        majorProjects: projectsByUser.get(d.userId)?.length ?? 0,
        subject: digestSubject(d),
      })),
    });
  }

  const base = process.env.NEXT_PUBLIC_SITE_URL || "https://pmrfp.com";
  const mailingAddress = process.env.BUSINESS_MAILING_ADDRESS?.trim() || null;
  if (isD1(db) && (!mailingAddress || !unsubscribeUrl(base, "check"))) {
    return NextResponse.json({ error: "Daily opportunity email configuration unavailable" }, { status: 503 });
  }
  // Sponsors: one cached read per run; the slot is the email's trade × its listings' province.
  const paidSponsors = await getSponsorSnapshot();
  const provinceByRfp = new Map(rows.map((r) => [r.id, r.province]));
  let sent = 0;
  let rfpsNotified = 0;
  for (const planned of digests) {
    const d = isD1(db) ? { ...planned, items: await claimDailyMatches(db, planned, weekAgo) } : planned;
    if (!d.items.length) continue;
    const place = dominantPlace(d.items.map((i) => ({ province: provinceByRfp.get(i.id) ?? null, country: i.country ?? null })));
    await sendDailyMatches(d.email, {
      subject: digestSubject(d),
      smtpOnly: native,
      items: d.items.map((i) => ({
        title: i.title,
        slug: i.slug,
        trade: i.categoryNames.find(Boolean) ?? null,
        region: i.regionName,
        deadline: i.deadline,
        summary: i.summary,
      })),
      unsubscribeUrl: unsubscribeUrl(base, d.userId),
      mailingAddress,
      recentAwards: (awardsByUser.get(d.userId) ?? []).map((a) => ({ slug: a.slug, line: awardLine(a, d.tradeLabel) })),
      majorProjects: (projectsByUser.get(d.userId) ?? []).map((a) => ({ slug: a.slug, name: a.name, line: projectAlertLine(a, (n) => compactDollars(n)) })),
      sponsorHtml: sponsorEmailBlock(
        { placement: "alerts_email", categories: [d.tradeLabel], market: place.country, province: place.province, seed: d.userId },
        base,
        paidSponsors,
        (u) => countImpression({ sponsor: u.id, placement: u.placement, trade: u.trade, region: u.region }),
      ),
    });
    if (!isD1(db)) await db.from("notifications").insert(
      d.items.map((i) => ({
        user_id: d.userId,
        type: "rfp_alert",
        title: "New matching opportunity",
        message: i.title,
        link_url: `/rfps/${i.slug}`,
      })),
    );
    const projects = projectsByUser.get(d.userId) ?? [];
    if (projects.length) {
      const notices = projects.map((a) => ({
          user_id: d.userId,
          type: "major_project_alert",
          title: a.kind === "status" ? "Major project status changed" : "New major project near you",
          message: a.name,
          link_url: `/major-projects/${a.slug}#${a.status}`,
        }));
      if (isD1(db)) await db.batch(notices.map(n => db.prepare(
        "INSERT INTO notifications(id,user_id,type,title,message,link_url) VALUES (?,?,?,?,?,?)",
      ).bind(crypto.randomUUID(), n.user_id, n.type, n.title, n.message, n.link_url)));
      else await db.from("notifications").insert(notices);
    }
    sent++;
    rfpsNotified += d.items.length;
  }
  await flushImpressions(true);

  return NextResponse.json({ sent, rfpsNotified });
}

async function claimDailyMatches(db: D1Binding, digest: ReturnType<typeof buildDigests>[number], weekAgo: string) {
  const items = digest.items.map(item => ({ id: item.id, notice: crypto.randomUUID() }));
  const inserted = await readD1<{ link_url: string }>(db, `INSERT INTO notifications(id,user_id,type,title,message,link_url)
    SELECT json_extract(x.value,'$.notice'),u.id,'rfp_alert','New matching opportunity',r.title,'/rfps/'||r.slug
    FROM users_profile u CROSS JOIN json_each(?) x JOIN rfp_posts r ON r.id=json_extract(x.value,'$.id')
    LEFT JOIN notification_preferences p ON p.user_id=u.id
    WHERE u.id=? AND u.email=? AND u.status='active' AND ${customerAppAuthority} AND ${allowedMailbox}
      AND r.status='published' AND r.is_demo=0 AND (r.deadline IS NULL OR date(r.deadline)>=date('now'))
      AND coalesce(p.channel_email,1)=1 AND coalesce(p.new_rfps,'daily')<>'off'
      AND EXISTS (SELECT 1 FROM organization_members m JOIN organizations o ON o.id=m.organization_id
        WHERE m.user_id=u.id AND o.status='active' AND o.is_demo=0
        AND (EXISTS (SELECT 1 FROM subscriptions s WHERE s.organization_id=o.id AND s.status IN ('active','comped'))
          OR EXISTS (SELECT 1 FROM trade_trials t WHERE t.organization_id=o.id AND julianday(t.started_at)<=julianday('now') AND julianday(t.ends_at)>julianday('now'))))
      AND NOT EXISTS (SELECT 1 FROM notifications n WHERE n.user_id=u.id AND n.type='rfp_alert'
        AND n.link_url='/rfps/'||r.slug AND julianday(n.created_at)>=julianday(?))
      AND NOT EXISTS (SELECT 1 FROM lead_alert_log l WHERE l.user_id=u.id AND l.lead_key IN ('pmjob:'||r.id,'follow:'||r.id))
    RETURNING link_url`, JSON.stringify(items), digest.userId, digest.email, weekAgo);
  const claimed = new Set(inserted.map(row => row.link_url));
  return digest.items.filter(item => claimed.has(`/rfps/${item.slug}`));
}

/**
 * Award notices first seen in the digest window (created_at, not the award
 * date — notices land days after the award). Any error just means no section.
 */
async function recentAwards(
  db: Db,
  opts: {
    since: string;
    today: string;
    paidOrgIds: string[];
    catsByOrg: Map<string, Set<string>>;
    regionsByOrg: Map<string, Set<string>>;
    usersByOrg: Map<string, Set<string>>;
    countriesByOrg: Map<string, Set<CountryCode>>;
    countryByRegion: Map<string, CountryCode>;
  },
): Promise<Map<string, DigestAward[]>> {
  type AwardWithCategories = Omit<AwardRow, "categories"> & {
    rfp_categories: { category_id: string; trade_categories: { slug: string } | null }[];
  };
  const awardsRead = await read<Omit<AwardWithCategories, "rfp_categories"> & { rfp_categories: string | AwardWithCategories["rfp_categories"] }>(db,
    `SELECT r.id,r.title,r.slug,r.summary,r.deadline,r.region_id,r.province,r.source_type,${categories("slug")}
      FROM rfp_posts r WHERE r.status='published' AND r.is_demo=0 AND r.source_type='public_source'
      AND julianday(r.created_at)>=julianday(?) AND date(r.deadline)<=date(?) ORDER BY r.created_at DESC,id LIMIT 500`,
    [opts.since,opts.today], supabase => supabase
    .from("rfp_posts")
    .select("id,title,slug,summary,deadline,region_id,province,source_type, rfp_categories(category_id, trade_categories(slug))")
    .eq("status", "published")
    .eq("source_type", "public_source")
    .gte("created_at", opts.since)
    .lte("deadline", opts.today)
    .limit(500));
  const rows: AwardWithCategories[] = awardsRead.map(row => ({ ...row, rfp_categories:
    typeof row.rfp_categories === "string" ? JSON.parse(row.rfp_categories) : row.rfp_categories }));
  const awards = rows
    .map((r): DigestAward | null => {
      const a = toDigestAward(
        { ...r, categories: r.rfp_categories.map((c) => ({ id: c.category_id, slug: c.trade_categories?.slug ?? "" })) },
        opts.today,
      );
      return a ? { ...a, country: listingCountry(r as { region_id: string | null; province?: string | null }, opts.countryByRegion) } : null;
    })
    .filter((a): a is DigestAward => a !== null);
  return recentAwardsByUser({ awards, ...opts });
}

/** Major-project news a project can bring in a week; deduped per member by the notifications log. */
const PROJECT_WINDOW_DAYS = 7;

/**
 * Major projects that are new or changed status in the last week, matched to
 * each member's provinces (from their expanded service regions) and trades.
 * Canada only. Any error just means no section.
 */
async function majorProjectAlertsByUser(
  db: Db,
  opts: {
    userIds: string[];
    tree: (RegionNode & { name: string; country: string | null; province?: string | null })[];
    paidOrgIds: string[];
    catsByOrg: Map<string, Set<string>>;
    regionsByOrg: Map<string, Set<string>>;
    usersByOrg: Map<string, Set<string>>;
    countriesByOrg: Map<string, Set<CountryCode>>;
  },
): Promise<Map<string, ProjectAlert[]>> {
  const since = new Date(Date.now() - PROJECT_WINDOW_DAYS * 86_400_000).toISOString();
  const cutoff = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const [data, cats, sentRows] = await Promise.all([
    read<Record<string, unknown>>(db,
      `SELECT slug,name,province,city,status,previous_status,est_value_cad,trades_needed,created_at,status_changed_at,stale
      FROM major_projects WHERE ${projectIsPublic} AND stale=0
      AND (julianday(created_at)>=julianday(?) OR julianday(status_changed_at)>=julianday(?)) LIMIT 500`, [since,since],
      supabase => supabase.from("major_projects")
        .select("slug,name,province,city,status,previous_status,est_value_cad,trades_needed,created_at,status_changed_at,stale")
        .neq("review_status", "rejected").or("source.neq.manual,approved.eq.true").eq("stale", false)
        .or(`created_at.gte.${since},status_changed_at.gte.${since}`).limit(500)),
    read<{ id: string; slug: string }>(db, "SELECT id,slug FROM trade_categories", [], supabase => supabase.from("trade_categories").select("id,slug")),
    forIds<{ user_id: string; link_url: string }>(db, opts.userIds,
      `SELECT user_id,link_url FROM notifications WHERE user_id ${inList} AND type='major_project_alert' AND julianday(created_at)>=julianday(?)`,
      (supabase, ids) => supabase.from("notifications").select("user_id,link_url").eq("type", "major_project_alert").gte("created_at", cutoff).in("user_id", ids),
      cutoff),
  ]);
  const rows: ProjectAlertRow[] = (data as Record<string, unknown>[]).map((r) => ({
    slug: String(r.slug),
    name: String(r.name),
    province: (r.province as string | null) ?? null,
    city: (r.city as string | null) ?? null,
    status: r.status as ProjectAlertRow["status"],
    previousStatus: (r.previous_status as ProjectAlertRow["status"] | null) ?? null,
    estValueCad: r.est_value_cad == null ? null : Number(r.est_value_cad),
    tradesNeeded: typeof r.trades_needed === "string" ? JSON.parse(r.trades_needed) : (r.trades_needed as string[] | null) ?? [],
    firstSeenAt: String(r.created_at),
    statusChangedAt: (r.status_changed_at as string | null) ?? null,
    stale: Boolean(r.stale),
  }));
  const events = projectEvents(rows, since);
  if (!events.length) return new Map();
  const slugById = new Map(((cats ?? []) as { id: string; slug: string }[]).map((c) => [c.id, c.slug]));
  const provinceById = new Map(opts.tree.map((r) => [r.id, r.province ?? null]));
  const sentByUser = new Map<string, Set<string>>();
  for (const n of (sentRows ?? []) as { user_id: string; link_url: string }[]) {
    const key = n.link_url.replace("/major-projects/", "").replace("#", "|");
    if (!sentByUser.has(n.user_id)) sentByUser.set(n.user_id, new Set());
    sentByUser.get(n.user_id)!.add(key);
  }
  const wanted = new Set(opts.userIds);
  const out = new Map<string, ProjectAlert[]>();
  for (const org of opts.paidOrgIds) {
    const tradeSlugs = new Set([...(opts.catsByOrg.get(org) ?? [])].map((id) => slugById.get(id)).filter((s): s is string => Boolean(s)));
    const provinces = new Set([...(opts.regionsByOrg.get(org) ?? [])].map((id) => provinceById.get(id)).filter((p): p is string => Boolean(p)));
    if (!tradeSlugs.size || !provinces.size) continue;
    for (const userId of opts.usersByOrg.get(org) ?? []) {
      if (!wanted.has(userId) || out.has(userId)) continue;
      const picks = projectAlertsFor(events, {
        tradeSlugs,
        provinces,
        countries: opts.countriesByOrg.get(org) ?? new Set<CountryCode>(["CA"]),
        alreadySent: sentByUser.get(userId),
      });
      if (picks.length) out.set(userId, picks);
    }
  }
  return out;
}

function group(rows: Pair[], keyField: string, valField: string): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  for (const r of rows) {
    const k = r[keyField];
    if (!map.has(k)) map.set(k, new Set());
    map.get(k)!.add(r[valField]);
  }
  return map;
}
