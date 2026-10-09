import { describe, expect, it } from "vitest";
import {
  ACCEPTED_PAIR_CAP,
  DECAY_FLOOR,
  DECAY_GRACE_DAYS,
  LEVELS,
  PAIR_CAP,
  PEER_DAILY_CAP,
  POINTS,
  WINDOW_CAPS,
  decayFactor,
  levelFor,
  levelProgress,
  ratingPoints,
  scoreLedger,
  type LedgerEvent,
} from "@/lib/karma/rules";
import { EXTRA_PORTFOLIO_SLOTS, directorySortKey, extraPortfolioSlots, isFeaturedContributor, portfolioSlotLimit, rotateFeatured } from "@/lib/karma/perks";
import karmaMessages from "@/i18n/messages/karma";

const NOW = new Date("2026-10-10T12:00:00Z");
const day = (n: number, h = 12) => new Date(Date.UTC(2026, 9, n, h)).toISOString();
const ev = (kind: LedgerEvent["kind"], points: number, createdAt: string, extra: Partial<LedgerEvent> = {}): LedgerEvent => ({ kind, points, createdAt, ...extra });

describe("levels", () => {
  it("maps thresholds to five levels", () => {
    expect(LEVELS.map((l) => l.min)).toEqual([0, 50, 150, 400, 1000]);
    expect(levelFor(0)).toBe(1);
    expect(levelFor(49)).toBe(1);
    expect(levelFor(50)).toBe(2);
    expect(levelFor(149)).toBe(2);
    expect(levelFor(150)).toBe(3);
    expect(levelFor(400)).toBe(4);
    expect(levelFor(999)).toBe(4);
    expect(levelFor(1000)).toBe(5);
    expect(levelFor(99999)).toBe(5);
    expect(levelFor(-40)).toBe(1);
    expect(levelFor(Number.NaN)).toBe(1);
  });

  it("reports progress to the next level", () => {
    expect(levelProgress(0)).toEqual({ level: 1, next: 2, toNext: 50, percent: 0 });
    expect(levelProgress(100)).toEqual({ level: 2, next: 3, toNext: 50, percent: 50 });
    expect(levelProgress(5000)).toEqual({ level: 5, next: null, toNext: 0, percent: 100 });
  });

  it("names every level in every language", () => {
    for (const lang of ["en", "fr", "es"] as const) {
      for (const l of LEVELS) expect(karmaMessages[lang].levels[l.slug]).toBeTruthy();
    }
  });
});

describe("points", () => {
  it("awards rating points only for 4 and 5 stars", () => {
    expect([1, 2, 3, 4, 5].map(ratingPoints)).toEqual([0, 0, 0, 5, 10]);
  });

  it("sums counted events and never goes below zero", () => {
    const s = scoreLedger([ev("profile_approved", 20, day(1)), ev("forum_content_removed", -20, day(2)), ev("forum_content_removed", -20, day(3))], NOW);
    expect(s.raw).toBe(0);
    expect(s.level).toBe(1);
  });

  it("ignores reversed events (clawbacks)", () => {
    const s = scoreLedger([ev("project_verified_review", 40, day(1)), ev("project_verified_review", 40, day(2), { reversedAt: day(3) })], NOW);
    expect(s.raw).toBe(40);
    expect(s.events[1]).toMatchObject({ counted: 0, reversed: true });
  });

  it("counts admin adjustments in both directions", () => {
    expect(scoreLedger([ev("admin_adjustment", 60, day(1))], NOW).score).toBe(60);
    expect(scoreLedger([ev("profile_approved", 20, day(1)), ev("admin_adjustment", -15, day(2))], NOW).score).toBe(5);
  });
});

describe("anti-gaming caps", () => {
  it("counts at most PAIR_CAP peer signals from one member per 30 days", () => {
    const votes = Array.from({ length: 6 }, (_, i) => ev("forum_answer_upvote", 5, day(1 + i), { actorId: "buddy" }));
    const s = scoreLedger(votes, NOW);
    expect(s.raw).toBe(PAIR_CAP * 5);
    expect(s.events.filter((e) => e.capped === "pair")).toHaveLength(6 - PAIR_CAP);
  });

  it("lets the same member count again after 30 days", () => {
    const votes = [...Array.from({ length: 3 }, (_, i) => ev("forum_answer_upvote", 5, new Date(Date.UTC(2026, 6, 1 + i)).toISOString(), { actorId: "a" })), ev("forum_answer_upvote", 5, day(1), { actorId: "a" })];
    expect(scoreLedger(votes, NOW).raw).toBe(20);
  });

  it("caps accepted answers from the same asker separately", () => {
    const acc = Array.from({ length: 4 }, (_, i) => ev("forum_accepted_answer", 15, day(1 + i), { actorId: "asker" }));
    expect(scoreLedger(acc, NOW).raw).toBe(ACCEPTED_PAIR_CAP * 15);
  });

  it("caps peer points per day across many different members", () => {
    const votes = Array.from({ length: 20 }, (_, i) => ev("forum_answer_upvote", 5, day(5, 1 + (i % 20)), { actorId: `m${i}` }));
    const s = scoreLedger(votes, NOW);
    expect(s.raw).toBe(PEER_DAILY_CAP);
    expect(s.events.some((e) => e.capped === "daily")).toBe(true);
  });

  it("caps project reviews and bid events per rolling 30 days", () => {
    const reviews = Array.from({ length: 12 }, (_, i) => ev("project_verified_review", 40, day(1, i)));
    expect(scoreLedger(reviews, NOW).raw).toBe((WINDOW_CAPS.project_verified_review ?? 0) * 40);
    const pkgs = Array.from({ length: 7 }, (_, i) => ev("gc_package_interest", 20, day(2, i)));
    expect(scoreLedger(pkgs, NOW).raw).toBe((WINDOW_CAPS.gc_package_interest ?? 0) * 20);
  });

  it("never caps penalties", () => {
    const pen = Array.from({ length: 5 }, (_, i) => ev("forum_content_removed", -20, day(1, i)));
    const s = scoreLedger([ev("admin_adjustment", 200, day(1, 0)), ...pen], NOW);
    expect(s.raw).toBe(100);
  });
});

describe("decay", () => {
  it("does nothing during the grace period", () => {
    expect(decayFactor(new Date(NOW.getTime() - DECAY_GRACE_DAYS * 86_400_000).toISOString(), NOW)).toBe(1);
    expect(decayFactor(null, NOW)).toBe(1);
  });

  it("shrinks 5% per idle month after grace, floored at half", () => {
    const ago = (days: number) => new Date(NOW.getTime() - days * 86_400_000).toISOString();
    expect(decayFactor(ago(DECAY_GRACE_DAYS + 29), NOW)).toBe(1);
    expect(decayFactor(ago(DECAY_GRACE_DAYS + 30), NOW)).toBe(0.95);
    expect(decayFactor(ago(DECAY_GRACE_DAYS + 90), NOW)).toBe(0.85);
    expect(decayFactor(ago(DECAY_GRACE_DAYS + 3000), NOW)).toBe(DECAY_FLOOR);
  });

  it("lowers the level of an idle company and restores it on new activity", () => {
    const old = new Date("2025-01-01T00:00:00Z").toISOString();
    const idle = scoreLedger([ev("project_verified_review", 40, old), ev("project_verified_review", 40, "2025-01-02T00:00:00Z"), ev("project_verified_review", 40, "2025-01-03T00:00:00Z"), ev("vendor_verified", 20, old), ev("profile_approved", 20, old)], NOW);
    expect(idle.raw).toBe(160);
    expect(idle.decay).toBe(DECAY_FLOOR);
    expect(idle.level).toBe(2);
    const back = scoreLedger([...idle.events.map((e) => e.event), ev("forum_answer_upvote", 5, day(9), { actorId: "x" })], NOW);
    expect(back.decay).toBe(1);
    expect(back.level).toBe(3);
  });

  it("admin adjustments don't reset the inactivity clock", () => {
    const s = scoreLedger([ev("profile_approved", 20, "2025-01-01T00:00:00Z"), ev("admin_adjustment", 10, day(9))], NOW);
    expect(s.lastEarnedAt).toBe("2025-01-01T00:00:00Z");
    expect(s.decay).toBeLessThan(1);
  });
});

describe("perks", () => {
  it("adds portfolio slots from level 3", () => {
    expect([1, 2, 3, 4, 5].map(extraPortfolioSlots)).toEqual([0, 0, 2, 4, 6]);
    expect(extraPortfolioSlots(null)).toBe(0);
    expect(portfolioSlotLimit(6, 4)).toBe(6 + EXTRA_PORTFOLIO_SLOTS[4]);
  });

  it("only breaks ties inside a paid tier in the directory", () => {
    // A level 5 free listing never beats a level 1 Verified (tier 1) listing.
    expect(directorySortKey(1, 1)).toBeGreaterThan(directorySortKey(0, 5));
    expect(directorySortKey(4, 1)).toBeGreaterThan(directorySortKey(2, 5));
    expect(directorySortKey(0, 3)).toBeGreaterThan(directorySortKey(0, 2));
  });

  it("features only levels 4-5, rotates daily and is deterministic", () => {
    const pool = [{ orgId: "a", level: 5 }, { orgId: "b", level: 4 }, { orgId: "c", level: 3 }, { orgId: "d", level: 4 }, { orgId: "e", level: 5 }];
    expect(isFeaturedContributor(3)).toBe(false);
    const d1 = rotateFeatured(pool, 3, "2026-10-10");
    expect(d1).toHaveLength(3);
    expect(d1.every((x) => x.level >= 4)).toBe(true);
    expect(rotateFeatured(pool, 3, "2026-10-10")).toEqual(d1);
    const days = new Set(Array.from({ length: 10 }, (_, i) => rotateFeatured(pool, 1, `2026-10-${10 + i}`)[0].orgId));
    expect(days.size).toBeGreaterThan(1);
  });
});

describe("explainer copy matches the rules", () => {
  it("states the real caps and decay numbers", () => {
    const en = karmaMessages.en.page;
    const limits = en.limits.join(" ");
    expect(limits).toContain(`at most ${PAIR_CAP} times`);
    expect(limits).toContain(`at most ${ACCEPTED_PAIR_CAP} of your answers`);
    expect(limits).toContain(`${PEER_DAILY_CAP} forum points a day`);
    expect(limits).toContain(`${WINDOW_CAPS.gc_package_interest} packages`);
    expect(limits).toContain(`${WINDOW_CAPS.rfp_bids_received} RFPs`);
    expect(limits).toContain(`${WINDOW_CAPS.project_verified_review} reviewed projects`);
    expect(en.lose.join(" ")).toContain(`${POINTS.forum_content_removed * -1}`);
    expect(en.lose.join(" ")).toContain(`${DECAY_GRACE_DAYS / 30} months`);
  });

  it("has every key in French and Spanish", () => {
    const keys = (o: unknown, p = ""): string[] =>
      o && typeof o === "object" && !Array.isArray(o) ? Object.entries(o).flatMap(([k, v]) => keys(v, `${p}${k}.`)) : [p];
    expect(keys(karmaMessages.fr)).toEqual(keys(karmaMessages.en));
    expect(keys(karmaMessages.es)).toEqual(keys(karmaMessages.en));
    expect(karmaMessages.fr.page.limits).toHaveLength(karmaMessages.en.page.limits.length);
    expect(karmaMessages.es.page.lose).toHaveLength(karmaMessages.en.page.lose.length);
  });
});
