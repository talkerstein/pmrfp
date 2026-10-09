/**
 * Country-first email rule (pure; tested in test/unit/country-first.test.ts):
 * a recipient only ever gets tenders, RFPs and awards from the country (or
 * countries) their company works in. Canadians never get U.S. work and U.S.
 * trades never get Canadian work, whatever a listing's region looks like
 * (no region, the national region, or a mis-filed one).
 */
import { accountGeo, countryOf, regionCountry, type CountryCode } from "@/lib/visitor-geo";

export interface RegionCountryRow {
  id: string;
  country?: string | null;
}

/** region id → "CA" | "US", from regions.country ("Canada" / "USA"). */
export function regionCountryMap(regions: readonly RegionCountryRow[]): Map<string, CountryCode> {
  return new Map(regions.map((r) => [r.id, regionCountry(r)]));
}

/**
 * A listing's country: its province/state when it names a U.S. state or a
 * Canadian province, else its region's country, else Canada.
 */
export function listingCountry(
  r: { region_id?: string | null; regionId?: string | null; province?: string | null },
  byRegion: ReadonlyMap<string, CountryCode>,
): CountryCode {
  const fromProvince = accountGeo({ province: r.province ?? null })?.country;
  if (fromProvince === "US" || fromProvince === "CA") return fromProvince;
  const regionId = r.region_id ?? r.regionId ?? null;
  const fromRegion = regionId ? byRegion.get(regionId) : undefined;
  return fromRegion ?? countryOf({ province: r.province ?? null });
}

/**
 * The countries a company works in: the countries of the regions it serves
 * (a company that picked Ontario and New York gets both), else its own
 * province/state, else Canada.
 */
export function orgCountries(
  org: { province?: string | null; country?: string | null },
  serviceRegionIds: Iterable<string>,
  byRegion: ReadonlyMap<string, CountryCode>,
): Set<CountryCode> {
  const out = new Set<CountryCode>();
  for (const id of serviceRegionIds) {
    const c = byRegion.get(id);
    if (c) out.add(c);
  }
  if (out.size) return out;
  const own = accountGeo(org)?.country;
  out.add(own === "US" ? "US" : "CA");
  return out;
}

/**
 * The weekly free-trade digest's match: in the company's trades, in one of
 * its countries, and in a region it serves (or filed nationally / with no
 * region — the country check keeps those from crossing the border).
 */
export function freeDigestMatches<R extends { region_id: string | null; province?: string | null; rfp_categories: { category_id: string }[] }>(
  rfps: readonly R[],
  org: { categories: ReadonlySet<string>; regions: ReadonlySet<string>; countries: ReadonlySet<CountryCode> },
  nationalIds: ReadonlySet<string>,
  byRegion: ReadonlyMap<string, CountryCode>,
): R[] {
  return rfps.filter(
    (r) =>
      r.rfp_categories.some((c) => org.categories.has(c.category_id)) &&
      org.countries.has(listingCountry(r, byRegion)) &&
      (!r.region_id || nationalIds.has(r.region_id) || org.regions.has(r.region_id)),
  );
}
