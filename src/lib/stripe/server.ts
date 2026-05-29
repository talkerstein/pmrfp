import Stripe from "stripe";
import { createServiceClient } from "@/lib/supabase/service";
import { isServiceConfigured } from "@/lib/supabase/config";

export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_PRICE_TRADE_PRO_ANNUAL);
}

export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
  return new Stripe(key);
}

export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

/**
 * Upsert our subscriptions row from a Stripe subscription object. Keyed by
 * organization_id (carried in subscription metadata). Uses the service client
 * (RLS bypass) since this runs from the webhook.
 */
export async function syncSubscriptionFromStripe(sub: Stripe.Subscription): Promise<void> {
  if (!isServiceConfigured()) return;
  const orgId = sub.metadata?.organization_id;
  if (!orgId) return;

  const supabase = createServiceClient();
  const item = sub.items.data[0];
  await supabase
    .from("subscriptions")
    .upsert(
      {
        organization_id: orgId,
        user_id: sub.metadata?.user_id ?? null,
        stripe_customer_id: typeof sub.customer === "string" ? sub.customer : sub.customer.id,
        stripe_subscription_id: sub.id,
        stripe_price_id: item?.price.id ?? null,
        status: mapStatus(sub.status),
        current_period_start: toIso(item?.current_period_start),
        current_period_end: toIso(item?.current_period_end),
        cancel_at_period_end: sub.cancel_at_period_end,
        amount: item?.price.unit_amount != null ? item.price.unit_amount / 100 : null,
        currency: (item?.price.currency ?? "cad").toUpperCase(),
      },
      { onConflict: "organization_id" },
    );
}

function mapStatus(s: Stripe.Subscription.Status): string {
  // Our enum: trialing|active|past_due|canceled|unpaid|comped|inactive
  switch (s) {
    case "trialing":
    case "active":
    case "past_due":
    case "canceled":
    case "unpaid":
      return s;
    case "incomplete":
    case "incomplete_expired":
    case "paused":
      return "inactive";
    default:
      return "inactive";
  }
}

function toIso(unixSeconds: number | null | undefined): string | null {
  return unixSeconds ? new Date(unixSeconds * 1000).toISOString() : null;
}
