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
/**
 * Plans a new buyer can start. "seo" (SEO Listing) is retired: old links and
 * bookmarks carrying plan=seo are steered to Trade Pro (and its 14-day trial)
 * instead of a plan we no longer sell. Existing SEO subscribers keep their
 * entitlement (subscriptions.tier = "seo"), handled in the access code.
 */
export type PlanId = "pro" | "featured";
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
  if (plan === "seo") plan = "pro";
  if (plan !== "pro" && plan !== "featured") return null;
  // Featured is annual-only (mirrors /api/stripe/checkout).
  const iv: PlanInterval = plan !== "featured" && interval === "monthly" ? "monthly" : "annual";
  const cur = PRICING.currency;
  if (plan === "featured") {
    return { plan, interval: iv, name: "Featured", priceLabel: `$${PRICING.featuredAnnual} ${cur}/year` };
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
