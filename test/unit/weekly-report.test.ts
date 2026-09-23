import { describe, expect, it } from "vitest";
import type Stripe from "stripe";
import { buildWeeklyReport, withDelta } from "@/lib/admin/weekly-report";
import { fmtByCurrency, summarizeStripe } from "@/lib/admin/stripe-revenue";

const now = new Date("2026-09-28T12:30:00Z");
const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000).toISOString();
const sub = (over: Record<string, unknown>) => ({
  status: "active",
  amount: 249,
  stripe_price_id: "price_annual",
  created_at: daysAgo(40),
  updated_at: daysAgo(40),
  cancel_at_period_end: false,
  orgName: "Acme",
  ...over,
});

describe("weekly admin report", () => {
  const r = buildWeeklyReport({
    now,
    users: [
      { email: "a@x.com", primary_role: "trade", created_at: daysAgo(1) },
      { email: "b@x.com", primary_role: "trade", created_at: daysAgo(3) },
      { email: "c@x.com", primary_role: "property_manager", created_at: daysAgo(6) },
      { email: "d@x.com", primary_role: "trade", created_at: daysAgo(9) }, // last week
    ],
    subscriptions: [sub({}), sub({ status: "comped", amount: null }), sub({ status: "canceled" })],
    pmRfps: [
      { title: "Roof", slug: "roof", created_at: daysAgo(2) },
      { title: "Old", slug: "old", created_at: daysAgo(10) },
    ],
    tenders: { total: 2, us: 1 },
    interests: 5,
    interestsPrev: 2,
    contactRequests: 1,
    stripe: null,
  });

  it("counts this week's signups by type, against last week", () => {
    expect(r.signups.count).toBe(3);
    expect(r.signups.prev).toBe(1);
    expect(r.signups.byRole).toEqual([["Trades", 2], ["Property managers", 1]]);
    expect(r.signups.latest[0].email).toBe("a@x.com");
  });

  it("reports database access separately from money", () => {
    expect(r.access).toEqual({ payingCount: 1, comped: 1 });
    expect(r).not.toHaveProperty("revenue");
  });

  it("splits PM RFPs from imported tenders", () => {
    expect(r.activity.pmRfps).toEqual([{ title: "Roof", slug: "roof" }]);
    expect(r.activity.tendersImported).toBe(2);
    expect(r.activity.usTendersImported).toBe(1);
    expect(withDelta(5, 2)).toBe("5 (+3 vs last week)");
    expect(withDelta(2, 5)).toBe("2 (−3 vs last week)");
  });
});

describe("Stripe revenue", () => {
  const nowS = Math.floor(now.getTime() / 1000);
  const DAY = 86_400;
  const charge = (over: Partial<Stripe.Charge>) =>
    ({
      status: "succeeded",
      paid: true,
      amount: 2900,
      amount_refunded: 0,
      currency: "cad",
      created: nowS - 2 * DAY,
      customer: { id: "cus_1", object: "customer", name: "City Limits", email: "x@y.com" },
      billing_details: { name: null, email: null },
      ...over,
    }) as unknown as Stripe.Charge;
  const subscription = (over: Partial<Stripe.Subscription>, unit: number, interval: "month" | "year") =>
    ({
      status: "active",
      currency: "cad",
      customer: { id: "cus_1", object: "customer", name: "City Limits", email: "x@y.com" },
      canceled_at: null,
      items: { data: [{ quantity: 1, price: { unit_amount: unit, currency: "cad", recurring: { interval, interval_count: 1 } } }] },
      ...over,
    }) as unknown as Stripe.Subscription;

  it("counts only money actually received", () => {
    const s = summarizeStripe(
      [
        charge({}),
        charge({ created: nowS - 20 * DAY, amount: 24900 }),
        charge({ status: "failed", paid: false }),
        charge({ amount_refunded: 2900 }), // fully refunded
      ],
      [],
      nowS,
    );
    expect(s.moneyIn7d).toEqual({ CAD: 29 });
    expect(s.moneyIn30d).toEqual({ CAD: 278 });
    expect(s.payments7d).toEqual([{ who: "City Limits", amount: 29, currency: "CAD", date: "2026-09-26" }]);
  });

  it("computes MRR from active subscriptions and flags failed and canceled ones", () => {
    const s = summarizeStripe(
      [],
      [
        subscription({}, 2900, "month"),
        subscription({}, 24900, "year"),
        subscription({ status: "past_due" }, 2900, "month"),
        subscription({ status: "canceled", canceled_at: nowS - DAY }, 2900, "month"),
      ],
      nowS,
    );
    expect(s.active).toHaveLength(2);
    expect(s.mrr).toEqual({ CAD: 49.75 });
    expect(s.pastDue).toEqual(["City Limits"]);
    expect(s.canceled7d).toEqual(["City Limits"]);
    expect(fmtByCurrency({})).toBe("$0");
    expect(fmtByCurrency({ CAD: 49.75 })).toBe("$49.75 CAD");
  });
});
