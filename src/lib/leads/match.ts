/**
 * The Lead Feed matcher: for one trade company, every lead in ITS country,
 * trades and area, scored and sorted. Leads are:
 *   bid          an open RFP / public tender in their trade
 *   package      an open GC sub-trade package in their trade
 *   award        public work just awarded (last AWARD_DAYS days): in their
 *                trade, or a general-contracting award when they're a
 *                building sub-trade (the GC who won is about to hire subs)
 *   project      a major project (provincial / federal inventories,
 *                funding lists, capital plans) that's proposed, approved or
 *                under construction
 *   permit       a C$3M+ city building permit, issued recently
 *   application  a large development application (rezoning / site plan)
 * Canada and the U.S. are never mixed: everything is filtered to the
 * member's country first (major projects are Canada only). Pure: it reads
 * the shared cached snapshots its caller passes in and nothing else
 * (test/unit/lead-feed.test.ts).
 */
import type { RfpListItem } from "@/lib/data/types";
import type { MajorProject } from "@/lib/major-projects/data";
import type { MajorProjectStatus } from "@/lib/major-projects/model";
import { expandRegionIds } from "@/lib/data/region-tree";
import { hubWins, openPackages, type HubWin } from "@/lib/gc/hub";
import { isPastContract } from "@/lib/data/fomo";
import { isGcPackage } from "@/lib/gc/packages";
import { countryOf, type CountryCode } from "@/lib/visitor-geo";
import { GC_SUB_TRADES, projectTradeMatch, type TradeMatch } from "./trades";

export const LEAD_KINDS = ["bid", "package", "award", "project", "permit", "application"] as const;
export type LeadKind = (typeof LEAD_KINDS)[number];

/** How far back an award counts as "just won". */
export const AWARD_DAYS = 90;
/** A permit older than this is past the point where subs get hired. */
export const PERMIT_MAX_AGE_DAYS = 365;
/** Development applications: 1-3 years before construction, so a longer window. */
export const APPLICATION_MAX_AGE_DAYS = 1095;

export type LeadArea = "city" | "region" | "province";

/** trade_categories.name of general-contracting (board listings carry names). */
const GC_CATEGORY_NAME = "General Contracting";

/** Fields only Trade Pro (and trial) members see. Never sent to free members. */
export interface LeadProFields {
  /** GC / builder / award winner. */
  contractor: string | null;
  /** Public buyer on an award, or the owner of a project. */
  buyer: string | null;
  bidListUrl: string | null;
  bidRoute: string | null;
  /** Where the facts come from (the publisher's page). */
  sourceUrl: string | null;
}

export interface Lead {
  /** 'rfp:<slug>' | 'mp:<id>'. Stable across runs (alert dedupe). */
  key: string;
  kind: LeadKind;
  title: string;
  summary: string | null;
  city: string | null;
  province: string | null;
  area: LeadArea;
  /** The news date: award date, permit date, last status change. */
  date: string | null;
  /** When it became news to PMRFP: first imported or last status change (alerts use it). */
  seen: string | null;
  /** Bids and packages: closing date. */
  deadline: string | null;
  valueCad: number | null;
  /** The member's trades this lead is for (slugs). */
  trades: string[];
  tradeMatch: TradeMatch;
  /** Internal page: /rfps/<slug> or /major-projects/<slug>. */
  href: string;
  status: MajorProjectStatus | null;
  /** Public flags: a GC / bid route exists (the values themselves are Pro). */
  hasContractor: boolean;
  hasBidRoute: boolean;
  score: number;
  pro: LeadProFields | null;
}

export interface RegionRow {
  id: string;
  slug: string;
  name: string;
  province?: string | null;
  country?: string | null;
  parent_id?: string | null;
}

export interface TradeRow {
  id: string;
  slug: string;
  name: string;
}

/** Who we're matching for, resolved once (buildLeadProfile). */
export interface LeadProfile {
  country: CountryCode;
  tradeSlugs: ReadonlySet<string>;
  /** slug → display name (board listings carry names, not slugs). */
  nameBySlug: ReadonlyMap<string, string>;
  /** Lowercase. The company's own city and the leaf areas it picked. */
  cities: ReadonlySet<string>;
  /** Lowercase local area names it serves (metros, cities under them). */
  regionNames: ReadonlySet<string>;
  /** Full province / state names it serves, in its country. */
  provinces: ReadonlySet<string>;
  /** Region ids it serves (expanded), for major projects filed by region. */
  regionIds: ReadonlySet<string>;
}

const lc = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();
const NATIONAL = new Set(["canada", "united-states"]);

/** Province / state of a region row (U.S. state rows carry the state as their name). */
function regionProvince(r: RegionRow): string | null {
  if (r.province) return r.province;
  const us = lc(r.country) === "usa" || lc(r.country) === "us" || lc(r.country) === "united states";
  return us && !NATIONAL.has(r.slug) && r.name !== "United States" ? r.name : null;
}

function regionCountry(r: RegionRow): CountryCode {
  const c = lc(r.country);
  return c === "usa" || c === "us" || c === "united states" ? "US" : "CA";
}

/**
 * The profile for one company: its trades (slugs + names) and its area from
 * its service regions (a region covers everything under it), its own city
 * and province. Only the member's country counts.
 */
export function buildLeadProfile(p: {
  country: CountryCode;
  org: { city?: string | null; province?: string | null };
  tradeSlugs: readonly string[];
  regionIds: readonly string[];
  regions: readonly RegionRow[];
  trades: readonly TradeRow[];
}): LeadProfile {
  const byId = new Map(p.regions.map((r) => [r.id, r]));
  const selected = p.regionIds.filter((id) => byId.has(id) && regionCountry(byId.get(id)!) === p.country);
  const expanded = expandRegionIds(selected, p.regions.map((r) => ({ id: r.id, parent_id: r.parent_id ?? null })));
  const hasChildren = new Set(p.regions.map((r) => r.parent_id).filter(Boolean) as string[]);
  const provinces = new Set<string>();
  const regionNames = new Set<string>();
  const cities = new Set<string>();
  for (const id of expanded) {
    const r = byId.get(id);
    if (!r || regionCountry(r) !== p.country) continue;
    const prov = regionProvince(r);
    if (prov) provinces.add(prov);
    const local = !NATIONAL.has(r.slug) && prov != null && lc(r.name) !== lc(prov);
    if (!local) continue;
    regionNames.add(lc(r.name));
    // A city-level pick (no areas under it) is "same city".
    if (selected.includes(id) && !hasChildren.has(id)) cities.add(lc(r.name));
  }
  if (p.org.city) cities.add(lc(p.org.city));
  if (p.org.province && countryOf({ province: p.org.province }) === p.country) provinces.add(p.org.province);
  const slugs = new Set(p.tradeSlugs);
  return {
    country: p.country,
    tradeSlugs: slugs,
    nameBySlug: new Map(p.trades.filter((t) => slugs.has(t.slug)).map((t) => [t.slug, t.name])),
    cities,
    regionNames,
    provinces,
    regionIds: expanded,
  };
}

/** Same city > same region > same province; null = outside the member's area. */
export function areaOf(
  item: { city?: string | null; regionName?: string | null; province?: string | null },
  profile: Pick<LeadProfile, "cities" | "regionNames" | "provinces">,
): LeadArea | null {
  const city = lc(item.city);
  const region = lc(item.regionName);
  if (city && profile.cities.has(city)) return "city";
  if ((region && profile.regionNames.has(region)) || (city && profile.regionNames.has(city))) return "region";
  if (region && profile.cities.has(region)) return "region";
  if (item.province && profile.provinces.has(item.province)) return "province";
  return null;
}

/* ------------------------------------------------------------------ scoring */

const AREA_POINTS: Record<LeadArea, number> = { city: 30, region: 20, province: 10 };
const DAY = 86_400_000;
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b.slice(0, 10)) - Date.parse(a.slice(0, 10))) / DAY);

/** 10 for today, falling to 0 at `window` days old. */
export function recencyPoints(date: string | null, today: string, window: number): number {
  if (!date) return 2;
  const age = daysBetween(date, today);
  if (!Number.isFinite(age)) return 2;
  return Math.max(0, Math.min(10, 10 * (1 - Math.max(0, age) / window)));
}

/** C$100k = 0 … C$1M = 2, C$10M = 4, C$100M = 6, C$1B+ = 8. */
export function valuePoints(v: number | null): number {
  if (!v || v <= 0) return 0;
  return Math.max(0, Math.min(8, (Math.log10(v) - 5) * 2));
}

export function leadScore(p: {
  area: LeadArea;
  recency: number;
  value: number | null;
  match: TradeMatch;
  actionable: boolean;
}): number {
  return AREA_POINTS[p.area] + p.recency + valuePoints(p.value) + (p.match === "named" ? 4 : 0) + (p.actionable ? 6 : 0);
}

/* ------------------------------------------------------------------ matching */

export interface MatchInput {
  profile: LeadProfile;
  /** The board (listRfps for the member's country, or all of it). */
  rfps: readonly RfpListItem[];
  /** The major-projects snapshot (Canada only; [] when the tables aren't there). */
  projects: readonly MajorProject[];
  /** region id → name, for projects filed by region. */
  regionNameById?: ReadonlyMap<string, string>;
  /** Trade Pro fields for projects by id (read under the member's session), if any. */
  projectPro?: ReadonlyMap<string, { generalContractor: string | null; bidListUrl: string | null; bidRoute: string | null }>;
  today: string;
  /** Only these kinds (alerts skip bids and packages). Default: all. */
  kinds?: ReadonlySet<LeadKind>;
  /** Awards already computed from the same board (a cron matching many members computes them once). */
  wins?: readonly HubWin[];
}

function projectKind(p: Pick<MajorProject, "source" | "status">): LeadKind {
  if (p.source.startsWith("permits-")) return "permit";
  if (p.status === "application" || p.source.startsWith("apps-")) return "application";
  return "project";
}

const LIVE_STATUSES: ReadonlySet<MajorProjectStatus> = new Set(["application", "proposed", "approved", "under_construction", "unknown"]);

/** The project's news date: last status change, else the source's status date, else first import. */
function projectDate(p: Pick<MajorProject, "statusChangedAt" | "statusDate" | "firstSeen">): string | null {
  return (p.statusChangedAt?.slice(0, 10) ?? p.statusDate ?? p.firstSeen) || null;
}

/**
 * Still a lead for somebody: not stale, not finished / cancelled / on hold,
 * and (permits, applications) recent enough that subs are still being hired.
 */
export function isLiveLeadProject(p: Pick<MajorProject, "stale" | "status" | "source" | "statusChangedAt" | "statusDate" | "firstSeen">, today: string): boolean {
  if (p.stale || !LIVE_STATUSES.has(p.status)) return false;
  const kind = projectKind(p);
  const date = projectDate(p);
  if (kind === "permit" && date && daysBetween(date, today) > PERMIT_MAX_AGE_DAYS) return false;
  if (kind === "application" && date && daysBetween(date, today) > APPLICATION_MAX_AGE_DAYS) return false;
  return true;
}

/** Every lead for the profile, best first. */
export function matchLeads(input: MatchInput): Lead[] {
  const { profile, today } = input;
  if (!profile.tradeSlugs.size) return [];
  const out: Lead[] = [];
  const want = (k: LeadKind) => !input.kinds || input.kinds.has(k);
  const needBoard = want("bid") || want("package") || (want("award") && !input.wins);
  const rfps = needBoard ? input.rfps.filter((r) => !r.isDemo && countryOf(r) === profile.country) : [];

  // Open bids in their trade (not GC packages, not past contracts).
  for (const r of want("bid") ? rfps : []) {
    if (r.status !== "open" || isPastContract(r) || isGcPackage(r)) continue;
    const trades = tradesFor(r.categories, profile);
    if (!trades.length) continue;
    const area = areaOf(r, profile);
    if (!area) continue;
    out.push(rfpLead("bid", r, area, trades, today));
  }

  // Open GC sub-trade packages.
  for (const r of want("package") ? openPackages(rfps as RfpListItem[]) : []) {
    const trades = tradesFor(r.categories, profile);
    if (!trades.length) continue;
    const area = areaOf(r, profile);
    if (!area) continue;
    out.push(rfpLead("package", r, area, trades, today));
  }

  // Who just won public work: in their trade, or a GC award for a sub-trade.
  const isSub = [...profile.tradeSlugs].some((t) => GC_SUB_TRADES.has(t));
  const wins = !want("award")
    ? []
    : input.wins
      ? input.wins.filter((w) => countryOf(w) === profile.country)
      : hubWins(rfps as RfpListItem[], [], { today, days: AWARD_DAYS });
  for (const w of wins) {
    let trades = tradesFor(w.categories, profile);
    let match: TradeMatch = "named";
    if (!trades.length && isSub && w.categories.includes(GC_CATEGORY_NAME)) {
      trades = [...profile.tradeSlugs].filter((t) => GC_SUB_TRADES.has(t));
      match = "typical";
    }
    if (!trades.length) continue;
    const area = areaOf({ city: null, regionName: w.regionName, province: w.province }, profile);
    if (!area) continue;
    const recency = recencyPoints(w.date, today, AWARD_DAYS);
    out.push({
      key: `rfp:${w.slug}`,
      kind: "award",
      title: w.title,
      summary: null,
      city: null,
      province: w.province,
      area,
      date: w.date,
      seen: w.date,
      deadline: null,
      valueCad: w.amount,
      trades,
      tradeMatch: match,
      href: `/rfps/${w.slug}`,
      status: null,
      hasContractor: true,
      hasBidRoute: false,
      score: leadScore({ area, recency, value: w.amount, match, actionable: false }),
      pro: { contractor: w.winner, buyer: w.buyer, bidListUrl: null, bidRoute: null, sourceUrl: null },
    });
  }

  // Major projects, permits, development applications (Canada only).
  if (profile.country === "CA" && (want("project") || want("permit") || want("application"))) {
    for (const p of input.projects) {
      if (!isLiveLeadProject(p, today)) continue;
      const kind = projectKind(p);
      if (!want(kind)) continue;
      const date = projectDate(p);
      const tm = projectTradeMatch(p, profile.tradeSlugs);
      if (!tm) continue;
      const regionName = p.regionId ? input.regionNameById?.get(p.regionId) ?? null : null;
      const area = areaOf({ city: p.city, regionName, province: p.province }, profile);
      if (!area) continue;
      const window = kind === "permit" ? PERMIT_MAX_AGE_DAYS : kind === "application" ? APPLICATION_MAX_AGE_DAYS : 730;
      const recency = recencyPoints(date, today, window);
      const pro = input.projectPro?.get(p.id);
      out.push({
        key: `mp:${p.id}`,
        kind,
        title: p.name,
        summary: p.description,
        city: p.city,
        province: p.province,
        area,
        date,
        seen: (p.statusChangedAt ?? p.firstSeen)?.slice(0, 10) ?? null,
        deadline: null,
        valueCad: p.estValueCad,
        trades: tm.trades,
        tradeMatch: tm.match,
        href: `/major-projects/${p.slug}`,
        status: p.status,
        hasContractor: p.hasGc,
        hasBidRoute: p.hasBidRoute,
        score: leadScore({ area, recency, value: p.estValueCad, match: tm.match, actionable: false }),
        pro: {
          contractor: pro?.generalContractor ?? null,
          buyer: p.owner,
          bidListUrl: pro?.bidListUrl ?? null,
          bidRoute: pro?.bidRoute ?? null,
          sourceUrl: p.sources[0]?.url ?? null,
        },
      });
    }
  }

  return out.sort(
    (a, b) => b.score - a.score || (b.date ?? b.deadline ?? "").localeCompare(a.date ?? a.deadline ?? "") || a.key.localeCompare(b.key),
  );
}

/** The member's trade slugs whose display name is one of a listing's categories. */
function tradesFor(categoryNames: readonly string[], profile: LeadProfile): string[] {
  return [...profile.tradeSlugs].filter((s) => {
    const name = profile.nameBySlug.get(s);
    return name != null && categoryNames.includes(name);
  });
}

function rfpLead(kind: "bid" | "package", r: RfpListItem, area: LeadArea, trades: string[], today: string): Lead {
  // Open now: closing soon ranks a little higher, but anything open is actionable.
  const days = r.deadline ? daysBetween(today, r.deadline) : null;
  const recency = days == null ? 6 : days < 0 ? 0 : Math.max(4, 10 - days / 6);
  return {
    key: `rfp:${r.slug}`,
    kind,
    title: r.title,
    summary: r.summary,
    city: r.city,
    province: r.province,
    area,
    date: null,
    seen: null,
    deadline: r.deadline,
    valueCad: null,
    trades,
    tradeMatch: "named",
    href: `/rfps/${r.slug}`,
    status: null,
    hasContractor: false,
    hasBidRoute: true,
    score: leadScore({ area, recency, value: null, match: "named", actionable: true }),
    pro: null,
  };
}

/* ------------------------------------------------------------------ counts */

/** "This month" for the counts panel. */
export const MONTH_DAYS = 30;

export interface MarketCounts {
  /** Open now. */
  openBids: number;
  /** Major projects, permits and development applications that are news in the last MONTH_DAYS (issued, filed, status change, new on PMRFP). */
  projects: number;
  permits: number;
  applications: number;
  /** Distinct contractors who won public work in the last MONTH_DAYS. */
  winners: number;
  /** Open now. */
  packages: number;
  /** Every lead in the list (all live projects, awards in AWARD_DAYS, open bids). */
  total: number;
}

/** Honest counts for the "Your market this month" panel. */
export function marketCounts(leads: readonly Lead[], today: string): MarketCounts {
  const since = new Date(Date.parse(`${today}T00:00:00Z`) - MONTH_DAYS * DAY).toISOString().slice(0, 10);
  const thisMonth = (l: Lead) => (l.date ?? "") >= since && (l.date ?? "") <= today;
  const recent = (k: LeadKind) => leads.filter((l) => l.kind === k && thisMonth(l)).length;
  const winners = new Set(leads.filter((l) => l.kind === "award" && thisMonth(l)).map((l) => lc(l.pro?.contractor) || l.key)).size;
  const permits = recent("permit");
  const applications = recent("application");
  return {
    openBids: leads.filter((l) => l.kind === "bid").length,
    projects: recent("project") + permits + applications,
    permits,
    applications,
    winners,
    packages: leads.filter((l) => l.kind === "package").length,
    total: leads.length,
  };
}

/** Below this many leads the dashboard doesn't push an upgrade; it suggests widening instead. */
export const THIN_MARKET = 3;

export function isThinMarket(c: MarketCounts): boolean {
  return c.total < THIN_MARKET;
}
