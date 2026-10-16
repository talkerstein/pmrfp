import type Stripe from "stripe";
import { intelStatusFromStripe, isIntelRowActive } from "@/lib/entitlement/intel";

/** Pure Stripe → intel_access rules (unit tested; the writes live in ./stripe.ts). */

export interface IntelAccessUpsert {
  organization_id: string;
  status: string;
  source: "stripe";
  stripe_customer_id: string | null;
  stripe_subscription_id: string;
  stripe_price_id: string | null;
  billing_interval: "monthly" | "annual" | null;
  currency: "CAD" | "USD" | null;
  amount: number | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  expires_at: null;
  updated_at: string;
}

export function intelRowFromSubscription(sub: Stripe.Subscription, now: Date = new Date()): IntelAccessUpsert | null {
  const orgId = sub.metadata?.organization_id;
  if (!orgId) return null;
  const item = sub.items?.data?.[0];
  const recurring = item?.price?.recurring?.interval;
  const cur = (item?.price?.currency ?? "").toUpperCase();
  return {
    organization_id: orgId,
    status: intelStatusFromStripe(sub.status),
    source: "stripe",
    stripe_customer_id: typeof sub.customer === "string" ? sub.customer : sub.customer?.id ?? null,
    stripe_subscription_id: sub.id,
    stripe_price_id: item?.price?.id ?? null,
    billing_interval: recurring === "year" ? "annual" : recurring === "month" ? "monthly" : null,
    currency: cur === "CAD" || cur === "USD" ? cur : null,
    amount: item?.price?.unit_amount != null ? item.price.unit_amount / 100 : null,
    current_period_end: item?.current_period_end ? new Date(item.current_period_end * 1000).toISOString() : null,
    cancel_at_period_end: Boolean(sub.cancel_at_period_end),
    expires_at: null,
    updated_at: now.toISOString(),
  };
}

/**
 * Don't let Stripe switch off an admin grant: an ended or unpaid
 * subscription only overwrites the row when the row is that subscription's
 * (or isn't an active admin grant). An entitled status always applies.
 */
export function shouldApplyIntelSync(
  existing: { status: string; source: string; stripe_subscription_id: string | null } | null | undefined,
  incoming: Pick<IntelAccessUpsert, "status" | "stripe_subscription_id">,
): boolean {
  if (!existing) return true;
  if (isIntelRowActive({ status: incoming.status })) return true;
  if (existing.stripe_subscription_id === incoming.stripe_subscription_id) return true;
  return !(existing.source === "admin" && isIntelRowActive({ status: existing.status }));
}
