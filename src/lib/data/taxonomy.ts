import { createReadClient } from "@/lib/supabase/read";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { cache } from "react";
import {
  DEMO_CATEGORIES,
  DEMO_PROPERTY_TYPES,
  DEMO_REGIONS,
} from "@/lib/demo-data";

export interface CategoryOption { slug: string; name: string; icon: string | null }
export interface RegionOption { slug: string; name: string; province: string | null; country: string }
export interface PropertyTypeOption { slug: string; name: string }

export interface TaxonomyRow {
  id: string; slug: string; name: string; active: boolean;
  icon?: string | null; sort_order?: number; province?: string | null;
  country?: string; parent_id?: string | null;
}
type TaxonomyTable = "trade_categories" | "regions" | "property_types";
const SELECTS: Record<TaxonomyTable, string> = {
  trade_categories: "id,slug,name,icon,active,sort_order",
  regions: "id,slug,name,province,country,parent_id,active,sort_order",
  property_types: "id,slug,name,active",
};

// One canonical projection per table, reused by dropdowns, maps and region
// trees. No active=true filter here: preserve every row allowed by anon RLS.
export const getTaxonomyRows = cache(async (table: TaxonomyTable): Promise<TaxonomyRow[]> => {
  const out: TaxonomyRow[] = [];
  const client = createReadClient();
  for (let from = 0; ; from += 250) {
    const { data, error } = await client.from(table).select(SELECTS[table]).order("id").range(from, from + 249);
    if (error) throw error;
    const page = (data ?? []) as unknown as TaxonomyRow[];
    out.push(...page);
    if (page.length < 250) return out;
  }
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
