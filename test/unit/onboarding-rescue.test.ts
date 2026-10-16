import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RESCUE_STEPS, lifecycleEnabled, type StepId } from "@/lib/lifecycle/config";
import { decide, type MemberFacts, type MemberState } from "@/lib/lifecycle/schedule";
import { decideRescue, isInternalEmail, manualOutreach, missingParts, openBidsIn, resumePath, type StalledState } from "@/lib/lifecycle/rescue";
import { renderStep, sampleCopyData } from "@/lib/lifecycle/copy";
import { errorDetail, stageOf, stallCounts } from "@/lib/onboarding/steps";

/* ------------------------------------------------------------------ fixtures */

const M = 60_000;
const H = 60 * M;
const D = 24 * H;
// Tuesday 2026-10-20, 14:00 in Toronto (EDT, UTC-4).
const TUE_2PM = new Date("2026-10-20T18:00:00Z");
const at = (iso: string) => new Date(iso);

function stalled(p: Partial<StalledState> & { startedAgoMs?: number; now?: Date } = {}): StalledState {
  const now = p.now ?? TUE_2PM;
  return {
    userId: "u9",
    startedAt: new Date(now.getTime() - (p.startedAgoMs ?? 2 * H + 5 * M)).toISOString(),
    province: "Ontario",
    active: true,
    internal: false,
    emailConfirmed: true,
    completed: false,
    optedOut: false,
    suppressed: false,
    recorded: new Set<StepId>(),
    lastSentAt: null,
    digestSentAt: null,
    ...p,
  };
}

const facts: MemberFacts = {
  hasTrades: true,
  hasAreas: true,
  projects: 0,
  badgeInstalled: false,
  leadTotal: 12,
  benchmarkReady: true,
  canPost: true,
  forumPosts: 0,
  foundingSoldOut: false,
};

function member(p: Partial<MemberState> = {}): MemberState {
  return {
    userId: "u9",
    joinedAt: new Date(TUE_2PM.getTime() - H).toISOString(),
    province: "Ontario",
    active: true,
    paid: false,
    trial: null,
    optedOut: false,
    suppressed: false,
    recorded: new Set<StepId>(),
    lastSentAt: null,
    digestSentAt: null,
    facts,
    ...p,
  };
}

/* ------------------------------------------------------------------ eligibility */

describe("onboarding rescue: who's eligible", () => {
  it("a confirmed, active trade account with no company gets the +2h email", () => {
    expect(decideRescue(stalled(), TUE_2PM)).toEqual({ action: "send", step: "rescue_2h" });
  });

  it("stops for completed, inactive, internal, bounced, unsubscribed and unconfirmed accounts", () => {
    expect(decideRescue(stalled({ completed: true }), TUE_2PM)).toEqual({ action: "stop", reason: "completed" });
    expect(decideRescue(stalled({ active: false }), TUE_2PM)).toEqual({ action: "stop", reason: "inactive" });
    expect(decideRescue(stalled({ internal: true }), TUE_2PM)).toEqual({ action: "stop", reason: "internal" });
    expect(decideRescue(stalled({ suppressed: true }), TUE_2PM)).toEqual({ action: "stop", reason: "bounced" });
    expect(decideRescue(stalled({ optedOut: true }), TUE_2PM)).toEqual({ action: "stop", reason: "unsubscribed" });
    expect(decideRescue(stalled({ emailConfirmed: false }), TUE_2PM)).toEqual({ action: "stop", reason: "unconfirmed" });
  });

  it("internal, test, demo and throwaway addresses never qualify", () => {
    for (const e of ["hi@talkerstein.ca", "info@pmrfp.com", "sam@example.com", "x@foo.test", "test@gmail.com", "demo2@gmail.com", "rishon+test@gmail.com", "a@mailinator.com", "nope"]) {
      expect(isInternalEmail(e, ""), e).toBe(true);
    }
    for (const e of ["jo@northlineroofing.ca", "contest.winner@gmail.com", "testa.roofing@outlook.com"]) {
      expect(isInternalEmail(e, ""), e).toBe(false);
    }
    expect(isInternalEmail("ops@partner.co", "@partner.co")).toBe(true);
    expect(isInternalEmail("me@x.co", "me@x.co, other@y.co")).toBe(true);
  });
});

/* ------------------------------------------------------------------ timing */

describe("onboarding rescue: step timing", () => {
  it("waits for +2h, then +1 day, then +3 days, then stops forever", () => {
    expect(decideRescue(stalled({ startedAgoMs: 90 * M }), TUE_2PM)).toEqual({ action: "wait", step: null, reason: "not_due" });
    expect(decideRescue(stalled({ startedAgoMs: 2 * H + M }), TUE_2PM)).toEqual({ action: "send", step: "rescue_2h" });

    const after2h = new Set<StepId>(["rescue_2h"]);
    expect(decideRescue(stalled({ startedAgoMs: 20 * H, recorded: after2h }), TUE_2PM)).toEqual({ action: "wait", step: null, reason: "not_due" });
    expect(decideRescue(stalled({ startedAgoMs: D + H, recorded: after2h }), TUE_2PM)).toEqual({ action: "send", step: "rescue_1d" });

    const after1d = new Set<StepId>(["rescue_2h", "rescue_1d"]);
    expect(decideRescue(stalled({ startedAgoMs: 2 * D, recorded: after1d }), TUE_2PM)).toEqual({ action: "wait", step: null, reason: "not_due" });
    expect(decideRescue(stalled({ startedAgoMs: 3 * D + H, recorded: after1d }), TUE_2PM)).toEqual({ action: "send", step: "rescue_3d" });

    const all = new Set<StepId>(RESCUE_STEPS);
    expect(decideRescue(stalled({ startedAgoMs: 3 * D + 2 * H, recorded: all }), TUE_2PM)).toEqual({ action: "stop", reason: "finished" });
    expect(decideRescue(stalled({ startedAgoMs: 30 * D, recorded: all }), TUE_2PM)).toEqual({ action: "stop", reason: "finished" });
  });

  it("only ever starts with the +2h email (no backlog when the flag turns on)", () => {
    expect(decideRescue(stalled({ startedAgoMs: 4 * D }), TUE_2PM)).toEqual({ action: "stop", reason: "not_in_sequence" });
  });

  it("a missed window is never sent late", () => {
    // 2h went, 1d window (to day 5) passed: straight to the 3-day one.
    const r = decideRescue(stalled({ startedAgoMs: 6 * D, recorded: new Set<StepId>(["rescue_2h"]) }), TUE_2PM);
    expect(r).toEqual({ action: "send", step: "rescue_3d" });
    expect(decideRescue(stalled({ startedAgoMs: 9 * D, recorded: new Set<StepId>(["rescue_2h"]) }), TUE_2PM)).toEqual({ action: "stop", reason: "finished" });
  });

  it("one lifecycle email per local day, and not on a weekly-email day", () => {
    const today = new Date(TUE_2PM.getTime() - 3 * H).toISOString();
    expect(decideRescue(stalled({ startedAgoMs: D + H, recorded: new Set<StepId>(["rescue_2h"]), lastSentAt: today }), TUE_2PM)).toEqual({
      action: "wait",
      step: "rescue_1d",
      reason: "one_per_day",
    });
    expect(decideRescue(stalled({ digestSentAt: today }), TUE_2PM)).toEqual({ action: "wait", step: "rescue_2h", reason: "digest_today" });
  });
});

/* ------------------------------------------------------------------ quiet hours */

describe("onboarding rescue: quiet hours", () => {
  it("the +2h email may go until 20:00 local Mon–Thu", () => {
    const tue1830 = at("2026-10-20T22:30:00Z"); // 18:30 Toronto
    const tue2030 = at("2026-10-21T00:30:00Z"); // 20:30 Toronto
    const tue0815 = at("2026-10-20T12:15:00Z"); // 08:15 Toronto
    expect(decideRescue(stalled({ now: tue1830 }), tue1830)).toEqual({ action: "send", step: "rescue_2h" });
    expect(decideRescue(stalled({ now: tue0815 }), tue0815)).toEqual({ action: "send", step: "rescue_2h" });
    expect(decideRescue(stalled({ now: tue2030 }), tue2030)).toEqual({ action: "wait", step: "rescue_2h", reason: "quiet_hours" });
  });

  it("the other rescue steps keep 9:00–17:00", () => {
    const tue1830 = at("2026-10-20T22:30:00Z");
    const s = stalled({ now: tue1830, startedAgoMs: D + H, recorded: new Set<StepId>(["rescue_2h"]) });
    expect(decideRescue(s, tue1830)).toEqual({ action: "wait", step: "rescue_1d", reason: "quiet_hours" });
  });

  it("no Friday-evening or weekend sends; uses the member's own zone", () => {
    const fri1800 = at("2026-10-23T22:00:00Z"); // Friday 18:00 Toronto
    const sat1200 = at("2026-10-24T16:00:00Z");
    expect(decideRescue(stalled({ now: fri1800 }), fri1800)).toEqual({ action: "wait", step: "rescue_2h", reason: "quiet_hours" });
    expect(decideRescue(stalled({ now: sat1200 }), sat1200)).toEqual({ action: "wait", step: "rescue_2h", reason: "quiet_hours" });
    // 18:30 Toronto is 15:30 in Vancouver: inside normal hours there.
    const tue1830 = at("2026-10-20T22:30:00Z");
    const bc = stalled({ now: tue1830, province: "British Columbia", startedAgoMs: D + H, recorded: new Set<StepId>(["rescue_2h"]) });
    expect(decideRescue(bc, tue1830)).toEqual({ action: "send", step: "rescue_1d" });
  });

  it("a Friday-night sign-up still gets the +2h email on Monday morning", () => {
    const mon0830 = at("2026-10-26T12:30:00Z"); // Monday 08:30 Toronto
    const friNight = at("2026-10-23T23:30:00Z").toISOString(); // Friday 19:30
    expect(decideRescue(stalled({ startedAt: friNight }), mon0830)).toEqual({ action: "send", step: "rescue_2h" });
  });
});

/* ------------------------------------------------------------------ completion, welcome, pending review */

describe("onboarding rescue: hand-off to the normal sequence", () => {
  it("stops the moment onboarding completes", () => {
    const s = stalled({ startedAgoMs: D + H, recorded: new Set<StepId>(["rescue_2h"]), completed: true });
    expect(decideRescue(s, TUE_2PM)).toEqual({ action: "stop", reason: "completed" });
  });

  it("then the Day 0 welcome starts from the new membership, once (no double welcome)", () => {
    const yesterday = new Date(TUE_2PM.getTime() - 26 * H).toISOString();
    const m = member({ recorded: new Set<StepId>(["rescue_2h"]), lastSentAt: yesterday });
    expect(decide(m, TUE_2PM)).toEqual({ action: "send", step: "welcome" });
    // Rescue steps are never part of the free track.
    const afterWelcome = member({ recorded: new Set<StepId>(["rescue_2h", "rescue_1d", "welcome"]), lastSentAt: yesterday });
    expect(decide(afterWelcome, TUE_2PM)).toEqual({ action: "wait", step: null, reason: "not_due" });
  });

  it("a rescue email sent today pushes the welcome to tomorrow (one a day)", () => {
    const earlier = new Date(TUE_2PM.getTime() - 2 * H).toISOString();
    expect(decide(member({ recorded: new Set<StepId>(["rescue_2h"]), lastSentAt: earlier }), TUE_2PM)).toEqual({
      action: "wait",
      step: "welcome",
      reason: "one_per_day",
    });
  });

  it("pending review: one 'we're reviewing your profile' email, first, then the normal welcome", () => {
    expect(decide(member({ pendingReview: true }), TUE_2PM)).toEqual({ action: "send", step: "review_pending" });
    const yesterday = new Date(TUE_2PM.getTime() - 26 * H).toISOString();
    const sent = member({ pendingReview: true, recorded: new Set<StepId>(["review_pending"]), lastSentAt: yesterday, joinedAt: yesterday });
    expect(decide(sent, TUE_2PM)).toEqual({ action: "send", step: "welcome" });
    // Never for an old profile, never twice, never once approved.
    expect(decide(member({ pendingReview: true, joinedAt: new Date(TUE_2PM.getTime() - 4 * D).toISOString() }), TUE_2PM).action).not.toBe("send");
    expect(decide(member({ pendingReview: false }), TUE_2PM)).toEqual({ action: "send", step: "welcome" });
  });

  it("pending review uses the relaxed evening hours too", () => {
    const tue1830 = at("2026-10-20T22:30:00Z");
    const m = member({ pendingReview: true, joinedAt: new Date(tue1830.getTime() - H).toISOString() });
    expect(decide(m, tue1830)).toEqual({ action: "send", step: "review_pending" });
    expect(decide(member({ joinedAt: new Date(tue1830.getTime() - H).toISOString() }), tue1830)).toEqual({ action: "wait", step: "welcome", reason: "quiet_hours" });
  });
});

/* ------------------------------------------------------------------ what's left, links, examples, stages */

describe("onboarding rescue: what's left and where they stalled", () => {
  it("lists only what the sign-up page didn't already capture", () => {
    expect(missingParts({ stage: "form_viewed", prefCompany: true, prefTrades: true, prefAreas: false })).toEqual(["areas"]);
    expect(missingParts({ stage: "role_pick_viewed", prefCompany: false, prefTrades: false, prefAreas: false })).toEqual(["role", "company", "trades", "areas"]);
    expect(resumePath({})).toBe("/onboarding");
    expect(resumePath({ orgKind: "builder" })).toBe("/onboarding?role=general_contractor");
  });

  it("the furthest step reached is the stall point", () => {
    const none = new Set<string>();
    expect(stageOf({ emailConfirmed: false, steps: none, onboardingCompleted: false, hasCompany: false })).toBe("signed_up");
    expect(stageOf({ emailConfirmed: true, steps: none, onboardingCompleted: false, hasCompany: false })).toBe("email_confirmed");
    expect(stageOf({ emailConfirmed: true, steps: new Set(["role_pick_viewed", "role_picked", "form_viewed"]), onboardingCompleted: false, hasCompany: false })).toBe("form_viewed");
    expect(stageOf({ emailConfirmed: true, steps: new Set(["form_viewed", "form_error"]), onboardingCompleted: false, hasCompany: false })).toBe("form_error");
    expect(stageOf({ emailConfirmed: true, steps: none, onboardingCompleted: true, hasCompany: false })).toBe("completed_no_company");
    expect(stallCounts(["form_viewed", "signed_up", "form_viewed"])).toEqual([
      { stage: "signed_up", count: 1 },
      { stage: "form_viewed", count: 2 },
    ]);
    expect(errorDetail(["categories"])).toBe("categories");
    expect(errorDetail([0])).toBeNull();
  });

  it("open bids for the no-trade email: province first, honest, no demo or closed ones", () => {
    const r = (title: string, province: string | null, extra: Partial<{ status: string; isDemo: boolean; deadline: string | null }> = {}) => ({
      title,
      province,
      status: "open",
      isDemo: false,
      deadline: "2026-11-30",
      ...extra,
    });
    const rfps = [r("A", "Ontario"), r("B", "Ontario", { status: "closed" }), r("C", "Ontario", { isDemo: true }), r("D", "Ontario", { deadline: "2026-10-01" }), r("E", "Alberta"), r("F", "Texas")];
    const inCountry = (x: { province: string | null }) => x.province !== "Texas";
    expect(openBidsIn(rfps, { inCountry, province: "Ontario", today: "2026-10-20", isPast: () => false }).map((x) => x.title)).toEqual(["A"]);
    expect(openBidsIn(rfps, { inCountry, province: null, today: "2026-10-20", isPast: () => false }).map((x) => x.title)).toEqual(["A", "E"]);
  });

  it("the manual note is plain, personal and signed R. Talkar", () => {
    const n = manualOutreach({ email: "jo@roofco.ca", firstName: "Jo", company: "Roof Co", role: "trade" });
    expect(n.text).toContain("To: jo@roofco.ca");
    expect(n.text).toContain("Hi Jo,");
    expect(n.text).toContain("for Roof Co");
    expect(n.text).toContain("R. Talkar");
    expect(n.text).not.toMatch(/https?:\/\//);
  });
});

/* ------------------------------------------------------------------ copy */

const CTX = { base: "https://pmrfp.com", unsubscribeUrl: "https://pmrfp.com/api/email/lifecycle-unsubscribe?u=u9&t=abc" };
const NEW_STEPS = [...RESCUE_STEPS, "review_pending"] as const;

describe("onboarding rescue copy", () => {
  it("short (< 100 words), signed, footer with unsubscribe + Talkerstein address, utm tagged, en/fr/es, CA/US", () => {
    for (const step of NEW_STEPS) {
      for (const lang of ["en", "fr", "es"] as const) {
        for (const country of ["CA", "US"] as const) {
          const e = renderStep(step, sampleCopyData(step, lang, country), CTX);
          const id = `${step}/${lang}/${country}`;
          expect(e.words, id).toBeLessThan(100);
          expect(e.text, id).toContain("R. Talkar");
          expect(e.text, id).toContain(CTX.unsubscribeUrl);
          expect(e.text, id).toContain("Talkerstein Consulting Group, 5050 Dufferin St., Toronto, ON M3H 5T5");
          expect(e.text, id).toContain("info@pmrfp.com");
          expect(e.text, id).toContain(`utm_source=lifecycle&utm_medium=email&utm_campaign=${step}`);
        }
      }
    }
  });

  it("+2h: what's left, why, and a deep link back to onboarding", () => {
    const e = renderStep("rescue_2h", sampleCopyData("rescue_2h", "en"), CTX);
    expect(e.subject).toBe("Finish your PMRFP profile in 2 minutes");
    expect(e.text).toContain("- Your company name");
    expect(e.text).toContain("- The areas you serve");
    expect(e.text).not.toContain("- The trades you do");
    expect(e.text).toMatch(/leads match on your trades and service area/);
    expect(e.text).toContain("https://pmrfp.com/onboarding?utm_source=lifecycle");
    expect(e.text).toMatch(/Reply to this email/);
  });

  it("+1 day: real examples with the honest count, or an honest 'nothing today'", () => {
    const d = sampleCopyData("rescue_1d", "en");
    const e = renderStep("rescue_1d", d, CTX);
    expect(e.text).toContain("PMRFP has 14 leads for Roofing and HVAC in Toronto right now");
    expect(e.text).toContain(`- ${d.rescue!.examples!.titles[0]}`);
    const none = renderStep("rescue_1d", { ...d, rescue: { ...d.rescue!, examples: { scope: "trade", total: 0, titles: [] } } }, CTX);
    expect(none.text).toMatch(/Honest answer: there are no open Roofing and HVAC leads in Toronto today/);
    const area = renderStep("rescue_1d", { ...d, trades: [], hasTrades: false, rescue: { ...d.rescue!, examples: { scope: "area", total: 1, titles: ["Snow removal, Ottawa"] } } }, CTX);
    expect(area.text).toContain("PMRFP has 1 open bid in Toronto right now");
    expect(area.text).toMatch(/Pick your trades/);
  });

  it("+3 days: the set-it-up-for-you offer, and the last one", () => {
    const e = renderStep("rescue_3d", sampleCopyData("rescue_3d", "en"), CTX);
    expect(e.text).toMatch(/Reply with your company name, the trades you do and the area you cover/);
    expect(e.text).toMatch(/last reminder/);
  });

  it("pending review: 1 business day, what they'll get, and the fix when trades/areas are missing", () => {
    const d = sampleCopyData("review_pending", "en");
    const e = renderStep("review_pending", d, CTX);
    expect(e.subject).toBe("We're reviewing your PMRFP profile");
    expect(e.text).toMatch(/usually within 1 business day/);
    expect(e.text).toMatch(/Add trades and areas/);
    const ok = renderStep("review_pending", { ...d, hasAreas: true, hasTrades: true }, CTX);
    expect(ok.text).toMatch(/Nothing to do in the meantime/);
  });

  it("writes in the member's language", () => {
    expect(renderStep("rescue_2h", sampleCopyData("rescue_2h", "fr"), CTX).subject).toMatch(/Complétez votre profil/);
    expect(renderStep("rescue_2h", sampleCopyData("rescue_2h", "es"), CTX).subject).toMatch(/Complete su perfil/);
    expect(renderStep("rescue_1d", { ...sampleCopyData("rescue_1d", "en", "US"), area: null, rescue: { missing: [], resumePath: "/onboarding", examples: { scope: "area", total: 2, titles: ["A", "B"] } }, trades: [], hasTrades: false }, CTX).text).toContain("in the U.S.");
  });
});

/* ------------------------------------------------------------------ engine: flag, eligibility, idempotency */

const writes: { table: string; op: string; rows: unknown }[] = [];
const tables: Record<string, unknown[]> = {};
const authUsers: Record<string, unknown> = {};

function fakeDb() {
  return {
    auth: { admin: { getUserById: async (id: string) => ({ data: { user: authUsers[id] ?? null }, error: null }) } },
    from(table: string) {
      let op = "select";
      const b: Record<string, unknown> = {};
      const chain = () => b;
      for (const m of ["select", "eq", "neq", "gte", "gt", "lt", "in", "is", "or", "order", "limit", "range", "like", "abortSignal", "retry", "returns", "maybeSingle"]) b[m] = chain;
      b.upsert = (rows: unknown) => ((op = "upsert"), writes.push({ table, op, rows }), b);
      b.insert = (rows: unknown) => ((op = "insert"), writes.push({ table, op, rows }), b);
      b.update = (rows: unknown) => ((op = "update"), writes.push({ table, op, rows }), b);
      b.then = (resolve: (v: unknown) => void) => {
        if (op === "upsert" || op === "insert") return resolve({ data: [{ id: "row-1" }], error: null, count: 0 });
        if (op === "update") return resolve({ data: null, error: null, count: 0 });
        return resolve({ data: tables[table] ?? [], error: null, count: 0 });
      };
      return b;
    },
  };
}

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => fakeDb() }));
vi.mock("@/lib/supabase/config", () => ({ isServiceConfigured: () => true, isSupabaseConfigured: () => true }));
vi.mock("@/lib/data/rfps", () => ({ listRfps: async () => [] }));
vi.mock("@/lib/data/taxonomy", () => ({ getTaxonomyRows: async () => [] }));
vi.mock("@/lib/major-projects/data", () => ({ getMajorProjects: async () => [] }));
vi.mock("@/lib/data/price-benchmarks-load", () => ({
  loadBenchmarkData: async () => ({ awards: [], categories: [], today: "2026-10-20", combos: [] }),
  benchmarkPath: (t: string, p: string) => `/benchmarks/${t}/${p.toLowerCase()}`,
}));
vi.mock("@/lib/founding/server", () => ({ cachedLifetimeCount: async () => 10 }));
const sendSpy = vi.fn(async (p: unknown) => (void p, { ok: true, id: "re_test" }));
vi.mock("@/lib/email/send", () => ({ emailConfigured: () => true, sendLifecycleEmail: (p: unknown) => sendSpy(p) }));

const signedUp = new Date(TUE_2PM.getTime() - 3 * H).toISOString();
const profile = (p: Record<string, unknown> = {}) => ({
  id: "u9",
  email: "jo@northlineroofing.ca",
  full_name: "Jo Smith",
  status: "active",
  primary_role: "trade",
  onboarding_completed: false,
  created_at: signedUp,
  ...p,
});

describe("onboarding rescue engine", () => {
  beforeEach(() => {
    writes.length = 0;
    sendSpy.mockClear();
    for (const k of Object.keys(tables)) delete tables[k];
    for (const k of Object.keys(authUsers)) delete authUsers[k];
    Object.assign(tables, { lifecycle_sends: [], organization_members: [], trade_trials: [], organizations: [], users_profile: [profile()] });
    authUsers.u9 = { email_confirmed_at: signedUp, app_metadata: { provider: "email" }, user_metadata: { pref_categories: ["roofing"], pref_company: "Northline Roofing" } };
  });
  afterEach(() => {
    delete process.env.LIFECYCLE_EMAILS_ENABLED;
  });

  it("flag off: nothing sends, nothing is written", async () => {
    expect(lifecycleEnabled(undefined)).toBe(false);
    const { runLifecycle } = await import("@/lib/lifecycle/server");
    const r = await runLifecycle({ dry: false, now: TUE_2PM });
    expect(r.skipped).toMatch(/LIFECYCLE_EMAILS_ENABLED/);
    expect(sendSpy).not.toHaveBeenCalled();
    expect(writes).toEqual([]);
  });

  it("dry run: lists the +2h email for a stalled trade sign-up, sends and writes nothing", async () => {
    const { runLifecycle } = await import("@/lib/lifecycle/server");
    const r = await runLifecycle({ dry: true, now: TUE_2PM });
    expect(r.rescue.considered).toBe(1);
    expect(r.sends).toEqual([expect.objectContaining({ step: "rescue_2h", email: "jo@northlineroofing.ca", org: "Northline Roofing" })]);
    expect(sendSpy).not.toHaveBeenCalled();
    expect(writes).toEqual([]);
  });

  it("flag on: claims the row first (no company id), then sends once from R. Talkar, reply-to info@", async () => {
    process.env.LIFECYCLE_EMAILS_ENABLED = "1";
    const { runLifecycle } = await import("@/lib/lifecycle/server");
    const r = await runLifecycle({ dry: false, now: TUE_2PM });
    expect(r.sent).toBe(1);
    expect(writes[0]).toMatchObject({ table: "lifecycle_sends", op: "upsert", rows: { user_id: "u9", organization_id: null, step: "rescue_2h", status: "sending" } });
    expect(sendSpy).toHaveBeenCalledTimes(1);
    expect(sendSpy.mock.calls[0][0]).toMatchObject({ to: "jo@northlineroofing.ca", replyTo: "info@pmrfp.com", step: "rescue_2h" });
    expect(String((sendSpy.mock.calls[0][0] as { from: string }).from)).toContain("R. Talkar");
  });

  it("an already-sent rescue step never goes again", async () => {
    process.env.LIFECYCLE_EMAILS_ENABLED = "1";
    tables.lifecycle_sends = [{ user_id: "u9", step: "rescue_2h", status: "sent", sent_at: new Date(TUE_2PM.getTime() - 30 * M).toISOString() }];
    const { runLifecycle } = await import("@/lib/lifecycle/server");
    const r = await runLifecycle({ dry: false, now: TUE_2PM });
    expect(r.sent).toBe(0);
    expect(sendSpy).not.toHaveBeenCalled();
  });

  it("never emails internal addresses, unconfirmed accounts or non-trade roles", async () => {
    const { runLifecycle } = await import("@/lib/lifecycle/server");
    tables.users_profile = [profile({ email: "test@pmrfp.com" })];
    expect((await runLifecycle({ dry: true, now: TUE_2PM })).sends).toEqual([]);
    tables.users_profile = [profile({ primary_role: "property_manager" })];
    expect((await runLifecycle({ dry: true, now: TUE_2PM })).sends).toEqual([]);
    tables.users_profile = [profile()];
    authUsers.u9 = { email_confirmed_at: null, user_metadata: {} };
    const r = await runLifecycle({ dry: true, now: TUE_2PM });
    expect(r.sends).toEqual([]);
    expect(r.rescue.stops).toEqual({ unconfirmed: 1 });
  });

  it("completed onboarding: no rescue email, the normal welcome goes once", async () => {
    const joined = new Date(TUE_2PM.getTime() - H).toISOString();
    tables.users_profile = [profile({ onboarding_completed: true })];
    tables.organization_members = [{ organization_id: "o1", user_id: "u9", created_at: joined }];
    tables.organizations = [
      { id: "o1", name: "Northline Roofing", slug: "northline", city: "Toronto", province: "Ontario", country: "Canada", organization_type: "trade_company", status: "active", is_demo: false, profile_status: "approved", created_at: joined },
    ];
    tables.lifecycle_sends = [{ user_id: "u9", step: "rescue_2h", status: "sent", sent_at: new Date(TUE_2PM.getTime() - 26 * H).toISOString() }];
    const { runLifecycle } = await import("@/lib/lifecycle/server");
    const r = await runLifecycle({ dry: true, now: TUE_2PM });
    expect(r.rescue.considered).toBe(0);
    expect(r.sends.map((s) => s.step)).toEqual(["welcome"]);
  });

  it("a new company in pending_review gets the review note (once), not a rescue email", async () => {
    const joined = new Date(TUE_2PM.getTime() - H).toISOString();
    tables.users_profile = [profile({ onboarding_completed: true })];
    tables.organization_members = [{ organization_id: "o1", user_id: "u9", created_at: joined }];
    tables.organizations = [
      { id: "o1", name: "Northline Roofing", slug: "northline", city: "Toronto", province: "Ontario", country: "Canada", organization_type: "trade_company", status: "active", is_demo: false, profile_status: "pending_review", created_at: joined },
    ];
    const { runLifecycle } = await import("@/lib/lifecycle/server");
    const r = await runLifecycle({ dry: true, now: TUE_2PM });
    expect(r.sends.map((s) => s.step)).toEqual(["review_pending"]);
    expect(r.sends[0].subject).toBe("We're reviewing your PMRFP profile");
    tables.lifecycle_sends = [{ user_id: "u9", step: "review_pending", status: "sent", sent_at: new Date(TUE_2PM.getTime() - 30 * M).toISOString() }];
    const again = await runLifecycle({ dry: true, now: TUE_2PM });
    expect(again.sends).toEqual([]); // welcome waits for tomorrow (one a day); the review note never repeats
  });
});
