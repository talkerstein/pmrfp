import { describe, expect, it } from "vitest";
import { buildWeeklyReport, withDelta } from "@/lib/admin/weekly-report";

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
    subscriptions: [
      sub({}), // $249/yr → 20.75/mo
      sub({ amount: 29, stripe_price_id: "price_monthly", created_at: daysAgo(2), orgName: "NewCo" }),
      sub({ status: "comped", amount: null }),
      sub({ status: "canceled", updated_at: daysAgo(2), orgName: "GoneCo" }),
      sub({ cancel_at_period_end: true, updated_at: daysAgo(4), orgName: "LeavingCo" }),
    ],
    pmRfps: [
      { title: "Roof", slug: "roof", created_at: daysAgo(2) },
      { title: "Old", slug: "old", created_at: daysAgo(10) },
    ],
    tenders: { total: 2, us: 1 },
    interests: 5,
    interestsPrev: 2,
    contactRequests: 1,
    monthlyPriceIds: ["price_monthly"],
  });

  it("counts this week's signups by type, against last week", () => {
    expect(r.signups.count).toBe(3);
    expect(r.signups.prev).toBe(1);
    expect(r.signups.byRole).toEqual([["Trades", 2], ["Property managers", 1]]);
    expect(r.signups.latest[0].email).toBe("a@x.com");
  });

  it("computes MRR from annual and monthly plans, new paid and cancellations", () => {
    // 249/12 + 29 + LeavingCo 249/12 (still paying until period end)
    expect(r.revenue.mrr).toBe(Math.round(249 / 12 + 29 + 249 / 12));
    expect(r.revenue.arr).toBe(Math.round((249 / 12 + 29 + 249 / 12) * 12)); // 846
    expect(r.revenue.comped).toBe(1);
    expect(r.revenue.newPaid).toEqual([{ org: "NewCo", amount: 29, monthly: true }]);
    expect(r.revenue.churned.map((c) => c.org).sort()).toEqual(["GoneCo", "LeavingCo"]);
  });

  it("splits PM RFPs from imported tenders", () => {
    expect(r.activity.pmRfps).toEqual([{ title: "Roof", slug: "roof" }]);
    expect(r.activity.tendersImported).toBe(2);
    expect(r.activity.usTendersImported).toBe(1);
    expect(withDelta(5, 2)).toBe("5 (+3 vs last week)");
    expect(withDelta(2, 5)).toBe("2 (−3 vs last week)");
  });
});
