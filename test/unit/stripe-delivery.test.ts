import Stripe from "stripe";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const f = vi.hoisted(() => ({
  claimed: new Set<string>(),
  retrieve: vi.fn(),
  save: vi.fn(),
  database: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/config", async original => ({
  ...await original<typeof import("@/lib/supabase/config")>(),
  isServiceConfigured: () => true,
}));
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({ from: f.database }),
}));
vi.mock("@/lib/stripe/server", async original => {
  const module = await original<typeof import("@/lib/stripe/server")>();
  const sdk = await import("stripe");
  return {
    ...module,
    getStripe: () => Object.assign(new sdk.default("sk_test_local_fixture"), {
      subscriptions: { retrieve: f.retrieve },
    }),
  };
});

import { POST } from "@/app/api/stripe/webhook/route";

const signing = "whsec_local_fixture_only";
const stripe = new Stripe("sk_test_local_fixture");
const signed = (eventId: string) => {
  const body = JSON.stringify({
    id: eventId,
    object: "event",
    type: "customer.subscription.updated",
    data: { object: { id: "sub_localfixture" } },
  });
  const signature = stripe.webhooks.generateTestHeaderString({ payload: body, secret: signing });
  return new Request("https://pmrfp.com/api/stripe/webhook", {
    method: "POST",
    headers: { "stripe-signature": signature },
    body,
  });
};

beforeEach(() => {
  f.claimed.clear();
  f.retrieve.mockReset();
  f.save.mockReset();
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_local_fixture");
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", signing);
  f.retrieve.mockResolvedValue({
    id: "sub_localfixture", status: "active", customer: "cus_localfixture",
    metadata: { organization_id: "local-fixture-org" },
    items: { data: [{ price: { id: "price_localfixture", currency: "cad", unit_amount: 24900 } }] },
  });
  f.database.mockImplementation((table: string) => {
    if (table === "stripe_webhook_events") return {
      insert: async ({ id }: { id: string }) => {
        if (f.claimed.has(id)) return { error: { code: "23505" } };
        f.claimed.add(id);
        return { error: null };
      },
      delete: () => ({ eq: async (_column: string, id: string) => {
        f.claimed.delete(id);
        return { error: null };
      } }),
    };
    const select = () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) });
    if (table === "subscriptions") return { select, upsert: f.save };
    if (table === "organizations") return { select };
    throw new Error("Unexpected local fixture table");
  });
});

afterEach(() => vi.unstubAllEnvs());

it("processes a signed delivery once and acknowledges a duplicate", async () => {
  f.save.mockResolvedValue({ error: null });
  const first = await POST(signed("evt_localA"));
  const second = await POST(signed("evt_localA"));
  expect(first.status).toBe(200);
  expect(await second.json()).toMatchObject({ received: true, duplicate: true });
  expect(f.retrieve).toHaveBeenCalledOnce();
  expect(f.save).toHaveBeenCalledWith(expect.objectContaining({
    organization_id: "local-fixture-org", stripe_subscription_id: "sub_localfixture",
    status: "active", amount: 249, currency: "CAD",
  }), { onConflict: "organization_id" });
});

it("releases the delivery claim and lets Stripe retry after a failed save", async () => {
  f.save.mockResolvedValueOnce({ error: { message: "connection failed" } })
    .mockResolvedValueOnce({ error: null });
  const logged = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    expect((await POST(signed("evt_localB"))).status).toBe(500);
    expect(f.claimed.has("evt_localB")).toBe(false);
    expect((await POST(signed("evt_localB"))).status).toBe(200);
    expect(f.save).toHaveBeenCalledTimes(2);
  } finally {
    logged.mockRestore();
  }
});
