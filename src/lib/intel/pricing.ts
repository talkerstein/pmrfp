/**
 * Award Intelligence pricing: the ONE place to change it. Set separately for
 * each currency (never converted): CAD for Canada, USD for the U.S. A visitor
 * only ever sees their own country's currency.
 *
 * Card checkout works per interval and currency once its Stripe Price ID is
 * in the env var below (INTEL_PRICE_ENV). Never create live Stripe objects
 * from code: make the recurring Price in the Stripe dashboard (product
 * "PMRFP Award Intelligence"), then paste its ID into the env var. Until
 * then /intel offers "ask us" instead of a card button, and an admin can
 * grant access by hand (/admin/intel).
 */
import type { CountryCode } from "@/lib/visitor-geo";

export type IntelInterval = "monthly" | "annual";
export type IntelCurrency = "CAD" | "USD";

export const INTEL_INTERVALS: readonly IntelInterval[] = ["monthly", "annual"];

/** Shown as "launch pricing" on /intel while true. */
export const INTEL_LAUNCH_PRICING = true;

export const INTEL_PRICES: Record<IntelInterval, Record<IntelCurrency, number>> = {
  monthly: { CAD: 99, USD: 99 },
  annual: { CAD: 990, USD: 990 },
};

/** Env var holding the Stripe recurring Price ID for each interval and currency. */
export const INTEL_PRICE_ENV: Record<IntelInterval, Record<IntelCurrency, string>> = {
  monthly: { CAD: "STRIPE_PRICE_INTEL_MONTHLY_CAD", USD: "STRIPE_PRICE_INTEL_MONTHLY_USD" },
  annual: { CAD: "STRIPE_PRICE_INTEL_ANNUAL_CAD", USD: "STRIPE_PRICE_INTEL_ANNUAL_USD" },
};

/**
 * Card checkout is OFF unless INTEL_CHECKOUT_ENABLED is "true" (or 1/on/yes),
 * so Award Intelligence can be piloted with design partners first (admin
 * grants in /admin/intel). Off: the pages show "Ask for access" and the
 * checkout route refuses, even when the Stripe price IDs are set.
 */
export function intelCheckoutEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return /^(1|true|on|yes)$/i.test(env.INTEL_CHECKOUT_ENABLED?.trim() ?? "");
}

/** Card payment possible for this interval in this country right now (flag on + Stripe key + price ID). */
export function intelPayable(interval: IntelInterval, country: CountryCode, env: Record<string, string | undefined> = process.env): boolean {
  return intelCheckoutEnabled(env) && Boolean(env.STRIPE_SECRET_KEY) && intelStripePrice(interval, country, env) !== null;
}

/** Stripe metadata `product` on Intel checkouts and subscriptions (the webhook routes on it). */
export const INTEL_PRODUCT = "pmrfp_award_intel";

export const intelCurrency = (country: CountryCode): IntelCurrency => (country === "US" ? "USD" : "CAD");

export function intelPrice(interval: IntelInterval, country: CountryCode): { amount: number; currency: IntelCurrency } {
  const currency = intelCurrency(country);
  return { amount: INTEL_PRICES[interval][currency], currency };
}

/** The Stripe Price ID for an interval in a country's currency, or null when card payment isn't set up. */
export function intelStripePrice(interval: IntelInterval, country: CountryCode, env: Record<string, string | undefined> = process.env): string | null {
  const v = env[INTEL_PRICE_ENV[interval][intelCurrency(country)]]?.trim();
  return v && v.startsWith("price_") ? v : null;
}

/** Which env var a Price ID came from (webhook: interval + currency of a subscription). */
export function intelPriceInfo(priceId: string | null | undefined, env: Record<string, string | undefined> = process.env): { interval: IntelInterval; currency: IntelCurrency } | null {
  if (!priceId) return null;
  for (const interval of INTEL_INTERVALS) {
    for (const currency of ["CAD", "USD"] as const) {
      if (env[INTEL_PRICE_ENV[interval][currency]]?.trim() === priceId) return { interval, currency };
    }
  }
  return null;
}

export function parseIntelInterval(v: unknown): IntelInterval {
  return v === "annual" ? "annual" : "monthly";
}

/** Two months free on annual: 12 × monthly − annual. */
export function annualSaving(country: CountryCode): number {
  const c = intelCurrency(country);
  return INTEL_PRICES.monthly[c] * 12 - INTEL_PRICES.annual[c];
}
