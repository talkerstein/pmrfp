import { createReadClient } from "@/lib/supabase/read";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import {
  DEMO_CATEGORIES,
  DEMO_PROPERTY_TYPES,
  DEMO_REGIONS,
} from "@/lib/demo-data";

export interface CategoryOption { slug: string; name: string; icon: string | null }
export interface RegionOption { slug: string; name: string; province: string | null; country: string }
export interface PropertyTypeOption { slug: string; name: string }

export async function getCategories(): Promise<CategoryOption[]> {
  if (!isSupabaseConfigured()) {
    return DEMO_CATEGORIES.map((c) => ({ slug: c.slug, name: c.name, icon: c.icon }));
  }
  const supabase = createReadClient();
  const { data } = await supabase
    .from("trade_categories")
    .select("slug,name,icon")
    .eq("active", true)
    .order("sort_order");
  return (data as CategoryOption[] | null) ?? [];
}

export async function getRegions(): Promise<RegionOption[]> {
  if (!isSupabaseConfigured()) {
    return DEMO_REGIONS.map((r) => ({ slug: r.slug, name: r.name, province: r.province, country: "Canada" }));
  }
  const supabase = createReadClient();
  const { data } = await supabase
    .from("regions")
    .select("slug,name,province,country")
    .eq("active", true)
    .order("sort_order");
  return (data as RegionOption[] | null) ?? [];
}

export async function getPropertyTypes(): Promise<PropertyTypeOption[]> {
  if (!isSupabaseConfigured()) {
    return DEMO_PROPERTY_TYPES.map((p) => ({ slug: p.slug, name: p.name }));
  }
  const supabase = createReadClient();
  const { data } = await supabase
    .from("property_types")
    .select("slug,name")
    .eq("active", true)
    .order("name");
  return (data as PropertyTypeOption[] | null) ?? [];
}
