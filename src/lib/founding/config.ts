/**
 * Founding 500: lifetime Trade Pro for one payment, capped at 500 paid
 * organizations. Pure helpers only (no I/O) so they are unit-testable and
 * safe to import from client components.
 *
 * Storage (no schema change): a lifetime org is a normal `subscriptions` row
 * with tier 'pro', status 'active', current_period_end 2999-12-31,
 * cancel_at_period_end false and stripe_subscription_id 'lifetime_<checkout
 * session id>'. That prefix is the marker everything keys off: the counter,
 * the "never downgrade" guard in syncSubscriptionFromStripe, the billing badge
 * and the directory badge.
 */
export const FOUNDING = {
  cap: 500,
  priceUsd: 200,
  priceCad: 250,
  /** The regular Trade Pro price the comparison quotes (CAD/yr). */
  regularAnnualCad: 249,
  /** Pro-rated refund window if Trade Pro is discontinued (months). */
  discontinueRefundMonths: 24,
  refundDays: 30,
} as const;

export const FOUNDING_PRODUCT = "founding_lifetime";
export const LIFETIME_SUB_PREFIX = "lifetime_";
export const LIFETIME_PERIOD_END = "2999-12-31T00:00:00.000Z";
export const FOUNDING_PATH = "/founding-500";

export type FoundingMarket = "CA" | "US";

export function foundingPrice(market: FoundingMarket): { amount: number; currency: "usd" | "cad" } {
  return market === "US" ? { amount: FOUNDING.priceUsd, currency: "usd" } : { amount: FOUNDING.priceCad, currency: "cad" };
}

/** Normalizes untrusted input to a market: only an explicit "US" is US. */
export function parseMarket(v: unknown): FoundingMarket {
  return v === "US" ? "US" : "CA";
}

export function isLifetimeSubscriptionId(id: string | null | undefined): boolean {
  return typeof id === "string" && id.startsWith(LIFETIME_SUB_PREFIX);
}

export function lifetimeSubscriptionId(checkoutSessionId: string): string {
  return `${LIFETIME_SUB_PREFIX}${checkoutSessionId}`;
}

/** Spots left, never negative. */
export function spotsLeft(sold: number, cap: number = FOUNDING.cap): number {
  return Math.max(0, cap - Math.max(0, sold));
}

export function isSoldOut(sold: number, cap: number = FOUNDING.cap): boolean {
  return spotsLeft(sold, cap) === 0;
}

/** At or below this many spots left the bar says so; above it, no count is shown. */
export const FOUNDING_LOW_SPOTS = 50;

export type FoundingScarcity = "limited" | "low" | "soldout";

/**
 * What the Founding 500 bar may say about spots left. Never an exact count
 * while more than FOUNDING_LOW_SPOTS remain ("Limited to the first 500
 * companies"), "Fewer than 50 spots left" once at or below it. An unknown
 * count (the read failed) reads as "limited", which is always true.
 */
export function foundingScarcity(left: number | null | undefined): FoundingScarcity {
  if (left == null) return "limited";
  if (left <= 0) return "soldout";
  return left <= FOUNDING_LOW_SPOTS ? "low" : "limited";
}

export type CheckoutRefusal = "signin" | "org" | "role" | "already" | "soldout" | null;

/** Server-side gate for starting a Founding 500 checkout. Most actionable reason first. */
export function checkoutRefusal(p: {
  signedIn: boolean;
  organizationType: string | null | undefined;
  alreadyLifetime: boolean;
  sold: number;
  cap?: number;
}): CheckoutRefusal {
  if (!p.signedIn) return "signin";
  if (!p.organizationType) return "org";
  if (p.organizationType !== "trade_company" && p.organizationType !== "supplier") return "role";
  if (p.alreadyLifetime) return "already";
  if (isSoldOut(p.sold, p.cap)) return "soldout";
  return null;
}

/**
 * The subscriptions row that grants lifetime Trade Pro. Keeps the existing
 * Stripe customer id when there is one, so old invoices stay reachable.
 */
export function lifetimeRow(p: {
  organizationId: string;
  userId: string | null;
  checkoutSessionId: string;
  stripeCustomerId: string | null;
  amount: number | null;
  currency: string;
  now?: Date;
}) {
  return {
    organization_id: p.organizationId,
    user_id: p.userId,
    stripe_customer_id: p.stripeCustomerId,
    stripe_subscription_id: lifetimeSubscriptionId(p.checkoutSessionId),
    stripe_price_id: null,
    status: "active",
    current_period_start: (p.now ?? new Date()).toISOString(),
    current_period_end: LIFETIME_PERIOD_END,
    cancel_at_period_end: false,
    tier: "pro",
    amount: p.amount,
    currency: p.currency.toUpperCase(),
  };
}
