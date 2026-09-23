/**
 * Market config — the single source of truth for country-driven currency,
 * locale, and market-specific phrasing. Lets the product serve Canada (incl.
 * Quebec) and a US beachhead (St. Louis) without hard-coding "Canada" / "CAD"
 * across components.
 *
 * Pricing amounts live here per market. Canada = the live CAD ladder. The US
 * (USD) amounts are placeholders pending (a) founder sign-off on the numbers
 * and (b) real USD Stripe Price objects — see plan P2. Until USD Stripe prices
 * exist, US orgs are billed in CAD with an honest note (formatPrice + a
 * "billed in CAD" string in the UI).
 *
 * `org.country` and `region.country` are free-text display strings
 * ("Canada" / "United States"). `marketForCountry()` normalizes them.
 */

export interface Market {
  code: "CA" | "US";
  country: string; // canonical display value matching the DB country column
  demonym: string;
  currency: "CAD" | "USD";
  locale: string;
  /** SEO/cost-guide qualifier, e.g. "in Canada" / "in the U.S." Empty = neutral. */
  costGuideQualifier: string;
  /** Competitor differentiator that is load-bearing in CA, a liability in US. */
  competitorEdge: string | null;
  /** Whether real native-currency Stripe prices exist yet for this market. */
  hasNativeStripePrices: boolean;
  pricing: {
    proAnnual: number;
    proMonthly: number;
    featuredAnnual: number;
  };
}

export const MARKETS: Record<Market["code"], Market> = {
  CA: {
    code: "CA",
    country: "Canada",
    demonym: "Canadian",
    currency: "CAD",
    locale: "en-CA",
    costGuideQualifier: "in Canada",
    competitorEdge: "Canada-native",
    hasNativeStripePrices: true,
    pricing: { proAnnual: 249, proMonthly: 29, featuredAnnual: 599 },
  },
  US: {
    code: "US",
    country: "United States",
    demonym: "U.S.",
    currency: "USD",
    locale: "en-US",
    costGuideQualifier: "in the U.S.",
    // In the US we are the newcomer — "Canada-native" is a negative, suppress it.
    competitorEdge: null,
    // Flip to true once USD Stripe Price objects + STRIPE_PRICE_*_USD env vars
    // exist and checkout branches by org country (plan P2).
    hasNativeStripePrices: false,
    // Placeholders pending founder confirmation (recommended $199 USD/yr).
    pricing: { proAnnual: 199, proMonthly: 19, featuredAnnual: 479 },
  },
};

export const DEFAULT_MARKET: Market = MARKETS.CA;

/** Normalize a free-text country string to a Market (defaults to Canada). */
export function marketForCountry(country: string | null | undefined): Market {
  if (!country) return DEFAULT_MARKET;
  const c = country.trim().toLowerCase();
  if (
    c === "us" ||
    c === "usa" ||
    c === "u.s." ||
    c === "u.s.a." ||
    c === "united states" ||
    c === "united states of america" ||
    c === "america"
  ) {
    return MARKETS.US;
  }
  return MARKETS.CA;
}

/**
 * Rough CAD → USD rate for "about US$X" hints shown to U.S. visitors. Billing
 * stays in CAD (the card issuer converts), so this is display-only — refresh it
 * if the loonie moves more than a few cents.
 */
export const USD_PER_CAD = 0.72;

/** "about US$180" for CA$249: whole dollars under $50, nearest $5 above. */
export function approxUsd(cad: number): number {
  const usd = cad * USD_PER_CAD;
  return usd < 50 ? Math.round(usd) : Math.round(usd / 5) * 5;
}

/** Format a whole-dollar amount in the market's currency. */
export function formatPrice(amount: number, market: Market = DEFAULT_MARKET): string {
  return new Intl.NumberFormat(market.locale, {
    style: "currency",
    currency: market.currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * For markets without native Stripe prices yet (US today): the amount is
 * charged in CAD, so surface an honest "billed in CAD" note. Returns null when
 * no note is needed (native-currency market).
 */
export function billingCurrencyNote(market: Market): string | null {
  if (market.hasNativeStripePrices) return null;
  return "Billed in CAD; your bank converts at checkout.";
}
