import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BADGE_STEPS, STEPS, FREE_STEPS, TRIAL_STEPS, isStepId, lifecycleMaxPerDay, lifecycleStartAt, type StepId } from "@/lib/lifecycle/config";
import { cohortOf, decide, plan, stepWindow, type MemberFacts, type MemberState } from "@/lib/lifecycle/schedule";
import { nextSendWindow } from "@/lib/lifecycle/timezone";
import { renderStep, sampleCopyData, BADGE_PREVIEW_PATH, type CopyData } from "@/lib/lifecycle/copy";
import { fakeDb, type FakeDb } from "./fake-supabase";

const H = 3_600_000;
const D = 24 * H;
// Tuesday 2026-10-27, 14:00 in Toronto (18:00 UTC).
const NOW = new Date("2026-10-27T18:00:00Z");
const ago = (ms: number, from: Date = NOW) => new Date(from.getTime() - ms).toISOString();

const facts = (f: Partial<MemberFacts> = {}): MemberFacts => ({
  hasTrades: true,
  hasAreas: true,
  projects: 0,
  badgeInstalled: false,
  hasWebsite: true,
  badgeDetectedOn: null,
  leadTotal: 12,
  benchmarkReady: true,
  canPost: true,
  forumPosts: 0,
  foundingSoldOut: false,
  ...f,
});

/** An approved company that joined (and was approved) `joinedDaysAgo` days ago. */
function member(p: Partial<MemberState> & { joinedDaysAgo?: number } = {}): MemberState {
  const joined = ago((p.joinedDaysAgo ?? 1) * D + H);
  return {
    userId: "u1",
    joinedAt: joined,
    province: "Ontario",
    active: true,
    paid: false,
    trial: null,
    optedOut: false,
    suppressed: false,
    recorded: new Set<StepId>(),
    lastSentAt: null,
    digestSentAt: null,
    profileApproved: true,
    approvedAt: joined,
    sentAt: {},
    internal: false,
    facts: facts(),
    ...p,
  };
}

const rec = (...steps: StepId[]) => new Set<StepId>(steps);
const GO_LIVE = new Date("2026-10-23T13:00:00Z");

/* ------------------------------------------------------------------ the badge email's timing */

describe("badge email: when it goes", () => {
  it("is a step of its own, and the lifecycle knows all four badge steps", () => {
    expect(BADGE_STEPS).toEqual(["badge", "badge_reminder", "badge_thanks", "welcome_back"]);
    for (const s of BADGE_STEPS) expect(isStepId(s)).toBe(true);
    // The free track itself is unchanged: the badge lane sits beside it.
    expect(FREE_STEPS).toEqual(["welcome", "market", "get_found", "trial_offer", "benchmark", "community", "founding"]);
    expect(STEPS.indexOf("badge")).toBe(STEPS.indexOf("welcome") + 1);
    expect(STEPS.indexOf("badge")).toBeLessThan(STEPS.indexOf("market"));
  });

  it("goes after the welcome and before 'market', right after the profile is approved", () => {
    // Day 0: the welcome is still first, even though the badge is open too.
    expect(decide(member({ joinedDaysAgo: 0 }), NOW)).toEqual({ action: "send", step: "welcome" });
    // Day 1: welcome done, badge goes before market.
    expect(decide(member({ joinedDaysAgo: 1, recorded: rec("welcome") }), NOW)).toEqual({ action: "send", step: "badge" });
    // Then market, on its own day.
    expect(decide(member({ joinedDaysAgo: 1, recorded: rec("welcome", "badge") }), NOW)).toEqual({ action: "send", step: "market" });
    expect(decide(member({ joinedDaysAgo: 3, recorded: rec("welcome", "badge", "market") }), NOW)).toEqual({ action: "send", step: "get_found" });
  });

  it("waits for the approval: nothing about the badge while the profile is pending, and the rest of the track isn't held up", () => {
    const pending = member({ joinedDaysAgo: 1, recorded: rec("welcome"), profileApproved: false, approvedAt: null });
    expect(decide(pending, NOW)).toEqual({ action: "send", step: "market" });
    expect(stepWindow("badge", pending)).toBeNull();
  });

  it("is due half an hour after the approval, for 5 days, never later", () => {
    const base = { joinedDaysAgo: 5, recorded: rec("welcome", "market", "get_found", "trial_offer") };
    const approvedAt = (msAgo: number) => member({ ...base, approvedAt: ago(msAgo) });
    // 10 minutes after approval: not yet (the rest of the track is done too, so it just waits).
    expect(decide(approvedAt(10 * 60_000), NOW)).toMatchObject({ action: "wait", reason: "not_due" });
    expect(decide(approvedAt(40 * 60_000), NOW)).toEqual({ action: "send", step: "badge" });
    expect(decide(approvedAt(4 * D), NOW)).toEqual({ action: "send", step: "badge" });
    // 6 days later the window is over: never sent late.
    expect(decide(member({ ...base, approvedAt: ago(6 * D) }), NOW)).not.toMatchObject({ step: "badge" });
  });

  it("falls back to when the member joined for an approval from before approved_at existed", () => {
    const m = member({ joinedDaysAgo: 3, recorded: rec("welcome"), approvedAt: null });
    expect(decide(m, NOW)).toEqual({ action: "send", step: "badge" });
    expect(decide({ ...m, joinedAt: ago(20 * D) }, NOW)).not.toMatchObject({ step: "badge" });
  });

  it("is skipped when the badge is already installed on their site", () => {
    const m = member({ joinedDaysAgo: 1, recorded: rec("welcome"), facts: facts({ badgeInstalled: true, badgeDetectedOn: "2026-10-26" }) });
    // thanks comes first, then the badge email is skipped (nothing to ask for)
    expect(decide({ ...m, recorded: rec("welcome", "badge_thanks") }, NOW)).toEqual({ action: "skip", step: "badge", reason: "badge_installed" });
  });

  it("trial emails come before the badge email on the trial track", () => {
    const started = ago(4 * H);
    const trial = { startedAt: started, endsAt: new Date(Date.parse(started) + 14 * D).toISOString() };
    expect(decide(member({ joinedDaysAgo: 5, recorded: rec("welcome", "market", "get_found"), trial }), NOW)).toEqual({ action: "send", step: "trial_day1" });
  });

  it("one email a day still applies", () => {
    const m = member({ joinedDaysAgo: 1, recorded: rec("welcome"), lastSentAt: ago(3 * H) });
    expect(decide(m, NOW)).toEqual({ action: "wait", step: "badge", reason: "one_per_day" });
  });
});

describe("badge reminder: 7 days later, only if not installed, then nothing", () => {
  const afterBadge = (daysSinceBadge: number, over: Partial<MemberState> = {}) =>
    member({
      joinedDaysAgo: 30,
      approvedAt: ago(daysSinceBadge * D + 3 * D),
      recorded: rec("welcome", "badge", "market", "get_found", "trial_offer", "benchmark", "community", "founding"),
      sentAt: { badge: ago(daysSinceBadge * D) },
      ...over,
    });

  it("goes 7 days after the badge email, no sooner", () => {
    expect(decide(afterBadge(6), NOW)).toEqual({ action: "stop", reason: "finished" });
    expect(decide(afterBadge(7), NOW)).toEqual({ action: "send", step: "badge_reminder" });
    expect(decide(afterBadge(13), NOW)).toEqual({ action: "send", step: "badge_reminder" });
    // Never late: a week past its window it is simply over.
    expect(decide(afterBadge(15), NOW)).toEqual({ action: "stop", reason: "finished" });
  });

  it("counts from the day the badge email was actually SENT, and needs it to have been sent", () => {
    expect(decide(afterBadge(7, { sentAt: {} }), NOW)).toEqual({ action: "stop", reason: "finished" });
    // No badge email on record: there is nothing to remind them about (the badge email itself is what's due).
    expect(decide(afterBadge(7, { recorded: rec("welcome", "market", "get_found", "trial_offer", "benchmark", "community", "founding") }), NOW)).not.toMatchObject({ step: "badge_reminder" });
  });

  it("is skipped once an install is detected (the thanks goes instead)", () => {
    const installed = afterBadge(7, { facts: facts({ badgeInstalled: true, badgeDetectedOn: "2026-10-26" }), recorded: rec("welcome", "badge", "market", "get_found", "trial_offer", "benchmark", "community", "founding", "badge_thanks") });
    expect(decide(installed, NOW)).toEqual({ action: "skip", step: "badge_reminder", reason: "badge_installed" });
    // plan() records the skip and ends there: nothing is sent.
    expect(plan(installed, NOW)).toMatchObject({ skips: [{ step: "badge_reminder", reason: "badge_installed" }], decision: { action: "stop" } });
  });

  it("is skipped when there is no website to install it on", () => {
    expect(decide(afterBadge(7, { facts: facts({ hasWebsite: false }) }), NOW)).toEqual({ action: "skip", step: "badge_reminder", reason: "no_website" });
  });

  it("is the last one: once recorded, nothing more", () => {
    const done = afterBadge(8, { recorded: rec("welcome", "badge", "market", "get_found", "trial_offer", "benchmark", "community", "founding", "badge_reminder") });
    expect(decide(done, NOW)).toEqual({ action: "stop", reason: "finished" });
    expect(plan(done, NOW).decision.action).toBe("stop");
  });

  it("gives way to a step of the track that is due the same day", () => {
    const m = member({ joinedDaysAgo: 8, approvedAt: ago(8 * D), recorded: rec("welcome", "badge", "market", "get_found", "trial_offer"), sentAt: { badge: ago(7 * D) } });
    // benchmark (day 8) is due: it goes first, the reminder follows on a later day inside its own window.
    expect(decide(m, NOW)).toEqual({ action: "send", step: "benchmark" });
    expect(decide({ ...m, recorded: rec("welcome", "badge", "market", "get_found", "trial_offer", "benchmark") }, NOW)).toEqual({ action: "send", step: "badge_reminder" });
  });
});

describe("badge thanks: once, when the install is first detected", () => {
  const installed = (over: Partial<MemberState> = {}) =>
    member({ joinedDaysAgo: 4, recorded: rec("welcome", "badge", "market"), sentAt: { badge: ago(3 * D) }, facts: facts({ badgeInstalled: true, badgeDetectedOn: "2026-10-27" }), ...over });

  it("goes first, ahead of whatever else is due", () => {
    expect(decide(installed(), NOW)).toEqual({ action: "send", step: "badge_thanks" });
  });

  it("not before an install is detected", () => {
    expect(decide(installed({ facts: facts({ badgeInstalled: false, badgeDetectedOn: null }) }), NOW)).not.toMatchObject({ step: "badge_thanks" });
    expect(stepWindow("badge_thanks", installed({ facts: facts({ badgeInstalled: true, badgeDetectedOn: null }) }))).toBeNull();
  });

  it("once: after it is recorded it never repeats, and a company that never got the badge email can still get it", () => {
    expect(decide(installed({ recorded: rec("welcome", "badge", "market", "badge_thanks") }), NOW)).not.toMatchObject({ step: "badge_thanks" });
    expect(decide(installed({ recorded: rec("welcome"), sentAt: {} }), NOW)).toEqual({ action: "send", step: "badge_thanks" });
  });

  it("is open for 14 days after the detection, never later", () => {
    expect(decide(installed({ facts: facts({ badgeInstalled: true, badgeDetectedOn: "2026-10-15" }) }), NOW)).toEqual({ action: "send", step: "badge_thanks" });
    expect(decide(installed({ facts: facts({ badgeInstalled: true, badgeDetectedOn: "2026-10-01" }) }), NOW)).not.toMatchObject({ step: "badge_thanks" });
  });

  it("an install detected before go-live is old news: no thanks out of nowhere", () => {
    const old = installed({ facts: facts({ badgeInstalled: true, badgeDetectedOn: "2026-10-20" }) });
    expect(decide(old, NOW, { startAt: GO_LIVE })).not.toMatchObject({ step: "badge_thanks" });
    expect(decide(installed({ facts: facts({ badgeInstalled: true, badgeDetectedOn: "2026-10-26" }) }), NOW, { startAt: GO_LIVE })).toEqual({ action: "send", step: "badge_thanks" });
  });
});

describe("the badge lane stops on upgrade, unsubscribe, bounce (and inactive)", () => {
  // A member for whom EACH badge step would otherwise be due.
  const due: Record<string, MemberState> = {
    badge: member({ joinedDaysAgo: 1, recorded: rec("welcome") }),
    badge_reminder: member({ joinedDaysAgo: 30, approvedAt: ago(10 * D), recorded: rec("welcome", "badge", "market", "get_found", "trial_offer", "benchmark", "community", "founding"), sentAt: { badge: ago(7 * D) } }),
    badge_thanks: member({ joinedDaysAgo: 4, recorded: rec("welcome", "badge"), facts: facts({ badgeInstalled: true, badgeDetectedOn: "2026-10-27" }) }),
    welcome_back: member({ joinedDaysAgo: 30, approvedAt: ago(30 * D) }),
  };

  it("each is actually due without the stop", () => {
    expect(decide(due.badge, NOW)).toEqual({ action: "send", step: "badge" });
    expect(decide(due.badge_reminder, NOW)).toEqual({ action: "send", step: "badge_reminder" });
    expect(decide(due.badge_thanks, NOW)).toEqual({ action: "send", step: "badge_thanks" });
    expect(decide(due.welcome_back, NOW, { startAt: GO_LIVE })).toEqual({ action: "send", step: "welcome_back" });
  });

  it.each([
    [{ paid: true }, "upgraded"],
    [{ optedOut: true }, "unsubscribed"],
    [{ suppressed: true }, "bounced"],
    [{ active: false }, "inactive"],
  ] as const)("%o → stop %s, for every badge step", (patch, reason) => {
    for (const [step, m] of Object.entries(due)) {
      const opts = step === "welcome_back" ? { startAt: GO_LIVE } : {};
      expect(decide({ ...m, ...patch }, NOW, opts), step).toEqual({ action: "stop", reason });
    }
  });

  it("starting a paid plan stops the reminder even on the trial track", () => {
    const trial = { startedAt: ago(2 * D), endsAt: new Date(NOW.getTime() + 12 * D).toISOString() };
    expect(decide({ ...due.badge_reminder, trial, paid: true }, NOW)).toEqual({ action: "stop", reason: "upgraded" });
  });
});

/* ------------------------------------------------------------------ go-live cutoff */

describe("LIFECYCLE_START_AT", () => {
  it("is off when unset or empty, a date when valid, and 'invalid' (never silently off) when it isn't one", () => {
    expect(lifecycleStartAt(undefined)).toEqual({ kind: "off" });
    expect(lifecycleStartAt("")).toEqual({ kind: "off" });
    expect(lifecycleStartAt("   ")).toEqual({ kind: "off" });
    expect(lifecycleStartAt("2026-10-23")).toEqual({ kind: "on", at: new Date("2026-10-23T00:00:00Z") });
    expect(lifecycleStartAt("2026-10-23T09:00:00-04:00")).toEqual({ kind: "on", at: new Date("2026-10-23T13:00:00Z") });
    for (const bad of ["tomorrow", "23/10/2026", "soon", "1"]) expect(lifecycleStartAt(bad)).toEqual({ kind: "invalid", raw: bad });
  });

  it("LIFECYCLE_MAX_PER_DAY: a positive whole number, else no ceiling", () => {
    expect(lifecycleMaxPerDay(undefined)).toBeNull();
    expect(lifecycleMaxPerDay("")).toBeNull();
    expect(lifecycleMaxPerDay("0")).toBeNull();
    expect(lifecycleMaxPerDay("-5")).toBeNull();
    expect(lifecycleMaxPerDay("abc")).toBeNull();
    expect(lifecycleMaxPerDay("40")).toBe(40);
  });

  it("unset: exactly the sequence as before (everyone is on the normal one)", () => {
    expect(cohortOf(member({ joinedDaysAgo: 400 }), null)).toMatchObject({ mode: "normal" });
    expect(decide(member({ joinedDaysAgo: 0 }), NOW)).toEqual({ action: "send", step: "welcome" });
    // An old account is NOT in the sequence (no catch-up out of nowhere)...
    expect(decide(member({ joinedDaysAgo: 9 }), NOW, {})).toEqual({ action: "stop", reason: "not_in_sequence" });
    // ...unless its approval is recent: the badge email follows the approval, whenever the company joined.
    expect(decide(member({ joinedDaysAgo: 9, approvedAt: ago(2 * D) }), NOW, {})).toEqual({ action: "send", step: "badge" });
  });

  it("a company that joined before go-live gets no old-step catch-up: no welcome, market, get_found, …", () => {
    // Joined 2 days ago, go-live was yesterday: with no cutoff it is at the start of the sequence (welcome, then the rest).
    const live = new Date(NOW.getTime() - D);
    const old = member({ joinedDaysAgo: 2, approvedAt: ago(2 * D), recorded: rec() });
    expect(decide(old, NOW)).toEqual({ action: "send", step: "welcome" });
    expect(cohortOf(old, live)).toEqual({ mode: "catch_up" });
    const d = decide(old, NOW, { startAt: live });
    expect(d).toEqual({ action: "send", step: "welcome_back" });
    for (const s of ["welcome", "market", "get_found", "trial_offer", "benchmark", "community", "founding", "review_pending", "badge"]) {
      expect(d, s).not.toMatchObject({ step: s });
    }
  });

  it("they get at most ONE catch-up email: after the welcome-back there is nothing", () => {
    const old = member({ joinedDaysAgo: 5, approvedAt: ago(5 * D) });
    expect(decide({ ...old, recorded: rec("welcome_back") }, NOW, { startAt: GO_LIVE })).toEqual({ action: "stop", reason: "finished" });
    // Not even the later steps of the old sequence, on any later day.
    for (const days of [1, 3, 8, 20, 40]) {
      const later = new Date(NOW.getTime() + days * D);
      expect(decide({ ...old, recorded: rec("welcome_back") }, later, { startAt: GO_LIVE }).action, `+${days}d`).toBe("stop");
    }
  });

  it("the welcome-back waits for the approval, is skipped if the badge is already installed, and is open for 21 days from go-live", () => {
    const pending = member({ joinedDaysAgo: 30, profileApproved: false, approvedAt: null, pendingReview: true });
    expect(decide(pending, NOW, { startAt: GO_LIVE })).toEqual({ action: "wait", step: null, reason: "not_due" });
    const installed = member({ joinedDaysAgo: 30, approvedAt: ago(30 * D), facts: facts({ badgeInstalled: true, badgeDetectedOn: "2026-10-01" }) });
    expect(decide(installed, NOW, { startAt: GO_LIVE })).toEqual({ action: "skip", step: "welcome_back", reason: "badge_installed" });
    // Day 22 after go-live: never late.
    const late = new Date(GO_LIVE.getTime() + 22 * D);
    expect(decide(member({ joinedDaysAgo: 60, approvedAt: ago(60 * D, late) , joinedAt: ago(60 * D, late) }), late, { startAt: GO_LIVE }).action).toBe("stop");
  });

  it("not for staff or test addresses", () => {
    expect(decide(member({ joinedDaysAgo: 30, approvedAt: ago(30 * D), internal: true }), NOW, { startAt: GO_LIVE })).toEqual({ action: "stop", reason: "internal" });
  });

  it("sending hours, one a day, and the weekly-email day still apply to the welcome-back", () => {
    const old = member({ joinedDaysAgo: 30, approvedAt: ago(30 * D) });
    const quiet = new Date("2026-10-27T11:00:00Z"); // 7:00 Toronto
    expect(decide(old, quiet, { startAt: GO_LIVE })).toMatchObject({ action: "wait", step: "welcome_back", reason: "quiet_hours" });
    expect(decide({ ...old, lastSentAt: ago(2 * H) }, NOW, { startAt: GO_LIVE })).toMatchObject({ action: "wait", reason: "one_per_day" });
    expect(decide({ ...old, digestSentAt: ago(2 * H) }, NOW, { startAt: GO_LIVE })).toMatchObject({ action: "wait", reason: "digest_today" });
  });

  it("a company that joins after go-live gets the normal sequence", () => {
    const fresh = member({ joinedDaysAgo: 0, joinedAt: ago(2 * H), approvedAt: ago(2 * H) });
    expect(cohortOf(fresh, GO_LIVE)).toMatchObject({ mode: "normal" });
    expect(decide(fresh, NOW, { startAt: GO_LIVE })).toEqual({ action: "send", step: "welcome" });
    expect(decide({ ...fresh, joinedAt: ago(1 * D + H), approvedAt: ago(1 * D + H), recorded: rec("welcome") }, NOW, { startAt: GO_LIVE })).toEqual({ action: "send", step: "badge" });
  });

  it("a company created before go-live but approved after it joins the normal sequence from its approval", () => {
    const approvedSince = new Date(GO_LIVE.getTime() + 2 * D).toISOString();
    const m = member({ joinedAt: ago(40 * D), approvedAt: approvedSince });
    expect(cohortOf(m, GO_LIVE)).toEqual({ mode: "normal", startMs: Date.parse(approvedSince) });
    // 40 days after it joined its welcome window is long gone, but the clock now starts at the approval.
    expect(decide(m, NOW, { startAt: GO_LIVE })).toEqual({ action: "send", step: "welcome" });
  });

  it("catch-up members don't get the pending-review note", () => {
    const pending = member({ joinedDaysAgo: 1, pendingReview: true, profileApproved: false, approvedAt: null });
    expect(decide(pending, NOW)).toEqual({ action: "send", step: "review_pending" });
    expect(decide(pending, NOW, { startAt: new Date(NOW.getTime() + D) })).toEqual({ action: "wait", step: null, reason: "not_due" });
  });

  it("trial emails of a trial that started after go-live still go; a trial from before it gets nothing", () => {
    const trialAfter = { startedAt: ago(4 * H), endsAt: new Date(NOW.getTime() + 14 * D).toISOString() };
    const old = member({ joinedDaysAgo: 30, approvedAt: ago(30 * D), recorded: rec("welcome_back") });
    expect(decide({ ...old, trial: trialAfter }, NOW, { startAt: GO_LIVE })).toEqual({ action: "send", step: "trial_day1" });
    const trialBefore = { startedAt: ago(6 * D), endsAt: new Date(NOW.getTime() + 8 * D).toISOString() };
    expect(decide({ ...old, trial: trialBefore }, NOW, { startAt: GO_LIVE })).toEqual({ action: "stop", reason: "finished" });
    expect(TRIAL_STEPS.length).toBeGreaterThan(0);
  });
});

describe("next send window (for the dry-run preview)", () => {
  it("is 13:00 Eastern on a weekday, never before the time asked", () => {
    // Thursday evening → Friday 13:00 EDT (17:00Z).
    expect(nextSendWindow(new Date("2026-10-22T23:00:00Z")).toISOString()).toBe("2026-10-23T17:00:00.000Z");
    // Friday evening → Monday.
    expect(nextSendWindow(new Date("2026-10-23T23:00:00Z")).toISOString()).toBe("2026-10-26T17:00:00.000Z");
    // Tuesday morning → the same day.
    expect(nextSendWindow(new Date("2026-10-27T12:00:00Z")).toISOString()).toBe("2026-10-27T17:00:00.000Z");
    // After DST ends (EST, UTC-5).
    expect(nextSendWindow(new Date("2026-11-04T12:00:00Z")).toISOString()).toBe("2026-11-04T18:00:00.000Z");
  });
});

/* ------------------------------------------------------------------ copy */

const CTX = { base: "https://pmrfp.com", unsubscribeUrl: "https://pmrfp.com/api/email/lifecycle-unsubscribe?u=u1&t=abc" };
const LANGS = ["en", "fr", "es"] as const;
const COUNTRIES = ["CA", "US"] as const;
const BADGE_COPY_STEPS = ["badge", "badge_reminder", "badge_thanks", "welcome_back"] as const;

const mailtoOf = (text: string) => text.match(/mailto:\?subject=[^\s]+/)?.[0] ?? "";

describe("badge emails: copy", () => {
  it("every badge step in all 3 languages, Canada and U.S., with and without the reward line and a website", () => {
    for (const step of BADGE_COPY_STEPS) {
      for (const lang of LANGS) {
        for (const country of COUNTRIES) {
          for (const reward of [false, true]) {
            for (const website of [true, false]) {
              const tag = `${step}/${lang}/${country}/reward=${reward}/site=${website}`;
              const e = renderStep(step, sampleCopyData(step, lang, country, "specialty", { reward, website }), CTX);
              expect(e.words, tag).toBeLessThan(150);
              expect(e.subject.length, tag).toBeGreaterThan(10);
              // the footer: why, one-click unsubscribe, sender and postal address (CASL / CAN-SPAM)
              expect(e.text, tag).toContain(CTX.unsubscribeUrl);
              expect(e.html, tag).toContain(CTX.unsubscribeUrl.replace(/&/g, "&amp;"));
              expect(e.text, tag).toContain("5050 Dufferin St., Toronto, ON M3H 5T5");
              expect(e.text, tag).toContain("Talkerstein Consulting Group");
              expect(e.text, tag).toContain("R. Talkar");
              expect(e.text, tag).toContain(`utm_source=lifecycle&utm_medium=email&utm_campaign=${step}`);
              // no currency, province or state: one copy serves both countries
              expect(e.text, tag).not.toMatch(/\bCAD\b|\bUSD\b|Ontario|Texas/);
            }
          }
        }
      }
    }
  });

  it("the badge email puts the REAL slug in the code, the profile link and the badge page link, in every language", () => {
    const slug = "northline-roofing";
    for (const lang of LANGS) {
      const e = renderStep("badge", sampleCopyData("badge", lang, "CA"), CTX);
      const prefix = lang === "en" ? "" : `/${lang}`;
      expect(e.text, lang).toContain(`<img src="https://pmrfp.com/api/badge/${slug}"`);
      expect(e.text, lang).toContain(`href="https://pmrfp.com${prefix}/directory/${slug}?utm_source=badge&amp;utm_medium=referral&amp;utm_campaign=${slug}"`);
      expect(e.text, lang).toContain(`alt="Northline Roofing"`);
      expect(e.text, lang).toContain(`https://pmrfp.com${prefix}/badge?company=${slug}&utm_source=lifecycle`);
      expect(e.html, lang).toContain(`/api/badge/${slug}`);
    }
    // The U.S. sample has its own company, its own slug.
    const us = renderStep("badge", sampleCopyData("badge", "en", "US"), CTX);
    expect(us.text).toContain("/api/badge/lone-star-roofing");
    expect(us.text).not.toContain("northline");
  });

  it("is the /badge page's own snippet, not a second copy of it", async () => {
    const { badgeHtml } = await import("@/lib/badge/snippet");
    const code = badgeHtml({ kind: "listed", base: "https://pmrfp.com", slug: "northline-roofing", pageUrl: "https://pmrfp.com/directory/northline-roofing", name: "Northline Roofing", lang: "en" });
    const e = renderStep("badge", sampleCopyData("badge", "en", "CA"), CTX);
    for (const line of code.split("\n")) expect(e.text).toContain(`  ${line}`);
  });

  it("explains the SEO play honestly: verification and a profile link, 'can help', and no promise of rankings", () => {
    const en = renderStep("badge", sampleCopyData("badge", "en", "CA"), CTX).text;
    expect(en).toMatch(/check that you're listed/);
    expect(en).toMatch(/link to your PMRFP profile/);
    expect(en).toMatch(/can help search engines understand your business, but we can't promise rankings/);
    expect(en).toMatch(/footer or contact page/);
    for (const lang of LANGS) {
      for (const step of BADGE_COPY_STEPS) {
        const t = renderStep(step, sampleCopyData(step, lang, "CA", "specialty", { reward: true }), CTX).text;
        expect(t, `${step}/${lang}`).not.toMatch(/guarante[ée]|\b(rank|rang|classe)\w* (higher|plus haut)|top of google|#1|first page|more traffic|boost your (seo|ranking)|garantiz|primera p[aá]gina/i);
      }
    }
    // The hedge is in every language.
    expect(renderStep("badge", sampleCopyData("badge", "fr", "CA"), CTX).text).toMatch(/peuvent aider les moteurs de recherche à comprendre votre entreprise, sans garantie de classement/);
    expect(renderStep("badge", sampleCopyData("badge", "es", "US"), CTX).text).toMatch(/pueden ayudar a los buscadores a entender su negocio, pero no prometemos posiciones/);
  });

  it("two-minute install: platform notes, a mailto for whoever manages the site, and a picture of the badge", () => {
    for (const lang of LANGS) {
      const e = renderStep("badge", sampleCopyData("badge", lang, "CA"), CTX);
      for (const platform of ["WordPress", "Wix", "Squarespace", "Shopify"]) expect(e.text, `${lang} ${platform}`).toContain(platform);
      // prefilled mailto: a subject and a body with the code and the profile link
      const mailto = mailtoOf(e.text);
      expect(mailto, lang).toMatch(/^mailto:\?subject=.+&body=.+/);
      const body = decodeURIComponent(mailto.split("&body=")[1]);
      expect(body, lang).toContain('<img src="https://pmrfp.com/api/badge/northline-roofing"');
      expect(body, lang).toContain(`https://pmrfp.com${lang === "en" ? "" : `/${lang}`}/directory/northline-roofing`);
      // the picture: a PNG on our own static path (so an email open never counts as a badge load), HTML version only
      expect(e.html, lang).toContain(`<img src="https://pmrfp.com${BADGE_PREVIEW_PATH}"`);
      expect(e.html, lang).toMatch(/<img[^>]+alt="[^"]+"[^>]+width="214" height="54"/);
      expect(e.text, lang).not.toContain(BADGE_PREVIEW_PATH);
    }
    expect(BADGE_PREVIEW_PATH.endsWith(".png")).toBe(true);
  });

  it("the reward is mentioned ONLY when the flag is on", () => {
    for (const lang of LANGS) {
      for (const step of ["badge", "badge_reminder", "welcome_back"] as const) {
        const off = renderStep(step, sampleCopyData(step, lang, "CA", "specialty", { reward: false }), CTX).text;
        const on = renderStep(step, sampleCopyData(step, lang, "CA", "specialty", { reward: true }), CTX).text;
        expect(off, `${step}/${lang}`).not.toMatch(/Trade Pro/);
        expect(on, `${step}/${lang}`).toMatch(/14/);
        expect(on, `${step}/${lang}`).toContain("Trade Pro");
      }
      // The thanks says so only when it was actually granted.
      expect(renderStep("badge_thanks", sampleCopyData("badge_thanks", lang, "CA", "specialty", { reward: false }), CTX).text).not.toContain("Trade Pro");
      expect(renderStep("badge_thanks", sampleCopyData("badge_thanks", lang, "CA", "specialty", { reward: true }), CTX).text).toContain("Trade Pro");
    }
  });

  it("a company with no website is asked to add one, and gets no platform notes", () => {
    const e = renderStep("badge", sampleCopyData("badge", "en", "CA", "specialty", { website: false }), CTX).text;
    expect(e).toContain("Your profile doesn't list a website yet");
    expect(e).toContain("Add your website: https://pmrfp.com/dashboard/company");
    expect(e).not.toContain("WordPress");
  });

  it("the thanks names the domain it saw the badge on, and sells nothing", () => {
    for (const lang of LANGS) {
      const e = renderStep("badge_thanks", sampleCopyData("badge_thanks", lang, "CA"), CTX);
      expect(e.subject, lang).toContain("northlineroofing.ca");
      expect(e.text, lang).toContain("northlineroofing.ca");
      expect(e.text, lang).not.toMatch(/Founding|Fondateurs|Fundadores|upgrade|offer|offre|oferta/i);
    }
  });

  it("subject lines (en)", () => {
    const s = (step: StepId) => renderStep(step, sampleCopyData(step, "en", "CA"), CTX).subject;
    expect(s("badge")).toBe("Put your PMRFP badge on your website (2 minutes)");
    expect(s("badge_reminder")).toBe("Your PMRFP badge is still waiting");
    expect(s("badge_thanks")).toBe("Thanks: we can see your PMRFP badge on northlineroofing.ca");
    expect(s("welcome_back")).toBe("Welcome back to PMRFP, Sam: a badge for your website");
  });

  it("'get found' no longer repeats the badge: it is about adding a project", () => {
    for (const lang of LANGS) {
      const t = renderStep("get_found", sampleCopyData("get_found", lang, "CA"), CTX).text;
      expect(t, lang).not.toMatch(/badge|insignia|\/badge/i);
      expect(t, lang).toContain("/dashboard/projects/new");
    }
  });

  it("the badge page link carries the slug even for an unusual company name", () => {
    const d: CopyData = { ...sampleCopyData("badge", "en", "CA"), company: "Crème & Sons <Roofing>", badge: { slug: "creme-sons-roofing-ab12", website: "cremesons.ca", detectedDomain: null, reward: null } };
    const e = renderStep("badge", d, CTX);
    expect(e.text).toContain("/badge?company=creme-sons-roofing-ab12");
    expect(e.html).not.toContain("<Roofing>");
    expect(e.html).toContain("&lt;Roofing&gt;");
  });
});

/* ------------------------------------------------------------------ the engine, with a fake database */

const sendSpy = vi.fn<(p: unknown) => Promise<{ ok: boolean; id: string }>>(async () => ({ ok: true, id: "re_test" }));
const state = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => state.db }));
vi.mock("@/lib/supabase/config", () => ({ isServiceConfigured: () => true, isSupabaseConfigured: () => true }));
vi.mock("@/lib/data/rfps", () => ({ listRfps: async () => [] }));
vi.mock("@/lib/data/taxonomy", () => ({ getTaxonomyRows: async () => [] }));
vi.mock("@/lib/major-projects/data", () => ({ getMajorProjects: async () => [] }));
vi.mock("@/lib/data/price-benchmarks-load", () => ({
  loadBenchmarkData: async () => ({ awards: [], categories: [], today: "2026-10-27", combos: [] }),
  benchmarkPath: (t: string, p: string) => `/benchmarks/${t}/${p.toLowerCase()}`,
}));
vi.mock("@/lib/founding/server", () => ({ cachedLifetimeCount: async () => 10 }));
vi.mock("@/lib/email/send", () => ({ emailConfigured: () => true, sendLifecycleEmail: (p: unknown) => sendSpy(p) }));

type Row = Record<string, unknown>;

function company(i: number, over: { joinedAgo?: number; approvedAgo?: number | null; email?: string; website?: string | null; status?: string } = {}) {
  const joined = ago((over.joinedAgo ?? 30 * D) + 0);
  const approved = over.approvedAgo === null ? null : ago(over.approvedAgo ?? over.joinedAgo ?? 30 * D);
  return {
    member: { organization_id: `o${i}`, user_id: `u${i}`, created_at: joined },
    org: {
      id: `o${i}`, name: `Company ${i}`, slug: `company-${i}`, city: "Toronto", province: "Ontario", country: "Canada", organization_type: "trade_company",
      status: "active", is_demo: false, profile_status: over.status ?? "approved", website: over.website === undefined ? `https://company${i}.ca` : over.website, approved_at: approved, created_at: joined,
    },
    user: { id: `u${i}`, email: over.email ?? `owner${i}@company${i}.ca`, full_name: `Owner ${i}`, status: "active", primary_role: "trade" },
  };
}

function world(cs: ReturnType<typeof company>[], extra: Partial<Record<string, Row[]>> = {}): FakeDb {
  return fakeDb(
    {
      lifecycle_sends: [],
      organization_members: cs.map((c) => c.member),
      organizations: cs.map((c) => c.org),
      users_profile: cs.map((c) => c.user),
      trade_trials: [],
      notification_preferences: [],
      signup_attribution: [],
      forum_posts: [],
      subscriptions: [],
      organization_categories: [],
      organization_regions: [],
      case_studies: [],
      badge_hits: [],
      badge_rewards: [],
      email_suppressions: [],
      digest_subscribers: [],
      onboarding_steps: [],
      ...extra,
    },
    { unique: { lifecycle_sends: (e, r) => e.user_id === r.user_id && e.step === r.step, badge_rewards: (e, r) => e.organization_id === r.organization_id } },
  );
}

describe("the lifecycle run: go-live cutoff, the daily ceiling, and what it sends", () => {
  beforeEach(() => {
    sendSpy.mockClear();
    process.env.UNSUBSCRIBE_SECRET = "test-secret";
  });
  afterEach(() => {
    for (const k of ["LIFECYCLE_EMAILS_ENABLED", "LIFECYCLE_START_AT", "LIFECYCLE_MAX_PER_DAY", "BADGE_REWARD_ENABLED", "UNSUBSCRIBE_SECRET"]) delete process.env[k];
  });

  const writesTo = (db: FakeDb) => db.calls.filter((c) => c.op !== "select");

  it("cutoff unset: the dry run plans like today, and lists every company with its next email", async () => {
    // Joined an hour ago and approved: welcome first (the badge email follows the next day).
    const db = world([company(1, { joinedAgo: H, approvedAgo: H })]);
    state.db = db;
    const { runLifecycle } = await import("@/lib/lifecycle/server");
    const r = await runLifecycle({ dry: true, now: NOW });
    expect(r.startAt).toEqual({ kind: "off" });
    expect(r.members).toEqual([expect.objectContaining({ org: "Company 1", cohort: "normal", step: "welcome", summary: "send welcome" })]);
    expect(r.sends.map((s) => s.step)).toEqual(["welcome"]);
    expect(writesTo(db)).toEqual([]);
    expect(sendSpy).not.toHaveBeenCalled();
  });

  it("cutoff set: a company from before go-live gets the ONE welcome-back, a company after it gets the normal sequence", async () => {
    process.env.LIFECYCLE_START_AT = GO_LIVE.toISOString();
    const db = world([company(1, { joinedAgo: 5 * D, approvedAgo: 5 * D }), company(2, { joinedAgo: 2 * H, approvedAgo: 2 * H })]);
    state.db = db;
    const { runLifecycle } = await import("@/lib/lifecycle/server");
    const r = await runLifecycle({ dry: true, now: NOW });
    expect(r.startAt).toEqual({ kind: "on", at: GO_LIVE.toISOString() });
    const byOrg = Object.fromEntries((r.members ?? []).map((m) => [m.org, m]));
    expect(byOrg["Company 1"]).toMatchObject({ cohort: "catch_up", step: "welcome_back" });
    expect(byOrg["Company 2"]).toMatchObject({ cohort: "normal", step: "welcome" });
  });

  it("cutoff set: also reaches accounts older than the sequence window (a catch-up, once each)", async () => {
    process.env.LIFECYCLE_START_AT = GO_LIVE.toISOString();
    const db = world([company(1, { joinedAgo: 200 * D, approvedAgo: null }), company(2, { joinedAgo: 90 * D, approvedAgo: 90 * D })]);
    state.db = db;
    const { runLifecycle } = await import("@/lib/lifecycle/server");
    const r = await runLifecycle({ dry: true, now: NOW });
    // Company 1 was approved before approved_at existed (null): still approved, so it gets the welcome-back.
    expect((r.members ?? []).map((m) => [m.org, m.step])).toEqual([["Company 1", "welcome_back"], ["Company 2", "welcome_back"]]);
  });

  it("a real run: records the welcome-back, sends it once, and the next run sends nothing more", async () => {
    process.env.LIFECYCLE_EMAILS_ENABLED = "1";
    process.env.LIFECYCLE_START_AT = GO_LIVE.toISOString();
    const db = world([company(1, { joinedAgo: 5 * D, approvedAgo: 5 * D })]);
    state.db = db;
    const { runLifecycle } = await import("@/lib/lifecycle/server");
    const r = await runLifecycle({ dry: false, now: NOW });
    expect(r.sent).toBe(1);
    expect(sendSpy).toHaveBeenCalledTimes(1);
    const sent = sendSpy.mock.calls[0][0] as { subject: string; text: string; unsubscribeUrl: string; step: string };
    expect(sent.step).toBe("welcome_back");
    expect(sent.subject).toBe("Welcome back to PMRFP, Owner: a badge for your website");
    expect(sent.unsubscribeUrl).toContain("/api/email/lifecycle-unsubscribe?u=u1&t=");
    expect(sent.text).toContain("/api/badge/company-1");
    expect(db.tables.lifecycle_sends).toEqual([expect.objectContaining({ user_id: "u1", step: "welcome_back", status: "sent", organization_id: "o1" })]);

    // Next day, and every day after: nothing (no welcome, market, get_found, …).
    for (const days of [1, 2, 5, 10, 30]) {
      sendSpy.mockClear();
      const later = new Date(NOW.getTime() + days * D);
      const again = await runLifecycle({ dry: false, now: later });
      expect(again.sent, `+${days}d`).toBe(0);
      expect(sendSpy).not.toHaveBeenCalled();
    }
  });

  it("an unsubscribed or bounced company gets no catch-up, and neither does one that upgraded", async () => {
    process.env.LIFECYCLE_EMAILS_ENABLED = "1";
    process.env.LIFECYCLE_START_AT = GO_LIVE.toISOString();
    const cs = [company(1), company(2), company(3)];
    const db = world(cs, {
      notification_preferences: [{ user_id: "u1", lifecycle_emails: false, channel_email: true, new_rfps: "daily" }],
      email_suppressions: [{ email_key: "owner2@company2.ca" }],
      subscriptions: [{ organization_id: "o3", status: "active", tier: "pro", stripe_subscription_id: "sub_1" }],
    });
    state.db = db;
    const { runLifecycle } = await import("@/lib/lifecycle/server");
    const r = await runLifecycle({ dry: false, now: NOW });
    expect(r.sent).toBe(0);
    expect(r.stops).toEqual({ unsubscribed: 1, bounced: 1, upgraded: 1 });
    expect(sendSpy).not.toHaveBeenCalled();
  });

  it("a cutoff that isn't a date stops the run instead of guessing", async () => {
    process.env.LIFECYCLE_EMAILS_ENABLED = "1";
    process.env.LIFECYCLE_START_AT = "next tuesday";
    state.db = world([company(1)]);
    const { runLifecycle } = await import("@/lib/lifecycle/server");
    for (const dry of [true, false]) {
      const r = await runLifecycle({ dry, now: NOW });
      expect(r.skipped).toMatch(/LIFECYCLE_START_AT is not a date/);
      expect(r.sends).toEqual([]);
    }
    expect(sendSpy).not.toHaveBeenCalled();
  });

  it("LIFECYCLE_MAX_PER_DAY caps the sends in any rolling 24 hours", async () => {
    process.env.LIFECYCLE_EMAILS_ENABLED = "1";
    process.env.LIFECYCLE_START_AT = GO_LIVE.toISOString();
    process.env.LIFECYCLE_MAX_PER_DAY = "2";
    const db = world([company(1), company(2), company(3), company(4)]);
    state.db = db;
    const { runLifecycle } = await import("@/lib/lifecycle/server");
    // The run stamps sent_at with the wall clock, so the clock follows the simulated time.
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      const at = (ms: number) => {
        const t = new Date(NOW.getTime() + ms);
        vi.setSystemTime(t);
        return t;
      };
      const first = await runLifecycle({ dry: false, now: at(0), sendGapMs: 0 });
      expect(first.sent).toBe(2);
      expect(first.cap).toEqual({ max: 2, sentLast24h: 0 });
      // An hour later the same ceiling is already used up.
      const second = await runLifecycle({ dry: false, now: at(H), sendGapMs: 0 });
      expect(second.sent).toBe(0);
      expect(second.cap).toMatchObject({ max: 2, sentLast24h: 2 });
      // A day later it is open again.
      const third = await runLifecycle({ dry: false, now: at(D + 2 * H), sendGapMs: 0 });
      expect(third.sent).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("spaces real sends out (Resend's per-second limit) and never paces a dry run", async () => {
    process.env.LIFECYCLE_EMAILS_ENABLED = "1";
    process.env.LIFECYCLE_START_AT = GO_LIVE.toISOString();
    state.db = world([company(1), company(2), company(3)]);
    const { runLifecycle } = await import("@/lib/lifecycle/server");
    const t0 = Date.now();
    const r = await runLifecycle({ dry: false, now: NOW, sendGapMs: 60 });
    expect(r.sent).toBe(3);
    // 3 sends = 2 gaps of 60 ms (the first send never waits).
    expect(Date.now() - t0).toBeGreaterThanOrEqual(110);
    const { SEND_GAP_MS, RUN_TIME_BUDGET_MS } = await import("@/lib/lifecycle/config");
    expect(SEND_GAP_MS).toBeGreaterThanOrEqual(500); // under Resend's default 2 requests a second
    expect(RUN_TIME_BUDGET_MS).toBeLessThan(60_000); // the route's maxDuration
  });

  it("a dry run past the ceiling still lists everyone, marking the ones held back", async () => {
    process.env.LIFECYCLE_START_AT = GO_LIVE.toISOString();
    process.env.LIFECYCLE_MAX_PER_DAY = "1";
    state.db = world([company(1), company(2)]);
    const { runLifecycle } = await import("@/lib/lifecycle/server");
    const r = await runLifecycle({ dry: true, now: NOW });
    expect(r.members).toHaveLength(2);
    expect(r.sends).toHaveLength(1);
    expect((r.members ?? []).filter((m) => m.step).length).toBe(1);
    expect((r.members ?? []).some((m) => /held back/.test(m.summary))).toBe(true);
  });

  it("refuses to send without the unsubscribe signing secret", async () => {
    process.env.LIFECYCLE_EMAILS_ENABLED = "1";
    delete process.env.UNSUBSCRIBE_SECRET;
    const saved = process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    state.db = world([company(1, { joinedAgo: H, approvedAgo: H })]);
    try {
      const { runLifecycle } = await import("@/lib/lifecycle/server");
      const r = await runLifecycle({ dry: false, now: NOW });
      expect(r.skipped).toMatch(/unsubscribe/i);
      expect(sendSpy).not.toHaveBeenCalled();
      // a dry run still works: it sends nothing
      expect((await runLifecycle({ dry: true, now: NOW })).skipped).toBeUndefined();
    } finally {
      if (saved !== undefined) process.env.SUPABASE_SERVICE_ROLE_KEY = saved;
    }
  });

  it("the badge email names the reward only when BADGE_REWARD_ENABLED is on; the reminder is skipped once installed", async () => {
    process.env.LIFECYCLE_EMAILS_ENABLED = "1";
    const welcomed = [{ user_id: "u1", step: "welcome", status: "sent", sent_at: ago(2 * D) }];
    // Off:
    state.db = world([company(1, { joinedAgo: 2 * D, approvedAgo: 2 * D })], { lifecycle_sends: [...welcomed] });
    const { runLifecycle } = await import("@/lib/lifecycle/server");
    await runLifecycle({ dry: false, now: NOW });
    const off = sendSpy.mock.calls[0][0] as { step: string; text: string };
    expect(off.step).toBe("badge");
    expect(off.text).not.toContain("Trade Pro");
    // On:
    sendSpy.mockClear();
    process.env.BADGE_REWARD_ENABLED = "1";
    state.db = world([company(1, { joinedAgo: 2 * D, approvedAgo: 2 * D })], { lifecycle_sends: [...welcomed] });
    await runLifecycle({ dry: false, now: NOW });
    expect((sendSpy.mock.calls[0][0] as { text: string }).text).toContain("14 days of Trade Pro");
  });

  it("detected install: the thanks goes (naming the domain), the reminder never does", async () => {
    process.env.LIFECYCLE_EMAILS_ENABLED = "1";
    const lc = [
      { user_id: "u1", step: "welcome", status: "sent", sent_at: ago(9 * D) },
      { user_id: "u1", step: "badge", status: "sent", sent_at: ago(8 * D) },
    ];
    const hits = [
      { day: "2026-10-25", kind: "listed", slug: "company-1", referrer: "company1.ca", hits: 2 },
      { day: "2026-10-27", kind: "listed", slug: "company-1", referrer: "company1.ca", hits: 1 },
    ];
    state.db = world([company(1, { joinedAgo: 9 * D, approvedAgo: 9 * D })], { lifecycle_sends: [...lc], badge_hits: hits });
    const { runLifecycle } = await import("@/lib/lifecycle/server");
    await runLifecycle({ dry: false, now: NOW });
    const sent = sendSpy.mock.calls[0][0] as { step: string; subject: string };
    expect(sent.step).toBe("badge_thanks");
    expect(sent.subject).toBe("Thanks: we can see your PMRFP badge on company1.ca");
    // Next day: the reminder (a week after the badge email) is skipped, not sent.
    sendSpy.mockClear();
    const r = await runLifecycle({ dry: false, now: new Date(NOW.getTime() + D) });
    expect(sendSpy.mock.calls.map((c) => (c[0] as { step: string }).step)).not.toContain("badge_reminder");
    expect(r.skips.map((s) => s.step)).toContain("badge_reminder");
  });

  it("an install from another site, or only one day on its own, does not count as installed", async () => {
    process.env.LIFECYCLE_EMAILS_ENABLED = "1";
    const lc = [{ user_id: "u1", step: "welcome", status: "sent", sent_at: ago(9 * D) }, { user_id: "u1", step: "badge", status: "sent", sent_at: ago(8 * D) }];
    const hits = [
      { day: "2026-10-25", kind: "listed", slug: "company-1", referrer: "someoneelse.com", hits: 2 },
      { day: "2026-10-26", kind: "listed", slug: "company-1", referrer: "someoneelse.com", hits: 2 },
      { day: "2026-10-27", kind: "listed", slug: "company-1", referrer: "company1.ca", hits: 1 },
    ];
    state.db = world([company(1, { joinedAgo: 9 * D, approvedAgo: 9 * D })], { lifecycle_sends: [...lc], badge_hits: hits });
    const { runLifecycle } = await import("@/lib/lifecycle/server");
    await runLifecycle({ dry: false, now: NOW });
    // Not thanked; the reminder (8 days after the badge email) goes instead.
    expect((sendSpy.mock.calls[0][0] as { step: string }).step).toBe("badge_reminder");
  });
});
