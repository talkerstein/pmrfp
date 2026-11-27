import { afterEach, expect, it, vi } from "vitest";
import type { SessionContext } from "@/lib/access/access";

const create = vi.hoisted(() => vi.fn());
vi.mock("@/lib/stripe/server", () => ({
  getStripe: () => ({ checkout: { sessions: { create } } }),
  isStripeConfigured: () => true,
  SITE_URL: "https://pmrfp.com",
}));
vi.mock("@/lib/analytics", async original => ({
  ...await original<typeof import("@/lib/analytics")>(),
  trackEvent: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("server-only", () => ({}));

import { createTradeCheckout } from "@/lib/billing/checkout";

afterEach(() => {
  vi.unstubAllEnvs();
  create.mockReset();
});

it("builds the hosted subscription checkout with the production return URLs", async () => {
  vi.stubEnv("STRIPE_PRICE_TRADE_PRO_ANNUAL", "price_local_fixture");
  create.mockResolvedValue({ url: "https://checkout.stripe.com/local-fixture" });
  const session = {
    userId: "fixture-user",
    organization: { id: "fixture-company" },
    profile: { primary_role: "trade", email: "checkout@example.invalid" },
  } as SessionContext;

  expect(await createTradeCheckout(session, { plan: "pro", interval: "annual" }, "api"))
    .toMatchObject({ ok: true });
  expect(create).toHaveBeenCalledOnce();
  expect(create).toHaveBeenCalledWith(expect.objectContaining({
    mode: "subscription",
    success_url: "https://pmrfp.com/dashboard?welcome=1",
    cancel_url: "https://pmrfp.com/pricing",
    line_items: [{ price: "price_local_fixture", quantity: 1 }],
    subscription_data: { metadata: {
      organization_id: "fixture-company", user_id: "fixture-user", plan: "pro", interval: "annual",
    } },
  }));
});
