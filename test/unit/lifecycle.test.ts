import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { FREE_STEPS, STEPS, TRIAL_STEPS, lifecycleEnabled, type StepId } from "@/lib/lifecycle/config";
import { decide, inSendingHours, plan, sameLocalDay, type MemberFacts, type MemberState } from "@/lib/lifecycle/schedule";
import { provinceTimeZone } from "@/lib/lifecycle/timezone";
import { renderStep, sampleCopyData, type CopyData } from "@/lib/lifecycle/copy";
import { personaOf, type Persona } from "@/lib/lifecycle/persona";
import { engagementFromEvent } from "@/lib/lifecycle/engagement";
import { lifecycleUnsubscribeUrl, unsubscribeUrl, verifyLifecycleUnsubscribe, verifyUnsubscribe } from "@/lib/email/unsubscribe";
import { emailUtmUrl } from "@/lib/email/utm";

/* ------------------------------------------------------------------ fixtures */

const H = 3_600_000;
const D = 24 * H;
// Tuesday 2026-10-20, 14:00 in Toronto (18:00 UTC).
const TUE_2PM_ET = new Date("2026-10-20T18:00:00Z");

const facts = (f: Partial<MemberFacts> = {}): MemberFacts => ({
  hasTrades: true,
  hasAreas: true,
  projects: 0,
  badgeInstalled: false,
  leadTotal: 12,
  benchmarkReady: true,
  canPost: true,
  forumPosts: 0,
  foundingSoldOut: false,
  ...f,
});

function member(p: Partial<MemberState> & { joinedDaysAgo?: number; now?: Date } = {}): MemberState {
  const now = p.now ?? TUE_2PM_ET;
  return {
    userId: "u1",
    joinedAt: new Date(now.getTime() - (p.joinedDaysAgo ?? 0) * D - H).toISOString(),
    province: "Ontario",
    active: true,
    paid: false,
    trial: null,
    optedOut: false,
    suppressed: false,
    recorded: new Set<StepId>(),
    lastSentAt: null,
    digestSentAt: null,
    facts: facts(),
    ...p,
  };
}

const allBefore = (step: StepId): Set<StepId> => new Set(FREE_STEPS.slice(0, FREE_STEPS.indexOf(step as (typeof FREE_STEPS)[number])));

/* ------------------------------------------------------------------ scheduling */

describe("lifecycle scheduling", () => {
  it("is off unless the flag says 1 or true", () => {
    expect(lifecycleEnabled(undefined)).toBe(false);
    expect(lifecycleEnabled("0")).toBe(false);
    expect(lifecycleEnabled("1")).toBe(true);
    expect(lifecycleEnabled("true")).toBe(true);
  });

  it("sends the welcome on day 0 and each free step on its day, in order", () => {
    expect(decide(member(), TUE_2PM_ET)).toEqual({ action: "send", step: "welcome" });
    const days: Record<string, number> = { market: 1, get_found: 3, trial_offer: 5, benchmark: 8, community: 12, founding: 16 };
    for (const [step, day] of Object.entries(days)) {
      const m = member({ joinedDaysAgo: day, recorded: allBefore(step as StepId) });
      expect(decide(m, TUE_2PM_ET)).toEqual({ action: "send", step });
    }
  });

  it("waits until a step is due", () => {
    const m = member({ joinedDaysAgo: 0, recorded: new Set(["welcome"]) });
    expect(decide(m, TUE_2PM_ET)).toEqual({ action: "wait", step: null, reason: "not_due" });
  });

  it("never enters someone whose welcome window passed (no backlog when the flag turns on)", () => {
    expect(decide(member({ joinedDaysAgo: 9 }), TUE_2PM_ET)).toEqual({ action: "stop", reason: "not_in_sequence" });
  });

  it("misses a step whose window closed instead of sending it late", () => {
    // Day 8 with only the welcome sent: market/get_found/trial_offer windows are over except trial_offer (5..9) and benchmark (8..12).
    const m = member({ joinedDaysAgo: 8, recorded: new Set(["welcome"]) });
    expect(decide(m, TUE_2PM_ET)).toEqual({ action: "send", step: "trial_offer" });
  });

  it("finishes after the last step", () => {
    const m = member({ joinedDaysAgo: 18, recorded: new Set(FREE_STEPS) });
    expect(decide(m, TUE_2PM_ET)).toEqual({ action: "stop", reason: "finished" });
  });
});

describe("lifecycle skip rules (behaviour-based)", () => {
  it("skips get-found when the company has a project AND the badge", () => {
    const at = (f: Partial<MemberFacts>) => decide(member({ joinedDaysAgo: 3, recorded: allBefore("get_found"), facts: facts(f) }), TUE_2PM_ET);
    expect(at({ projects: 1, badgeInstalled: true })).toEqual({ action: "skip", step: "get_found", reason: "profile_done" });
    expect(at({ projects: 1, badgeInstalled: false }).action).toBe("send");
  });

  it("skips the benchmark teaser without n ≥ 5 priced awards", () => {
    const m = member({ joinedDaysAgo: 8, recorded: allBefore("benchmark"), facts: facts({ benchmarkReady: false }) });
    expect(decide(m, TUE_2PM_ET)).toEqual({ action: "skip", step: "benchmark", reason: "no_benchmark" });
  });

  it("community only for members who can post and haven't yet", () => {
    const at = (f: Partial<MemberFacts>) => decide(member({ joinedDaysAgo: 12, recorded: allBefore("community"), facts: facts(f) }), TUE_2PM_ET);
    expect(at({ canPost: false })).toMatchObject({ action: "skip", reason: "cannot_post" });
    expect(at({ forumPosts: 2 })).toMatchObject({ action: "skip", reason: "already_posted" });
    expect(at({}).action).toBe("send");
  });

  it("doesn't sell a trial into an empty market", () => {
    const m = member({ joinedDaysAgo: 5, recorded: allBefore("trial_offer"), facts: facts({ leadTotal: 0, benchmarkReady: false }) });
    expect(decide(m, TUE_2PM_ET)).toMatchObject({ action: "skip", step: "trial_offer", reason: "thin_market" });
  });

  it("skips Founding 500 when sold out", () => {
    const m = member({ joinedDaysAgo: 16, recorded: allBefore("founding"), facts: facts({ foundingSoldOut: true }) });
    expect(decide(m, TUE_2PM_ET)).toMatchObject({ action: "skip", step: "founding", reason: "sold_out" });
  });

  it("plan() records the skip and moves on to the next step in the same run", () => {
    const m = member({ joinedDaysAgo: 12, recorded: allBefore("benchmark"), facts: facts({ benchmarkReady: false }) });
    const r = plan(m, TUE_2PM_ET);
    expect(r.skips).toEqual([{ step: "benchmark", reason: "no_benchmark" }]);
    expect(r.decision).toEqual({ action: "send", step: "community" });
  });
});

describe("lifecycle stop conditions", () => {
  const due = { joinedDaysAgo: 1, recorded: new Set<StepId>(["welcome"]) };
  it.each([
    [{ paid: true }, "upgraded"],
    [{ optedOut: true }, "unsubscribed"],
    [{ suppressed: true }, "bounced"],
    [{ active: false }, "inactive"],
  ] as const)("%o → stop %s", (patch, reason) => {
    expect(decide(member({ ...due, ...patch }), TUE_2PM_ET)).toEqual({ action: "stop", reason });
  });

  it("a trial replaces the free track; the trial track ends with one win-back", () => {
    const started = new Date(TUE_2PM_ET.getTime() - 4 * H);
    const trial = { startedAt: started.toISOString(), endsAt: new Date(started.getTime() + 14 * D).toISOString() };
    const m = member({ joinedDaysAgo: 5, recorded: new Set(["welcome", "market", "get_found"]), trial });
    expect(decide(m, TUE_2PM_ET)).toEqual({ action: "send", step: "trial_day1" });

    // 7 days after the trial ended: the win-back, then nothing.
    const ended = new Date(TUE_2PM_ET.getTime() - 7 * D - H);
    const old = { startedAt: new Date(ended.getTime() - 14 * D).toISOString(), endsAt: ended.toISOString() };
    const w = member({ joinedDaysAgo: 30, trial: old, recorded: new Set<StepId>(["trial_day1", "trial_day7", "trial_day12", "trial_expired"]) });
    expect(decide(w, TUE_2PM_ET)).toEqual({ action: "send", step: "trial_winback" });
    expect(decide({ ...w, recorded: new Set(TRIAL_STEPS) }, TUE_2PM_ET)).toEqual({ action: "stop", reason: "finished" });
  });

  it("paying stops the trial track too", () => {
    const trial = { startedAt: TUE_2PM_ET.toISOString(), endsAt: new Date(TUE_2PM_ET.getTime() + 14 * D).toISOString() };
    expect(decide(member({ trial, paid: true }), new Date(TUE_2PM_ET.getTime() + 4 * H))).toEqual({ action: "stop", reason: "upgraded" });
  });
});

describe("lifecycle quiet hours, one a day, digest day", () => {
  it("sends 9:00–17:00 weekdays in the member's own zone", () => {
    const tz = provinceTimeZone("Ontario")!;
    expect(inSendingHours(new Date("2026-10-20T12:59:00Z"), tz)).toBe(false); // 8:59 ET
    expect(inSendingHours(new Date("2026-10-20T13:00:00Z"), tz)).toBe(true); // 9:00 ET
    expect(inSendingHours(new Date("2026-10-20T21:00:00Z"), tz)).toBe(false); // 17:00 ET
    expect(inSendingHours(new Date("2026-10-24T15:00:00Z"), tz)).toBe(false); // Saturday
  });

  it("uses the province/state zone, else Eastern", () => {
    expect(provinceTimeZone("British Columbia")).toBe("America/Vancouver");
    expect(provinceTimeZone("TX")).toBe("America/Chicago");
    expect(provinceTimeZone("California")).toBe("America/Los_Angeles");
    expect(provinceTimeZone(null)).toBeNull();
    // 10:00 ET = 7:00 in Vancouver: Ontario sends, BC waits.
    const at = new Date("2026-10-20T14:00:00Z");
    expect(decide(member({ now: at }), at)).toEqual({ action: "send", step: "welcome" });
    expect(decide(member({ now: at, province: "British Columbia" }), at)).toMatchObject({ action: "wait", reason: "quiet_hours" });
    expect(decide(member({ now: at, province: null }), at)).toEqual({ action: "send", step: "welcome" });
  });

  it("one lifecycle email per local day", () => {
    const m = member({ joinedDaysAgo: 1, recorded: new Set(["welcome"]), lastSentAt: new Date(TUE_2PM_ET.getTime() - 4 * H).toISOString() });
    expect(decide(m, TUE_2PM_ET)).toMatchObject({ action: "wait", reason: "one_per_day" });
    const y = { ...m, lastSentAt: new Date(TUE_2PM_ET.getTime() - 20 * H).toISOString() };
    expect(decide(y, TUE_2PM_ET)).toEqual({ action: "send", step: "market" });
    expect(sameLocalDay("2026-10-20T03:30:00Z", TUE_2PM_ET, "America/Toronto")).toBe(false); // 23:30 ET Monday
  });

  it("not on a day the weekly email went out", () => {
    const m = member({ joinedDaysAgo: 1, recorded: new Set(["welcome"]), digestSentAt: new Date(TUE_2PM_ET.getTime() - 3 * H).toISOString() });
    expect(decide(m, TUE_2PM_ET)).toMatchObject({ action: "wait", reason: "digest_today" });
  });
});

/* ------------------------------------------------------------------ copy */

const CTX = { base: "https://pmrfp.com", unsubscribeUrl: "https://pmrfp.com/api/email/lifecycle-unsubscribe?u=u1&t=abc" };
const LANGS = ["en", "fr", "es"] as const;
const COUNTRIES = ["CA", "US"] as const;
const PERSONAS: Persona[] = ["recurring", "specialty", "subtrade"];

describe("lifecycle copy", () => {
  it("every step, language, country and persona: short, unsubscribe + address in the footer, utm tagged", () => {
    for (const step of STEPS) {
      for (const lang of LANGS) {
        for (const country of COUNTRIES) {
          for (const persona of PERSONAS) {
            const e = renderStep(step, sampleCopyData(step, lang, country, persona), CTX);
            expect(e.words, `${step}/${lang}/${country}/${persona}`).toBeLessThan(150);
            expect(e.subject.length).toBeGreaterThan(5);
            expect(e.text).toContain(CTX.unsubscribeUrl);
            expect(e.html).toContain(CTX.unsubscribeUrl.replace(/&/g, "&amp;"));
            expect(e.text).toContain("5050 Dufferin St., Toronto, ON M3H 5T5");
            expect(e.text).toContain("Talkerstein Consulting Group");
            expect(e.text).toContain(`utm_source=lifecycle&utm_medium=email&utm_campaign=${step}`);
            expect(e.text).toContain("R. Talkar");
          }
        }
      }
    }
  });

  it("without a signing secret, the footer still says how to stop the emails", () => {
    const e = renderStep("welcome", sampleCopyData("welcome", "en"), { base: CTX.base, unsubscribeUrl: null });
    expect(e.text).toMatch(/reply with "unsubscribe"/);
  });

  it("one currency per country: CAD in Canada, USD in the U.S.", () => {
    const ca = renderStep("founding", sampleCopyData("founding", "en", "CA"), CTX).text;
    expect(ca).toContain("$250 CAD");
    expect(ca).not.toContain("USD");
    const us = renderStep("founding", sampleCopyData("founding", "en", "US"), CTX).text;
    expect(us).toContain("$200 USD");
    expect(us).not.toContain("CAD");
    // Trade Pro yearly is billed in CAD only, so U.S. copy never quotes it.
    const us12 = renderStep("trial_day12", sampleCopyData("trial_day12", "en", "US"), CTX).text;
    expect(us12).not.toContain("CAD");
    expect(us12).toContain("by the year");
    const ca12 = renderStep("trial_day12", sampleCopyData("trial_day12", "fr", "CA"), CTX).text;
    expect(ca12).toContain("249 $ CAD");
  });

  it("Canada and U.S. content never mixed in the benchmark teaser", () => {
    const us = renderStep("benchmark", sampleCopyData("benchmark", "en", "US"), CTX).text;
    expect(us).toContain("Texas");
    expect(us).not.toMatch(/Ontario|CAD/);
  });

  it("writes in the member's language", () => {
    expect(renderStep("welcome", sampleCopyData("welcome", "fr"), CTX).text).toContain("Bonjour Sam,");
    expect(renderStep("welcome", sampleCopyData("welcome", "es"), CTX).text).toContain("Hola, Sam:");
    expect(renderStep("welcome", sampleCopyData("welcome", "fr"), CTX).text).toContain("https://pmrfp.com/fr/dashboard/company");
    expect(renderStep("founding", sampleCopyData("founding", "es"), CTX).subject).toContain("Fundadores 500");
  });

  it("never shows a Founding 500 remaining count while more than 50 spots are left", () => {
    const quiet = renderStep("founding", { ...sampleCopyData("founding", "en"), foundingScarcity: "quiet" }, CTX).text;
    expect(quiet).not.toMatch(/fewer than|spots? (are )?left|\d+ left/i);
    const low = renderStep("founding", { ...sampleCopyData("founding", "en"), foundingScarcity: "low" }, CTX).text;
    expect(low).toContain("Fewer than 50 spots are left.");
  });

  it("is honest about a thin market and leads with awards when bids are few", () => {
    const thin: CopyData = { ...sampleCopyData("market", "en"), market: { openBids: 0, projects: 0, winners: 1, packages: 0, total: 1 }, proBenchmarks: 0 };
    const t = renderStep("market", thin, CTX).text;
    expect(t).toContain("Honest answer: PMRFP has 1 lead");
    expect(t).toContain("Add areas or trades");

    const fewBids: CopyData = { ...sampleCopyData("market", "en"), market: { openBids: 1, projects: 2, winners: 3, packages: 1, total: 7 } };
    const f = renderStep("market", fewBids, CTX).text;
    expect(f.indexOf("3 contractors who won")).toBeLessThan(f.indexOf("1 open bid"));
  });

  it("pro copy sells who wins and what it paid; subtrades get the leads-first version", () => {
    const spec = renderStep("trial_offer", sampleCopyData("trial_offer", "en", "CA", "specialty"), CTX).text;
    expect(spec.indexOf("Who won")).toBeLessThan(spec.indexOf("All 21 leads"));
    const rec = renderStep("trial_offer", sampleCopyData("trial_offer", "en", "CA", "recurring"), CTX).text;
    expect(rec).toContain("plan for the rebid");
    const sub = renderStep("trial_offer", sampleCopyData("trial_offer", "en", "CA", "subtrade"), CTX).text;
    expect(sub.indexOf("All 21 leads")).toBeLessThan(sub.indexOf("Who won"));
    expect(spec).toContain("No card");
  });

  it("personas from trades", () => {
    expect(personaOf(["snow-removal", "landscaping"])).toBe("recurring");
    expect(personaOf(["hvac"])).toBe("specialty");
    expect(personaOf(["painting", "flooring", "hvac"])).toBe("subtrade");
    expect(personaOf([])).toBe("subtrade");
  });

  it("utm source is configurable and defaults to pmrfp", () => {
    expect(emailUtmUrl("https://pmrfp.com/rfps", "x")).toBe("https://pmrfp.com/rfps?utm_source=pmrfp&utm_medium=email&utm_campaign=x");
    expect(emailUtmUrl("https://pmrfp.com/terms#a", "founding", false, "lifecycle")).toBe(
      "https://pmrfp.com/terms?utm_source=lifecycle&utm_medium=email&utm_campaign=founding#a",
    );
  });
});

describe("lifecycle unsubscribe + engagement", () => {
  beforeAll(() => {
    process.env.UNSUBSCRIBE_SECRET = "test-secret";
  });

  it("signs its own links, which can't be swapped with the alerts unsubscribe", () => {
    const u = new URL(lifecycleUnsubscribeUrl("https://pmrfp.com", "user-1")!);
    expect(u.pathname).toBe("/api/email/lifecycle-unsubscribe");
    expect(verifyLifecycleUnsubscribe("user-1", u.searchParams.get("t"))).toBe(true);
    expect(verifyLifecycleUnsubscribe("user-2", u.searchParams.get("t"))).toBe(false);
    const alerts = new URL(unsubscribeUrl("https://pmrfp.com", "user-1")!).searchParams.get("t");
    expect(verifyLifecycleUnsubscribe("user-1", alerts)).toBe(false);
    expect(verifyUnsubscribe("user-1", u.searchParams.get("t"))).toBe(false);
  });

  it("reads opens and clicks from Resend events only", () => {
    expect(engagementFromEvent({ type: "email.opened", data: { email_id: "re_1" } })).toEqual({ emailId: "re_1", field: "opened_at" });
    expect(engagementFromEvent({ type: "email.clicked", data: { email_id: "re_1" } })).toEqual({ emailId: "re_1", field: "clicked_at" });
    expect(engagementFromEvent({ type: "email.bounced", data: { email_id: "re_1" } })).toBeNull();
    expect(engagementFromEvent({ type: "email.opened", data: {} })).toBeNull();
  });
});

/* ------------------------------------------------------------------ engine: dry run sends nothing */

const writes: { table: string; op: string; rows: unknown }[] = [];
const tables: Record<string, unknown[]> = {};

function fakeDb() {
  return {
    from(table: string) {
      let op = "select";
      let payload: unknown = null;
      const b: Record<string, unknown> = {};
      const chain = () => b;
      for (const m of ["select", "eq", "neq", "gte", "gt", "lt", "in", "is", "or", "order", "limit", "range", "like", "abortSignal", "retry", "returns", "maybeSingle"]) b[m] = chain;
      b.upsert = (rows: unknown) => ((op = "upsert"), (payload = rows), writes.push({ table, op, rows }), b);
      b.insert = (rows: unknown) => ((op = "insert"), (payload = rows), writes.push({ table, op, rows }), b);
      b.update = (rows: unknown) => ((op = "update"), (payload = rows), writes.push({ table, op, rows }), b);
      b.then = (resolve: (v: unknown) => void) => {
        if (op === "upsert" || op === "insert") return resolve({ data: [{ id: "row-1" }], error: null, count: 0 });
        if (op === "update") return resolve({ data: null, error: null, count: 0 });
        void payload;
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
const sendSpy = vi.fn(async () => ({ ok: true, id: "re_test" }));
vi.mock("@/lib/email/send", () => ({ emailConfigured: () => true, sendLifecycleEmail: (...a: unknown[]) => sendSpy(...(a as [])) }));

describe("lifecycle engine", () => {
  beforeEach(() => {
    writes.length = 0;
    sendSpy.mockClear();
    const joined = new Date(TUE_2PM_ET.getTime() - H).toISOString();
    Object.assign(tables, {
      lifecycle_sends: [],
      organization_members: [{ organization_id: "o1", user_id: "u1", created_at: joined }],
      trade_trials: [],
      organizations: [
        { id: "o1", name: "Northline Roofing", slug: "northline", city: "Toronto", province: "Ontario", country: "Canada", organization_type: "trade_company", status: "active", is_demo: false, profile_status: "approved", created_at: joined },
      ],
      users_profile: [{ id: "u1", email: "sam@example.com", full_name: "Sam Lee", status: "active", primary_role: "trade" }],
    });
  });
  afterEach(() => {
    delete process.env.LIFECYCLE_EMAILS_ENABLED;
  });

  it("dry run lists who would get what and makes no sends or writes", async () => {
    const { runLifecycle } = await import("@/lib/lifecycle/server");
    const r = await runLifecycle({ dry: true, now: TUE_2PM_ET });
    expect(r.skipped).toBeUndefined();
    expect(r.sends).toHaveLength(1);
    expect(r.sends[0]).toMatchObject({ step: "welcome", email: "sam@example.com", lang: "en", country: "CA" });
    expect(sendSpy).not.toHaveBeenCalled();
    expect(writes).toEqual([]);
  });

  it("sends nothing while the flag is off, even without dry", async () => {
    const { runLifecycle } = await import("@/lib/lifecycle/server");
    const r = await runLifecycle({ dry: false, now: TUE_2PM_ET });
    expect(r.skipped).toMatch(/LIFECYCLE_EMAILS_ENABLED/);
    expect(sendSpy).not.toHaveBeenCalled();
  });

  it("flag on: records the step before sending, then sends once", async () => {
    process.env.LIFECYCLE_EMAILS_ENABLED = "1";
    const { runLifecycle } = await import("@/lib/lifecycle/server");
    const r = await runLifecycle({ dry: false, now: TUE_2PM_ET });
    expect(r.sent).toBe(1);
    expect(sendSpy).toHaveBeenCalledTimes(1);
    expect(writes[0]).toMatchObject({ table: "lifecycle_sends", op: "upsert", rows: { user_id: "u1", step: "welcome", status: "sending" } });
    expect(writes.at(-1)).toMatchObject({ table: "lifecycle_sends", op: "update", rows: { status: "sent", resend_id: "re_test" } });
  });

  it("an already-recorded step is never sent again", async () => {
    process.env.LIFECYCLE_EMAILS_ENABLED = "1";
    tables.lifecycle_sends = [{ user_id: "u1", step: "welcome", status: "sent", sent_at: new Date(TUE_2PM_ET.getTime() - 30 * 60_000).toISOString() }];
    const { runLifecycle } = await import("@/lib/lifecycle/server");
    const r = await runLifecycle({ dry: false, now: TUE_2PM_ET });
    expect(r.sent).toBe(0);
    expect(sendSpy).not.toHaveBeenCalled();
  });
});
