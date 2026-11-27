import { D1ApiError, readD1Json, UUID, type D1Binding } from "../../src/lib/d1/contracts";
import { FEATURED_DAYS } from "../../src/lib/marketplace/feature";
import { d1LegacySeoPrice, d1SubscriptionPlan, type D1BillingPrices } from "../../src/lib/stripe/d1-prices";
import { verifyGateway } from "./auth";

interface BillingEnv extends D1BillingPrices {
  APP_DB: D1Binding;
  STRIPE_BILLING_GATEWAY_SECRET?: string;
}

const stripeId = (prefix: string, value: unknown): value is string =>
  typeof value === "string" && new RegExp("^" + prefix + "_[A-Za-z0-9]{1,100}$").test(value);

/** Record signed expiry deliveries without granting an entitlement. */
export async function recordExpiredCheckout(request: Request, env: BillingEnv) {
  await verifyGateway(request.headers.get("x-pmrfp-stripe-gateway"), env.STRIPE_BILLING_GATEWAY_SECRET);
  if (request.method !== "POST") throw new D1ApiError(405, "method_not_allowed");
  const input = await readD1Json(request, 256) as { eventId?: unknown } | null;
  if (!stripeId("evt", input?.eventId)) throw new D1ApiError(400, "invalid_checkout");
  const db = env.APP_DB;
  const [gate, receipt] = await db.batch([
    db.prepare(`SELECT CASE WHEN EXISTS (SELECT 1 FROM _billing_authority
      WHERE id=1 AND mode='d1-authoritative-v1') THEN 1 ELSE json('billing_authority_unavailable') END`),
    db.prepare("INSERT INTO stripe_webhook_events(id) VALUES(?) ON CONFLICT(id) DO NOTHING").bind(input.eventId),
  ]);
  if (!gate?.success || !receipt?.success) throw new D1ApiError(503, "billing_write_failed");
  return { applied: false, duplicate: receipt.meta.changes === 0 };
}

export async function recordSpotlightCheckout(request: Request, env: BillingEnv) {
  await verifyGateway(request.headers.get("x-pmrfp-stripe-gateway"), env.STRIPE_BILLING_GATEWAY_SECRET);
  if (request.method !== "POST") throw new D1ApiError(405, "method_not_allowed");
  const input = await readD1Json(request, 512) as { eventId?: unknown; checkoutId?: unknown } | null;
  if (!stripeId("evt", input?.eventId) || typeof input.checkoutId !== "string" ||
      !/^cs_live_[A-Za-z0-9]{1,128}$/.test(input.checkoutId)) throw new D1ApiError(400, "invalid_checkout");
  const db = env.APP_DB;
  const [gate, checkout, receipt] = await db.batch([
    db.prepare(`SELECT CASE WHEN EXISTS (SELECT 1 FROM _billing_authority
      WHERE id=1 AND mode='d1-authoritative-v1') THEN 1 ELSE json('billing_authority_unavailable') END`),
    db.prepare(`INSERT INTO _billing_spotlight_checkouts(checkout_id)
      SELECT ? WHERE NOT EXISTS (SELECT 1 FROM stripe_webhook_events WHERE id=?)
      ON CONFLICT(checkout_id) DO NOTHING`).bind(input.checkoutId, input.eventId),
    db.prepare("INSERT INTO stripe_webhook_events(id) VALUES(?) ON CONFLICT(id) DO NOTHING").bind(input.eventId),
  ]);
  if (!gate?.success || !checkout?.success || !receipt?.success) throw new D1ApiError(503, "billing_write_failed");
  return { applied: checkout.meta.changes === 1, duplicate: checkout.meta.changes === 0 };
}

export async function applyPaidMarketplaceCheckout(request: Request, env: BillingEnv) {
  await verifyGateway(request.headers.get("x-pmrfp-stripe-gateway"), env.STRIPE_BILLING_GATEWAY_SECRET);
  if (request.method !== "POST") throw new D1ApiError(405, "method_not_allowed");
  const input = await readD1Json(request, 2048);
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new D1ApiError(400, "invalid_marketplace_checkout");
  }
  const { eventId, checkoutId, listingId, userId } = input as Record<string, unknown>;
  if (!stripeId("evt", eventId) || typeof checkoutId !== "string" ||
      !/^cs_live_[A-Za-z0-9]{1,128}$/.test(checkoutId) ||
      typeof listingId !== "string" || !UUID.test(listingId) ||
      typeof userId !== "string" || !UUID.test(userId)) {
    throw new D1ApiError(400, "invalid_marketplace_checkout");
  }

  const db = env.APP_DB;
  const [gate, write, checkout, event] = await db.batch([
    db.prepare(`SELECT CASE WHEN EXISTS (SELECT 1 FROM _billing_authority
      WHERE id=1 AND mode='d1-authoritative-v1')
      AND NOT EXISTS (SELECT 1 FROM _billing_marketplace_checkouts WHERE checkout_id=?
        AND (listing_id<>? OR user_id<>?))
      AND (EXISTS (SELECT 1 FROM stripe_webhook_events WHERE id=?)
        OR EXISTS (SELECT 1 FROM _billing_marketplace_checkouts WHERE checkout_id=?)
        OR EXISTS (SELECT 1 FROM marketplace_listings WHERE id=? AND user_id=?))
      THEN 1 ELSE json('billing_authority_or_listing_unavailable') END`)
      .bind(checkoutId, listingId, userId, eventId, checkoutId, listingId, userId),
    db.prepare(`UPDATE marketplace_listings SET featured_until=strftime('%Y-%m-%dT%H:%M:%fZ',
        CASE WHEN julianday(featured_until)>julianday('now') THEN featured_until ELSE 'now' END, ?),
      updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
      WHERE id=? AND user_id=?
        AND NOT EXISTS (SELECT 1 FROM stripe_webhook_events WHERE id=?)
        AND NOT EXISTS (SELECT 1 FROM _billing_marketplace_checkouts WHERE checkout_id=?)`)
      .bind(`+${FEATURED_DAYS} days`, listingId, userId, eventId, checkoutId),
    db.prepare(`INSERT INTO _billing_marketplace_checkouts(checkout_id,listing_id,user_id)
      SELECT ?,?,? WHERE NOT EXISTS (SELECT 1 FROM stripe_webhook_events WHERE id=?)
      ON CONFLICT(checkout_id) DO NOTHING`).bind(checkoutId, listingId, userId, eventId),
    db.prepare("INSERT INTO stripe_webhook_events(id) VALUES(?) ON CONFLICT(id) DO NOTHING").bind(eventId),
  ]);
  if (!gate?.success || !write?.success || !checkout?.success || !event?.success) {
    throw new D1ApiError(503, "billing_write_failed");
  }
  return { applied: write.meta.changes === 1, duplicate: checkout.meta.changes === 0 };
}

const stripeStatuses: Readonly<Record<string, string>> = {
  active: "active", trialing: "trialing", past_due: "past_due", canceled: "canceled",
  unpaid: "unpaid", incomplete: "inactive", incomplete_expired: "inactive", paused: "inactive",
};

/** Apply the current Stripe state to an already-linked subscription. */
export async function applyRecurringSubscriptionState(request: Request, env: BillingEnv) {
  await verifyGateway(request.headers.get("x-pmrfp-stripe-gateway"), env.STRIPE_BILLING_GATEWAY_SECRET);
  if (request.method !== "POST") throw new D1ApiError(405, "method_not_allowed");
  const input = await readD1Json(request, 2048);
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new D1ApiError(400, "invalid_subscription_state");
  }
  const { eventId, organizationId, userId, subscriptionId, customerId, priceId, periodEnd,
    observedEventTime, status, cancelAtPeriodEnd, suspendOrganization, unitAmount } = input as Record<string, unknown>;
  if (!stripeId("evt", eventId) || !stripeId("sub", subscriptionId) || !stripeId("cus", customerId) ||
      !stripeId("price", priceId) || typeof organizationId !== "string" || !UUID.test(organizationId) ||
      typeof userId !== "string" || !UUID.test(userId) || typeof periodEnd !== "string" ||
      !Number.isFinite(Date.parse(periodEnd)) || typeof observedEventTime !== "number" ||
      !Number.isSafeInteger(observedEventTime) || observedEventTime <= 0 || typeof status !== "string" ||
      !Object.hasOwn(stripeStatuses, status) || typeof cancelAtPeriodEnd !== "boolean" ||
      typeof suspendOrganization !== "boolean" || (suspendOrganization && status !== "canceled")) {
    throw new D1ApiError(400, "invalid_subscription_state");
  }
  const legacySeo = d1LegacySeoPrice(priceId, env);
  if (legacySeo && (!Number.isSafeInteger(unitAmount) || typeof unitAmount !== "number" || unitAmount < 0)) {
    throw new D1ApiError(400, "invalid_subscription_amount");
  }
  const plan = legacySeo && typeof unitAmount === "number"
    ? { tier: "seo", amount: String(unitAmount / 100) }
    : d1SubscriptionPlan(priceId, env);
  if (!plan) throw new D1ApiError(400, "unknown_subscription_price");

  const db = env.APP_DB;
  const [gate, cursor, write, placement, organization, receipt] = await db.batch<{ email: string | null; name: string | null }>([
    db.prepare(`SELECT CASE WHEN EXISTS (SELECT 1 FROM _billing_authority
      WHERE id=1 AND mode='d1-authoritative-v1') THEN 1 ELSE json('billing_authority_unavailable') END`),
    db.prepare(`INSERT INTO _billing_subscription_state (subscription_id, event_id, event_created)
      SELECT ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM stripe_webhook_events WHERE id=?)
      AND EXISTS (SELECT 1 FROM subscriptions WHERE organization_id=? AND user_id=?
        AND stripe_subscription_id=? AND stripe_customer_id=? AND tier IN ('pro','featured','realtor','seo')
        AND ((tier='realtor')=(?='realtor'))
        AND (tier='seo' OR ?<>'seo')
        AND status<>'comped' AND (status<>'canceled' OR ?='canceled'))
      ON CONFLICT(subscription_id) DO UPDATE SET
        event_id=excluded.event_id, event_created=excluded.event_created
        WHERE excluded.event_created >= _billing_subscription_state.event_created`)
      .bind(subscriptionId, eventId, observedEventTime, eventId, organizationId, userId,
        subscriptionId, customerId, plan.tier, plan.tier, stripeStatuses[status]),
    db.prepare(`UPDATE subscriptions SET status=?, current_period_end=?, cancel_at_period_end=?,
      stripe_price_id=?, amount=?, tier=?, updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
      WHERE organization_id=? AND stripe_subscription_id=?
      AND EXISTS (SELECT 1 FROM _billing_subscription_state WHERE subscription_id=? AND event_id=?)
      AND NOT EXISTS (SELECT 1 FROM stripe_webhook_events WHERE id=?)`)
      .bind(stripeStatuses[status], new Date(periodEnd).toISOString(), Number(cancelAtPeriodEnd),
        priceId, plan.amount, plan.tier, organizationId, subscriptionId, subscriptionId, eventId, eventId),
    db.prepare(`UPDATE organizations SET
      featured=CASE WHEN ?='featured' THEN ? ELSE featured END,
      status=CASE WHEN ? AND status='active' THEN 'suspended' ELSE status END
      WHERE id=? AND (?='featured' OR ?)
      AND EXISTS (SELECT 1 FROM _billing_subscription_state WHERE subscription_id=? AND event_id=?)
      AND NOT EXISTS (SELECT 1 FROM stripe_webhook_events WHERE id=?)`)
      .bind(plan.tier, Number(status === "active" || status === "trialing"), Number(suspendOrganization),
        organizationId, plan.tier, Number(suspendOrganization), subscriptionId, eventId, eventId),
    db.prepare(`SELECT email,name FROM organizations WHERE id=?
      AND EXISTS (SELECT 1 FROM _billing_subscription_state WHERE subscription_id=? AND event_id=?)
      AND NOT EXISTS (SELECT 1 FROM stripe_webhook_events WHERE id=?)`).bind(organizationId, subscriptionId, eventId, eventId),
    db.prepare("INSERT INTO stripe_webhook_events(id) VALUES(?) ON CONFLICT(id) DO NOTHING").bind(eventId),
  ]);
  if (!gate?.success || !cursor?.success || !write?.success || !placement?.success || !organization?.success || !receipt?.success) {
    throw new D1ApiError(503, "billing_write_failed");
  }
  return { applied: write.meta.changes === 1, duplicate: receipt.meta.changes === 0, organization: organization.results[0] };
}

/** Internal write for a paid recurring checkout verified by the server. */
export async function applyPaidTradeCheckout(request: Request, env: BillingEnv) {
  await verifyGateway(request.headers.get("x-pmrfp-stripe-gateway"), env.STRIPE_BILLING_GATEWAY_SECRET);
  if (request.method !== "POST") throw new D1ApiError(405, "method_not_allowed");
  const input = await readD1Json(request, 2048);
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new D1ApiError(400, "invalid_checkout");
  }
  const { eventId, organizationId, userId, subscriptionId, customerId, priceId, periodEnd } =
    input as Record<string, unknown>;
  if (!stripeId("evt", eventId) || !stripeId("sub", subscriptionId) ||
      !stripeId("cus", customerId) || !stripeId("price", priceId) ||
      typeof organizationId !== "string" || !UUID.test(organizationId) ||
      typeof userId !== "string" || !UUID.test(userId) ||
      typeof periodEnd !== "string" || !Number.isFinite(Date.parse(periodEnd)) ||
      Date.parse(periodEnd) <= Date.now()) throw new D1ApiError(400, "invalid_checkout");
  const plan = d1SubscriptionPlan(priceId, env);
  if (!plan) throw new D1ApiError(400, "unknown_subscription_price");

  // The copied staging database cannot accept billing writes. The authority
  // marker belongs only in the billing database after source writes stop.
  const authority = await env.APP_DB.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='_billing_authority'",
  ).first();
  if (!authority) throw new D1ApiError(503, "billing_authority_unavailable");

  const db = env.APP_DB;
  const eligibleCompany = `EXISTS (
    SELECT 1 FROM organizations o JOIN organization_members m ON m.organization_id=o.id
    JOIN users_profile u ON u.id=m.user_id
    WHERE o.id=? AND m.user_id=? AND u.status='active' AND o.status='active'
      AND o.is_demo=0 AND ((o.organization_type IN ('trade_company','supplier'))<>(?='realtor'))
  )`;
  const [gate, write, placement, receipt] = await db.batch([
    db.prepare(`SELECT CASE WHEN EXISTS (
      SELECT 1 FROM _billing_authority WHERE id=1 AND mode='d1-authoritative-v1'
    ) AND (EXISTS (SELECT 1 FROM stripe_webhook_events WHERE id=?) OR (
      ${eligibleCompany} AND NOT EXISTS (
        SELECT 1 FROM subscriptions WHERE organization_id=?
          AND stripe_subscription_id IS NOT NULL AND stripe_subscription_id <> ?
          AND stripe_subscription_id NOT GLOB 'lifetime_*'
          AND status IN ('active','trialing','past_due','unpaid','comped')
      )
    )) THEN 1 ELSE json('billing_authority_or_organization_unavailable') END`)
      .bind(eventId, organizationId, userId, plan.tier, organizationId, subscriptionId),
    db.prepare(`INSERT INTO subscriptions (
      id, organization_id, user_id, stripe_customer_id, stripe_subscription_id, stripe_price_id,
      status, current_period_end, amount, currency, tier
    ) SELECT ?,?,?,?,?,?,'active',?,?,'CAD',?
      WHERE NOT EXISTS (SELECT 1 FROM stripe_webhook_events WHERE id=?)
    ON CONFLICT(organization_id) DO UPDATE SET
      user_id=excluded.user_id, stripe_customer_id=excluded.stripe_customer_id,
      stripe_subscription_id=excluded.stripe_subscription_id, stripe_price_id=excluded.stripe_price_id,
      status=excluded.status, current_period_end=excluded.current_period_end,
      amount=excluded.amount, currency=excluded.currency, tier=excluded.tier,
      updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
    WHERE (subscriptions.stripe_subscription_id IS NULL
       OR subscriptions.stripe_subscription_id NOT GLOB 'lifetime_*')
      AND NOT (subscriptions.status='canceled' AND subscriptions.stripe_subscription_id IS excluded.stripe_subscription_id)
      AND (subscriptions.stripe_subscription_id IS NOT excluded.stripe_subscription_id
        OR subscriptions.current_period_end IS NULL
        OR julianday(subscriptions.current_period_end) <= julianday(excluded.current_period_end))`)
      .bind(crypto.randomUUID(), organizationId, userId, customerId, subscriptionId, priceId,
        new Date(periodEnd).toISOString(), plan.amount, plan.tier, eventId),
    db.prepare(`UPDATE organizations SET
      featured=CASE WHEN ?='featured' THEN 1 ELSE featured END,
      profile_status=CASE WHEN profile_status IN ('pending_review','draft') THEN 'approved' ELSE profile_status END
      WHERE id=? AND status='active'
      AND EXISTS (SELECT 1 FROM subscriptions WHERE organization_id=? AND stripe_subscription_id=?
        AND stripe_customer_id=? AND status='active' AND stripe_price_id=?)
      AND NOT EXISTS (SELECT 1 FROM stripe_webhook_events WHERE id=?)`)
      .bind(plan.tier, organizationId, organizationId, subscriptionId, customerId, priceId, eventId),
    db.prepare("INSERT INTO stripe_webhook_events(id) VALUES(?) ON CONFLICT(id) DO NOTHING").bind(eventId),
  ]);
  if (!gate?.success || !write?.success || !placement?.success || !receipt?.success) throw new D1ApiError(503, "billing_write_failed");
  return { applied: write.meta.changes === 1, duplicate: receipt.meta.changes === 0 };
}
