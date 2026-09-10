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
  const priceId = item?.price.id ?? null;
  const status = mapStatus(sub.status);
  // Tier drives entitlement: has_active_trade_access() only unlocks RFPs for
  // pro/featured. Without this, an active $99 SEO sub would silently grant
  // the $249 product.
  const tier = isFeaturedPriceId(priceId)
    ? "featured"
    : isSeoPriceId(priceId)
      ? "seo"
      : "pro";
  await supabase
    .from("subscriptions")
    .upsert(
      {
        organization_id: orgId,
        user_id: sub.metadata?.user_id ?? null,
        stripe_customer_id: typeof sub.customer === "string" ? sub.customer : sub.customer.id,
        stripe_subscription_id: sub.id,
        stripe_price_id: priceId,
        status,
        current_period_start: toIso(item?.current_period_start),
        current_period_end: toIso(item?.current_period_end),
        cancel_at_period_end: sub.cancel_at_period_end,
        tier,
        amount: item?.price.unit_amount != null ? item.price.unit_amount / 100 : null,
        currency: (item?.price.currency ?? "cad").toUpperCase(),
      },
      { onConflict: "organization_id" },
    );

  // Featured plan controls the org's `featured` placement. We only touch the
  // flag for the Featured price, so admin-set editorial featuring on Pro/Free
  // orgs is never clobbered: active Featured → true, canceled Featured → false.
  if (isFeaturedPriceId(priceId)) {
    const active = status === "active" || status === "trialing";
    await supabase.from("organizations").update({ featured: active }).eq("id", orgId);
  }
}

/** True when the price id is the paid Featured placement plan. */
export function isFeaturedPriceId(priceId: string | null | undefined): boolean {
  const featured = process.env.STRIPE_PRICE_FEATURED_ANNUAL;
  return Boolean(featured && priceId && priceId === featured);
}

/** True when the price id is the directory-only SEO tier (either interval). */
export function isSeoPriceId(priceId: string | null | undefined): boolean {
  if (!priceId) return false;
  const annual = process.env.STRIPE_PRICE_SEO_ANNUAL;
  const monthly = process.env.STRIPE_PRICE_SEO_MONTHLY;
  return priceId === annual || priceId === monthly;
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
