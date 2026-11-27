import { D1ApiError, readD1Json, UUID, type D1Binding } from "../../src/lib/d1/contracts";
import { INTEL_ENTITLED_STATUSES } from "../../src/lib/entitlement/intel";
import { verifyGateway } from "./auth";

const statuses = ["active", "trialing", "past_due", "canceled", "unpaid", "inactive"];
const stripeId = (kind: string, value: unknown): value is string =>
  typeof value === "string" && new RegExp("^" + kind + "_[A-Za-z0-9]{1,100}$").test(value);

export async function applyIntelSubscription(request: Request, env: { APP_DB: D1Binding; STRIPE_BILLING_GATEWAY_SECRET?: string }) {
  await verifyGateway(request.headers.get("x-pmrfp-stripe-gateway"), env.STRIPE_BILLING_GATEWAY_SECRET);
  if (request.method !== "POST") throw new D1ApiError(405, "method_not_allowed");
  const input = await readD1Json(request, 2048);
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new D1ApiError(400, "invalid_intel_subscription");
  const { eventId, organizationId, userId, subscriptionId, customerId, priceId, periodEnd,
    eventCreated, status, interval, currency, cents, cancelAtPeriodEnd } = input as Record<string, unknown>;
  if (!stripeId("evt", eventId) || !stripeId("sub", subscriptionId) || !stripeId("cus", customerId) || !stripeId("price", priceId) ||
      typeof organizationId !== "string" || !UUID.test(organizationId) || typeof userId !== "string" || !UUID.test(userId) ||
      typeof status !== "string" || !statuses.includes(status) || (interval !== "monthly" && interval !== "annual") ||
      (currency !== "CAD" && currency !== "USD") || typeof periodEnd !== "string" || !Number.isFinite(Date.parse(periodEnd)) ||
      typeof cancelAtPeriodEnd !== "boolean" || typeof cents !== "number" || !Number.isSafeInteger(cents) || cents < 0 ||
      typeof eventCreated !== "number" || !Number.isSafeInteger(eventCreated) || eventCreated <= 0) {
    throw new D1ApiError(400, "invalid_intel_subscription");
  }
  const entitled = status === "active" || status === "trialing";
  const db = env.APP_DB;
  const [gate, cursor, access, receipt] = await db.batch([
    db.prepare(`SELECT CASE WHEN EXISTS(SELECT 1 FROM _billing_authority WHERE id=1 AND mode='d1-authoritative-v1')
      AND (EXISTS(SELECT 1 FROM stripe_webhook_events WHERE id=?) OR
        EXISTS(SELECT 1 FROM organizations o WHERE o.id=? AND (
          EXISTS(SELECT 1 FROM organization_members WHERE organization_id=o.id AND user_id=?) OR
          EXISTS(SELECT 1 FROM intel_access WHERE organization_id=o.id AND stripe_subscription_id=? AND stripe_customer_id=?))))
      THEN 1 ELSE json('intel_billing_authority_unavailable') END`).bind(eventId, organizationId, userId, subscriptionId, customerId),
    db.prepare(`INSERT INTO _billing_subscription_state(subscription_id,event_id,event_created)
      SELECT ?,?,? WHERE NOT EXISTS(SELECT 1 FROM stripe_webhook_events WHERE id=?)
      ON CONFLICT(subscription_id) DO UPDATE SET event_id=excluded.event_id,event_created=excluded.event_created
        WHERE excluded.event_created>=_billing_subscription_state.event_created`).bind(subscriptionId, eventId, eventCreated, eventId),
    db.prepare(`INSERT INTO intel_access(organization_id,status,source,stripe_customer_id,stripe_subscription_id,
        stripe_price_id,billing_interval,currency,amount,current_period_end,cancel_at_period_end,expires_at,updated_at)
      SELECT ?,?,'stripe',?,?,?,?,?,?,?, ?,NULL,strftime('%Y-%m-%dT%H:%M:%fZ','now')
      WHERE EXISTS(SELECT 1 FROM _billing_subscription_state WHERE subscription_id=? AND event_id=?)
        AND NOT EXISTS(SELECT 1 FROM stripe_webhook_events WHERE id=?)
      ON CONFLICT(organization_id) DO UPDATE SET status=excluded.status,source=excluded.source,
        stripe_customer_id=excluded.stripe_customer_id,stripe_subscription_id=excluded.stripe_subscription_id,
        stripe_price_id=excluded.stripe_price_id,billing_interval=excluded.billing_interval,currency=excluded.currency,
        amount=excluded.amount,current_period_end=excluded.current_period_end,cancel_at_period_end=excluded.cancel_at_period_end,
        expires_at=NULL,updated_at=excluded.updated_at
      WHERE ?=1 OR intel_access.stripe_subscription_id=excluded.stripe_subscription_id
        OR intel_access.status NOT IN (${INTEL_ENTITLED_STATUSES.map(() => "?").join(",")})`)
      .bind(organizationId, status, customerId, subscriptionId, priceId, interval, currency, String(cents / 100),
        new Date(periodEnd).toISOString(), Number(cancelAtPeriodEnd), subscriptionId, eventId, eventId, Number(entitled),
        ...INTEL_ENTITLED_STATUSES),
    db.prepare("INSERT INTO stripe_webhook_events(id) VALUES(?) ON CONFLICT(id) DO NOTHING").bind(eventId),
  ]);
  if (!gate?.success || !cursor?.success || !access?.success || !receipt?.success) {
    throw new D1ApiError(503, "billing_write_failed");
  }
  return { applied: access.meta.changes === 1, duplicate: receipt.meta.changes === 0 };
}
