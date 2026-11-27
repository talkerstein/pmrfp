export const TAXONOMY_SELECTS = {
  trade_categories: "id,slug,name,icon,active,sort_order",
  regions: "id,slug,name,province,country,parent_id,active,sort_order",
  property_types: "id,slug,name,active",
} as const;
export type TaxonomyTable = keyof typeof TAXONOMY_SELECTS;
export interface TaxonomyRow {
  id: string; slug: string; name: string; active: boolean;
  icon?: string | null; sort_order?: number; province?: string | null;
  country?: string; parent_id?: string | null;
}
export const TAXONOMY_PAGE_SIZE = 250;
export function isTaxonomyTable(value: string): value is TaxonomyTable {
  return Object.hasOwn(TAXONOMY_SELECTS, value);
}
