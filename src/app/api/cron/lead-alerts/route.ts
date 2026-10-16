import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { isServiceConfigured } from "@/lib/supabase/config";
import { listRfps } from "@/lib/data/rfps";
import { getTaxonomyRows } from "@/lib/data/taxonomy";
import { torontoToday } from "@/lib/data/monthly-winners-load";
import { compactDollars } from "@/lib/data/fomo";
import { getMajorProjects } from "@/lib/major-projects/data";
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
 * Protect with CRON_SECRET if set.
 */
const MAX_RECIPIENTS = 300;
type Pair = Record<string, string>;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isServiceConfigured()) return NextResponse.json({ skipped: "no service client" });
  const dry = new URL(request.url).searchParams.get("dry") === "1";
  if (!dry && !leadAlertsEnabled()) return NextResponse.json({ skipped: "LEAD_ALERTS_ENABLED is off" });

  const db = createServiceClient();
  const now = new Date();
  const today = torontoToday();

  // Who is Trade Pro: paying Pro / Featured, or on an active trial.
  const [subs, trials] = await Promise.all([proSubscriptionOrgIds(db), activeTrialOrgIds(db, now)]);
  const proIds = [...new Set([...subs, ...trials])];
  if (!proIds.length) return NextResponse.json({ sent: 0, reason: "no Trade Pro or trial companies" });

  const [{ data: orgRows }, { data: orgCats }, { data: orgRegs }, { data: members }] = await Promise.all([
    db.from("organizations").select("id,name,city,province,country,organization_type,status,is_demo").in("id", proIds),
    db.from("organization_categories").select("organization_id, trade_categories(slug)").in("organization_id", proIds),
    db.from("organization_regions").select("organization_id,region_id").in("organization_id", proIds),
    db.from("organization_members").select("organization_id,user_id").in("organization_id", proIds),
  ]);
  const orgs = ((orgRows ?? []) as { id: string; name: string; city: string | null; province: string | null; country: string | null; organization_type: string; status: string; is_demo: boolean }[])
    .filter((o) => o.organization_type === "trade_company" && o.status !== "suspended" && !o.is_demo);
  if (!orgs.length) return NextResponse.json({ sent: 0, reason: "no Trade Pro trade companies" });

  // Shared snapshots, once per run.
  const [regions, trades, rfps, projects] = await Promise.all([
    getTaxonomyRows("regions").catch(() => []),
    getTaxonomyRows("trade_categories").catch(() => []),
    listRfps().catch(() => []),
    getMajorProjects().catch(() => []),
  ]);
  const regionRows = regions.map((r) => ({ id: r.id, slug: r.slug, name: r.name, province: r.province ?? null, country: r.country ?? null, parent_id: r.parent_id ?? null }));
  const countryByRegion = regionCountryMap(regionRows);
  const regionNameById = new Map(regions.map((r) => [r.id, r.name]));
  const tradeRows = trades.map((t) => ({ id: t.id, slug: t.slug, name: t.name }));
  const wins = hubWins(rfps.filter((r) => !r.isDemo), [], { today, days: AWARD_DAYS });

  const slugsByOrg = new Map<string, string[]>();
  for (const r of (orgCats ?? []) as unknown as { organization_id: string; trade_categories: { slug: string } | null }[]) {
    if (!r.trade_categories?.slug) continue;
    slugsByOrg.set(r.organization_id, [...(slugsByOrg.get(r.organization_id) ?? []), r.trade_categories.slug]);
  }
  const regionsByOrg = group((orgRegs ?? []) as Pair[], "organization_id", "region_id");
  const usersByOrg = group((members ?? []) as Pair[], "organization_id", "user_id");
  const userIds = [...new Set(((members ?? []) as Pair[]).map((m) => m.user_id))];
  const ids = userIds.length ? userIds : ["__"];
  const [{ data: profiles }, { data: prefs }, { data: lastSent }] = await Promise.all([
    db.from("users_profile").select("id,email,status").in("id", ids),
    db.from("notification_preferences").select("user_id,new_rfps,channel_email").in("user_id", ids),
    db
      .from("notifications")
      .select("user_id,created_at")
      .eq("type", "lead_alert")
      .gte("created_at", new Date(now.getTime() - 8 * 86_400_000).toISOString())
      .in("user_id", ids),
  ]);
  const emailById = new Map(
    ((profiles ?? []) as { id: string; email: string; status: string }[]).filter((p) => p.email && p.status !== "suspended").map((p) => [p.id, p.email]),
  );
  const prefById = new Map(((prefs ?? []) as { user_id: string; new_rfps: string; channel_email: boolean }[]).map((p) => [p.user_id, p]));
  const lastById = new Map<string, string>();
  for (const n of (lastSent ?? []) as { user_id: string; created_at: string }[]) {
    if (!lastById.has(n.user_id) || lastById.get(n.user_id)! < n.created_at) lastById.set(n.user_id, n.created_at);
  }

  const base = (process.env.NEXT_PUBLIC_SITE_URL || "https://pmrfp.com").replace(/\/$/, "");
  const mailingAddress = process.env.BUSINESS_MAILING_ADDRESS?.trim() || null;
  const report: { org: string; country: CountryCode; leads: number; subject: string }[] = [];
  let sent = 0;
  let logMissing = false;

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
      const candidates = pickLeadAlerts(leads, { alreadySent: new Set(), today, cadence, max: 50 });
      if (!candidates.length) continue;
      const already = await sentKeys(db, userId, candidates.map((l) => l.key));
      if (already === null) {
        logMissing = true;
        break;
      }
      let picks: Lead[] = pickLeadAlerts(candidates, { alreadySent: already, today, cadence });
      if (!picks.length) continue;
      picks = attachProjectPro(picks, await projectPro(db, picks));
      const subject = leadAlertSubject(picks.length, tradeLabel, areaLabel);
      if (dry) {
        report.push({ org: org.name, country, leads: picks.length, subject });
        continue;
      }
      // Record first: a slow or failed send never causes a resend.
      const { error } = await db
        .from("lead_alert_log")
        .upsert(picks.map((l) => ({ user_id: userId, lead_key: l.key })), { onConflict: "user_id,lead_key", ignoreDuplicates: true });
      if (error) {
        if (isMissingTableError(error)) logMissing = true;
        else console.error("[lead-alerts] log failed", error.message);
        break;
      }
      await sendLeadAlert(email, {
        subject,
        listHtml: leadAlertHtml(picks, base, (n) => compactDollars(n)),
        trial: trials.has(org.id) && !subs.has(org.id),
        unsubscribeUrl: unsubscribeUrl(base, userId),
        mailingAddress,
      });
      await db.from("notifications").insert({
        user_id: userId,
        type: "lead_alert",
        title: subject,
        message: picks.map((l) => l.title).slice(0, 3).join(" · "),
        link_url: "/dashboard",
      });
      sent++;
    }
  }

  if (logMissing) {
    return NextResponse.json({ skipped: "lead_alert_log table missing (run migration 20261016000002)", sent, dry });
  }
  return dry ? NextResponse.json({ dry: true, enabled: leadAlertsEnabled(), members: report }) : NextResponse.json({ sent });
}

/** Active / comped Pro or Featured subscriptions (before migration 20260819000001: any active one). */
async function proSubscriptionOrgIds(db: ReturnType<typeof createServiceClient>): Promise<Set<string>> {
  const { data, error } = await db.from("subscriptions").select("organization_id,status,tier").in("status", ["active", "comped"]);
  if (error) {
    const legacy = await db.from("subscriptions").select("organization_id").in("status", ["active", "comped"]);
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
  const { data, error } = await db.from("lead_alert_log").select("lead_key").eq("user_id", userId).in("lead_key", keys);
  if (error) return isMissingTableError(error) ? null : new Set(keys); // unknown error: send nothing rather than repeat
  return new Set(((data ?? []) as { lead_key: string }[]).map((r) => r.lead_key));
}

/** Trade Pro fields for the projects in one email (recipients are Pro / trial). */
async function projectPro(db: ReturnType<typeof createServiceClient>, leads: Lead[]) {
  const ids = leads.filter((l) => l.key.startsWith("mp:") && (l.hasContractor || l.hasBidRoute)).map((l) => l.key.slice(3));
  const out = new Map<string, { generalContractor: string | null; bidListUrl: string | null; bidRoute: string | null }>();
  if (!ids.length) return out;
  const { data, error } = await db.from("major_projects").select("id,general_contractor,bid_list_url,bid_route").in("id", ids);
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
