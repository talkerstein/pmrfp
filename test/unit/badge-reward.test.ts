import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { detectBadgeInstall } from "@/lib/badge/install";
import { REWARD_DAYS, badgeRewardEnabled, isPayingSubscription, planTrialChange, rewardRefusal, trialAfter, type RewardCompany } from "@/lib/badge/reward";
import { fakeDb, type FakeDb } from "./fake-supabase";

const DAY = 86_400_000;
const NOW = new Date("2026-10-27T15:00:00Z");
const iso = (ms: number) => new Date(ms).toISOString();

/* ------------------------------------------------------------------ pure rules */

const hits = (days: string[], referrer = "acmepaving.ca") => days.map((day) => ({ day, kind: "listed", slug: "acme-paving", referrer }));
const installed = (website = "https://acmepaving.ca") => detectBadgeInstall(website, hits(["2026-10-20", "2026-10-22"]), "acme-paving");
const company = (over: Partial<RewardCompany> = {}): RewardCompany => ({
  organizationType: "trade_company",
  status: "active",
  isDemo: false,
  profileApproved: true,
  paid: false,
  alreadyRewarded: false,
  internal: false,
  ...over,
});

describe("badge reward: the flag", () => {
  it("is off unless BADGE_REWARD_ENABLED is 1 or true", () => {
    expect(badgeRewardEnabled(undefined)).toBe(false);
    for (const v of ["", "0", "false", "yes", "on"]) expect(badgeRewardEnabled(v)).toBe(false);
    expect(badgeRewardEnabled("1")).toBe(true);
    expect(badgeRewardEnabled("true")).toBe(true);
  });

  it("is 14 days", () => {
    expect(REWARD_DAYS).toBe(14);
  });
});

describe("badge reward: who is eligible", () => {
  const ok = (over: Partial<RewardCompany> = {}, install = installed(), enabled = true) => rewardRefusal({ enabled, install, company: company(over) });

  it("a free, live, approved company with a detected install on its own site", () => {
    expect(ok()).toBeNull();
  });

  it("nothing while the flag is off", () => {
    expect(ok({}, installed(), false)).toBe("disabled");
  });

  it("needs the install: one day isn't enough, and another site's loads don't count", () => {
    expect(ok({}, detectBadgeInstall("https://acmepaving.ca", hits(["2026-10-20"]), "acme-paving"))).toBe("not_installed");
    expect(ok({}, detectBadgeInstall("https://acmepaving.ca", hits(["2026-10-20", "2026-10-22"], "competitor.com"), "acme-paving"))).toBe("not_installed");
    expect(ok({}, detectBadgeInstall("https://acmepaving.ca", hits(["2026-10-20", "2026-10-22"], ""), "acme-paving"))).toBe("not_installed");
  });

  it("only once per company", () => {
    expect(ok({ alreadyRewarded: true })).toBe("already_rewarded");
  });

  it("never for a company that already pays", () => {
    expect(ok({ paid: true })).toBe("paying");
    expect(isPayingSubscription({ status: "active", tier: "pro", stripe_subscription_id: null })).toBe(true);
    expect(isPayingSubscription({ status: "comped", tier: "featured", stripe_subscription_id: null })).toBe(true);
    expect(isPayingSubscription({ status: "active", tier: "seo", stripe_subscription_id: "lifetime_cs_1" })).toBe(true);
    expect(isPayingSubscription({ status: "past_due", tier: "pro", stripe_subscription_id: null })).toBe(false);
    expect(isPayingSubscription({ status: "canceled", tier: "pro", stripe_subscription_id: null })).toBe(false);
  });

  it("only a live company: trade, active, not a demo, approved", () => {
    for (const over of [{ isDemo: true }, { profileApproved: false }, { status: "suspended" }, { organizationType: "supplier" }]) {
      expect(ok(over)).toBe("not_a_live_company");
    }
  });

  it("not for staff or test accounts", () => {
    expect(ok({ internal: true })).toBe("internal");
  });

  it("not when the company's website is one of ours or a test host", () => {
    for (const site of ["https://talkerstein.com", "https://www.pmrfp.com", "https://example.com", "https://acme.vercel.app"]) {
      const rows = hits(["2026-10-20", "2026-10-22"], new URL(site).hostname.replace(/^www\./, ""));
      expect(ok({}, detectBadgeInstall(site, rows, "acme-paving"))).toBe("own_domain");
    }
    expect(ok({}, detectBadgeInstall(null, hits(["2026-10-20", "2026-10-22"]), "acme-paving"))).toBe("own_domain");
  });
});

describe("badge reward: what it does to the trial", () => {
  it("no trial yet → a new 14-day trial from now", () => {
    expect(planTrialChange(null, NOW)).toEqual({ kind: "start", startedAt: NOW.toISOString(), endsAt: iso(NOW.getTime() + 14 * DAY) });
  });

  it("a running trial is extended by 14 days (same start)", () => {
    const existing = { startedAt: iso(NOW.getTime() - 9 * DAY), endsAt: iso(NOW.getTime() + 5 * DAY) };
    const c = planTrialChange(existing, NOW);
    expect(c).toEqual({ kind: "extend", endsAt: iso(NOW.getTime() + 19 * DAY), previousEndsAt: existing.endsAt });
    expect(trialAfter(c!, existing)).toEqual({ startedAt: existing.startedAt, endsAt: iso(NOW.getTime() + 19 * DAY) });
    // the trade_trials check: ends_at <= started_at + 31 days
    expect(Date.parse(trialAfter(c!, existing).endsAt) - Date.parse(existing.startedAt)).toBeLessThanOrEqual(31 * DAY);
  });

  it("an ended trial is opened again for 14 days from now", () => {
    const existing = { startedAt: iso(NOW.getTime() - 60 * DAY), endsAt: iso(NOW.getTime() - 46 * DAY) };
    const c = planTrialChange(existing, NOW);
    expect(c).toMatchObject({ kind: "reopen", startedAt: NOW.toISOString(), endsAt: iso(NOW.getTime() + 14 * DAY), previousStartedAt: existing.startedAt, previousEndsAt: existing.endsAt });
    expect(Date.parse(trialAfter(c!, existing).endsAt) - Date.parse(trialAfter(c!, existing).startedAt)).toBe(14 * DAY);
  });

  it("never breaks the table's 31-day cap; with no room left it grants nothing", () => {
    // A hand-made 25-day trial with 5 days left: only 6 of the 14 days fit under the cap.
    const long = { startedAt: iso(NOW.getTime() - 20 * DAY), endsAt: iso(NOW.getTime() + 5 * DAY) };
    const c = planTrialChange(long, NOW);
    expect(c).toMatchObject({ kind: "extend" });
    expect(Date.parse(trialAfter(c!, long).endsAt) - Date.parse(long.startedAt)).toBe(31 * DAY);
    // Already at the cap: nothing to extend, so nothing is used up.
    const full = { startedAt: iso(NOW.getTime() - 1 * DAY), endsAt: iso(NOW.getTime() - 1 * DAY + 31 * DAY) };
    expect(planTrialChange(full, NOW)).toBeNull();
  });
});

/* ------------------------------------------------------------------ the cron pass (fake database) */

const state = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => state.db }));
vi.mock("@/lib/supabase/config", () => ({ isServiceConfigured: () => true, isSupabaseConfigured: () => true }));

type Row = Record<string, unknown>;

function seed(over: Partial<Record<string, Row[]>> = {}): FakeDb {
  const tables: Record<string, Row[]> = {
    organizations: [
      { id: "o1", name: "Acme Paving", slug: "acme-paving", website: "https://www.acmepaving.ca/", organization_type: "trade_company", status: "active", is_demo: false, profile_status: "approved" },
    ],
    badge_hits: [
      { day: "2026-10-20", kind: "listed", slug: "acme-paving", referrer: "acmepaving.ca", hits: 3 },
      { day: "2026-10-22", kind: "listed", slug: "acme-paving", referrer: "acmepaving.ca", hits: 1 },
      // loads with no referrer never match anything
      { day: "2026-10-23", kind: "listed", slug: "acme-paving", referrer: "", hits: 9 },
    ],
    organization_members: [{ organization_id: "o1", user_id: "u1" }],
    users_profile: [{ id: "u1", email: "owner@acmepaving.ca", primary_role: "trade" }],
    subscriptions: [],
    trade_trials: [],
    badge_rewards: [],
    ...over,
  };
  return fakeDb(tables, { unique: { badge_rewards: (e, r) => e.organization_id === r.organization_id, trade_trials: (e, r) => e.organization_id === r.organization_id } });
}

describe("badge reward: the cron pass", () => {
  beforeEach(() => {
    delete process.env.BADGE_REWARD_ENABLED;
  });
  afterEach(() => {
    delete process.env.BADGE_REWARD_ENABLED;
  });

  const writes = (db: FakeDb) => db.calls.filter((c) => c.op !== "select");

  it("flag off: nothing is granted and nothing is written", async () => {
    const db = seed();
    state.db = db;
    const { runBadgeRewards } = await import("@/lib/badge/server");
    const r = await runBadgeRewards({ dry: false, now: NOW });
    expect(r.enabled).toBe(false);
    expect(r.skipped).toMatch(/BADGE_REWARD_ENABLED/);
    expect(writes(db)).toEqual([]);
    expect(db.tables.trade_trials).toEqual([]);
  });

  it("a dry run shows who would get it (even with the flag off) and writes nothing", async () => {
    const db = seed();
    state.db = db;
    const { runBadgeRewards } = await import("@/lib/badge/server");
    const r = await runBadgeRewards({ dry: true, now: NOW });
    expect(r.enabled).toBe(false);
    expect(r.granted).toEqual([expect.objectContaining({ org: "Acme Paving", domain: "acmepaving.ca", days: 2, kind: "start", endsAt: iso(NOW.getTime() + 14 * DAY) })]);
    expect(writes(db)).toEqual([]);
  });

  it("flag on: claims the company's row, then starts a 14-day trial (source badge); a second run grants nothing", async () => {
    process.env.BADGE_REWARD_ENABLED = "1";
    const db = seed();
    state.db = db;
    const { runBadgeRewards } = await import("@/lib/badge/server");
    const r = await runBadgeRewards({ dry: false, now: NOW });
    expect(r.granted).toHaveLength(1);
    expect(db.tables.badge_rewards).toEqual([
      expect.objectContaining({ organization_id: "o1", kind: "start", days: 14, domain: "acmepaving.ca", distinct_days: 2, detected_on: "2026-10-22", trial_ends_after: iso(NOW.getTime() + 14 * DAY) }),
    ]);
    expect(db.tables.trade_trials).toEqual([
      expect.objectContaining({ organization_id: "o1", started_by: null, started_at: NOW.toISOString(), ends_at: iso(NOW.getTime() + 14 * DAY), source: "badge" }),
    ]);
    // The claim goes first: badge_rewards is written before trade_trials.
    const order = writes(db).map((c) => c.table);
    expect(order.indexOf("badge_rewards")).toBeLessThan(order.indexOf("trade_trials"));

    const again = await runBadgeRewards({ dry: false, now: new Date(NOW.getTime() + 3600_000) });
    expect(again.granted).toEqual([]);
    expect(again.refused).toEqual({ already_rewarded: 1 });
    expect(db.tables.badge_rewards).toHaveLength(1);
    expect(db.tables.trade_trials).toHaveLength(1);
  });

  it("a racing run that loses the claim changes nothing", async () => {
    process.env.BADGE_REWARD_ENABLED = "1";
    const db = seed();
    state.db = db;
    const { runBadgeRewards } = await import("@/lib/badge/server");
    // Another run claims between our read ("already rewarded?", the 1st badge_rewards call) and our
    // insert (the 2nd): the primary key stops us, and the trial is never touched.
    const realFrom = db.from.bind(db);
    let calls = 0;
    db.from = (table: string) => {
      if (table === "badge_rewards" && ++calls === 2) db.tables.badge_rewards.push({ organization_id: "o1", kind: "start" });
      return realFrom(table);
    };
    const r = await runBadgeRewards({ dry: false, now: NOW });
    expect(r.granted).toEqual([]);
    expect(db.tables.trade_trials).toEqual([]);
    expect(db.tables.badge_rewards).toHaveLength(1);
  });

  it("a running trial is extended by 14 days and keeps its start", async () => {
    process.env.BADGE_REWARD_ENABLED = "1";
    const startedAt = iso(NOW.getTime() - 9 * DAY);
    const endsAt = iso(NOW.getTime() + 5 * DAY);
    const db = seed({ trade_trials: [{ organization_id: "o1", started_at: startedAt, ends_at: endsAt, source: "dashboard" }] });
    state.db = db;
    const { runBadgeRewards } = await import("@/lib/badge/server");
    const r = await runBadgeRewards({ dry: false, now: NOW });
    expect(r.granted).toEqual([expect.objectContaining({ kind: "extend", endsAt: iso(NOW.getTime() + 19 * DAY) })]);
    expect(db.tables.trade_trials).toEqual([expect.objectContaining({ started_at: startedAt, ends_at: iso(NOW.getTime() + 19 * DAY), source: "dashboard" })]);
    expect(db.tables.badge_rewards[0]).toMatchObject({ kind: "extend", trial_started_before: startedAt, trial_ends_before: endsAt });
  });

  it("an ended trial is opened again for 14 days, and the old dates are kept in badge_rewards", async () => {
    process.env.BADGE_REWARD_ENABLED = "1";
    const startedAt = iso(NOW.getTime() - 40 * DAY);
    const endsAt = iso(NOW.getTime() - 26 * DAY);
    const db = seed({ trade_trials: [{ organization_id: "o1", started_at: startedAt, ends_at: endsAt, source: "dashboard" }] });
    state.db = db;
    const { runBadgeRewards } = await import("@/lib/badge/server");
    await runBadgeRewards({ dry: false, now: NOW });
    expect(db.tables.trade_trials).toEqual([expect.objectContaining({ started_at: NOW.toISOString(), ends_at: iso(NOW.getTime() + 14 * DAY) })]);
    expect(db.tables.badge_rewards[0]).toMatchObject({ kind: "reopen", trial_started_before: startedAt, trial_ends_before: endsAt });
  });

  it("never for a company that already pays", async () => {
    process.env.BADGE_REWARD_ENABLED = "1";
    const db = seed({ subscriptions: [{ organization_id: "o1", status: "active", tier: "pro", stripe_subscription_id: "sub_1" }] });
    state.db = db;
    const { runBadgeRewards } = await import("@/lib/badge/server");
    const r = await runBadgeRewards({ dry: false, now: NOW });
    expect(r.granted).toEqual([]);
    expect(r.refused).toEqual({ paying: 1 });
    expect(writes(db)).toEqual([]);
  });

  it("not for an admin's or a test address's company", async () => {
    process.env.BADGE_REWARD_ENABLED = "1";
    for (const profile of [{ id: "u1", email: "owner@acmepaving.ca", primary_role: "super_admin" }, { id: "u1", email: "rishon@talkerstein.com", primary_role: "trade" }, { id: "u1", email: "test+qa@gmail.com", primary_role: "trade" }]) {
      const db = seed({ users_profile: [profile] });
      state.db = db;
      const { runBadgeRewards } = await import("@/lib/badge/server");
      const r = await runBadgeRewards({ dry: false, now: NOW });
      expect(r.granted, profile.email).toEqual([]);
      expect(r.refused).toEqual({ internal: 1 });
      expect(writes(db)).toEqual([]);
    }
  });

  it("not when only one day, only no-referrer loads, or only other sites' loads are on record", async () => {
    process.env.BADGE_REWARD_ENABLED = "1";
    const cases: Row[][] = [
      [{ day: "2026-10-20", kind: "listed", slug: "acme-paving", referrer: "acmepaving.ca", hits: 5 }],
      [
        { day: "2026-10-20", kind: "listed", slug: "acme-paving", referrer: "", hits: 5 },
        { day: "2026-10-22", kind: "listed", slug: "acme-paving", referrer: "", hits: 5 },
      ],
      [
        { day: "2026-10-20", kind: "listed", slug: "acme-paving", referrer: "someoneelse.com", hits: 5 },
        { day: "2026-10-22", kind: "listed", slug: "acme-paving", referrer: "someoneelse.com", hits: 5 },
      ],
    ];
    for (const badge_hits of cases) {
      const db = seed({ badge_hits });
      state.db = db;
      const { runBadgeRewards } = await import("@/lib/badge/server");
      const r = await runBadgeRewards({ dry: false, now: NOW });
      expect(r.granted).toEqual([]);
      expect(writes(db)).toEqual([]);
    }
  });

  it("not when the company's website is one of ours", async () => {
    process.env.BADGE_REWARD_ENABLED = "1";
    const db = seed({
      organizations: [{ id: "o1", name: "Talkerstein", slug: "acme-paving", website: "https://talkerstein.com", organization_type: "trade_company", status: "active", is_demo: false, profile_status: "approved" }],
      badge_hits: [
        { day: "2026-10-20", kind: "listed", slug: "acme-paving", referrer: "talkerstein.com", hits: 1 },
        { day: "2026-10-22", kind: "listed", slug: "acme-paving", referrer: "talkerstein.com", hits: 1 },
      ],
    });
    state.db = db;
    const { runBadgeRewards } = await import("@/lib/badge/server");
    const r = await runBadgeRewards({ dry: false, now: NOW });
    expect(r.granted).toEqual([]);
    expect(r.refused).toEqual({ own_domain: 1 });
  });

  it("if the trial can't be changed the claim is undone, so the next run can try again", async () => {
    process.env.BADGE_REWARD_ENABLED = "1";
    const db = seed();
    delete (db.tables as Record<string, unknown>).trade_trials; // the table is missing: the insert fails
    state.db = db;
    const { runBadgeRewards } = await import("@/lib/badge/server");
    const r = await runBadgeRewards({ dry: false, now: NOW });
    expect(r.granted).toEqual([]);
    expect(r.refused).toEqual({ failed: 1 });
    expect(db.tables.badge_rewards).toEqual([]);
  });
});
