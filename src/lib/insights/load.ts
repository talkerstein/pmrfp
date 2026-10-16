import "server-only";
import { cache } from "react";
import { listAllRfpsCached } from "@/lib/data/trade-city";
import { getCategories, getTaxonomyRows, type CategoryOption } from "@/lib/data/taxonomy";
import { loadIntel } from "@/lib/intel/load";
import { loadBenchmarkData } from "@/lib/data/price-benchmarks-load";
import { provinceFromSlug } from "@/lib/data/price-benchmarks";
import { getMajorProjects } from "@/lib/major-projects/data";
import { buildLeadProfile, matchLeads, type LeadKind, type LeadProfile } from "@/lib/leads/match";
import { personaOf, type Persona } from "@/lib/lifecycle/persona";
import type { CountryCode } from "@/lib/visitor-geo";
import type { RfpListItem } from "@/lib/data/types";
import type { InsightData } from "./detectors";
import { scopeFromProfile } from "./scope";

export { scopeFromProfile };
import { insightsFor, type InsightRun } from "./engine";
import { indexableMarkets, marketMonth, type MarketIndexEntry, type MarketMonth } from "./market";
import { positioningFor, type Positioning } from "./positioning";
import type { TradeRef } from "./types";

/**
 * Insight inputs from the SHARED cached snapshots only (DB-load rules from
 * PR #136): the board snapshot (lib/data/board-snapshot via
 * listAllRfpsCached), award notices and benchmark rows derived from it
 * (lib/intel/load, lib/data/price-benchmarks-load), the major-projects
 * snapshot, and the hour-cached taxonomy. No queries of its own; built once
 * per request with React cache(), never inside unstable_cache.
 */
export const loadInsightData = cache(async (): Promise<InsightData & { categories: CategoryOption[] }> => {
  const [rfps, intel, bench, categories] = await Promise.all([
    listAllRfpsCached().catch(() => [] as RfpListItem[]),
    loadIntel(),
    loadBenchmarkData(),
    getCategories().catch(() => [] as CategoryOption[]),
  ]);
  return { today: intel.today, rfps, awards: intel.awards, refs: intel.refs, benchmarkAwards: bench.awards, leads: null, categories };
});

const PROJECT_KINDS: ReadonlySet<LeadKind> = new Set(["project", "permit", "application"]);

/** Project / permit / application leads for a profile (pure matcher over the cached snapshots). */
export async function projectLeadsFor(profile: LeadProfile, today: string) {
  if (profile.country !== "CA") return [];
  const [projects, regions] = await Promise.all([getMajorProjects().catch(() => []), getTaxonomyRows("regions").catch(() => [])]);
  return matchLeads({ profile, rfps: [], projects, regionNameById: new Map(regions.map((r) => [r.id, r.name])), today, kinds: PROJECT_KINDS });
}

/** Insights for a member's market (the dashboard and the weekly brief). */
export async function insightsForProfile(profile: LeadProfile, orgProvince: string | null, persona?: Persona): Promise<InsightRun> {
  const data = await loadInsightData();
  const leads = await projectLeadsFor(profile, data.today);
  const scope = scopeFromProfile(profile, orgProvince);
  return insightsFor({ ...data, leads }, scope, persona ?? personaOf([...profile.tradeSlugs]));
}

/**
 * A synthetic member (admin preview, sample reports): trade slugs + a
 * province or state, profile built the same way the lead feed builds one.
 */
export async function insightsForSample(p: { country: CountryCode; province: string | null; tradeSlugs: string[]; persona?: Persona }): Promise<InsightRun> {
  const [regions, trades] = await Promise.all([getTaxonomyRows("regions").catch(() => []), getTaxonomyRows("trade_categories").catch(() => [])]);
  const profile = buildLeadProfile({
    country: p.country,
    org: { province: p.province },
    tradeSlugs: p.tradeSlugs,
    regionIds: regions.filter((r) => r.name === p.province).map((r) => r.id),
    regions: regions.map((r) => ({ id: r.id, slug: r.slug, name: r.name, province: r.province ?? null, country: r.country ?? null, parent_id: r.parent_id ?? null })),
    trades: trades.map((t) => ({ id: t.id, slug: t.slug, name: t.name })),
  });
  return insightsForProfile(profile, p.province, p.persona);
}

/** The bid-positioning record for one listing (RFP detail page). */
export async function positioningForListing(r: Pick<RfpListItem, "categories" | "province" | "regionName" | "summary">): Promise<Positioning | null> {
  const data = await loadInsightData();
  return positioningFor(r, { ...data, tradeSlug: new Map(data.categories.map((c) => [c.name, c.slug])) });
}

const tradeRefs = (cats: readonly CategoryOption[]): TradeRef[] => cats.map((c) => ({ slug: c.slug, name: c.name }));

/** /insights/[trade]/[province], or null for an unknown trade or place. */
export const loadMarketMonth = cache(async (tradeSlug: string, provSlug: string): Promise<MarketMonth | null> => {
  const province = provinceFromSlug(provSlug);
  if (!province) return null;
  const data = await loadInsightData();
  const cat = data.categories.find((c) => c.slug === tradeSlug);
  if (!cat) return null;
  return marketMonth(data, { slug: cat.slug, name: cat.name }, province);
});

/** Indexable market pages in one country (the /insights index and the sitemap). */
export const loadMarketIndex = cache(async (country: CountryCode): Promise<MarketIndexEntry[]> => {
  const data = await loadInsightData();
  return indexableMarkets(data, country, tradeRefs(data.categories));
});
