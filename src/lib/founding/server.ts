import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import { isServiceConfigured } from "@/lib/supabase/config";
import { FOUNDING, LIFETIME_SUB_PREFIX, isLifetimeSubscriptionId, lifetimeRow } from "./config";

/** Exact number of lifetime orgs sold. Throws on a DB error so callers can fail closed. */
export async function countLifetimeOrgs(): Promise<number> {
  if (!isServiceConfigured()) return 0;
  const { count, error } = await createServiceClient()
    .from("subscriptions")
    .select("id", { count: "exact", head: true })
    .like("stripe_subscription_id", `${LIFETIME_SUB_PREFIX}%`);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

let cached: { at: number; sold: number } | null = null;

/** The public counter: cached ~60s per server instance; null when the count can't be read. */
export async function cachedLifetimeCount(): Promise<number | null> {
  if (cached && Date.now() - cached.at < 60_000) return cached.sold;
  try {
    const sold = await countLifetimeOrgs();
    cached = { at: Date.now(), sold };
    return sold;
  } catch (err) {
    console.error("[founding] count failed:", err instanceof Error ? err.message : err);
    return cached?.sold ?? null;
  }
}

export async function isOrgLifetime(organizationId: string | null | undefined): Promise<boolean> {
  if (!organizationId || !isServiceConfigured()) return false;
  const { data } = await createServiceClient()
    .from("subscriptions")
    .select("stripe_subscription_id")
    .eq("organization_id", organizationId)
    .maybeSingle<{ stripe_subscription_id: string | null }>();
  return isLifetimeSubscriptionId(data?.stripe_subscription_id);
}

export interface GrantResult {
  granted: boolean;
  /** The org already had lifetime from a different checkout (a double purchase to refund). */
  duplicate: boolean;
  /** Sold count is above the cap after this grant (a race). Still granted. */
  oversold: boolean;
  sold: number | null;
  /** An active recurring Stripe subscription the org had before; the caller stops its renewal. */
  previousStripeSubscriptionId: string | null;
  error?: string;
}

/**
 * Grants lifetime Trade Pro. Never refuses for the cap: money taken means
 * access granted; the caller emails the admin when `oversold`.
 */
export async function grantLifetime(p: {
  organizationId: string;
  userId: string | null;
  checkoutSessionId: string;
  stripeCustomerId: string | null;
  amount: number | null;
  currency: string;
}): Promise<GrantResult> {
  const none: GrantResult = { granted: false, duplicate: false, oversold: false, sold: null, previousStripeSubscriptionId: null };
  if (!isServiceConfigured()) return { ...none, error: "service client not configured" };
  const svc = createServiceClient();
  const { data: existing } = await svc
    .from("subscriptions")
    .select("stripe_subscription_id,stripe_customer_id,status")
    .eq("organization_id", p.organizationId)
    .maybeSingle<{ stripe_subscription_id: string | null; stripe_customer_id: string | null; status: string }>();

  if (isLifetimeSubscriptionId(existing?.stripe_subscription_id)) {
    // Same checkout redelivered: nothing to do. A different checkout: they paid twice.
    const same = existing?.stripe_subscription_id === `${LIFETIME_SUB_PREFIX}${p.checkoutSessionId}`;
    return { ...none, granted: true, duplicate: !same };
  }

  const prevSub = existing?.stripe_subscription_id ?? null;
  const previousStripeSubscriptionId =
    prevSub && prevSub.startsWith("sub_") && ["active", "trialing", "past_due"].includes(existing?.status ?? "") ? prevSub : null;

  const row = lifetimeRow({ ...p, stripeCustomerId: p.stripeCustomerId ?? existing?.stripe_customer_id ?? null });
  let { error } = await svc.from("subscriptions").upsert(row, { onConflict: "organization_id" });
  if (error && /tier/i.test(error.message)) {
    // Pre-20260819 database without subscriptions.tier: every row is Pro-equivalent.
    const { tier: _omit, ...legacy } = row;
    ({ error } = await svc.from("subscriptions").upsert(legacy, { onConflict: "organization_id" }));
  }
  if (error) return { ...none, error: error.message, previousStripeSubscriptionId };

  // Paid orgs show in the directory right away, like a paid subscription.
  await svc
    .from("organizations")
    .update({ profile_status: "approved" })
    .eq("id", p.organizationId)
    .in("profile_status", ["pending_review", "draft"]);

  let sold: number | null = null;
  try {
    sold = await countLifetimeOrgs();
  } catch {
    sold = null;
  }
  return { granted: true, duplicate: false, oversold: sold != null && sold > FOUNDING.cap, sold, previousStripeSubscriptionId };
}
