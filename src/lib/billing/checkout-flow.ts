import { parsePlanIntent, signUpHrefForPlan, type PlanId, type PlanInterval } from "@/lib/billing/plan-intent";

/**
 * "Upgrade" in one move. /checkout?plan=pro&interval=annual is where every
 * upgrade link points. It decides, from who is asking, the next page:
 *
 *   signed out            -> /sign-up for that plan (the plan rides through the
 *                            emailed link as `next=/checkout…`)
 *   not onboarded yet     -> /onboarding?next=/checkout…  (finish, then pay)
 *   signed in, can buy    -> Stripe Checkout (created on the server)
 *   anything unusual      -> /dashboard/billing, which explains and offers the choice
 *
 * Before this, "Unlock" sent a signed-in trade to a billing page where they
 * pressed a second button, and sent a signed-out visitor to a sign-up whose
 * plan was lost whenever the page was opened twice (one trade clicked
 * upgrade three times in 30 minutes and never reached Stripe). Pure and
 * unit-tested; the page is app/[lang]/checkout/page.tsx.
 */

export const CHECKOUT_PATH = "/checkout";

/** The page every upgrade link points to. Plan names only: prices are resolved on the server. */
export function checkoutPath(plan: PlanId = "pro", interval: PlanInterval = "annual"): string {
  const iv = plan === "featured" ? "annual" : interval;
  return `${CHECKOUT_PATH}?plan=${plan}&interval=${iv}`;
}

export interface CheckoutAsk {
  plan: PlanId;
  interval: PlanInterval;
}

/** `?plan=&interval=` -> a valid ask, or null (unknown plans are never guessed). */
export function parseCheckoutAsk(plan: unknown, interval: unknown): CheckoutAsk | null {
  const i = parsePlanIntent(typeof plan === "string" ? plan : null, typeof interval === "string" ? interval : null);
  return i ? { plan: i.plan, interval: i.interval } : null;
}

export interface CheckoutWho {
  signedIn: boolean;
  onboarded: boolean;
  role: string | null;
  hasOrganization: boolean;
  /** Already on an active paid plan. */
  paid: boolean;
  stripeConfigured: boolean;
}

export type CheckoutDecision =
  | { go: "stripe" }
  | { go: "redirect"; to: string; why: "bad_plan" | "signed_out" | "onboarding" | "wrong_role" | "paid" | "unavailable" };

/** Where /checkout sends this person. `to` is an app path (the caller adds the language). */
export function decideCheckout(ask: CheckoutAsk | null, who: CheckoutWho): CheckoutDecision {
  if (!ask) return { go: "redirect", to: who.signedIn ? "/dashboard/billing" : "/pricing", why: "bad_plan" };
  if (!who.signedIn) return { go: "redirect", to: signUpHrefForPlan(ask.plan, ask.interval), why: "signed_out" };
  if (!who.onboarded || !who.hasOrganization) {
    return { go: "redirect", to: `/onboarding?next=${encodeURIComponent(checkoutPath(ask.plan, ask.interval))}`, why: "onboarding" };
  }
  if (who.role !== "trade") return { go: "redirect", to: "/dashboard", why: "wrong_role" };
  if (who.paid) return { go: "redirect", to: "/dashboard/billing", why: "paid" };
  if (!who.stripeConfigured) return { go: "redirect", to: `/dashboard/billing?plan=${ask.plan}&interval=${ask.interval}&checkout=unavailable`, why: "unavailable" };
  return { go: "stripe" };
}

/** Why a checkout could not be created, for the event and for the page that explains it. */
export type CheckoutFailure = "not_configured" | "no_session" | "no_company" | "plan_unavailable" | "stripe_error";

export function checkoutFailureMessage(reason: CheckoutFailure): { status: number; error: string } {
  switch (reason) {
    case "not_configured":
      return { status: 400, error: "Billing is not configured yet." };
    case "no_session":
      return { status: 401, error: "Sign in required" };
    case "no_company":
      return { status: 400, error: "Complete your company profile first." };
    case "plan_unavailable":
      return { status: 400, error: "That plan isn't available yet." };
    default:
      return { status: 502, error: "We couldn't reach the payment page. Please try again in a moment." };
  }
}

/**
 * Monthly is only offered when a monthly Stripe price exists (billing page,
 * pricing). Upgrade links ask for it only then: a "monthly" link with no
 * monthly price used to end in "That plan isn't available yet".
 */
export function upgradeInterval(monthlyEnabled: boolean): PlanInterval {
  return monthlyEnabled ? "monthly" : "annual";
}
