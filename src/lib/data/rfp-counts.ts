import { listRfps } from "./rfps";
import { isOpenListing } from "./site-counters";
import { countryOf, type CountryCode } from "@/lib/visitor-geo";

/**
 * Open-listing counts, counted from the shared board snapshot (no query of
 * their own) with the site-wide "open" rule (site-counters isOpenListing:
 * deadline today or later and not an award notice). Used to be one
 * exact-count query per region and per RFP detail page, every 5 minutes.
 * `country` scopes the total to one country (country-first: never pass null
 * for a number a visitor sees).
 */
export async function getOpenRfpCounts(region: string | null = null, excludeSlug?: string, country: CountryCode | null = null): Promise<{ totalOpen: number; regionMatchCount: number }> {
  // listRfps() is the snapshot as list items (demo board without Supabase).
  const open = (await listRfps()).filter(isOpenListing);
  const totalOpen = country ? open.filter((r) => countryOf(r) === country).length : open.length;
  if (!region) return { totalOpen, regionMatchCount: 0 };
  // Display-name match (list items carry the region's name), so duplicate
  // region names count together, as before.
  const regionMatchCount = open.filter((r) => r.regionName === region && r.slug !== excludeSlug).length;
  return { totalOpen, regionMatchCount };
}
