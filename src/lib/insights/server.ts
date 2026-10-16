import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import { isServiceConfigured } from "@/lib/supabase/config";
import { getTaxonomyRows } from "@/lib/data/taxonomy";
import { getMajorProjects, type MajorProject } from "@/lib/major-projects/data";
import { hubWins, type HubWin } from "@/lib/gc/hub";
import { activeTrialOrgIds } from "@/lib/entitlement/server";
import { isMissingTableError } from "@/lib/entitlement/trial";
import { isIntelRowActive } from "@/lib/entitlement/intel";
import { AWARD_DAYS, buildLeadProfile, matchLeads, type Lead, type RegionRow, type TradeRow } from "@/lib/leads/match";
import { attachProjectPro } from "@/lib/leads/view";
import { ALERT_KINDS, leadCadence, pickLeadAlerts, type LeadCadence } from "@/lib/leads/alerts";
import { orgCountries, regionCountryMap } from "@/lib/alerts/country";
import { personaOf, type Persona } from "@/lib/lifecycle/persona";
import { DIGEST_ADDRESS, DIGEST_SENDER } from "@/lib/digest/config";
import { unsubscribeUrl } from "@/lib/email/unsubscribe";
import { insightsBriefHtml, sendInsightsBrief } from "@/lib/email/send";
import { SITE } from "@/lib/site";
import { accountGeo, type CountryCode } from "@/lib/visitor-geo";
import { isEnabledLocale, type Locale } from "@/i18n/config";
import { regionName, tradeName } from "@/i18n/terms";
import { canonicalProvince } from "@/lib/data/price-benchmarks";
import { isoWeekKey, type InsightData } from "./detectors";
import { insightsFor, type InsightRun } from "./engine";
import { renderView, templateFor, fmtFor, type RenderedInsight } from "./copy";
import { viewFacts, type Entitlements, type InsightView } from "./gating";
import { loadInsightData } from "./load";
import { scopeFromProfile } from "./scope";
import { polishInsights, insightsLlmEnabled, type Rejection } from "./writer";
import { BRIEF_MAX_INSIGHTS, BRIEF_MAX_LEADS, BRIEF_MAX_RECIPIENTS, briefSkipReason, insightsEmailEnabled, mergesLeads, renderBrief, type BriefSkip, type RenderedBrief } from "./email";

/**
 * The weekly brief's server side: who gets it (Trade Pro + trial trade
 * companies), what each gets (their own insights + merged weekly leads),
 * the send log, and the admin preview / dry run. Shared data loads ONCE per
 * run from the cached snapshots; per-member reads are small and batched.
 */

type Db = SupabaseClient;
type Pair = Record<string, string>;
const base = () => (process.env.NEXT_PUBLIC_SITE_URL || "https://pmrfp.com").replace(/\/$/, "");

/* ------------------------------------------------------------------ composing one brief */

export interface ComposeInput {
  run: InsightRun;
  ent: Entitlements;
  lang: Locale;
  leads: Lead[];
  tradeSlugs: string[];
  nameBySlug: ReadonlyMap<string, string>;
  area: string;
  trial: boolean;
  userId: string | null;
  polish: boolean;
}

export interface Composed {
  views: InsightView[];
  insights: RenderedInsight[];
  brief: RenderedBrief;
  rejections: Rejection[];
  polished: number;
  model: string | null;
  polishSkipped: string | null;
}

/** Facts → gated views → (optional) polish → rendered brief. Same path for cron, dry run and preview. */
export async function composeBrief(c: ComposeInput): Promise<Composed> {
  const all = viewFacts(c.run.ranked, c.ent);
  const open = all.filter((v): v is Extract<InsightView, { locked: false }> => !v.locked).slice(0, BRIEF_MAX_INSIGHTS);
  const teaser = all.find((v) => v.locked);
  const views: InsightView[] = [...open, ...(teaser ? [teaser] : [])];
  const polish = await polishInsights(
    open.map((v) => ({ fact: v.fact, template: templateFor(v.fact, c.lang).text })),
    c.lang,
    { enabled: c.polish },
  );
  const insights = views.map((v) => renderView(v, c.lang, v.locked ? undefined : polish.texts.get(v.fact.id)));
  const brief = renderBrief({
    lang: c.lang,
    tradeNames: c.tradeSlugs.map((s) => tradeName(c.nameBySlug.get(s) ?? s, c.lang)),
    area: c.area,
    insights,
    leads: c.leads,
    base: base(),
    trial: c.trial,
    unsubscribeUrl: c.userId ? unsubscribeUrl(base(), c.userId) : null,
    mailingAddress: process.env.BUSINESS_MAILING_ADDRESS?.trim() || DIGEST_ADDRESS,
    sender: DIGEST_SENDER,
    contactEmail: SITE.email,
  });
  return { views, insights, brief, rejections: polish.rejections, polished: polish.polished, model: polish.model, polishSkipped: polish.skipped };
}

/* ------------------------------------------------------------------ shared run data */

interface Shared {
  data: InsightData;
  projects: MajorProject[];
  regions: RegionRow[];
  trades: TradeRow[];
  regionNameById: Map<string, string>;
  wins: HubWin[];
}

async function loadShared(): Promise<Shared> {
  const [data, projects, regions, trades] = await Promise.all([
    loadInsightData(),
    getMajorProjects().catch(() => []),
    getTaxonomyRows("regions").catch(() => []),
    getTaxonomyRows("trade_categories").catch(() => []),
  ]);
  return {
    data,
    projects,
    regions: regions.map((r) => ({ id: r.id, slug: r.slug, name: r.name, province: r.province ?? null, country: r.country ?? null, parent_id: r.parent_id ?? null })),
    trades: trades.map((t) => ({ id: t.id, slug: t.slug, name: t.name })),
    regionNameById: new Map(regions.map((r) => [r.id, r.name])),
    wins: hubWins(data.rfps.filter((r) => !r.isDemo), [], { today: data.today, days: AWARD_DAYS }),
  };
}

/** One company's insights + every lead it could be sent (alert kinds). */
function memberRun(s: Shared, p: { country: CountryCode; org: { city?: string | null; province?: string | null }; tradeSlugs: string[]; regionIds: string[]; persona?: Persona }) {
  const profile = buildLeadProfile({ country: p.country, org: p.org, tradeSlugs: p.tradeSlugs, regionIds: p.regionIds, regions: s.regions, trades: s.trades });
  const leads =
    p.country === "CA" || s.wins.length
      ? matchLeads({ profile, rfps: [], projects: p.country === "CA" ? s.projects : [], regionNameById: s.regionNameById, today: s.data.today, kinds: ALERT_KINDS, wins: s.wins })
      : [];
  const scope = scopeFromProfile(profile, p.org.province ?? null);
  const run = insightsFor({ ...s.data, leads }, scope, p.persona ?? personaOf(p.tradeSlugs));
  return { profile, leads, scope, run };
}

function areaLabel(org: { city?: string | null }, province: string | null, country: CountryCode, lang: Locale): string {
  return org.city || (province ? regionName(province, lang) : fmtFor(lang).place(null, country));
}

/* ------------------------------------------------------------------ cron */

export interface BriefRow {
  userId: string;
  email: string;
  org: string;
  lang: Locale;
  country: CountryCode;
  persona: Persona;
  insights: number;
  leads: number;
  subject: string;
  polished: number;
}

export interface BriefRun {
  enabled: boolean;
  llm: boolean;
  dry: boolean;
  week: string;
  considered: number;
  sends: BriefRow[];
  skips: Partial<Record<BriefSkip, number>>;
  rejections: Rejection[];
  sent: number;
  skipped: string | null;
}

/**
 * Pick, build and (unless dry) send this week's briefs. Guard rails:
 *  - Sends NOTHING unless INSIGHTS_EMAIL_ENABLED is on; dry runs work regardless.
 *  - One per member per ISO week: insight_brief_log (user_id, week) is
 *    written BEFORE the send; a second run the same week skips. Without
 *    the table nothing is sent.
 *  - Respects the opportunity-email setting (off / email off = none) and
 *    its one-click unsubscribe link.
 *  - Merged leads go into lead_alert_log first, so they never come again
 *    in a lead alert.
 */
export async function runInsightsBrief(opts: { dry: boolean; now?: Date; max?: number }): Promise<BriefRun> {
  const enabled = insightsEmailEnabled();
  const empty = (skipped: string | null, week = ""): BriefRun => ({ enabled, llm: insightsLlmEnabled(), dry: opts.dry, week, considered: 0, sends: [], skips: {}, rejections: [], sent: 0, skipped });
  if (!isServiceConfigured()) return empty("no service client");
  if (!opts.dry && !enabled) return empty("INSIGHTS_EMAIL_ENABLED is off");

  const db = createServiceClient();
  const now = opts.now ?? new Date();
  const shared = await loadShared();
  const week = isoWeekKey(shared.data.today);
  const report = empty(null, week);

  const [subs, trials, intelIds] = await Promise.all([proOrgIds(db), activeTrialOrgIds(db, now), intelOrgIds(db, now)]);
  const proIds = [...new Set([...subs, ...trials])];
  if (!proIds.length) return { ...report, skipped: "no Trade Pro or trial companies" };

  const [{ data: orgRows }, { data: orgCats }, { data: orgRegs }, { data: members }] = await Promise.all([
    db.from("organizations").select("id,name,city,province,country,organization_type,status,is_demo").in("id", proIds),
    db.from("organization_categories").select("organization_id, trade_categories(slug)").in("organization_id", proIds),
    db.from("organization_regions").select("organization_id,region_id").in("organization_id", proIds),
    db.from("organization_members").select("organization_id,user_id").in("organization_id", proIds),
  ]);
  const orgs = ((orgRows ?? []) as { id: string; name: string; city: string | null; province: string | null; country: string | null; organization_type: string; status: string; is_demo: boolean }[]).filter(
    (o) => o.organization_type === "trade_company" && o.status !== "suspended" && !o.is_demo,
  );
  const slugsByOrg = new Map<string, string[]>();
  for (const r of (orgCats ?? []) as unknown as { organization_id: string; trade_categories: { slug: string } | null }[]) {
    if (r.trade_categories?.slug) slugsByOrg.set(r.organization_id, [...(slugsByOrg.get(r.organization_id) ?? []), r.trade_categories.slug]);
  }
  const regionsByOrg = group((orgRegs ?? []) as Pair[], "organization_id", "region_id");
  const usersByOrg = group((members ?? []) as Pair[], "organization_id", "user_id");
  const userIds = [...new Set(((members ?? []) as Pair[]).map((m) => m.user_id))];
  const ids = userIds.length ? userIds : ["00000000-0000-0000-0000-000000000000"];
  const [{ data: profiles }, { data: prefs }, attrib, logged] = await Promise.all([
    db.from("users_profile").select("id,email,status").in("id", ids),
    db.from("notification_preferences").select("user_id,new_rfps,channel_email").in("user_id", ids),
    db.from("signup_attribution").select("user_id,lang").in("user_id", ids),
    db.from("insight_brief_log").select("user_id").eq("week", week).in("user_id", ids),
  ]);
  if (logged.error) {
    if (!opts.dry) return { ...report, skipped: isMissingTableError(logged.error) ? "insight_brief_log table missing (run migration 20261017000030)" : `log read failed: ${logged.error.message}` };
  }
  const sentThisWeek = new Set(((logged.data ?? []) as { user_id: string }[]).map((r) => r.user_id));
  const emailById = new Map(((profiles ?? []) as { id: string; email: string; status: string }[]).filter((p) => p.email && p.status !== "suspended").map((p) => [p.id, p.email]));
  const prefById = new Map(((prefs ?? []) as { user_id: string; new_rfps: string; channel_email: boolean }[]).map((p) => [p.user_id, p]));
  const langById = new Map(((attrib.data ?? []) as { user_id: string; lang: string | null }[]).map((a) => [a.user_id, a.lang]));
  const countryByRegion = regionCountryMap(shared.regions);
  const max = opts.max ?? BRIEF_MAX_RECIPIENTS;
  const skip = (r: BriefSkip) => (report.skips[r] = (report.skips[r] ?? 0) + 1);

  for (const org of orgs) {
    if (report.sends.length >= max) break;
    const tradeSlugs = slugsByOrg.get(org.id) ?? [];
    if (!tradeSlugs.length) continue;
    const regionIds = [...(regionsByOrg.get(org.id) ?? [])];
    const country = primaryCountry(org, regionIds, countryByRegion);
    const m = memberRun(shared, { country, org, tradeSlugs, regionIds });
    const ent: Entitlements = { pro: true, intel: intelIds.has(org.id) };
    const trial = trials.has(org.id) && !subs.has(org.id);

    for (const userId of usersByOrg.get(org.id) ?? []) {
      if (report.sends.length >= max) break;
      report.considered++;
      const email = emailById.get(userId) ?? null;
      const cadence: LeadCadence | null = leadCadence(prefById.get(userId));
      const rawLang = langById.get(userId);
      const lang: Locale = isEnabledLocale(rawLang) ? rawLang : "en";
      let leads: Lead[] = [];
      if (email && cadence && mergesLeads(cadence) && !sentThisWeek.has(userId)) {
        const candidates = pickLeadAlerts(m.leads, { alreadySent: new Set(), today: shared.data.today, cadence, max: 50 });
        const already = candidates.length ? await sentLeadKeys(db, userId, candidates.map((l) => l.key)) : new Set<string>();
        leads = pickLeadAlerts(candidates, { alreadySent: already ?? new Set(candidates.map((l) => l.key)), today: shared.data.today, cadence, max: BRIEF_MAX_LEADS });
        if (leads.length) leads = attachProjectPro(leads, await projectPro(db, leads));
      }
      const openCount = viewFacts(m.run.ranked, ent).filter((v) => !v.locked).length;
      const why = briefSkipReason({ email, cadence, sentThisWeek: sentThisWeek.has(userId), insights: Math.min(openCount, BRIEF_MAX_INSIGHTS), leads: leads.length });
      if (why) {
        skip(why);
        continue;
      }
      const province = m.scope.provinces[0] ?? canonicalProvince(org.province);
      const composed = await composeBrief({
        run: m.run,
        ent,
        lang,
        leads,
        tradeSlugs,
        nameBySlug: m.profile.nameBySlug,
        area: areaLabel(org, province ?? null, country, lang),
        trial,
        userId,
        polish: insightsLlmEnabled(),
      });
      report.rejections.push(...composed.rejections);
      const row: BriefRow = {
        userId,
        email: email!,
        org: org.name,
        lang,
        country,
        persona: m.run.persona,
        insights: composed.views.filter((v) => !v.locked).length,
        leads: leads.length,
        subject: composed.brief.subject,
        polished: composed.polished,
      };
      if (opts.dry) {
        report.sends.push(row);
        continue;
      }
      // Record first: a slow or failed send never causes a second brief this week.
      const { data: claimed, error } = await db
        .from("insight_brief_log")
        .upsert(
          {
            user_id: userId,
            week,
            organization_id: org.id,
            status: "sending",
            fact_ids: composed.views.map((v) => (v.locked ? v.stub.id : v.fact.id)).slice(0, 20),
            lead_keys: leads.map((l) => l.key),
            polished: composed.polished,
            lang,
          },
          { onConflict: "user_id,week", ignoreDuplicates: true },
        )
        .select("user_id");
      if (error) {
        report.skipped = isMissingTableError(error) ? "insight_brief_log table missing (run migration 20261017000030)" : `log write failed: ${error.message}`;
        break;
      }
      if (!claimed?.length) {
        skip("already-sent");
        continue;
      }
      if (leads.length) {
        await db.from("lead_alert_log").upsert(leads.map((l) => ({ user_id: userId, lead_key: l.key })), { onConflict: "user_id,lead_key", ignoreDuplicates: true });
      }
      await sendInsightsBrief(email!, composed.brief, lang, unsubscribeUrl(base(), userId));
      await db.from("insight_brief_log").update({ status: "sent", sent_at: new Date().toISOString() }).eq("user_id", userId).eq("week", week);
      await db.from("notifications").insert({ user_id: userId, type: "insights_brief", title: composed.brief.subject, message: composed.insights.slice(0, 2).map((i) => i.title).join(" · "), link_url: "/dashboard" });
      if (composed.rejections.length) await logRejections(db, composed.rejections, userId, "brief");
      report.sends.push(row);
      report.sent++;
    }
  }
  return report;
}

/* ------------------------------------------------------------------ admin preview */

export interface PreviewInput {
  /** A real company (service role read of its trades and areas)… */
  orgId?: string | null;
  /** …or a sample profile. */
  sample?: { country: CountryCode; province: string | null; tradeSlugs: string[] };
  persona?: Persona | null;
  lang: Locale;
  ent: Entitlements;
  polish: boolean;
}

export interface Preview {
  orgName: string | null;
  run: InsightRun;
  composed: Composed;
  html: string;
  /** What the dashboard card would show this viewer. */
  card: RenderedInsight[];
  error: string | null;
}

export async function previewInsights(p: PreviewInput): Promise<Preview | { error: string }> {
  const shared = await loadShared();
  let orgName: string | null = null;
  let country: CountryCode = p.sample?.country ?? "CA";
  let org: { city?: string | null; province?: string | null } = { province: p.sample?.province ?? null };
  let tradeSlugs = p.sample?.tradeSlugs ?? [];
  let regionIds = shared.regions.filter((r) => r.name === p.sample?.province).map((r) => r.id);
  if (p.orgId) {
    if (!isServiceConfigured()) return { error: "No service client: use a sample profile." };
    const db = createServiceClient();
    const [{ data: o }, { data: cats }, { data: regs }] = await Promise.all([
      db.from("organizations").select("id,name,city,province,country").eq("id", p.orgId).maybeSingle<{ id: string; name: string; city: string | null; province: string | null; country: string | null }>(),
      db.from("organization_categories").select("trade_categories(slug)").eq("organization_id", p.orgId),
      db.from("organization_regions").select("region_id").eq("organization_id", p.orgId),
    ]);
    if (!o) return { error: "No organization with that id." };
    orgName = o.name;
    org = o;
    tradeSlugs = ((cats ?? []) as unknown as { trade_categories: { slug: string } | null }[]).map((r) => r.trade_categories?.slug).filter((s): s is string => Boolean(s));
    regionIds = ((regs ?? []) as { region_id: string }[]).map((r) => r.region_id);
    country = primaryCountry(o, regionIds, regionCountryMap(shared.regions));
  }
  if (!tradeSlugs.length) return { error: "That profile has no trades." };
  const m = memberRun(shared, { country, org, tradeSlugs, regionIds, persona: p.persona ?? undefined });
  const province = m.scope.provinces[0] ?? null;
  const composed = await composeBrief({
    run: m.run,
    ent: p.ent,
    lang: p.lang,
    leads: pickLeadAlerts(m.leads, { alreadySent: new Set(), today: shared.data.today, cadence: "weekly", max: BRIEF_MAX_LEADS }),
    tradeSlugs,
    nameBySlug: m.profile.nameBySlug,
    area: areaLabel(org, province, country, p.lang),
    trial: false,
    userId: null,
    polish: p.polish,
  });
  if (composed.rejections.length && isServiceConfigured()) await logRejections(createServiceClient(), composed.rejections, null, "preview").catch(() => undefined);
  const card = viewFacts(m.run.ranked, p.ent).slice(0, 8).map((v) => renderView(v, p.lang));
  return { orgName, run: m.run, composed, html: insightsBriefHtml(composed.brief, p.lang), card, error: null };
}

/* ------------------------------------------------------------------ helpers */

async function logRejections(db: Db, rows: Rejection[], userId: string | null, source: "brief" | "preview") {
  const { error } = await db.from("insight_rejections").insert(
    rows.map((r) => ({ source, user_id: userId, fact_id: r.factId.slice(0, 300), kind: r.kind, lang: r.lang, reason: r.reason.slice(0, 1000), template: r.template, output: r.output.slice(0, 4000), model: r.model })),
  );
  if (error && !isMissingTableError(error)) console.warn("[insights] rejection log failed", error.message);
}

/** Active / comped Pro or Featured subscriptions. */
async function proOrgIds(db: Db): Promise<Set<string>> {
  const { data, error } = await db.from("subscriptions").select("organization_id,status,tier").in("status", ["active", "comped"]);
  if (error) return new Set();
  return new Set(((data ?? []) as { organization_id: string; tier: string | null }[]).filter((s) => s.tier === "pro" || s.tier === "featured").map((s) => s.organization_id));
}

/** Organizations with Award Intelligence right now (same rule as lib/entitlement/intel). */
async function intelOrgIds(db: Db, now: Date): Promise<Set<string>> {
  const { data, error } = await db.from("intel_access").select("organization_id,status,expires_at");
  if (error || !data) return new Set();
  return new Set(((data as { organization_id: string; status: string; expires_at: string | null }[]).filter((r) => isIntelRowActive(r, now))).map((r) => r.organization_id));
}

function primaryCountry(org: { province: string | null; country: string | null }, regionIds: string[], byRegion: ReadonlyMap<string, CountryCode>): CountryCode {
  const own = accountGeo(org)?.country;
  if (own === "US" || own === "CA") return own;
  return orgCountries(org, regionIds, byRegion).has("CA") ? "CA" : "US";
}

/** Keys already sent as lead alerts. Null = unknown (table missing or error): treat all as sent. */
async function sentLeadKeys(db: Db, userId: string, keys: string[]): Promise<Set<string> | null> {
  const { data, error } = await db.from("lead_alert_log").select("lead_key").eq("user_id", userId).in("lead_key", keys);
  if (error) return null;
  return new Set(((data ?? []) as { lead_key: string }[]).map((r) => r.lead_key));
}

async function projectPro(db: Db, leads: Lead[]) {
  const ids = leads.filter((l) => l.key.startsWith("mp:") && (l.hasContractor || l.hasBidRoute)).map((l) => l.key.slice(3));
  const out = new Map<string, { generalContractor: string | null; bidListUrl: string | null; bidRoute: string | null }>();
  if (!ids.length) return out;
  const { data } = await db.from("major_projects").select("id,general_contractor,bid_list_url,bid_route").in("id", ids);
  for (const r of (data ?? []) as { id: string; general_contractor: string | null; bid_list_url: string | null; bid_route: string | null }[]) {
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
