import { describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";
import { verifyStripeEvent } from "@/lib/stripe/verify-event";

const real = { id: "evt_123abc", type: "invoice.payment_failed" } as Stripe.Event;

function fakeStripe({ sigOk, lookup }: { sigOk: boolean; lookup: "found" | "missing" }) {
  return {
    webhooks: {
      constructEvent: vi.fn(() => {
        if (!sigOk) throw new Error("No signatures found matching the expected signature");
        return real;
      }),
    },
    events: {
      retrieve: vi.fn(async (id: string) => {
        if (lookup === "missing") throw new Error(`No such event: '${id}'`);
        return { ...real, id };
      }),
    },
  } as unknown as Stripe & {
    webhooks: { constructEvent: ReturnType<typeof vi.fn> };
    events: { retrieve: ReturnType<typeof vi.fn> };
  };
}

const body = JSON.stringify({ id: "evt_123abc", type: "invoice.payment_failed", data: { object: { forged: true } } });

describe("verifyStripeEvent", () => {
  it("uses the signature when the secret matches", async () => {
    const stripe = fakeStripe({ sigOk: true, lookup: "found" });
    const r = await verifyStripeEvent(stripe, body, "t=1,v1=x", "whsec_ok");
    expect(r?.via).toBe("signature");
    expect(stripe.events.retrieve).not.toHaveBeenCalled();
  });

  it("falls back to fetching the event from Stripe when the secret doesn't match, ignoring the posted body", async () => {
    const stripe = fakeStripe({ sigOk: false, lookup: "found" });
    const r = await verifyStripeEvent(stripe, body, "t=1,v1=x", "whsec_stale");
    expect(r?.via).toBe("api");
    expect(stripe.events.retrieve).toHaveBeenCalledWith("evt_123abc");
    expect((r?.event as unknown as { data?: unknown }).data).toBeUndefined(); // Stripe's copy, not the posted one
  });

  it("works with no secret configured at all", async () => {
    const stripe = fakeStripe({ sigOk: false, lookup: "found" });
    expect((await verifyStripeEvent(stripe, body, "t=1,v1=x", undefined))?.via).toBe("api");
  });

  it("rejects forged ids, junk bodies and malformed ids", async () => {
    const forged = fakeStripe({ sigOk: false, lookup: "missing" });
    expect(await verifyStripeEvent(forged, body, "sig", "whsec_stale")).toBeNull();

    const s = fakeStripe({ sigOk: false, lookup: "found" });
    expect(await verifyStripeEvent(s, "not json", "sig", "whsec")).toBeNull();
    expect(await verifyStripeEvent(s, JSON.stringify({ id: "evt_../../x" }), "sig", "whsec")).toBeNull();
    expect(await verifyStripeEvent(s, JSON.stringify({ id: 42 }), "sig", "whsec")).toBeNull();
    expect(s.events.retrieve).not.toHaveBeenCalled();
  });
});
