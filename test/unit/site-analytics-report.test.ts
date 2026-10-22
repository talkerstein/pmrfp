import { beforeEach, describe, expect, it, vi } from "vitest";
import { biggestLeak, funnel, marketView, normalizeReport, pct, weeklyLines, type RawReport } from "@/lib/tracking/report";
import { rangeEnding } from "@/lib/tracking/report-server";
import { buildWeeklyReport } from "@/lib/admin/weekly-report";

/** /admin/analytics: funnel math, per-market views (Canada and the U.S. apart), and admin-only access. */

const h = vi.hoisted(() => ({ admin: false, load: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn, revalidateTag: vi.fn(), revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/config", () => ({ isSupabaseConfigured: () => true, isServiceConfigured: () => true }));
vi.mock("@/lib/tracking/report-server", async (orig) => ({ ...(await orig<typeof import("@/lib/tracking/report-server")>()), loadSiteReport: h.load }));
vi.mock("@/lib/access/access", () => ({
  isDemoMode: () => false,
  requireRole: vi.fn(async (roles: string[]) => {
    // The real requireRole redirects anyone without one of `roles`.
    if (!h.admin || !roles.includes("admin")) throw new Error("REDIRECT:/dashboard");
    return { userId: "admin-1", profile: { primary_role: "admin" } };
  }),
}));

const RAW: RawReport = {
  from: "2026-10-15",
  to: "2026-10-21",
  daily: [
    { day: "2026-10-20", market: "CA", visitors: 60, page_views: 200 },
    { day: "2026-10-21", market: "CA", visitors: 40, page_views: 100 },
    { day: "2026-10-21", market: "US", visitors: 10, page_views: 15 },
  ],
  top_pages: [{ market: "CA", path: "/rfps", views: 120 }, { market: "US", path: "/pricing", views: 9 }],
  top_referrers: [{ market: "CA", host: "google.com", visits: 30 }],
  signups: [
    { market: "CA", channel: "google_organic", method: "magic_link", role: "trade", n: 3 },
    { market: "CA", channel: "email", method: "password", role: "property_manager", n: 1 },
    { market: "CA", channel: "google_organic", method: "google", role: "trade", n: 1 },
    { market: "US", channel: "direct", method: "google", role: "trade", n: 2 },
  ],
  accounts: { total: 7, without_row: 0 },
  events: [
    { market: "CA", event: "signup_viewed", role_group: "other", actors: 20, n: 25 },
    { market: "CA", event: "signup_started", role_group: "other", actors: 6, n: 6 },
    { market: "CA", event: "email_confirmed", role_group: "trade", actors: 4, n: 4 },
    { market: "CA", event: "signup_completed", role_group: "trade", actors: 4, n: 4 },
    { market: "CA", event: "signup_completed", role_group: "pm", actors: 1, n: 1 },
    { market: "CA", event: "onboarding_completed", role_group: "trade", actors: 2, n: 2 },
    { market: "CA", event: "onboarding_completed", role_group: "pm", actors: 1, n: 1 },
    { market: "CA", event: "upgrade_clicked", role_group: "other", actors: 3, n: 5 },
    { market: "CA", event: "upgrade_clicked", role_group: "trade", actors: 1, n: 1 },
    { market: "CA", event: "checkout_completed", role_group: "trade", actors: 1, n: 1 },
    { market: "CA", event: "writer_started", role_group: "pm", actors: 2, n: 2 },
    { market: "CA", event: "rfp_posted", role_group: "pm", actors: 1, n: 1 },
    { market: "US", event: "signup_viewed", role_group: "other", actors: 5, n: 5 },
  ],
  steps: [
    { market: "CA", event: "signup_step", step: "1", field: "", actors: 20, n: 22 },
    { market: "CA", event: "signup_step", step: "2", field: "", actors: 9, n: 9 },
    { market: "CA", event: "signup_step", step: "3", field: "", actors: 6, n: 6 },
    { market: "CA", event: "onboarding_step", step: "form_viewed", field: "", actors: 4, n: 5 },
    { market: "CA", event: "onboarding_step", step: "form_error", field: "website", actors: 2, n: 2 },
    { market: "CA", event: "onboarding_step", step: "form_error", field: "email", actors: 1, n: 1 },
  ],
};

describe("funnel math", () => {
  it("converts from the previous step and from the top", () => {
    const f = funnel([
      { key: "visit", label: "Visits", n: 200 },
      { key: "signup_viewed", label: "Opened the sign-up page", n: 20 },
      { key: "signup_completed", label: "Signed up", n: 5 },
    ]);
    expect(f.map((s) => [s.n, s.fromPrev, s.fromTop])).toEqual([
      [200, null, 1],
      [20, 0.1, 0.1],
      [5, 0.25, 0.025],
    ]);
  });

  it("never divides by zero and shows a dash instead", () => {
    const f = funnel([
      { key: "a", label: "A", n: 0 },
      { key: "b", label: "B", n: 3 },
    ]);
    expect(f[1]).toMatchObject({ fromPrev: null, fromTop: null });
    expect(funnel([])).toEqual([]);
    expect([pct(null), pct(0), pct(0.025), pct(0.25), pct(1)]).toEqual(["–", "0%", "2.5%", "25%", "100%"]);
  });

  it("builds Canada and the U.S. separately, with trade and PM branches", () => {
    const ca = marketView(RAW, "CA");
    expect([ca.visitors, ca.pageViews, ca.signups]).toEqual([100, 300, 5]);
    // visit, opened the page, submitted, account created, confirmed the email, finished onboarding
    expect(ca.funnel.shared.map((s) => s.key)).toEqual(["visit", "signup_viewed", "signup_started", "signup_completed", "email_confirmed", "onboarding_completed"]);
    expect(ca.funnel.shared.map((s) => s.n)).toEqual([100, 20, 6, 5, 4, 3]);
    expect(ca.funnel.shared[2].fromPrev).toBe(0.3);
    // Branches: signed-in members of that side only; anonymous clicks show under "Other activity".
    expect(ca.funnel.trade.map((s) => s.n)).toEqual([2, 1, 0, 1]);
    expect(ca.activity.find((a) => a.event === "upgrade_clicked")?.n).toBe(4);
    expect(ca.funnel.pm.map((s) => s.n)).toEqual([1, 2, 1]);
    expect(ca.signupsByChannel[0]).toEqual({ channel: "google_organic", label: "Google (organic)", n: 4 });
    expect(ca.signupsByMethod).toEqual(expect.arrayContaining([{ method: "magic_link", n: 3 }]));

    const us = marketView(RAW, "US");
    expect([us.visitors, us.signups]).toEqual([10, 2]);
    expect(us.funnel.shared.map((s) => s.n)).toEqual([10, 5, 0, 0, 0, 0]);
    expect(us.topPages).toEqual([{ path: "/pricing", views: 9 }]);
  });

  it("survives a malformed RPC result", () => {
    const r = normalizeReport({ daily: "nope", events: null });
    expect(marketView(r, "CA").visitors).toBe(0);
    expect(normalizeReport(null).daily).toEqual([]);
  });

  it("gives the weekly email its lines, per country", () => {
    const lines = weeklyLines(marketView(RAW, "CA"));
    expect(lines[0]).toBe("Visitors 100 · page views 300");
    expect(lines[1]).toBe("Sign-ups 5 by source: Google (organic) 4, Email 1");
    expect(lines[2]).toContain("Visit → sign-up 5%");
    expect(lines[2]).toContain("sign-up page → submitted 30%");
    expect(lines[2]).toContain("account → onboarded 60%");
    const report = buildWeeklyReport({ now: new Date("2026-10-21T12:00:00Z"), users: [], subscriptions: [], pmRfps: [], tenders: { total: 0, us: 0 }, interests: 0, interestsPrev: 0, contactRequests: 0, stripe: null, traffic: RAW });
    expect(report.traffic?.canada[0]).toBe("Visitors 100 · page views 300");
    expect(report.traffic?.us[0]).toBe("Visitors 10 · page views 15");
    expect(buildWeeklyReport({ now: new Date(), users: [], subscriptions: [], pmRfps: [], tenders: { total: 0, us: 0 }, interests: 0, interestsPrev: 0, contactRequests: 0, stripe: null }).traffic).toBeNull();
  });

  it("names the biggest leak, and ignores steps that grow or are too small to judge", () => {
    const ca = marketView(RAW, "CA");
    // 20 opened the page, 6 submitted: that is the worst neighbouring drop.
    expect(ca.leak).toMatchObject({ from: "Opened the sign-up page", to: "Submitted the sign-up form", fromN: 20, toN: 6 });
    expect(ca.leak?.kept).toBeCloseTo(0.3);
    expect(marketView(RAW, "US").leak).toMatchObject({ fromN: 5, toN: 0, kept: 0 }); // 5 opened it, none submitted: a leak
    const grows = funnel([
      { key: "a", label: "A", n: 10 },
      { key: "b", label: "B", n: 12 },
      { key: "c", label: "C", n: 9 },
    ]);
    // 10 -> 12 is not a drop (browsers become accounts); 12 -> 9 is.
    expect(biggestLeak(grows)).toMatchObject({ from: "B", to: "C", kept: 0.75 });
    expect(biggestLeak([])).toBeNull();
    expect(biggestLeak(funnel([{ key: "a", label: "A", n: 4 }, { key: "b", label: "B", n: 0 }]))).toBeNull();
  });

  it("shows where unfinished sign-ups stopped, and which field the company form refused", () => {
    const { wizard, onboarding, refusedFields } = marketView(RAW, "CA").stalls;
    expect(wizard).toEqual([{ step: 1, actors: 20 }, { step: 2, actors: 9 }, { step: 3, actors: 6 }]);
    expect(onboarding.map((o) => [o.step, o.actors])).toEqual([["form_viewed", 4], ["form_error", 3]]);
    expect(refusedFields).toEqual([{ field: "website", actors: 2 }, { field: "email", actors: 1 }]);
    // A database that predates the migration has no `steps`: the page still renders.
    expect(marketView(normalizeReport({ events: RAW.events }), "CA").stalls).toEqual({ wizard: [], onboarding: [], refusedFields: [] });
  });

  it("date ranges are inclusive", () => {
    expect(rangeEnding("2026-10-21", 7)).toEqual({ from: "2026-10-15", to: "2026-10-21" });
    expect(rangeEnding("2026-03-01", 1)).toEqual({ from: "2026-03-01", to: "2026-03-01" });
  });
});

describe("/admin/analytics is admin-only", () => {
  beforeEach(() => {
    h.load.mockReset().mockResolvedValue(RAW);
  });

  it("anyone else is redirected before any report is read", async () => {
    h.admin = false;
    const { default: Page } = await import("@/app/[lang]/admin/analytics/page");
    await expect(Page({ params: Promise.resolve({ lang: "en" }), searchParams: Promise.resolve({}) })).rejects.toThrow(/REDIRECT/);
    expect(h.load).not.toHaveBeenCalled();
  });

  it("admins get the report for the chosen range (30 days by default)", async () => {
    h.admin = true;
    const { default: Page } = await import("@/app/[lang]/admin/analytics/page");
    await Page({ params: Promise.resolve({ lang: "en" }), searchParams: Promise.resolve({}) });
    expect(h.load).toHaveBeenLastCalledWith(30);
    await Page({ params: Promise.resolve({ lang: "en" }), searchParams: Promise.resolve({ days: "7" }) });
    expect(h.load).toHaveBeenLastCalledWith(7);
    await Page({ params: Promise.resolve({ lang: "en" }), searchParams: Promise.resolve({ days: "9999" }) });
    expect(h.load).toHaveBeenLastCalledWith(30);
  });
});
