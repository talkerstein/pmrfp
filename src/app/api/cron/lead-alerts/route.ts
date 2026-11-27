import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { isServiceConfigured } from "@/lib/supabase/config";
import { listRfps } from "@/lib/data/rfps";
import { getTaxonomyRows } from "@/lib/data/taxonomy";
import { torontoToday } from "@/lib/data/monthly-winners-load";
import { compactDollars } from "@/lib/data/fomo";
import { getMajorProjects, projectIsPublic } from "@/lib/major-projects/data";
import { hubWins } from "@/lib/gc/hub";
import { activeTrialOrgIds } from "@/lib/entitlement/server";
import { isMissingTableError } from "@/lib/entitlement/trial";
import { AWARD_DAYS, buildLeadProfile, matchLeads, type Lead } from "@/lib/leads/match";
import { attachProjectPro } from "@/lib/leads/view";
import {
  ALERT_KINDS,
  isDue,
  leadAlertHtml,
  leadAlertSubject,
  leadAlertsEnabled,
  leadCadence,
  pickLeadAlerts,
} from "@/lib/leads/alerts";
import { orgCountries, regionCountryMap } from "@/lib/alerts/country";
import { accountGeo, type CountryCode } from "@/lib/visitor-geo";
import { sendLeadAlert } from "@/lib/email/send";
import { unsubscribeUrl } from "@/lib/email/unsubscribe";
import { insightsEmailEnabled, leadAlertDeferredToBrief } from "@/lib/insights/email";

import { vpsAppDatabase } from "@/lib/d1/http-binding";
import { inList, readD1, readD1ByIds, requireD1LifecycleAuthority } from "@/lib/lifecycle/d1";
import { customerAppAuthority } from "../../../../../workers/d1-api/customer-signup";

export const maxDuration = 60;

/**
 * "New leads for {trade} in {area}" (Vercel cron, daily 14:20 UTC, after the
 * tender imports and the daily match digest). For every Trade Pro and trial
 * trade company: major projects, permits, development applications and
 * contractors who just won public work, in its trades, area and country,
 * that became news in the member's cadence window and that member hasn't
 * been sent before.
 *
 * Guard rails:
 *  - Sends NOTHING unless LEAD_ALERTS_ENABLED is on. `?dry=1` reports who
 *    would get what without sending or writing, flag or not.
 *  - Never twice for the same lead (lead_alert_log, migration
 *    20261016000002); written BEFORE the send. Without the table, nothing
 *    is sent.
 *  - Opportunity-email setting respected: new_rfps off or email off = no
 *    lead alerts; weekly = one email a week at most; the unsubscribe link
 *    turns them off.
 *  - Board, major projects and taxonomy load ONCE per run from the shared
 *    cached snapshots; per-member reads are small and batched.
 *  - Country-first: one country per company, never mixed.
 *  - While INSIGHTS_EMAIL_ENABLED is on, members on the WEEKLY cadence get
 *    their leads inside the Monday insights brief instead (one email a
 *    week; lib/insights/email), so they're skipped here.
 * Protect with CRON_SECRET if set.
 */
const MAX_RECIPIENTS = 300;
type Pair = Record<string, string>;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const native = process.env.PMRFP_VPS_CUSTOMER_ENGINE === "d1";
  if ((native && !secret) || (secret && request.headers.get("authorization") !== `Bearer ${secret}`)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!native && !isServiceConfigured()) return NextResponse.json({ skipped: "no service client" });
  const dry = new URL(request.url).searchParams.get("dry") === "1";
  if (!dry && !leadAlertsEnabled()) return NextResponse.json({ skipped: "LEAD_ALERTS_ENABLED is off" });

  const d1 = native ? vpsAppDatabase() : null;
  const db = d1 ? null : createServiceClient();
  if (d1) await requireD1LifecycleAuthority(d1);
  const now = new Date();
  const today = torontoToday();

  // Who is Trade Pro: paying Pro / Featured, or on an active trial.
  const [subs, trials] = d1
    ? (await Promise.all([
      readD1<Pair>(d1, "SELECT DISTINCT organization_id FROM subscriptions WHERE status IN ('active','comped') AND tier IN ('pro','featured')"),
      readD1<Pair>(d1, "SELECT DISTINCT organization_id FROM trade_trials WHERE julianday(started_at)<=julianday(?) AND julianday(ends_at)>julianday(?)", now.toISOString(), now.toISOString()),
    ])).map(rows => new Set(rows.map(row => row.organization_id)))
    : await Promise.all([proSubscriptionOrgIds(db!), activeTrialOrgIds(db!, now)]);
  const proIds = [...new Set([...subs, ...trials])];
  if (!proIds.length) return NextResponse.json({ ...(dry ? { dry, checked: true } : {}), sent: 0, reason: "no Trade Pro or trial companies" });

  type Company = { id: string; name: string; city: string | null; province: string | null; country: string | null;
    organization_type: string; status: string; is_demo: boolean | number };
  const [{ data: orgRows }, { data: orgCats }, { data: orgRegs }, { data: members }] = d1
    ? (await Promise.all([
      readD1ByIds<Company>(d1, proIds, `SELECT id,name,city,province,country,organization_type,status,is_demo FROM organizations WHERE id ${inList}`),
      readD1ByIds<Pair>(d1, proIds, `SELECT o.organization_id,c.slug FROM organization_categories o
        JOIN trade_categories c ON c.id=o.category_id WHERE o.organization_id ${inList}`),
      readD1ByIds<Pair>(d1, proIds, `SELECT organization_id,region_id FROM organization_regions WHERE organization_id ${inList}`),
      readD1ByIds<Pair>(d1, proIds, `SELECT organization_id,user_id FROM organization_members WHERE organization_id ${inList}`),
    ])).map(data => ({ data }))
    : await Promise.all([
    db!.from("organizations").select("id,name,city,province,country,organization_type,status,is_demo").in("id", proIds),
    db!.from("organization_categories").select("organization_id, trade_categories(slug)").in("organization_id", proIds),
    db!.from("organization_regions").select("organization_id,region_id").in("organization_id", proIds),
    db!.from("organization_members").select("organization_id,user_id").in("organization_id", proIds),
  ]);
  const orgs = ((orgRows ?? []) as Company[])
    .filter(o => o.organization_type === "trade_company" && (native ? o.status === "active" : o.status !== "suspended") && !o.is_demo);
  if (!orgs.length) return NextResponse.json({ ...(dry ? { dry, checked: true } : {}), sent: 0, reason: "no Trade Pro trade companies" });

  // Shared snapshots, once per run.
  const [regions, trades, rfps, projects] = await Promise.all([
    (native ? getTaxonomyRows("regions") : getTaxonomyRows("regions").catch(() => [])),
    (native ? getTaxonomyRows("trade_categories") : getTaxonomyRows("trade_categories").catch(() => [])),
    (native ? listRfps() : listRfps().catch(() => [])),
    (native ? getMajorProjects(true) : getMajorProjects().catch(() => [])),
  ]);
  const regionRows = regions.map((r) => ({ id: r.id, slug: r.slug, name: r.name, province: r.province ?? null, country: r.country ?? null, parent_id: r.parent_id ?? null }));
  const countryByRegion = regionCountryMap(regionRows);
  const regionNameById = new Map(regions.map((r) => [r.id, r.name]));
  const tradeRows = trades.map((t) => ({ id: t.id, slug: t.slug, name: t.name }));
  const wins = hubWins(rfps.filter((r) => !r.isDemo), [], { today, days: AWARD_DAYS });

  const slugsByOrg = new Map<string, string[]>();
  for (const r of (orgCats ?? []) as unknown as { organization_id: string; slug?: string; trade_categories?: { slug: string } | null }[]) {
    const slug = r.slug ?? r.trade_categories?.slug;
    if (slug) slugsByOrg.set(r.organization_id, [...(slugsByOrg.get(r.organization_id) ?? []), slug]);
  }
  const regionsByOrg = group((orgRegs ?? []) as Pair[], "organization_id", "region_id");
  const usersByOrg = group((members ?? []) as Pair[], "organization_id", "user_id");
  const userIds = [...new Set(((members ?? []) as Pair[]).map((m) => m.user_id))];
  const ids = userIds.length ? userIds : ["__"];
  const cutoff = new Date(now.getTime() - 8 * 86_400_000).toISOString();
  const [{ data: profiles }, { data: prefs }, { data: lastSent }] = d1 ? (await Promise.all([
    readD1ByIds<Pair>(d1, ids, `SELECT id,email,status FROM users_profile u WHERE id ${inList}
      AND status='active' AND NOT EXISTS(SELECT 1 FROM email_suppressions e WHERE e.email_key=lower(trim(u.email)))
      AND NOT EXISTS(SELECT 1 FROM digest_subscribers d WHERE d.email_key=lower(trim(u.email)) AND d.status IN ('unsubscribed','bounced'))`),
    readD1ByIds<Pair>(d1, ids, `SELECT user_id,new_rfps,channel_email FROM notification_preferences WHERE user_id ${inList}`),
    readD1ByIds<Pair>(d1, ids, `SELECT user_id,created_at FROM notifications WHERE user_id ${inList}
      AND type='lead_alert' AND julianday(created_at)>=julianday(?)`, cutoff),
  ])).map(data => ({ data })) : await Promise.all([
    db!.from("users_profile").select("id,email,status").in("id", ids),
    db!.from("notification_preferences").select("user_id,new_rfps,channel_email").in("user_id", ids),
    db!
      .from("notifications")
      .select("user_id,created_at")
      .eq("type", "lead_alert")
      .gte("created_at", cutoff)
      .in("user_id", ids),
  ]);
  const emailById = new Map(
    ((profiles ?? []) as { id: string; email: string; status: string }[]).filter((p) => p.email && p.status !== "suspended").map((p) => [p.id, p.email]),
  );
  const prefById = new Map(((prefs ?? []) as { user_id: string; new_rfps: string; channel_email: boolean }[]).map((p) => [p.user_id, { ...p, channel_email: native ? Number(p.channel_email ?? 1) === 1 : p.channel_email }]));
  const lastById = new Map<string, string>();
  for (const n of (lastSent ?? []) as { user_id: string; created_at: string }[]) {
    if (!lastById.has(n.user_id) || lastById.get(n.user_id)! < n.created_at) lastById.set(n.user_id, n.created_at);
  }

  const base = (process.env.NEXT_PUBLIC_SITE_URL || "https://pmrfp.com").replace(/\/$/, "");
  const mailingAddress = process.env.BUSINESS_MAILING_ADDRESS?.trim() || null;
  if (d1 && !dry && (!mailingAddress || !unsubscribeUrl(base, "check"))) {
    return NextResponse.json({ error: "Lead alert mail configuration unavailable" }, { status: 503 });
  }
  const report: { org: string; country: CountryCode; leads: number; subject: string }[] = [];
  let sent = 0;
  let logMissing = false;
  const briefOn = insightsEmailEnabled();

  for (const org of orgs) {
    if (sent >= MAX_RECIPIENTS || logMissing) break;
    const tradeSlugs = slugsByOrg.get(org.id) ?? [];
    if (!tradeSlugs.length) continue;
    const own = [...(regionsByOrg.get(org.id) ?? [])];
    const country = primaryCountry(org, own, countryByRegion);
    const profile = buildLeadProfile({ country, org, tradeSlugs, regionIds: own, regions: regionRows, trades: tradeRows });
    const leads = matchLeads({ profile, rfps: [], projects, regionNameById, today, kinds: ALERT_KINDS, wins });
    if (!leads.length) continue;
    const tradeLabel = profile.nameBySlug.get(tradeSlugs[0]) ?? tradeSlugs[0];
    const areaLabel = org.city || [...profile.provinces][0] || (country === "US" ? "the U.S." : "Canada");

    for (const userId of usersByOrg.get(org.id) ?? []) {
      if (sent >= MAX_RECIPIENTS) break;
      const email = emailById.get(userId);
      const cadence = leadCadence(prefById.get(userId));
      if (!email || !cadence || !isDue(cadence, lastById.get(userId), now)) continue;
      if (leadAlertDeferredToBrief(cadence, briefOn)) continue;
      const candidates = pickLeadAlerts(leads, { alreadySent: new Set(), today, cadence, max: 50 });
      if (!candidates.length) continue;
      const keys = candidates.map(l => l.key);
      const already = d1 ? new Set((await readD1<Pair>(d1, `SELECT lead_key FROM lead_alert_log WHERE user_id=? AND lead_key ${inList}`,
        userId, JSON.stringify(keys))).map(row => row.lead_key)) : await sentKeys(db!, userId, keys);
      if (already === null) {
        logMissing = true;
        break;
      }
      let picks: Lead[] = pickLeadAlerts(candidates, { alreadySent: already, today, cadence });
      if (!picks.length) continue;
      picks = attachProjectPro(picks, await projectPro(db, picks, d1));
      const subject = leadAlertSubject(picks.length, tradeLabel, areaLabel);
      if (dry) {
        report.push({ org: org.name, country, leads: picks.length, subject });
        continue;
      }
      // Record first: a slow or failed send never causes a resend.
      if (d1) {
        const [claim] = await d1.batch<Pair>([d1.prepare(`INSERT INTO lead_alert_log(user_id,lead_key)
          SELECT u.id,k.value FROM users_profile u CROSS JOIN json_each(?) k
          LEFT JOIN notification_preferences p ON p.user_id=u.id
          WHERE u.id=? AND u.email=? AND u.status='active' AND ${customerAppAuthority}
            AND coalesce(p.channel_email,1)=1 AND coalesce(p.new_rfps,'daily')<>'off'
            AND CASE WHEN p.new_rfps='weekly' THEN 'weekly' ELSE 'daily' END=?
            AND NOT EXISTS (SELECT 1 FROM email_suppressions e WHERE e.email_key=lower(trim(u.email)))
            AND NOT EXISTS (SELECT 1 FROM digest_subscribers d WHERE d.email_key=lower(trim(u.email)) AND d.status IN ('unsubscribed','bounced'))
            AND EXISTS (SELECT 1 FROM organization_members m JOIN organizations o ON o.id=m.organization_id
              WHERE m.user_id=u.id AND o.id=? AND o.organization_type='trade_company' AND o.status='active' AND o.is_demo=0
              AND (EXISTS (SELECT 1 FROM subscriptions s WHERE s.organization_id=o.id AND s.status IN ('active','comped') AND s.tier IN ('pro','featured'))
                OR EXISTS (SELECT 1 FROM trade_trials t WHERE t.organization_id=o.id AND julianday(t.started_at)<=julianday('now') AND julianday(t.ends_at)>julianday('now'))))
            AND NOT EXISTS (SELECT 1 FROM lead_alert_log l WHERE l.user_id=u.id
              AND (l.lead_key LIKE 'rfp:%' OR l.lead_key LIKE 'mp:%') AND julianday(l.sent_at)>=julianday(?))
          ON CONFLICT(user_id,lead_key) DO NOTHING RETURNING lead_key`)
          .bind(JSON.stringify(picks.map(l => l.key)), userId, email, cadence, org.id,
            new Date(now.getTime() - (cadence === 'weekly' ? 6 * 86_400_000 : 20 * 3_600_000)).toISOString())]);
        const claimed = new Set(claim.results.map(row => row.lead_key));
        picks = picks.filter(l => claimed.has(l.key));
        if (!picks.length) continue;
      } else {
        const { error } = await db!.from("lead_alert_log")
          .upsert(picks.map(l => ({ user_id: userId, lead_key: l.key })), { onConflict: "user_id,lead_key", ignoreDuplicates: true });
        if (error) {
          if (isMissingTableError(error)) logMissing = true;
          else console.error("[lead-alerts] log failed", error.message);
          break;
        }
      }
      const sendSubject = leadAlertSubject(picks.length, tradeLabel, areaLabel);
      await sendLeadAlert(email, {
        subject: sendSubject,
        smtpOnly: native,
        listHtml: leadAlertHtml(picks, base, (n) => compactDollars(n)),
        trial: trials.has(org.id) && !subs.has(org.id),
        unsubscribeUrl: unsubscribeUrl(base, userId),
        mailingAddress,
      });
      const message = picks.map(l => l.title).slice(0, 3).join(" · ");
      if (d1) {
        await d1.prepare("INSERT INTO notifications (id,user_id,type,title,message,link_url) VALUES (?,?,'lead_alert',?,?,'/dashboard')")
          .bind(crypto.randomUUID(), userId, sendSubject, message).run();
        lastById.set(userId, now.toISOString());
      } else {
        await db!.from("notifications").insert({ user_id: userId, type: "lead_alert", title: sendSubject, message, link_url: "/dashboard" });
      }
      sent++;
    }
  }

  if (logMissing) {
    return NextResponse.json({ skipped: "lead_alert_log table missing (run migration 20261016000002)", sent, dry });
  }
  return dry ? NextResponse.json({ dry: true, checked: true, enabled: leadAlertsEnabled(), members: report }) : NextResponse.json({ sent });
}

/** Active / comped Pro or Featured subscriptions (before migration 20260819000001: any active one). */
async function proSubscriptionOrgIds(db: ReturnType<typeof createServiceClient>): Promise<Set<string>> {
  const { data, error } = await db!.from("subscriptions").select("organization_id,status,tier").in("status", ["active", "comped"]);
  if (error) {
    const legacy = await db!.from("subscriptions").select("organization_id").in("status", ["active", "comped"]);
    return new Set(((legacy.data ?? []) as Pair[]).map((s) => s.organization_id));
  }
  return new Set(
    ((data ?? []) as { organization_id: string; tier: string | null }[]).filter((s) => s.tier === "pro" || s.tier === "featured").map((s) => s.organization_id),
  );
}

/** One country per company: its own location, else its service regions (Canada first). */
function primaryCountry(
  org: { province: string | null; country: string | null },
  regionIds: string[],
  byRegion: ReadonlyMap<string, CountryCode>,
): CountryCode {
  const own = accountGeo(org)?.country;
  if (own === "US" || own === "CA") return own;
  const set = orgCountries(org, regionIds, byRegion);
  return set.has("CA") ? "CA" : "US";
}

/** Keys this member was already sent, out of `keys`. Null = the log table is missing. */
async function sentKeys(db: ReturnType<typeof createServiceClient>, userId: string, keys: string[]): Promise<Set<string> | null> {
  const { data, error } = await db!.from("lead_alert_log").select("lead_key").eq("user_id", userId).in("lead_key", keys);
  if (error) return isMissingTableError(error) ? null : new Set(keys); // unknown error: send nothing rather than repeat
  return new Set(((data ?? []) as { lead_key: string }[]).map((r) => r.lead_key));
}

/** Trade Pro fields for the projects in one email (recipients are Pro / trial). */
async function projectPro(db: ReturnType<typeof createServiceClient> | null, leads: Lead[], d1: ReturnType<typeof vpsAppDatabase> | null) {
  const ids = leads.filter((l) => l.key.startsWith("mp:") && (l.hasContractor || l.hasBidRoute)).map((l) => l.key.slice(3));
  const out = new Map<string, { generalContractor: string | null; bidListUrl: string | null; bidRoute: string | null }>();
  if (!ids.length) return out;
  type Row = { id: string; general_contractor: string | null; bid_list_url: string | null; bid_route: string | null };
  const { data, error } = d1
    ? { data: await readD1ByIds<Row>(d1, ids, `SELECT id,general_contractor,bid_list_url,bid_route FROM major_projects WHERE id ${inList} AND ${projectIsPublic}`), error: null }
    : await db!.from("major_projects").select("id,general_contractor,bid_list_url,bid_route").in("id", ids);
  if (error || !data) return out;
  for (const r of data as { id: string; general_contractor: string | null; bid_list_url: string | null; bid_route: string | null }[]) {
    out.set(r.id, { generalContractor: r.general_contractor, bidListUrl: r.bid_list_url, bidRoute: r.bid_route });
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
