/**
 * Where a visitor is browsing from, as Vercel's edge sees it
 * (x-vercel-ip-country / x-vercel-ip-country-region). The proxy copies it into
 * a readable cookie so cached (ISR) pages can adapt on the client; dynamic
 * pages read the headers directly (visitor-geo.server.ts).
 *
 * Used for convenience only — prefilling a province/state, showing U.S.
 * visitors U.S. tenders and prices in USD. Never for access or billing.
 */
import { US_STATES, isUsState } from "@/lib/geo";

export const GEO_COOKIE = "pmrfp_geo";

export interface VisitorGeo {
  /** ISO 3166-1 alpha-2, e.g. "US", "CA". */
  country: string | null;
  /** Full province/state name when we know it and PMRFP serves it ("Texas", "Ontario"). */
  province: string | null;
}

export const CA_PROVINCE_CODES: Record<string, string> = {
  ON: "Ontario", QC: "Quebec", BC: "British Columbia", AB: "Alberta", MB: "Manitoba",
  SK: "Saskatchewan", NS: "Nova Scotia", NB: "New Brunswick", NL: "Newfoundland and Labrador",
  PE: "Prince Edward Island", YT: "Yukon", NT: "Northwest Territories", NU: "Nunavut",
};

/** From the raw header values ("US", "TX"). */
export function geoFrom(country: string | null | undefined, region: string | null | undefined): VisitorGeo {
  const cc = (country ?? "").trim().toUpperCase() || null;
  const rc = (region ?? "").trim().toUpperCase();
  const province =
    cc === "US" ? US_STATES[rc] ?? null : cc === "CA" ? CA_PROVINCE_CODES[rc] ?? null : null;
  return { country: cc, province };
}

/** Cookie value: "US-TX", "CA-ON", "FR". */
export function encodeGeo(country: string | null | undefined, region: string | null | undefined): string | null {
  const cc = (country ?? "").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(cc)) return null;
  const rc = (region ?? "").trim().toUpperCase();
  return /^[A-Z0-9]{1,3}$/.test(rc) ? `${cc}-${rc}` : cc;
}

export function parseGeoCookie(value: string | null | undefined): VisitorGeo {
  const [cc, rc] = (value ?? "").split("-");
  return geoFrom(cc, rc);
}

/** PMRFP market for a visitor: U.S. or everyone else (Canada is the default). */
export function visitorMarket(geo: VisitorGeo): "US" | "CA" {
  return geo.country === "US" ? "US" : "CA";
}

/** Which country an RFP is in, from its free-text province/state. */
export function rfpMarket(r: { province: string | null }): "US" | "CA" {
  return isUsState(r.province) ? "US" : "CA";
}

/** Region slug for the visitor's province/state ("ontario", "us-texas"). Matches the regions table. */
export function visitorRegionSlug(geo: VisitorGeo): string | null {
  if (!geo.province) return null;
  const kebab = geo.province.toLowerCase().replace(/[^a-z]+/g, "-").replace(/^-|-$/g, "");
  return geo.country === "US" ? `us-${kebab}` : kebab;
}
