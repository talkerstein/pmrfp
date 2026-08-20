import { createReadClient } from "@/lib/supabase/read";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { DEMO_VENDORS } from "@/lib/demo-data";
import { getCategories, getRegions, type CategoryOption, type RegionOption } from "@/lib/data/taxonomy";

/**
 * Programmatic trade×city pages, gated on real content.
 *
 * The grid is 41 trades × 25 regions ≈ 1,000 possible pages, but only ~10
 * combos have approved vendors today. Generating the full grid would ship
 * ~1,000 empty pages onto a domain where 215 already fail to index — the
 * scaled-content pattern the June noindex guard exists to prevent. So a combo
 * page EXISTS only when it clears MIN_VENDORS; everything else is a 404, not a
 * noindexed shell. Pages turn on automatically (ISR) as vendors are approved.
 *
 * This is also the sales mechanic: a paying trade is what turns their city
 * page on. When paid placement ships, drop the effective threshold to 1 for
 * combos containing a paying vendor — revenue and content are the same signal.
 */
export const MIN_VENDORS = 2;

export interface TradeCityCombo {
  category: CategoryOption;
  region: RegionOption;
  vendorCount: number;
}

/** Region slugs that are countries/provinces, not cities — excluded from the
 * city grid so we don't emit "Electrical in Canada" (that's the trade hub). */
const NON_CITY_REGIONS = new Set(["canada", "united-states", "ontario", "quebec"]);

interface ComboRow {
  profile_status: string;
  status: string;
  organization_type: string;
  organization_categories: { trade_categories: { slug: string } | null }[];
  organization_regions: { regions: { slug: string } | null }[];
}

/** Count approved, active trade vendors per (category, region) pair. */
async function comboCounts(): Promise<Map<string, number>> {
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
    .select(
      "profile_status,status,organization_type,organization_categories(trade_categories(slug)),organization_regions(regions(slug))",
    )
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

/** Every combo that clears the gate — the ONLY pages that exist. */
export async function listQualifyingCombos(): Promise<TradeCityCombo[]> {
  const [counts, cats, regions] = await Promise.all([comboCounts(), getCategories(), getRegions()]);
  const catBy = new Map(cats.map((c) => [c.slug, c]));
  const regBy = new Map(regions.map((r) => [r.slug, r]));

  const out: TradeCityCombo[] = [];
  for (const [key, count] of counts) {
    if (count < MIN_VENDORS) continue;
    const [catSlug, regSlug] = key.split("|");
    if (NON_CITY_REGIONS.has(regSlug)) continue;
    const category = catBy.get(catSlug);
    const region = regBy.get(regSlug);
    if (category && region) out.push({ category, region, vendorCount: count });
  }
  return out.sort(
    (a, b) => b.vendorCount - a.vendorCount || a.category.slug.localeCompare(b.category.slug),
  );
}

/** Gate check for one combo (runtime guard behind generateStaticParams). */
export async function getQualifyingCombo(
  categorySlug: string,
  citySlug: string,
): Promise<TradeCityCombo | null> {
  const combos = await listQualifyingCombos();
  return (
    combos.find((c) => c.category.slug === categorySlug && c.region.slug === citySlug) ?? null
  );
}

/** Live city pages for one trade — used for hub-page cross-links. */
export async function listCitiesForTrade(categorySlug: string): Promise<TradeCityCombo[]> {
  const combos = await listQualifyingCombos();
  return combos.filter((c) => c.category.slug === categorySlug);
}
