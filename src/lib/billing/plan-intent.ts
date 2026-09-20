import { PRICING } from "@/lib/site";

/**
 * Purchase intent carried from a pricing CTA through sign-up to billing
 * (audit F04: clicking "Get Featured" landed on a generic sign-up page with no
 * trace of the plan the visitor had just chosen).
 *
 * Only the plan/interval NAMES travel in the URL and they are re-validated
 * here against an allowlist — prices always come from PRICING server-side and
 * the checkout route resolves the Stripe price itself, so a tampered query
 * string can change nothing but which summary is displayed.
 */
export type PlanId = "seo" | "pro" | "featured";
export type PlanInterval = "annual" | "monthly";

export interface PlanIntent {
  plan: PlanId;
  interval: PlanInterval;
  name: string;
  priceLabel: string;
}

export function parsePlanIntent(
  plan: string | null | undefined,
  interval: string | null | undefined,
): PlanIntent | null {
  if (plan !== "seo" && plan !== "pro" && plan !== "featured") return null;
  // Featured is annual-only (mirrors /api/stripe/checkout).
  const iv: PlanInterval = plan !== "featured" && interval === "monthly" ? "monthly" : "annual";
  const cur = PRICING.currency;
  if (plan === "featured") {
    return { plan, interval: iv, name: "Featured", priceLabel: `$${PRICING.featuredAnnual} ${cur}/year` };
  }
  if (plan === "seo") {
    return {
      plan,
      interval: iv,
      name: "SEO Listing",
      priceLabel: iv === "monthly" ? `$${PRICING.seoMonthly} ${cur}/month` : `$${PRICING.seoAnnual} ${cur}/year`,
    };
  }
  return {
    plan,
    interval: iv,
    name: "Trade Pro",
    priceLabel: iv === "monthly" ? `$${PRICING.proMonthly} ${cur}/month` : `$${PRICING.proAnnual} ${cur}/year`,
  };
}

/** Sign-up URL that remembers the chosen plan. Plans are trade-side products. */
export function signUpHrefForPlan(plan: PlanId, interval: PlanInterval = "annual"): string {
  return `/sign-up?role=trade&plan=${plan}&interval=${interval}`;
}

/** Where a new account lands to complete the purchase it started. */
export function billingPathForIntent(intent: PlanIntent): string {
  return `/dashboard/billing?plan=${intent.plan}&interval=${intent.interval}`;
}
