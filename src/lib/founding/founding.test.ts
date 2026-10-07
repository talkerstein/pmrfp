import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  FOUNDING,
  checkoutRefusal,
  foundingPrice,
  foundingScarcity,
  isLifetimeSubscriptionId,
  isSoldOut,
  lifetimeRow,
  parseMarket,
  spotsLeft,
} from "./config";

const upsert = vi.fn(async () => ({ error: null }));
let existingSubId: string | null = null;
vi.mock("@/lib/supabase/config", () => ({ isServiceConfigured: () => true }));
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: existingSubId ? { stripe_subscription_id: existingSubId } : null }) }) }),
      upsert,
      update: () => ({ eq: async () => ({ error: null }) }),
    }),
  }),
}));

describe("cap", () => {
  it("counts down and never goes negative", () => {
    expect(spotsLeft(0)).toBe(500);
    expect(spotsLeft(499)).toBe(1);
    expect(spotsLeft(500)).toBe(0);
    expect(spotsLeft(512)).toBe(0);
    expect(isSoldOut(499)).toBe(false);
    expect(isSoldOut(500)).toBe(true);
  });
  it("refuses checkout when sold out", () => {
    expect(checkoutRefusal({ signedIn: true, organizationType: "trade_company", alreadyLifetime: false, sold: 500 })).toBe("soldout");
    expect(checkoutRefusal({ signedIn: true, organizationType: "trade_company", alreadyLifetime: false, sold: 499 })).toBeNull();
  });
});

describe("checkout gate", () => {
  it("requires sign-in, an org, and a trade/supplier org", () => {
    expect(checkoutRefusal({ signedIn: false, organizationType: null, alreadyLifetime: false, sold: 0 })).toBe("signin");
    expect(checkoutRefusal({ signedIn: true, organizationType: null, alreadyLifetime: false, sold: 0 })).toBe("org");
    expect(checkoutRefusal({ signedIn: true, organizationType: "property_management", alreadyLifetime: false, sold: 0 })).toBe("role");
    expect(checkoutRefusal({ signedIn: true, organizationType: "supplier", alreadyLifetime: false, sold: 0 })).toBeNull();
  });
  it("refuses a duplicate lifetime for the same org", () => {
    expect(checkoutRefusal({ signedIn: true, organizationType: "trade_company", alreadyLifetime: true, sold: 10 })).toBe("already");
  });
});

describe("price per market", () => {
  it("charges US$200 in the U.S. and C$250 in Canada", () => {
    expect(foundingPrice("US")).toEqual({ amount: 200, currency: "usd" });
    expect(foundingPrice("CA")).toEqual({ amount: 250, currency: "cad" });
    expect(FOUNDING.priceUsd).toBe(200);
    expect(FOUNDING.priceCad).toBe(250);
  });
  it("treats anything but an explicit US as Canada", () => {
    expect(parseMarket("US")).toBe("US");
    expect(parseMarket("us")).toBe("CA");
    expect(parseMarket(undefined)).toBe("CA");
  });
});

describe("lifetime row", () => {
  it("is active pro until 2999 with the lifetime marker", () => {
    const row = lifetimeRow({ organizationId: "o1", userId: null, checkoutSessionId: "cs_1", stripeCustomerId: null, amount: 250, currency: "cad" });
    expect(row).toMatchObject({ tier: "pro", status: "active", cancel_at_period_end: false, stripe_subscription_id: "lifetime_cs_1", currency: "CAD" });
    expect(row.current_period_end.startsWith("2999-12-31")).toBe(true);
    expect(isLifetimeSubscriptionId(row.stripe_subscription_id)).toBe(true);
    expect(isLifetimeSubscriptionId("sub_123")).toBe(false);
  });
});

describe("entitlement guard", () => {
  beforeEach(() => upsert.mockClear());
  const sub = {
    id: "sub_old",
    status: "canceled",
    customer: "cus_1",
    cancel_at_period_end: false,
    metadata: { organization_id: "o1" },
    items: { data: [{ price: { id: "price_x", unit_amount: 24900, currency: "cad", lookup_key: null }, current_period_start: 1, current_period_end: 2 }] },
  };
  it("sync never downgrades a lifetime org", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test";
    const { syncSubscriptionFromStripe, shouldSkipSyncForLifetime } = await import("@/lib/stripe/server");
    expect(shouldSkipSyncForLifetime("lifetime_cs_1")).toBe(true);
    existingSubId = "lifetime_cs_1";
    await syncSubscriptionFromStripe(sub as never);
    expect(upsert).not.toHaveBeenCalled();
  });
  it("sync still updates normal subscriptions", async () => {
    const { syncSubscriptionFromStripe } = await import("@/lib/stripe/server");
    existingSubId = "sub_old";
    await syncSubscriptionFromStripe(sub as never);
    expect(upsert).toHaveBeenCalledTimes(1);
  });
});

describe("foundingScarcity", () => {
  it("never exposes a count above 50 left", () => {
    expect(foundingScarcity(500)).toBe("limited");
    expect(foundingScarcity(51)).toBe("limited");
    expect(foundingScarcity(null)).toBe("limited");
  });
  it("says fewer than 50 at 50 or below, sold out at 0", () => {
    expect(foundingScarcity(50)).toBe("low");
    expect(foundingScarcity(1)).toBe("low");
    expect(foundingScarcity(0)).toBe("soldout");
  });
});
