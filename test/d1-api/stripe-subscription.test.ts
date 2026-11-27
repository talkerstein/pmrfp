import Stripe from "stripe";
import { deliverD1Billing, rehearseD1TradeCheckout } from "../../src/lib/stripe/d1-rehearsal";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { D1Binding, D1Statement } from "../../src/lib/d1/contracts";
import { handleCustomerAuth } from "../../workers/d1-api/customer-auth";
import { readCustomerSession } from "../../workers/d1-api/customer-session";
import rehearsalWorker from "../../workers/d1-api/stripe-rehearsal";
import { sendSpotlightCheckoutEmails } from "../../src/lib/spotlight/delivery";
import { sendSubscriptionCheckoutUpdates, syncSubscriptionContact } from "../../src/lib/stripe/subscription-delivery";

vi.mock("../../src/lib/spotlight/delivery", () => ({ sendSpotlightCheckoutEmails: vi.fn() }));
vi.mock("../../src/lib/stripe/subscription-delivery", () => ({ sendSubscriptionCheckoutUpdates: vi.fn(), syncSubscriptionContact: vi.fn() }));

const userId = "5da718a5-f971-4944-a61b-8734c0767d29";
const organizationId = "0edfcabe-6f55-43d2-aab7-f9ab454c90f4";
const origin = "https://billing-fixtures.test";
const secret = "billing-gateway-local-fixture-key-32-characters";
let db: DatabaseSync;
let binding: D1Binding;

beforeEach(() => {
  db = new DatabaseSync(":memory:");
  db.exec(readFileSync("d1/production-staging-copy-2026-11-05.sql", "utf8"));
  db.prepare("INSERT INTO _auth_users VALUES(?)").run(userId);
  db.prepare("INSERT INTO users_profile(id,email,primary_role) VALUES(?,?,'trade')")
    .run(userId, "billing@example.invalid");
  db.prepare("INSERT INTO organizations(id,name,slug) VALUES(?,?,?)")
    .run(organizationId, "Local company", "local-company");
  db.prepare("INSERT INTO organization_members(id,organization_id,user_id,role) VALUES('local',?,?,'owner')")
    .run(organizationId, userId);

  const prepare = (sql: string, args: (number | string | null)[] = []): D1Statement => ({
    bind: (...values) => prepare(sql, values),
    first: async <T>() => (db.prepare(sql).get(...args) ?? null) as T | null,
    all: async <T>() => {
      const rows = db.prepare(sql).all(...args) as T[];
      return { success: true, results: rows, meta: { changes: Number(db.prepare("SELECT changes() AS count").get()?.count) } };
    },
    run: async () => ({ success: true, results: [], meta: { changes: Number(db.prepare(sql).run(...args).changes) } }),
  });
  binding = {
    prepare,
    batch: async <T>(statements: D1Statement[]) => {
      db.exec("BEGIN");
      try {
        const results = [];
        for (const statement of statements) results.push(await statement.all<T>());
        db.exec("COMMIT");
        return results;
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    },
  };
});
afterEach(() => db.close());

const activateAuthority = () => db.exec(`
  CREATE TABLE _billing_authority(id INTEGER PRIMARY KEY, mode TEXT NOT NULL);
  INSERT INTO _billing_authority VALUES(1,'d1-authoritative-v1');
`);

function checkout(overrides: object = {}, mode = "customer-native", key = secret) {
  const payload = {
    eventId: "evt_fixture1", userId, organizationId, subscriptionId: "sub_fixture1",
    customerId: "cus_fixture1", priceId: "price_fixtureMonthly",
    periodEnd: new Date(Date.now() + 86400000).toISOString(), ...overrides,
  };
  return handleCustomerAuth(new Request(origin + "/v1/billing/paid-trade-checkout", {
    method: "POST", headers: { "content-type": "application/json", "x-pmrfp-stripe-gateway": key },
    body: JSON.stringify(payload),
  }), {
    MODE: mode, AUTH_ORIGIN: origin, APP_DB: binding, AUTH_DB: binding,
    GATEWAY_SECRET: "", AUTH_SECRET: "",
    STRIPE_BILLING_GATEWAY_SECRET: secret, STRIPE_PRICE_TRADE_PRO_MONTHLY: "price_fixtureMonthly",
    STRIPE_PRICE_REALTOR_ANNUAL: "price_fixtureRealtor",
  });
}

it("grants Founding Lifetime once and retains the prior recurring customer", async () => {
  const write = (eventId: string, checkoutId: string) => handleCustomerAuth(new Request(origin + "/v1/billing/founding-checkout", {
    method: "POST",
    headers: { "content-type": "application/json", "x-pmrfp-stripe-gateway": secret },
    body: JSON.stringify({ eventId, checkoutId, organizationId, userId, customerId: null, amount: 250, currency: "CAD" }),
  }), { MODE: "customer-native", AUTH_ORIGIN: origin, APP_DB: binding, AUTH_DB: binding,
    GATEWAY_SECRET: "", AUTH_SECRET: "", STRIPE_BILLING_GATEWAY_SECRET: secret });

  db.prepare("INSERT INTO subscriptions(id,organization_id,status,stripe_subscription_id,stripe_customer_id) VALUES('fixture',?,'active','sub_prior','cus_prior')")
    .run(organizationId);
  expect((await write("evt_founding", "cs_live_founding")).status).toBe(503);
  activateAuthority();
  expect(await (await write("evt_founding", "cs_live_founding")).json()).toMatchObject({
    applied: true, duplicate: false, secondPurchase: false, previousSubscription: "sub_prior", sold: 1,
  });
  expect(db.prepare("SELECT stripe_subscription_id,stripe_customer_id,CAST(amount AS REAL) AS amount,tier,status FROM subscriptions").get())
    .toEqual({ stripe_subscription_id: "lifetime_cs_live_founding", stripe_customer_id: "cus_prior", amount: 250, tier: "pro", status: "active" });
  expect(await (await write("evt_founding", "cs_live_founding")).json()).toMatchObject({ applied: false, duplicate: true });
  expect(await (await write("evt_second", "cs_live_second")).json()).toMatchObject({ applied: false, duplicate: false, secondPurchase: true });
  expect(db.prepare("SELECT stripe_subscription_id AS id FROM subscriptions").get()?.id).toBe("lifetime_cs_live_founding");
});

it("keeps staging read-only and requires the dedicated gateway key and billing authority", async () => {
  expect((await checkout({}, "customer-staging")).status).toBe(404);
  expect((await checkout({}, "customer-native", "wrong")).status).toBe(401);
  expect((await checkout()).status).toBe(503);
  expect(db.prepare("SELECT count(*) AS count FROM subscriptions").get()?.count).toBe(0);
});

it("atomically grants Trade Pro once and exposes it through the existing session reader", async () => {
  activateAuthority();
  expect((await readCustomerSession(binding, userId)).hasTradeAccess).toBe(false);
  expect(await (await checkout()).json()).toEqual({ applied: true, duplicate: false });
  expect((await readCustomerSession(binding, userId)).hasTradeAccess).toBe(true);
  expect(await (await checkout()).json()).toEqual({ applied: false, duplicate: true });
  expect(db.prepare("SELECT count(*) AS count FROM stripe_webhook_events").get()?.count).toBe(1);
});

it("rejects an unrelated price and rolls back the grant if receipt persistence fails", async () => {
  activateAuthority();
  expect((await checkout({ priceId: "price_unrelated" })).status).toBe(400);
  db.exec(`CREATE TRIGGER reject_receipt BEFORE INSERT ON stripe_webhook_events
    BEGIN SELECT RAISE(ABORT, 'fixture receipt failure'); END;`);
  expect((await checkout()).status).toBe(503);
  expect((await readCustomerSession(binding, userId)).hasTradeAccess).toBe(false);
});

it("preserves lifetime access and does not replace a different active Stripe subscription", async () => {
  activateAuthority();
  db.prepare("INSERT INTO subscriptions(id,organization_id,status,stripe_subscription_id) VALUES('fixture',?,'active','sub_prior')")
    .run(organizationId);
  expect((await checkout()).status).toBe(503);
  expect(db.prepare("SELECT stripe_subscription_id AS id FROM subscriptions").get()?.id).toBe("sub_prior");
  expect(db.prepare("SELECT count(*) AS count FROM stripe_webhook_events").get()?.count).toBe(0);
  db.exec("UPDATE subscriptions SET stripe_subscription_id='lifetime_previous'");
  expect(await (await checkout()).json()).toEqual({ applied: false, duplicate: false });
  expect(db.prepare("SELECT stripe_subscription_id AS id FROM subscriptions").get()?.id).toBe("lifetime_previous");
});

it("records Realtor Pro for a buyer without granting Trade Pro", async () => {
  activateAuthority();
  expect((await checkout({ priceId: "price_fixtureRealtor" })).status).toBe(503);
  db.prepare("UPDATE organizations SET organization_type='property_manager' WHERE id=?").run(organizationId);
  expect(await (await checkout({ priceId: "price_fixtureRealtor" })).json()).toEqual({ applied: true, duplicate: false });
  expect(db.prepare("SELECT tier FROM subscriptions").get()?.tier).toBe("realtor");
  expect((await readCustomerSession(binding, userId)).hasTradeAccess).toBe(false);
});


it("verifies a signed sandbox checkout and delivers it to the D1 activation route", async () => {
  activateAuthority();
  const workerEnv = {
    MODE: "stripe-fixtures-only", APP_DB: binding, STRIPE_BILLING_GATEWAY_SECRET: secret,
    STRIPE_PRICE_TRADE_PRO_MONTHLY: "price_fixtureMonthly",
  };
  const status = () => rehearsalWorker.fetch(new Request(origin + "/v1/billing/rehearsal/status", {
    headers: { "x-pmrfp-stripe-gateway": secret },
  }), workerEnv);
  expect((await status()).status).toBe(503);
  db.exec(`CREATE TABLE _billing_rehearsal(id INTEGER PRIMARY KEY, mode TEXT NOT NULL);
    INSERT INTO _billing_rehearsal VALUES(1,'stripe-fixtures-only');`);
  db.exec(readFileSync("deploy/vps/stripe-subscription-state.sql", "utf8"));
  const signing = "whsec_local_fixture";
  const key = "sk_test_local_fixture";
  let subscriptionStatus = "active";
  let cancelAtPeriodEnd = false;
  const stripe = Object.assign(new Stripe(key), {
    subscriptions: { retrieve: async () => ({
      id: "sub_fixture1", livemode: false, status: subscriptionStatus, customer: "cus_fixture1",
      cancel_at_period_end: cancelAtPeriodEnd,
      metadata: { organization_id: organizationId, user_id: userId },
      items: { data: [{ current_period_end: Math.floor(Date.now() / 1000) + 86400,
        price: { id: "price_fixtureMonthly", currency: "cad" } }] },
    }) },
  });
  const env = {
    STRIPE_SECRET_KEY: key, STRIPE_WEBHOOK_SECRET: signing, STRIPE_PRICE_TRADE_PRO_MONTHLY: "price_fixtureMonthly",
    PMRFP_STRIPE_BILLING_GATEWAY_SECRET: secret, PMRFP_STRIPE_BILLING_GATEWAY_URL: origin,
  };
  const deliver = (async (url: URL, init: RequestInit) =>
    rehearsalWorker.fetch(new Request(url, init), workerEnv)) as typeof fetch;
  const payload = JSON.stringify({
    id: "evt_fixtureSigned", object: "event", type: "checkout.session.completed", livemode: false,
    data: { object: { mode: "subscription", payment_status: "paid", subscription: "sub_fixture1",
      customer: "cus_fixture1", metadata: { plan: "pro", organization_id: organizationId, user_id: userId } } },
  });
  const signature = stripe.webhooks.generateTestHeaderString({ payload, secret: signing });
  const otherUser = await rehearsalWorker.fetch(new Request(origin + "/v1/billing/paid-trade-checkout", {
    method: "POST", headers: { "content-type": "application/json", "x-pmrfp-stripe-gateway": secret },
    body: JSON.stringify({ userId: organizationId }),
  }), workerEnv);
  expect(await otherUser.json()).toEqual({ error: "fixture_user_required" });
  await expect(rehearseD1TradeCheckout(stripe, payload + " ", signature, env, deliver)).rejects.toThrow("invalid_signature");
  expect(await (await status()).json()).toEqual({ pro: false });
  expect(await rehearseD1TradeCheckout(stripe, payload, signature, env, deliver))
    .toEqual({ received: true, applied: true, duplicate: false });
  expect(await (await status()).json()).toEqual({ pro: true });
  expect(await rehearseD1TradeCheckout(stripe, payload, signature, env, deliver))
    .toEqual({ received: true, applied: false, duplicate: true });

  const subscriptionEvent = (id: string, created: number, type = "customer.subscription.updated") => {
    const body = JSON.stringify({ id, created, type, livemode: false, data: { object: { id: "sub_fixture1" } } });
    return rehearseD1TradeCheckout(stripe, body, stripe.webhooks.generateTestHeaderString({ payload: body,
      secret: signing }), env, deliver);
  };
  cancelAtPeriodEnd = true;
  expect((await subscriptionEvent("evt_cancelScheduled", 200)).applied).toBe(true);
  expect(db.prepare("SELECT cancel_at_period_end FROM subscriptions").get()?.cancel_at_period_end).toBe(1);
  expect(await (await status()).json()).toEqual({ pro: true });
  cancelAtPeriodEnd = false;
  expect((await subscriptionEvent("evt_olderUpdate", 100)).applied).toBe(false);
  expect(db.prepare("SELECT cancel_at_period_end FROM subscriptions").get()?.cancel_at_period_end).toBe(1);
  subscriptionStatus = "canceled";
  expect((await subscriptionEvent("evt_canceled", 300, "customer.subscription.deleted")).applied).toBe(true);
  expect(await (await status()).json()).toEqual({ pro: false });
  expect((await subscriptionEvent("evt_canceled", 300, "customer.subscription.deleted")).duplicate).toBe(true);
  subscriptionStatus = "active";
  expect((await subscriptionEvent("evt_lateActive", 400)).applied).toBe(false);
  expect(await (await status()).json()).toEqual({ pro: false });
});

it("handles signed recurring events inside the VPS process and writes authoritative D1 receipts atomically", async () => {
  const signing = "whsec_live_fixture";
  const key = "rk_live_fixture";
  let subscriptionStatus = "active";
  let priceId = "price_fixtureMonthly";
  const stripe = Object.assign(new Stripe(key), {
    subscriptions: { retrieve: async () => ({
      id: "sub_fixture1", livemode: true, status: subscriptionStatus, cancel_at_period_end: false,
      customer: "cus_fixture1", metadata: { organization_id: organizationId, user_id: userId },
      items: { data: [{ current_period_end: Math.floor(Date.now() / 1000) + 86400,
        price: { id: priceId, currency: "cad", unit_amount: 14900 } }] },
    }) },
  });
  const env = { STRIPE_SECRET_KEY: key, STRIPE_WEBHOOK_SECRET: signing,
    STRIPE_PRICE_TRADE_PRO_MONTHLY: "price_fixtureMonthly",
    STRIPE_PRICE_FEATURED_ANNUAL: "price_fixtureFeatured",
    STRIPE_PRICE_SEO_ANNUAL: "price_fixtureSeo",
    PMRFP_STRIPE_BILLING_GATEWAY_SECRET: secret,
    PMRFP_VPS_CUSTOMER_ENGINE: "d1",
    PMRFP_CUSTOMER_AUTH_ORIGIN: origin,
    PMRFP_CUSTOMER_AUTH_GATEWAY_SECRET: "local-customer-gateway-unused-in-billing",
    PMRFP_CUSTOMER_AUTH_SESSION_SECRET: "local-customer-session-unused-in-billing",
    PMRFP_CLOUDFLARE_ACCOUNT_ID: "a".repeat(32),
    PMRFP_D1_AUTH_DATABASE_ID: userId,
    PMRFP_D1_APP_DATABASE_ID: organizationId,
    PMRFP_D1_RUNTIME_TOKEN: "local-billing-fixture-cloudflare-token",
  };
  const gateway: typeof fetch = async (input, init) => {
    const request = new Request(input, init);
    expect(request.url).toBe(`https://api.cloudflare.com/client/v4/accounts/${env.PMRFP_CLOUDFLARE_ACCOUNT_ID}/d1/database/${organizationId}/query`);
    expect(request.headers.get("authorization")).toBe(`Bearer ${env.PMRFP_D1_RUNTIME_TOKEN}`);
    expect(request.headers.get("stripe-signature")).toBeNull();
    type Query = { sql: string; params: (string | number | null)[] };
    const payload = await request.json() as Query | { batch: Query[] };
    const prepare = ({ sql, params }: Query) => binding.prepare(sql).bind(...params);
    try {
      const result = "batch" in payload
        ? await binding.batch(payload.batch.map(prepare)) : [await prepare(payload).all()];
      return Response.json({ success: true, result });
    } catch {
      return Response.json({ success: false }, { status: 400 });
    }
  };
  const send = (type: string, object: object, livemode = true, id = "evt_liveFixture") => {
    const body = JSON.stringify({ id, created: 300, type, livemode, data: { object } });
    const signature = stripe.webhooks.generateTestHeaderString({ payload: body, secret: signing });
    return deliverD1Billing(stripe, body, signature, { env, fetcher: gateway, live: true });
  };
  const session = { mode: "subscription", payment_status: "paid", subscription: "sub_fixture1",
    customer: "cus_fixture1", metadata: { plan: "pro", organization_id: organizationId, user_id: userId } };
  await expect(send("checkout.session.completed", session, false)).rejects.toThrow("incorrect_stripe_mode");
  await expect(send("checkout.session.completed", session)).rejects.toThrow("billing_write_failed");
  expect((await readCustomerSession(binding, userId)).hasTradeAccess).toBe(false);

  activateAuthority();
  db.exec(readFileSync("deploy/vps/stripe-subscription-state.sql", "utf8"));
  expect(await send("checkout.session.expired", { payment_status: "unpaid" }, true, "evt_unpaidExpiry"))
    .toEqual({ received: true, applied: false, duplicate: false });
  expect(await send("checkout.session.expired", { payment_status: "unpaid" }, true, "evt_unpaidExpiry"))
    .toEqual({ received: true, applied: false, duplicate: true });
  expect((await readCustomerSession(binding, userId)).hasTradeAccess).toBe(false);
  priceId = "price_otherProduct";
  await expect(send("checkout.session.completed", session)).rejects.toThrow("subscription_mismatch");
  priceId = "price_fixtureMonthly";
  expect((await send("checkout.session.completed", session)).applied).toBe(true);
  expect(db.prepare("SELECT profile_status FROM organizations").get()?.profile_status).toBe("approved");
  expect((await send("checkout.session.completed", session)).duplicate).toBe(true);
  expect(sendSubscriptionCheckoutUpdates).toHaveBeenCalledTimes(1);
  expect((await readCustomerSession(binding, userId)).hasTradeAccess).toBe(true);

  subscriptionStatus = "past_due";
  const invoice = { parent: { subscription_details: { subscription: "sub_fixture1" } } };
  expect((await send("invoice.payment_failed", invoice, true, "evt_failedPayment")).applied).toBe(true);
  expect((await readCustomerSession(binding, userId)).hasTradeAccess).toBe(false);
  subscriptionStatus = "active";
  expect((await send("invoice.paid", invoice, true, "evt_recoveredPayment")).applied).toBe(true);
  expect((await readCustomerSession(binding, userId)).hasTradeAccess).toBe(true);
  expect((await send("invoice.paid", invoice, true, "evt_recoveredPayment")).duplicate).toBe(true);

  db.prepare("UPDATE organizations SET email='billing@example.invalid'").run();
  priceId = "price_fixtureFeatured";
  expect((await send("customer.subscription.updated", { id: "sub_fixture1" }, true, "evt_featuredUpgrade")).applied)
    .toBe(true);
  expect((await send("customer.subscription.updated", { id: "sub_fixture1" }, true, "evt_featuredUpgrade")).duplicate).toBe(true);
  expect(syncSubscriptionContact).toHaveBeenCalledTimes(1);
  expect(syncSubscriptionContact).toHaveBeenCalledWith(organizationId, "active", expect.objectContaining({ email: "billing@example.invalid" }));
  expect(db.prepare("SELECT tier FROM subscriptions").get()?.tier).toBe("featured");
  expect(db.prepare("SELECT featured FROM organizations").get()?.featured).toBe(1);
  subscriptionStatus = "canceled";
  expect((await send("customer.subscription.deleted", { id: "sub_fixture1" }, true, "evt_featuredCancelled")).applied)
    .toBe(true);
  expect(db.prepare("SELECT featured FROM organizations").get()?.featured).toBe(0);
  expect(db.prepare("SELECT status FROM organizations").get()?.status).toBe("suspended");
  expect((await readCustomerSession(binding, userId)).hasTradeAccess).toBe(false);

  // Grandfathered SEO renewals retain directory-only access. Checkout stays closed.
  db.prepare("UPDATE subscriptions SET tier='seo', status='active', amount=99").run();
  subscriptionStatus = "active";
  priceId = "price_fixtureSeo";
  await expect(send("checkout.session.completed", { ...session, metadata: { ...session.metadata, plan: "seo" } },
    true, "evt_seoCheckout")).rejects.toThrow("subscription_mismatch");
  expect((await send("invoice.paid", invoice, true, "evt_seoRenewal")).applied).toBe(true);
  expect(db.prepare("SELECT tier,CAST(amount AS REAL) AS amount FROM subscriptions").get()).toEqual({ tier: "seo", amount: 149 });
  expect((await readCustomerSession(binding, userId)).hasTradeAccess).toBe(false);
});

it("extends Marketplace placement once per paid checkout and rolls back when the receipt fails", async () => {
  db.exec(readFileSync("deploy/vps/stripe-marketplace-state.sql", "utf8"));
  const listingId = "2bdb408d-2bce-4a4d-b0c9-3e15dfcbf061";
  db.prepare(`INSERT INTO marketplace_listings(id,user_id,title,slug,category,condition,description,
    expires_at,featured_until) VALUES(?,?,'Fixture generator','fixture-generator','generators','used',
    'A locally seeded generator listing','2099-02-01','2099-01-01T00:00:00.000Z')`).run(listingId, userId);
  const featureEnds = () => db.prepare("SELECT featured_until FROM marketplace_listings")
    .get()?.featured_until;
  const signing = "whsec_live_marketplace_fixture";
  const key = "rk_live_marketplace_fixture";
  const stripe = new Stripe(key);
  let amount = 1900;
  let currency = "cad";
  stripe.checkout.sessions.listLineItems = (() => Promise.resolve({
    has_more: false, data: [{ price: { currency, unit_amount: amount }, quantity: 1, amount_discount: 0 }],
  })) as unknown as typeof stripe.checkout.sessions.listLineItems;
  const env = { STRIPE_SECRET_KEY: key, STRIPE_WEBHOOK_SECRET: signing,
    PMRFP_STRIPE_BILLING_GATEWAY_SECRET: secret, PMRFP_STRIPE_BILLING_GATEWAY_URL: origin };
  let mode = "customer-native";
  const gateway = (async (url: URL, init: RequestInit) => handleCustomerAuth(new Request(url, init), {
    MODE: mode, AUTH_ORIGIN: origin, APP_DB: binding, AUTH_DB: binding,
    GATEWAY_SECRET: "", AUTH_SECRET: "", STRIPE_BILLING_GATEWAY_SECRET: secret,
  })) as typeof fetch;
  const send = (event: string, checkout: string, owner = userId, paymentStatus = "paid",
    type = "checkout.session.completed") => {
    const body = JSON.stringify({ id: `evt_${event}`, type, livemode: true, data: {
      object: { id: `cs_live_${checkout}`, mode: "payment", payment_status: paymentStatus, currency: "inr",
        metadata: { product: "marketplace_featured", listing_id: listingId, user_id: owner } },
    } });
    const signature = stripe.webhooks.generateTestHeaderString({ payload: body, secret: signing });
    return deliverD1Billing(stripe, body, signature, { env, fetcher: gateway, live: true });
  };

  await expect(send("first", "first")).rejects.toThrow("billing_write_failed");
  activateAuthority();
  mode = "customer-staging";
  await expect(send("first", "first")).rejects.toThrow("billing_write_failed");
  mode = "customer-native";
  expect(await send("unpaid", "first", userId, "unpaid")).toEqual({ received: true, applied: false, duplicate: false });
  await expect(send("unpaidAsync", "first", userId, "unpaid", "checkout.session.async_payment_succeeded"))
    .rejects.toThrow("marketplace_checkout_unverified");
  amount = 1899;
  await expect(send("underprice", "underprice")).rejects.toThrow("marketplace_price_mismatch");
  amount = 1900;
  await expect(send("wrongOwner", "wrongOwner", organizationId)).rejects.toThrow("billing_write_failed");
  expect(featureEnds()).toBe("2099-01-01T00:00:00.000Z");
  expect(db.prepare("SELECT count(*) AS count FROM stripe_webhook_events").get()?.count).toBe(0);

  expect(await send("first", "first", userId, "paid", "checkout.session.async_payment_succeeded"))
    .toEqual({ received: true, applied: true, duplicate: false });
  expect((await send("first", "first")).duplicate).toBe(true);
  expect((await send("retry", "first")).duplicate).toBe(true);
  await expect(send("wrongOwner", "first", organizationId)).rejects.toThrow("billing_write_failed");
  expect(featureEnds()).toBe("2099-01-15T00:00:00.000Z");
  currency = "usd";
  amount = 1500;
  db.exec(`CREATE TRIGGER reject_receipt BEFORE INSERT ON stripe_webhook_events
    BEGIN SELECT RAISE(ABORT, 'fixture receipt failure'); END;`);
  await expect(send("second", "second")).rejects.toThrow("billing_write_failed");
  expect(featureEnds()).toBe("2099-01-15T00:00:00.000Z");
  expect(db.prepare("SELECT count(*) AS count FROM _billing_marketplace_checkouts").get()?.count).toBe(1);
  db.exec("DROP TRIGGER reject_receipt");
  expect((await send("second", "second")).applied).toBe(true);
  expect(featureEnds()).toBe("2099-01-29T00:00:00.000Z");
});

it("records a paid Spotlight once and suppresses emails on replays and unpaid events", async () => {
  db.exec(readFileSync("deploy/vps/stripe-marketplace-state.sql", "utf8"));
  activateAuthority();
  vi.mocked(sendSpotlightCheckoutEmails).mockClear();
  const signing = "whsec_live_spotlight_fixture";
  const key = "rk_live_spotlight_fixture";
  const stripe = new Stripe(key);
  let amount = 15900;
  stripe.checkout.sessions.listLineItems = (() => Promise.resolve({
    has_more: false, data: [{ price: { currency: "cad", unit_amount: amount }, quantity: 1, amount_discount: 0 }],
  })) as unknown as typeof stripe.checkout.sessions.listLineItems;
  const env = { STRIPE_SECRET_KEY: key, STRIPE_WEBHOOK_SECRET: signing,
    PMRFP_STRIPE_BILLING_GATEWAY_SECRET: secret, PMRFP_STRIPE_BILLING_GATEWAY_URL: origin };
  const fetcher = ((url: URL, init: RequestInit) => handleCustomerAuth(new Request(url, init), {
    MODE: "customer-native", AUTH_ORIGIN: origin, APP_DB: binding, AUTH_DB: binding,
    GATEWAY_SECRET: "", AUTH_SECRET: "", STRIPE_BILLING_GATEWAY_SECRET: secret,
  })) as typeof fetch;
  const send = (id: string, paymentStatus = "paid", type = "checkout.session.completed") => {
    const body = JSON.stringify({ id, type, livemode: true, data: { object: { id: "cs_live_spotlight",
      mode: "payment", payment_status: paymentStatus, metadata: { product: "spotlight", market: "CA" } } } });
    const signature = stripe.webhooks.generateTestHeaderString({ payload: body, secret: signing });
    return deliverD1Billing(stripe, body, signature, { env, fetcher, live: true });
  };
  expect((await send("evt_unpaid", "unpaid")).applied).toBe(false);
  amount--;
  await expect(send("evt_wrongPrice")).rejects.toThrow("spotlight_price_mismatch");
  expect(sendSpotlightCheckoutEmails).not.toHaveBeenCalled();
  amount++;
  expect((await send("evt_paid", "paid", "checkout.session.async_payment_succeeded")).applied).toBe(true);
  expect((await send("evt_paidRetry")).duplicate).toBe(true);
  expect(sendSpotlightCheckoutEmails).toHaveBeenCalledTimes(1);
});

it("keeps Award Intelligence separate from Trade Pro and preserves an admin grant on cancellation", async () => {
  db.exec(readFileSync("deploy/vps/stripe-subscription-state.sql", "utf8"));
  db.exec("INSERT INTO _billing_authority VALUES(1,'d1-authoritative-v1')");
  const write = (fields: Record<string, unknown>, key = secret) => handleCustomerAuth(new Request(origin + "/v1/billing/intel-subscription", {
    method: "POST", headers: { "content-type": "application/json", "x-pmrfp-stripe-gateway": key },
    body: JSON.stringify({
      organizationId, userId, subscriptionId: "sub_intel", customerId: "cus_intel", priceId: "price_intel",
      periodEnd: "2026-12-27T15:00:00Z", eventCreated: 200, status: "active",
      interval: "monthly", currency: "CAD", cents: 9900, cancelAtPeriodEnd: false, ...fields,
    }),
  }), { MODE: "customer-native", AUTH_ORIGIN: origin, APP_DB: binding, AUTH_DB: binding,
    GATEWAY_SECRET: "", AUTH_SECRET: "", STRIPE_BILLING_GATEWAY_SECRET: secret });

  expect((await write({ eventId: "evt_denied" }, "wrong")).status).toBe(401);
  db.prepare("INSERT INTO intel_access(organization_id,status,source) VALUES(?,'comped','admin')").run(organizationId);
  expect(await (await write({ eventId: "evt_cancel", status: "canceled" })).json())
    .toEqual({ applied: false, duplicate: false });
  expect(db.prepare("SELECT source,status FROM intel_access").get()).toEqual({ source: "admin", status: "comped" });
  expect(await (await write({ eventId: "evt_paid", eventCreated: 300 })).json()).toEqual({ applied: true, duplicate: false });
  expect(await (await write({ eventId: "evt_paid", eventCreated: 300 })).json()).toEqual({ applied: false, duplicate: true });
  expect(await (await write({ eventId: "evt_old", eventCreated: 250, status: "canceled" })).json())
    .toEqual({ applied: false, duplicate: false });
  expect(db.prepare("SELECT status,source,stripe_subscription_id FROM intel_access").get())
    .toEqual({ status: "active", source: "stripe", stripe_subscription_id: "sub_intel" });
  expect(db.prepare("SELECT count(*) AS n FROM subscriptions").get()).toEqual({ n: 0 });
});

it("routes a signed Award Intelligence event to its configured price and D1 entitlement", async () => {
  db.exec(readFileSync("deploy/vps/stripe-subscription-state.sql", "utf8"));
  db.exec("INSERT INTO _billing_authority VALUES(1,'d1-authoritative-v1')");
  const stripe = new Stripe("sk_test_fixture");
  const signing = "whsec_intel_fixture";
  const body = JSON.stringify({
    id: "evt_intelsync", created: 200, livemode: true, type: "customer.subscription.updated", data: { object: { id: "sub_intel" } },
  });
  const signature = stripe.webhooks.generateTestHeaderString({ payload: body, secret: signing });
  vi.spyOn(stripe.subscriptions, "retrieve").mockResolvedValue({
    id: "sub_intel", livemode: true, status: "active", customer: "cus_intel", cancel_at_period_end: false,
    metadata: { product: "pmrfp_award_intel", organization_id: organizationId, user_id: userId },
    items: { data: [{ current_period_end: 1798383600, price: { id: "price_intel", currency: "cad", recurring: { interval: "month" }, unit_amount: 9900 } }] },
  } as unknown as Awaited<ReturnType<typeof stripe.subscriptions.retrieve>>);
  const fetcher = ((url: string | URL | Request, init: RequestInit) => handleCustomerAuth(new Request(url, init), {
    MODE: "customer-native", AUTH_ORIGIN: origin, APP_DB: binding, AUTH_DB: binding,
    GATEWAY_SECRET: "", AUTH_SECRET: "", STRIPE_BILLING_GATEWAY_SECRET: secret,
  })) as typeof fetch;
  const env = {
    STRIPE_SECRET_KEY: "sk_live_fixture", STRIPE_WEBHOOK_SECRET: signing,
    PMRFP_STRIPE_BILLING_GATEWAY_SECRET: secret, PMRFP_STRIPE_BILLING_GATEWAY_URL: origin,
  };
  await expect(deliverD1Billing(stripe, body, signature, { live: true, env, fetcher })).rejects.toMatchObject({ code: "intel_subscription_mismatch" });
  const configured = { ...env, STRIPE_PRICE_INTEL_MONTHLY_CAD: "price_intel" };
  expect(await deliverD1Billing(stripe, body, signature, { live: true, env: configured, fetcher }))
    .toEqual({ received: true, applied: true, duplicate: false });
  expect(db.prepare("SELECT status,currency,billing_interval FROM intel_access").get())
    .toEqual({ status: "active", currency: "CAD", billing_interval: "monthly" });
});
