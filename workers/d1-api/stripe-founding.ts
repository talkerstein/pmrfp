import { FOUNDING, LIFETIME_PERIOD_END, isLifetimeSubscriptionId, lifetimeSubscriptionId } from "../../src/lib/founding/config";
import { D1ApiError, UUID, readD1Json, type D1Binding } from "../../src/lib/d1/contracts";
import { verifyGateway } from "./auth";

type Env = { APP_DB: D1Binding; STRIPE_BILLING_GATEWAY_SECRET?: string };

/** The caller verifies Stripe's signature and the purchased line before using this private route. */
export async function applyFoundingCheckout(request: Request, env: Env) {
  await verifyGateway(request.headers.get("x-pmrfp-stripe-gateway"), env.STRIPE_BILLING_GATEWAY_SECRET);
  if (request.method !== "POST") throw new D1ApiError(405, "method_not_allowed");
  const data = await readD1Json(request, 1200) as Record<string, unknown> | null;
  const { eventId, checkoutId, organizationId, userId, customerId, amount, currency } = data ?? {};
  if (typeof eventId !== "string" || !/^evt_[A-Za-z0-9]{1,100}$/.test(eventId) ||
      typeof checkoutId !== "string" || !/^cs_live_[A-Za-z0-9]{1,128}$/.test(checkoutId) ||
      typeof organizationId !== "string" || !UUID.test(organizationId) ||
      typeof userId !== "string" || !UUID.test(userId) ||
      (customerId !== null && (typeof customerId !== "string" || !/^cus_[A-Za-z0-9]{1,100}$/.test(customerId))) ||
      !((currency === "CAD" && amount === FOUNDING.priceCad) || (currency === "USD" && amount === FOUNDING.priceUsd))) {
    throw new D1ApiError(400, "invalid_founding_checkout");
  }

  const db = env.APP_DB;
  const lifetime = lifetimeSubscriptionId(checkoutId);
  const now = new Date().toISOString();
  const unprocessed = "NOT EXISTS (SELECT 1 FROM stripe_webhook_events WHERE id=?)";
  const [gate, previous, grant, placement, receipt, count] = await db.batch([
    db.prepare(`SELECT CASE WHEN EXISTS(SELECT 1 FROM _billing_authority WHERE id=1 AND mode='d1-authoritative-v1')
        AND (EXISTS(SELECT 1 FROM stripe_webhook_events WHERE id=?) OR EXISTS(
          SELECT 1 FROM organizations o WHERE o.id=? AND o.organization_type IN ('trade_company','supplier') AND o.is_demo=0
          AND EXISTS (SELECT 1 FROM users_profile WHERE id=?)))
      THEN 1 ELSE json('billing_authority_or_company_unavailable') END`).bind(eventId, organizationId, userId),
    db.prepare("SELECT stripe_subscription_id,status FROM subscriptions WHERE organization_id=?").bind(organizationId),
    db.prepare(`INSERT INTO subscriptions(id,organization_id,user_id,stripe_customer_id,stripe_subscription_id,
        status,current_period_start,current_period_end,cancel_at_period_end,tier,amount,currency,updated_at)
      SELECT ?,?,?,?,?,'active',?,?,0,'pro',?,?,? WHERE ${unprocessed}
      ON CONFLICT(organization_id) DO UPDATE SET user_id=excluded.user_id,
        stripe_customer_id=coalesce(excluded.stripe_customer_id,subscriptions.stripe_customer_id),
        stripe_subscription_id=excluded.stripe_subscription_id,stripe_price_id=NULL,status='active',
        current_period_start=excluded.current_period_start,current_period_end=excluded.current_period_end,
        cancel_at_period_end=0,tier='pro',amount=excluded.amount,currency=excluded.currency,updated_at=excluded.updated_at
      WHERE subscriptions.stripe_subscription_id IS NULL OR subscriptions.stripe_subscription_id NOT GLOB 'lifetime_*'`)
      .bind(crypto.randomUUID(), organizationId, userId, customerId, lifetime, now, LIFETIME_PERIOD_END,
        typeof amount === "number" ? amount : null, typeof currency === "string" ? currency : null, now, eventId),
    db.prepare(`UPDATE organizations SET profile_status='approved',updated_at=?
      WHERE id=? AND profile_status IN ('pending_review','draft') AND ${unprocessed}
      AND EXISTS(SELECT 1 FROM subscriptions WHERE organization_id=? AND stripe_subscription_id=?)`)
      .bind(now, organizationId, eventId, organizationId, lifetime),
    db.prepare("INSERT INTO stripe_webhook_events(id) VALUES(?) ON CONFLICT(id) DO NOTHING").bind(eventId),
    db.prepare("SELECT count(*) AS sold FROM subscriptions WHERE stripe_subscription_id GLOB 'lifetime_*'"),
  ]);
  if (![gate, previous, grant, placement, receipt, count].every(result => result?.success)) {
    throw new D1ApiError(503, "billing_write_failed");
  }
  const old = previous.results[0] as { stripe_subscription_id?: string; status?: string } | undefined;
  const oldId = old?.stripe_subscription_id;
  const applied = grant.meta.changes === 1;
  const sold = Number(count.results[0]?.sold ?? 0);
  return {
    applied, duplicate: receipt.meta.changes === 0,
    secondPurchase: isLifetimeSubscriptionId(oldId) && oldId !== lifetime,
    previousSubscription: applied && oldId && /^sub_[A-Za-z0-9]{1,100}$/.test(oldId) &&
      ["active", "trialing", "past_due"].includes(old?.status ?? "") ? oldId : null,
    oversold: sold > FOUNDING.cap, sold,
  };
}
