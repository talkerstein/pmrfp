import { isSupabaseConfigured } from "@/lib/supabase/config";
import { DEMO_RFPS, regionName } from "@/lib/demo-data";
import { getTaxonomyRows } from "./taxonomy";
import { getBoardRows } from "./board-snapshot";
import { countryOf, type CountryCode } from "@/lib/visitor-geo";

/**
 * Open-listing counts, counted from the shared board snapshot (no query of
 * their own). Used to be one exact-count query per region and per RFP detail
 * page (the current slug was part of the cache key), every 5 minutes.
 * `country` scopes the total to one country (country-first: never pass null
 * for a number a visitor sees).
 */
export async function getOpenRfpCounts(region: string | null = null, excludeSlug?: string, country: CountryCode | null = null): Promise<{ totalOpen: number; regionMatchCount: number }> {
  const today = new Date().toISOString().slice(0, 10);
  if (!isSupabaseConfigured()) {
    const open = DEMO_RFPS.filter((r) => (!r.deadline || r.deadline >= today) && (!country || countryOf(r) === country));
    return { totalOpen: open.length, regionMatchCount: region ? open.filter((r) => regionName(r.region) === region && r.slug !== excludeSlug).length : 0 };
  }
  const rows = await getBoardRows();
  const open = rows.filter((r) => !r.deadline || r.deadline >= today);
  const totalOpen = country ? open.filter((r) => countryOf(r) === country).length : open.length;
  if (!region) return { totalOpen, regionMatchCount: 0 };
  // Match existing display-name semantics, including duplicate region names
  // and inactive historical names still permitted by anonymous RLS.
  const ids = new Set((await getTaxonomyRows("regions")).filter((r) => r.name === region).map((r) => r.id));
  const regionMatchCount = ids.size
    ? open.filter((r) => r.regionId !== null && ids.has(r.regionId) && r.slug !== excludeSlug).length
    : 0;
  return { totalOpen, regionMatchCount };
}
