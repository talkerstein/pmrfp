import { afterEach, expect, it, vi } from "vitest";
import Stripe from "stripe";

vi.mock("server-only", () => ({}));
const fixture = vi.hoisted(() => ({
  configured: vi.fn(() => false),
  insert: vi.fn(async (_row: object): Promise<{ error: { code: string; message: string } | null }> => ({ error: null })),
  upsertSubscription: vi.fn(async (_row: object, _options: object) => ({ error: null })),
  currentSubscription: vi.fn(async (): Promise<{ data: { stripe_subscription_id: string } | null }> => ({ data: null })),
  retrieveStripeSubscription: vi.fn(async (_id: string): Promise<object> => ({})),
  billingAuthority: vi.fn<() => Promise<{ active: number } | null>>(async () => null),
}));
vi.mock("@/lib/d1/http-binding", () => ({ vpsAppDatabase: () => ({ prepare: () => ({ first: fixture.billingAuthority }) }) }));
vi.mock("@/lib/supabase/config", async importOriginal => ({
  ...await importOriginal<typeof import("@/lib/supabase/config")>(),
  isServiceConfigured: fixture.configured,
}));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => ({
  from: (table: string) => table === "subscriptions" ? {
    select: () => ({ eq: () => ({ maybeSingle: fixture.currentSubscription }) }),
    upsert: fixture.upsertSubscription,
  } : { insert: fixture.insert },
}) }));
vi.mock("@/lib/stripe/server", async importOriginal => {
  const original = await importOriginal<typeof import("@/lib/stripe/server")>();
  return {
    ...original,
    getStripe: () => {
      const stripe = original.getStripe();
      return Object.assign(stripe, { subscriptions: { retrieve: fixture.retrieveStripeSubscription } });
    },
  };
});

import { GET, POST } from "@/app/api/stripe/webhook/route";

afterEach(() => {
  vi.unstubAllEnvs();
  fixture.configured.mockReset().mockReturnValue(false);
  fixture.insert.mockClear();
  fixture.upsertSubscription.mockClear();
  fixture.currentSubscription.mockReset().mockResolvedValue({ data: null });
  fixture.retrieveStripeSubscription.mockReset();
  fixture.billingAuthority.mockReset().mockResolvedValue(null);
});

it("writes the current live subscription status through the private receiver and preserves lifetime access", async () => {
  fixture.configured.mockReturnValue(true);
  const secret = "whsec_private_vps_billing_fixture_key";
  vi.stubEnv("PMRFP_VPS_BILLING_RECEIVER", "enabled");
  vi.stubEnv("STRIPE_SECRET_KEY", "rk_live_fixture_only");
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", secret);
  vi.stubEnv("PMRFP_VPS_BILLING_PHASE", "invoices");
  expect((await GET()).status).toBe(200);
  const stripe = new Stripe("rk_live_fixture_only");
  fixture.retrieveStripeSubscription.mockResolvedValue({
    id: "sub_fixture",
    status: "past_due",
    customer: "cus_fixture",
    metadata: { organization_id: "org-fixture", user_id: "customer-fixture" },
    items: { data: [{ price: { id: "price_fixture_month", unit_amount: 2900, currency: "cad" } }] },
    cancel_at_period_end: false,
  });
  const send = (id: string) => {
    const payload = JSON.stringify({ id, livemode: true, type: "invoice.payment_failed", data: {
      object: { parent: { subscription_details: { subscription: "sub_fixture" } } },
    } });
    return POST(new Request("http://pmrfp-stripe-writer:4322/api/stripe/webhook", {
      method: "POST", body: payload,
      headers: { "stripe-signature": stripe.webhooks.generateTestHeaderString({ payload, secret }) },
    }));
  };
  expect(await (await send("evt_invoiceFixture")).json()).toEqual({ received: true });
  expect(fixture.retrieveStripeSubscription).toHaveBeenCalledWith("sub_fixture");
  expect(fixture.upsertSubscription).toHaveBeenCalledWith(expect.objectContaining({
    organization_id: "org-fixture", status: "past_due", stripe_subscription_id: "sub_fixture",
    tier: "pro", amount: 29, currency: "CAD",
  }), { onConflict: "organization_id" });
  fixture.currentSubscription.mockResolvedValue({ data: { stripe_subscription_id: "lifetime_previous_checkout" } });
  expect(await (await send("evt_lifetimeFixture")).json()).toEqual({ received: true });
  expect(fixture.upsertSubscription).toHaveBeenCalledTimes(1);
  const outOfPhase = JSON.stringify({ id: "evt_checkoutFixture", livemode: true, type: "checkout.session.completed", data: { object: {} } });
  expect((await POST(new Request("http://pmrfp-stripe-writer:4322/api/stripe/webhook", {
    method: "POST", body: outOfPhase,
    headers: { "stripe-signature": stripe.webhooks.generateTestHeaderString({ payload: outOfPhase, secret }) },
  }))).status).toBe(503);
  expect(fixture.insert).toHaveBeenCalledTimes(2);
});

it("asks Stripe to retry when an event cannot be persisted", async () => {
  vi.stubEnv("STRIPE_SECRET_KEY", "fixture-only");
  const response = await POST(new Request("https://pmrfp.com/api/stripe/webhook", {
    method: "POST",
    headers: { "stripe-signature": "fixture-only" },
    body: "{}",
  }));
  expect(response.status).toBe(503);
});

it("enforces live signatures and durable event receipts in the private VPS receiver", async () => {
  fixture.configured.mockReturnValue(true);
  const secret = "whsec_private_vps_fixture_signing_key";
  const stripe = new Stripe("rk_live_fixture_only");
  vi.stubEnv("PMRFP_VPS_BILLING_RECEIVER", "enabled");
  vi.stubEnv("STRIPE_SECRET_KEY", "rk_live_fixture_only");
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", secret);
  expect((await GET()).status).toBe(503);
  vi.stubEnv("RESEND_API_KEY", "fixture-only");
  vi.stubEnv("GHL_API_KEY", "fixture-only");
  vi.stubEnv("GHL_LOCATION_ID", "fixture-only");
  expect((await GET()).status).toBe(200);
  const event = { id: "evt_localFixture", type: "checkout.session.expired", livemode: true, data: { object: {} } };
  const payload = JSON.stringify(event);
  const post = (body: string, signature = stripe.webhooks.generateTestHeaderString({ payload: body, secret })) =>
    POST(new Request("http://pmrfp-stripe-writer:4322/api/stripe/webhook", {
      method: "POST", headers: { "stripe-signature": signature }, body,
    }));
  const signature = stripe.webhooks.generateTestHeaderString({ payload, secret });
  expect((await post(payload + " ", signature)).status).toBe(400);
  expect((await post(JSON.stringify({ ...event, livemode: false }))).status).toBe(400);
  expect(fixture.insert).not.toHaveBeenCalled();
  fixture.insert.mockResolvedValueOnce({ error: { code: "unexpected", message: "fixture write failure" } });
  expect((await post(payload)).status).toBe(503);
  fixture.insert.mockResolvedValueOnce({ error: { code: "23505", message: "duplicate" } });
  expect(await (await post(payload)).json()).toEqual({ received: true, duplicate: true });
  expect(await (await post(payload)).json()).toEqual({ received: true });
});

it("keeps live D1 billing disabled for the VPS rehearsal hostname and isolated builds", async () => {
  vi.stubEnv("PMRFP_BILLING_BACKEND", "d1-live-recurring");
  vi.stubEnv("STRIPE_SECRET_KEY", "rk_live_fixture");
  const post = (origin: string) => POST(new Request(`${origin}/api/stripe/webhook`, {
    method: "POST", headers: { "stripe-signature": "fixture-only" }, body: "{}",
  }));
  expect((await post("https://pmrfp-vps.talkerstein.ca")).status).toBe(503);
  vi.stubEnv("PMRFP_ISOLATED_D1_STAGING", "enabled");
  expect((await post("https://pmrfp.com")).status).toBe(503);
});

it("allows the private D1 writer on the relay network to reach Stripe signature verification", async () => {
  vi.stubEnv("PMRFP_BILLING_BACKEND", "d1-live-recurring");
  vi.stubEnv("PMRFP_VPS_BILLING_RECEIVER", "enabled");
  vi.stubEnv("STRIPE_SECRET_KEY", "rk_live_fixture");
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_private_vps_billing_fixture_key");
  const post = () => POST(new Request("http://0.0.0.0:4322/api/stripe/webhook", {
    method: "POST", headers: { host: "pmrfp-stripe-d1-writer:4322", "stripe-signature": "not-a-stripe-signature" }, body: "{}",
  }));
  expect((await post()).status).toBe(503);
  vi.stubEnv("PMRFP_VPS_CUSTOMER_ENGINE", "d1");
  expect((await post()).status).toBe(400);
});

it("keeps the D1 writer unready until its database accepts authoritative billing", async () => {
  vi.stubEnv("PMRFP_VPS_BILLING_RECEIVER", "enabled");
  vi.stubEnv("PMRFP_BILLING_BACKEND", "d1-live-recurring");
  vi.stubEnv("PMRFP_VPS_CUSTOMER_ENGINE", "d1");
  vi.stubEnv("STRIPE_SECRET_KEY", "rk_live_fixture");
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_private_vps_billing_fixture_key");
  vi.stubEnv("PMRFP_STRIPE_BILLING_GATEWAY_SECRET", "local-fixture-billing-secret-32-characters");
  vi.stubEnv("PMRFP_CUSTOMER_AUTH_ORIGIN", "https://pmrfp.com");
  vi.stubEnv("PMRFP_CUSTOMER_AUTH_GATEWAY_SECRET", "local-fixture-gateway-secret-32-characters");
  vi.stubEnv("PMRFP_CUSTOMER_AUTH_SESSION_SECRET", "local-fixture-session-secret-32-characters");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
  vi.stubEnv("RESEND_API_KEY", "fixture-only");
  vi.stubEnv("GHL_API_KEY", "fixture-only");
  vi.stubEnv("GHL_LOCATION_ID", "fixture-only");
  expect((await GET()).status).toBe(503);
  fixture.billingAuthority.mockResolvedValue({ active: 1 });
  expect((await GET()).status).toBe(200);
  fixture.billingAuthority.mockRejectedValue(new Error("D1 unavailable"));
  expect((await GET()).status).toBe(503);
});
