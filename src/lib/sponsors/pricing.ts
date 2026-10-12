/**
 * Sponsorship pricing: the ONE place to change it. Monthly, per slot, set
 * separately for each currency (never converted): CAD for Canada, USD for
 * the U.S. A visitor only ever sees their own country's currency.
 *
 * Tiers:
 *  - province: one trade in one province/state. Its web pages and that
 *    trade × province's daily/weekly emails.
 *  - national: one trade across the whole country (every province/state no
 *    province sponsor holds, plus country-wide pages such as the forum).
 *  - digest:   one trade in one province/state, in the emails only.
 *
 * Online payment is optional: a tier/currency is payable by card only when
 * its Stripe Price ID is set (see SPONSOR_PRICE_ENV and docs/sponsorships.md).
 * Without it, /advertise takes an enquiry instead. Never create live Stripe
 * objects from code: make the recurring monthly Price in the Stripe
 * dashboard, then paste its ID into the env var.
 */
export type SponsorTier = "province" | "national" | "digest";
export type SponsorCurrency = "CAD" | "USD";

export const SPONSOR_TIERS: readonly SponsorTier[] = ["province", "national", "digest"];

/** Shown as "launch pricing" on /advertise while true. */
export const LAUNCH_PRICING = true;

export const SPONSOR_PRICES: Record<SponsorTier, Record<SponsorCurrency, number>> = {
  province: { CAD: 199, USD: 199 },
  national: { CAD: 499, USD: 499 },
  digest: { CAD: 149, USD: 149 },
};

/** Env var holding the Stripe recurring (monthly) Price ID for each tier and currency. */
export const SPONSOR_PRICE_ENV: Record<SponsorTier, Record<SponsorCurrency, string>> = {
  province: { CAD: "STRIPE_PRICE_SPONSOR_PROVINCE_CAD", USD: "STRIPE_PRICE_SPONSOR_PROVINCE_USD" },
  national: { CAD: "STRIPE_PRICE_SPONSOR_NATIONAL_CAD", USD: "STRIPE_PRICE_SPONSOR_NATIONAL_USD" },
  digest: { CAD: "STRIPE_PRICE_SPONSOR_DIGEST_CAD", USD: "STRIPE_PRICE_SPONSOR_DIGEST_USD" },
};

/** Stripe metadata `product` on sponsorship checkouts and subscriptions. */
export const SPONSOR_PRODUCT = "pmrfp_sponsorship";

export function currencyFor(country: "CA" | "US"): SponsorCurrency {
  return country === "US" ? "USD" : "CAD";
}

/** Monthly price of a tier in the country's own currency. */
export function sponsorPrice(tier: SponsorTier, country: "CA" | "US"): { amount: number; currency: SponsorCurrency } {
  const currency = currencyFor(country);
  return { amount: SPONSOR_PRICES[tier][currency], currency };
}

/** The Stripe Price ID for a tier in a country's currency, or null when card payment isn't set up for it. */
export function sponsorStripePrice(tier: SponsorTier, country: "CA" | "US", env: Record<string, string | undefined> = process.env): string | null {
  const v = env[SPONSOR_PRICE_ENV[tier][currencyFor(country)]]?.trim();
  return v && v.startsWith("price_") ? v : null;
}

/** Lowest monthly price in a country's currency ("from $149"). */
export function lowestSponsorPrice(country: "CA" | "US"): number {
  return Math.min(...SPONSOR_TIERS.map((t) => sponsorPrice(t, country).amount));
}

export function isSponsorTier(v: unknown): v is SponsorTier {
  return typeof v === "string" && (SPONSOR_TIERS as readonly string[]).includes(v);
}

/** Old /advertise?package= values (Trade Spotlight, Founding Partner) still land on today's tiers. */
const LEGACY_TIER: Record<string, SponsorTier> = { trade: "province", founding: "national" };

/** ?tier= / ?package= / a form value → a tier, or "unsure". */
export function parseTierParam(v: string | null | undefined): SponsorTier | "unsure" {
  if (isSponsorTier(v)) return v;
  return (v && LEGACY_TIER[v]) || "unsure";
}
