import { createReadClient } from "@/lib/supabase/read";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { cache } from "react";
import { unstable_cache } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { cloudflareTaxonomy, matchingTaxonomy } from "./taxonomy-cloudflare";
import { TAXONOMY_DATA_TAG, TAXONOMY_DATA_TTL } from "@/lib/supabase/public-cache";
import {
  DEMO_CATEGORIES,
  DEMO_PROPERTY_TYPES,
  DEMO_REGIONS,
} from "@/lib/demo-data";

export interface CategoryOption { slug: string; name: string; icon: string | null }
export interface RegionOption { slug: string; name: string; province: string | null; country: string }
export interface PropertyTypeOption { slug: string; name: string }

import { TAXONOMY_SELECTS as SELECTS, type TaxonomyRow, type TaxonomyTable } from "@/lib/d1/taxonomy-contracts";
import { d1TaxonomyEnabled } from "@/lib/d1/taxonomy-backend";
export type { TaxonomyRow } from "@/lib/d1/taxonomy-contracts";

// One canonical projection per table, reused by dropdowns, maps and region
// trees. No active=true filter here: preserve every row allowed by anon RLS.
const getTaxonomyPage = unstable_cache(
  async (table: TaxonomyTable, from: number, _projectUrl: string): Promise<TaxonomyRow[]> => {
    void _projectUrl; // Scope Next's cache key to the database without storing request/user state.
    const { data, error } = await createReadClient().from(table).select(SELECTS[table]).order("id").range(from, from + 249);
    if (error) throw error;
    return (data ?? []) as unknown as TaxonomyRow[];
  },
  ["public-taxonomy-page-v1"],
  { tags: [TAXONOMY_DATA_TAG], revalidate: TAXONOMY_DATA_TTL },
);

// Cache parsed pages explicitly: Next's fetch cache does not persist HTTP 206.
// Small page entries also stay below the Data Cache size limit as regions grow.
async function sourceTaxonomy(table: TaxonomyTable, projectUrl: string): Promise<TaxonomyRow[]> {
  const out: TaxonomyRow[] = [];
  for (let from = 0; ; from += 250) {
    const page = await getTaxonomyPage(table, from, projectUrl);
    out.push(...page);
    if (page.length < 250) return out;
  }
}

const matchedCloudflareTaxonomy = unstable_cache(
  async (table: TaxonomyTable, projectUrl: string): Promise<TaxonomyRow[]> => {
    const candidate = cloudflareTaxonomy(table, process.env.PMRFP_PUBLIC_TAXONOMY_GATEWAY ?? "").catch(error => {
      unstable_rethrow(error);
      return null;
    });
    const [source, replica] = await Promise.all([sourceTaxonomy(table, projectUrl), candidate]);
    const matched = matchingTaxonomy(source, replica, SELECTS[table].split(","));
    console.info("[public-taxonomy-phase]", table, matched ? "cloudflare" : "source");
    return matched ?? source;
  },
  ["public-taxonomy-cloudflare-matched-v1"],
  { tags: [TAXONOMY_DATA_TAG], revalidate: 60 },
);

export const getTaxonomyRows = cache(async (table: TaxonomyTable): Promise<TaxonomyRow[]> => {
  if (d1TaxonomyEnabled()) return (await import("@/lib/d1/taxonomy-server")).d1TaxonomyRows(table);
  const projectUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  return process.env.PMRFP_PUBLIC_TAXONOMY_PHASE === "matched"
    ? matchedCloudflareTaxonomy(table, projectUrl)
    : sourceTaxonomy(table, projectUrl);
});

export async function getCategories(): Promise<CategoryOption[]> {
  if (!isSupabaseConfigured()) {
    return DEMO_CATEGORIES.map((c) => ({ slug: c.slug, name: c.name, icon: c.icon }));
  }
  return (await getTaxonomyRows("trade_categories")).filter((r) => r.active)
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map((r) => ({ slug: r.slug, name: r.name, icon: r.icon ?? null }));
}

export async function getRegions(): Promise<RegionOption[]> {
  if (!isSupabaseConfigured()) {
    return DEMO_REGIONS.map((r) => ({ slug: r.slug, name: r.name, province: r.province, country: "Canada" }));
  }
  return (await getTaxonomyRows("regions")).filter((r) => r.active)
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map((r) => ({ slug: r.slug, name: r.name, province: r.province ?? null, country: r.country ?? "Canada" }));
}

export async function getPropertyTypes(): Promise<PropertyTypeOption[]> {
  if (!isSupabaseConfigured()) {
    return DEMO_PROPERTY_TYPES.map((p) => ({ slug: p.slug, name: p.name }));
  }
  return (await getTaxonomyRows("property_types")).filter((r) => r.active)
    .sort((a, b) => a.name.localeCompare(b.name, "en"))
    .map((r) => ({ slug: r.slug, name: r.name }));
}
