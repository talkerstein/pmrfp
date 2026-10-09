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

/** The visitor's own pick from the header switch ("US" | "CA"); beats where they browse from. */
export const MARKET_COOKIE = "pmrfp_market";
export type MarketCode = "US" | "CA";

export function parseMarketCookie(value: string | null | undefined): MarketCode | null {
  const v = (value ?? "").trim().toUpperCase();
  return v === "US" || v === "CA" ? v : null;
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

/* ------------------------------------------------------------------ country-first */

/**
 * Country-first rule: a Canadian never sees U.S. work by default and a U.S.
 * trade never sees Canadian work. Every list, count and email picks ONE
 * country, then puts the visitor's own province/state first.
 *
 * Which country, in order (resolveCountry):
 *   1. ?country=ca|us on a page that takes it: an explicit one-page view
 *      (the RFP board tabs, the winners pages). Never persisted.
 *   2. The signed-in company's own location (organizations.province /
 *      .country, else the country of its service regions).
 *   3. The CA | US header switch (MARKET_COOKIE).
 *   4. Vercel's IP country (x-vercel-ip-country), via GEO_COOKIE on cached pages.
 *   5. Canada.
 * The province/state to put first comes from the account when it is in the
 * resolved country, else from the IP region when that is.
 */
export type CountryCode = MarketCode;

/** Mirror of the signed-in company's location ("CA-ON", "US-TX", "US") so cached pages and the header switch follow it. */
export const ACCOUNT_COOKIE = "pmrfp_acct";

export type CountrySource = "param" | "account" | "cookie" | "geo" | "default";

export interface CountrySignals {
  /** Raw ?country= value. */
  param?: string | null;
  /** The signed-in company's location, or null when unknown. */
  account?: VisitorGeo | null;
  /** Raw MARKET_COOKIE value. */
  cookie?: string | null;
  /** Where the request comes from. */
  geo?: VisitorGeo | null;
}

export interface ResolvedCountry {
  country: CountryCode;
  /** Full province/state name to sort first, only when it is in `country`. */
  province: string | null;
  source: CountrySource;
}

/** "ca" / "US" → "CA" / "US"; anything else (including "all") → null. */
export function parseCountryParam(value: string | null | undefined): CountryCode | null {
  return parseMarketCookie(value);
}

export function resolveCountry(s: CountrySignals): ResolvedCountry {
  const account = s.account?.country === "US" || s.account?.country === "CA" ? (s.account.country as CountryCode) : null;
  const param = parseCountryParam(s.param);
  const cookie = parseMarketCookie(s.cookie);
  const geo = s.geo?.country ? visitorMarket(s.geo) : null;
  const [country, source]: [CountryCode, CountrySource] = param
    ? [param, "param"]
    : account
      ? [account, "account"]
      : cookie
        ? [cookie, "cookie"]
        : geo
          ? [geo, "geo"]
          : ["CA", "default"];
  const province =
    (account === country ? s.account?.province : null) ??
    (s.geo?.country === country ? s.geo?.province : null) ??
    null;
  return { country, province, source };
}

/** Which country a row with a free-text province/state is in (RFPs, awards, companies, projects). */
export function countryOf(r: { province?: string | null }): CountryCode {
  return rfpMarket({ province: r.province ?? null });
}

/** Rows in one country. */
export function inCountry<T extends { province?: string | null }>(rows: readonly T[], country: CountryCode): T[] {
  return rows.filter((r) => countryOf(r) === country);
}

/** regions.country is "Canada" / "USA". */
export function regionCountry(r: { country?: string | null }): CountryCode {
  const c = (r.country ?? "").trim().toLowerCase();
  return c === "usa" || c === "us" || c === "u.s." || c === "united states" || c === "united states of america" ? "US" : "CA";
}

/** Region rows in one country. */
export function regionsInCountry<T extends { country?: string | null }>(rows: readonly T[], country: CountryCode): T[] {
  return rows.filter((r) => regionCountry(r) === country);
}

/**
 * Stable sort: rows in `province` first ("Ontario first, then the rest of
 * Canada"), otherwise the incoming order. A null `province` changes nothing.
 */
export function provinceFirst<T>(rows: readonly T[], province: string | null | undefined, provinceOf: (r: T) => string | null | undefined): T[] {
  const p = (province ?? "").trim().toLowerCase();
  if (!p) return [...rows];
  const mine: T[] = [];
  const rest: T[] = [];
  for (const r of rows) ((provinceOf(r) ?? "").trim().toLowerCase() === p ? mine : rest).push(r);
  return [...mine, ...rest];
}

function caProvinceName(p: string): string | null {
  return CA_PROVINCE_CODES[p.toUpperCase()] ?? Object.values(CA_PROVINCE_CODES).find((n) => n.toLowerCase() === p.toLowerCase()) ?? null;
}

function usStateName(p: string): string | null {
  return US_STATES[p.toUpperCase()] ?? Object.values(US_STATES).find((n) => n.toLowerCase() === p.toLowerCase()) ?? null;
}

/**
 * A company's own location from its profile: its province/state decides,
 * else an explicit U.S. country, else the country of its service regions
 * when they are all in one. Null when nothing says (organizations.country
 * defaults to "Canada" for everyone, so it alone is not proof).
 */
export function accountGeo(
  org: { province?: string | null; country?: string | null } | null | undefined,
  serviceRegions: readonly { country?: string | null; province?: string | null }[] = [],
): VisitorGeo | null {
  if (!org) return null;
  const prov = (org.province ?? "").trim();
  if (prov) {
    const us = isUsState(prov) ? usStateName(prov) : null;
    if (us) return { country: "US", province: us };
    const ca = caProvinceName(prov);
    if (ca) return { country: "CA", province: ca };
  }
  if ((org.country ?? "").trim() && regionCountry({ country: org.country }) === "US") return { country: "US", province: null };
  const countries = new Set(serviceRegions.map(regionCountry));
  if (countries.size !== 1) return null;
  const only = [...countries][0];
  const provs = new Set(serviceRegions.map((r) => r.province).filter((p): p is string => !!p));
  return { country: only, province: provs.size === 1 ? [...provs][0] : null };
}

/** ACCOUNT_COOKIE value for a company location ("CA-ON", "US-TX", "US"), or null. */
export function encodeAccountGeo(geo: VisitorGeo | null): string | null {
  if (!geo?.country) return null;
  const table: Record<string, string> = geo.country === "US" ? US_STATES : CA_PROVINCE_CODES;
  const code = Object.entries(table).find(([, n]) => n === geo.province)?.[0] ?? null;
  return encodeGeo(geo.country, code);
}

/** ACCOUNT_COOKIE → location; only CA/US count. */
export function parseAccountCookie(value: string | null | undefined): VisitorGeo | null {
  const g = parseGeoCookie(value);
  return g.country === "US" || g.country === "CA" ? g : null;
}
