import { cache } from "react";
import { createReadClient } from "@/lib/supabase/read";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { DEMO_VENDORS } from "@/lib/demo-data";
import { getCategories, getRegions, type CategoryOption, type RegionOption } from "@/lib/data/taxonomy";
import { listRfps } from "@/lib/data/rfps";
import { isPastContract } from "@/lib/data/fomo";
import type { RfpListItem } from "@/lib/data/types";

/**
 * Programmatic trade × place pages (/trades/[category]/[city]), gated on real
 * content.
 *
 * The grid is ~45 trades × ~90 regions ≈ 4,000 possible pages. Shipping the
 * empty grid onto a domain where most pages already fail to index is the
 * scaled-content pattern the June noindex guard exists to prevent. So a page
 * EXISTS only when it has something real to show:
 *   - MIN_VENDORS approved companies serving that city, or
 *   - MIN_LISTINGS tenders in that trade and place, open or past (who won,
 *     for how much) — Search Console shows "window cleaning rfp toronto"-style
 *     searches, and these pages answer them with the actual RFPs.
 * Everything else 404s. Pages turn on by themselves (ISR) as vendors are
 * approved and tenders import.
 *
 * Tenders count toward their region and every region above it except the
 * country (a Toronto tender is also a GTA and an Ontario tender). A parent
 * page with exactly the same tenders as one of its children (GTA = Toronto
 * today) is dropped as a duplicate; the most specific place keeps the page.
 */
export const MIN_VENDORS = 2;
export const MIN_LISTINGS = 3;

export interface TradeCityCombo {
  category: CategoryOption;
  region: RegionOption;
  vendorCount: number;
  /** Open tenders/RFPs in this trade and place, soonest deadline first. */
  open: RfpListItem[];
  /** Past public contracts (award notices), most recent first. */
  past: RfpListItem[];
}

/** Countries: the trade hub already covers "Electrical in Canada". */
const NATIONAL = new Set(["canada", "united-states"]);
/** Provinces / country-level: fine for tender pages, not for the vendor gate
 *  (a company tagged "Ontario" isn't evidence of an Ontario city market). */
const NON_CITY_REGIONS = new Set(["canada", "united-states", "ontario", "quebec"]);

export interface RegionNodeLite {
  slug: string;
  name: string;
  parentSlug: string | null;
}

interface ComboRow {
  organization_categories: { trade_categories: { slug: string } | null }[];
  organization_regions: { regions: { slug: string } | null }[];
}

/** Count approved, active trade vendors per (category, region) pair. */
async function vendorComboCounts(): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  const bump = (cat: string, reg: string) => {
    const k = `${cat}|${reg}`;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  };

  if (!isSupabaseConfigured()) {
    for (const v of DEMO_VENDORS)
      for (const c of v.categories) for (const r of v.regions) bump(c, r);
    return counts;
  }

  const supabase = createReadClient();
  const { data } = await supabase
    .from("organizations")
    .select("organization_categories(trade_categories(slug)),organization_regions(regions(slug))")
    .eq("organization_type", "trade_company")
    .eq("profile_status", "approved")
    .eq("status", "active")
    .eq("is_demo", false)
    .limit(1000);

  for (const row of (data as unknown as ComboRow[]) ?? []) {
    const cats = row.organization_categories.map((c) => c.trade_categories?.slug).filter(Boolean) as string[];
    const regs = row.organization_regions.map((r) => r.regions?.slug).filter(Boolean) as string[];
    for (const c of cats) for (const r of regs) bump(c, r);
  }
  return counts;
}

async function regionTree(): Promise<RegionNodeLite[]> {
  if (!isSupabaseConfigured()) {
    return (await getRegions()).map((r) => ({ slug: r.slug, name: r.name, parentSlug: null }));
  }
  const { data } = await createReadClient().from("regions").select("id,slug,name,parent_id");
  const rows = (data ?? []) as { id: string; slug: string; name: string; parent_id: string | null }[];
  const slugById = new Map(rows.map((r) => [r.id, r.slug]));
  return rows.map((r) => ({ slug: r.slug, name: r.name, parentSlug: r.parent_id ? slugById.get(r.parent_id) ?? null : null }));
}

/**
 * Pure: which trade × place pages exist and what they hold. Exported for tests.
 * `rfps` carry category and region display names (as listRfps returns them).
 */
export function buildTradeCityIndex(input: {
  rfps: RfpListItem[];
  categories: CategoryOption[];
  regions: RegionOption[];
  tree: RegionNodeLite[];
  vendorCounts: Map<string, number>;
}): TradeCityCombo[] {
  const { rfps, categories, regions, tree, vendorCounts } = input;
  const catByName = new Map(categories.map((c) => [c.name, c]));
  const catBySlug = new Map(categories.map((c) => [c.slug, c]));
  const regBySlug = new Map(regions.map((r) => [r.slug, r]));
  const node = new Map(tree.map((n) => [n.slug, n]));
  const slugByName = new Map(tree.map((n) => [n.name, n.slug]));

  const ancestry = (slug: string): string[] => {
    const out: string[] = [];
    const seen = new Set<string>();
    for (let s: string | null = slug; s && !seen.has(s); s = node.get(s)?.parentSlug ?? null) {
      seen.add(s);
      if (!NATIONAL.has(s)) out.push(s);
    }
    return out;
  };

  const listings = new Map<string, { open: RfpListItem[]; past: RfpListItem[] }>();
  for (const r of rfps) {
    if (r.isDemo) continue;
    const past = isPastContract(r);
    if (!past && r.status !== "open") continue; // closed, never awarded: nothing to show
    const regionSlug = r.regionName ? slugByName.get(r.regionName) : undefined;
    if (!regionSlug) continue;
    for (const catName of r.categories) {
      const cat = catByName.get(catName);
      if (!cat) continue;
      for (const reg of ancestry(regionSlug)) {
        const key = `${cat.slug}|${reg}`;
        const bucket = listings.get(key) ?? { open: [], past: [] };
        (past ? bucket.past : bucket.open).push(r);
        listings.set(key, bucket);
      }
    }
  }

  const keys = new Set([...listings.keys(), ...vendorCounts.keys()]);
  const combos: TradeCityCombo[] = [];
  for (const key of keys) {
    const [catSlug, regSlug] = key.split("|");
    if (NATIONAL.has(regSlug)) continue;
    const category = catBySlug.get(catSlug);
    const region = regBySlug.get(regSlug);
    if (!category || !region) continue;
    const vendorCount = vendorCounts.get(key) ?? 0;
    const { open = [], past = [] } = listings.get(key) ?? {};
    const byVendors = vendorCount >= MIN_VENDORS && !NON_CITY_REGIONS.has(regSlug);
    const byListings = open.length + past.length >= MIN_LISTINGS;
    if (!byVendors && !byListings) continue;
    combos.push({
      category,
      region,
      vendorCount,
      open: [...open].sort((a, b) => (a.deadline ?? "9999").localeCompare(b.deadline ?? "9999")),
      past: [...past].sort((a, b) => (b.deadline ?? "").localeCompare(a.deadline ?? "")),
    });
  }

  // Drop a parent page whose tenders are exactly a child's (GTA = Toronto),
  // unless its own vendors qualify it. Deepest place wins.
  const sigKey = (c: TradeCityCombo) =>
    `${c.category.slug}|${[...c.open, ...c.past].map((r) => r.slug).sort().join(",")}`;
  const depth = (slug: string) => ancestry(slug).length;
  const deepest = new Map<string, number>();
  for (const c of combos) {
    if (!c.open.length && !c.past.length) continue;
    const k = sigKey(c);
    deepest.set(k, Math.max(deepest.get(k) ?? 0, depth(c.region.slug)));
  }
  const kept = combos.filter((c) => {
    const vendorGated = c.vendorCount >= MIN_VENDORS && !NON_CITY_REGIONS.has(c.region.slug);
    if (vendorGated || (!c.open.length && !c.past.length)) return true;
    return depth(c.region.slug) === deepest.get(sigKey(c));
  });

  return kept.sort(
    (a, b) =>
      b.open.length + b.past.length - (a.open.length + a.past.length) ||
      b.vendorCount - a.vendorCount ||
      a.category.slug.localeCompare(b.category.slug) ||
      a.region.slug.localeCompare(b.region.slug),
  );
}

/** The whole board, once per request (the page also needs it for winner links). */
export const listAllRfpsCached = cache(() => listRfps());

/** Every page that clears the gate — the ONLY pages that exist. Cached per request. */
export const listQualifyingCombos = cache(async (): Promise<TradeCityCombo[]> => {
  const [vendorCounts, categories, regions, tree, rfps] = await Promise.all([
    vendorComboCounts(),
    getCategories(),
    getRegions(),
    regionTree(),
    listAllRfpsCached(),
  ]);
  return buildTradeCityIndex({ rfps, categories, regions, tree, vendorCounts });
});

/** Gate check for one combo (runtime guard behind generateStaticParams). */
export async function getQualifyingCombo(
  categorySlug: string,
  citySlug: string,
): Promise<TradeCityCombo | null> {
  const combos = await listQualifyingCombos();
  return combos.find((c) => c.category.slug === categorySlug && c.region.slug === citySlug) ?? null;
}

/** Live pages for one trade — used for hub-page cross-links. */
export async function listCitiesForTrade(categorySlug: string): Promise<TradeCityCombo[]> {
  const combos = await listQualifyingCombos();
  return combos.filter((c) => c.category.slug === categorySlug);
}

/** Live pages for one place — used for region-page cross-links. */
export async function listTradesForRegion(regionSlug: string): Promise<TradeCityCombo[]> {
  const combos = await listQualifyingCombos();
  return combos.filter((c) => c.region.slug === regionSlug);
}
