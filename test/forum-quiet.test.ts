import { describe, expect, it } from "vitest";
import {
  firstReplyPrompt,
  listStatus,
  newestPerForum,
  openTenderStrip,
  partitionForums,
  pickStartHere,
  shownCount,
  torontoToday,
  type AutoItem,
} from "@/lib/forum/quiet";
import { closingState, similarAwards, type PastAward } from "@/lib/forum/tender-facts";

describe("quiet-forum empty states", () => {
  it("never shows a zero count", () => {
    expect(shownCount(0)).toBeNull();
    expect(shownCount(null)).toBeNull();
    expect(shownCount(undefined)).toBeNull();
    expect(shownCount(Number.NaN)).toBeNull();
    expect(shownCount(3)).toBe(3);
  });

  it("lists show solved/open, never 'Unanswered' for an empty question", () => {
    expect(listStatus({ type: "question", hasAccepted: false, replyCount: 0 })).toBeNull();
    expect(listStatus({ type: "question", hasAccepted: false, replyCount: 2 })).toBe("open");
    expect(listStatus({ type: "question", hasAccepted: true, replyCount: 2 })).toBe("solved");
    expect(listStatus({ type: "discussion", hasAccepted: false, replyCount: 0 })).toBeNull();
  });

  it("puts the 'be the first' prompt on empty, unlocked thread pages only", () => {
    expect(firstReplyPrompt({ type: "question", replyCount: 0, isLocked: false })).toBe("answer");
    expect(firstReplyPrompt({ type: "discussion", replyCount: 0, isLocked: false })).toBe("reply");
    expect(firstReplyPrompt({ type: "question", replyCount: 1, isLocked: false })).toBeNull();
    expect(firstReplyPrompt({ type: "question", replyCount: 0, isLocked: true })).toBeNull();
  });

  it("collapses forums with no threads", () => {
    const { active, quiet } = partitionForums([{ s: "a", threadCount: 2 }, { s: "b", threadCount: 0 }, { s: "c", threadCount: 1 }]);
    expect(active.map((x) => x.s)).toEqual(["a", "c"]);
    expect(quiet.map((x) => x.s)).toEqual(["b"]);
  });

  it("spreads 'Start here' guides across forums", () => {
    const g = (id: string, categorySlug: string) => ({ id, categorySlug });
    const picks = pickStartHere([g("1", "ontario"), g("2", "ontario"), g("3", "ontario"), g("4", "quebec"), g("5", "plumbing")], 4);
    expect(picks.map((p) => p.id)).toEqual(["1", "4", "5", "2"]);
    expect(pickStartHere([], 6)).toEqual([]);
  });
});

describe("tender strips (real auto-threads only)", () => {
  const now = new Date("2026-10-09T15:00:00Z");
  const item = (id: string, over: Partial<AutoItem> = {}): AutoItem => ({ id, categorySlug: "plumbing", createdAt: "2026-10-07T00:00:00Z", kind: "tender", deadline: "2026-10-20", ...over });

  it("keeps tenders published this week that are still open, newest first", () => {
    const out = openTenderStrip(
      [
        item("old", { createdAt: "2026-09-20T00:00:00Z" }),
        item("closed", { deadline: "2026-10-08" }),
        item("no-date", { deadline: null }),
        item("award", { kind: "award" }),
        item("today", { deadline: "2026-10-09", createdAt: "2026-10-08T00:00:00Z" }),
        item("ok"),
      ],
      { today: "2026-10-09", now },
    );
    expect(out.map((x) => x.id)).toEqual(["today", "ok"]);
  });

  it("groups the newest tenders per forum, skipping awards and ones already shown", () => {
    const out = newestPerForum(
      [
        item("p1", { createdAt: "2026-10-08T00:00:00Z" }),
        item("p2", { createdAt: "2026-10-07T00:00:00Z" }),
        item("p3", { createdAt: "2026-10-06T00:00:00Z" }),
        item("e1", { categorySlug: "electrical", createdAt: "2026-10-09T00:00:00Z" }),
        item("a1", { categorySlug: "roofing-envelope", kind: "award" }),
      ],
      { per: 2, skip: new Set(["p1"]) },
    );
    expect(out).toEqual([
      { forum: "electrical", threads: [expect.objectContaining({ id: "e1" })] },
      { forum: "plumbing", threads: [expect.objectContaining({ id: "p2" }), expect.objectContaining({ id: "p3" })] },
    ]);
  });

  it("dates 'today' in Toronto time", () => {
    expect(torontoToday(new Date("2026-10-10T02:00:00Z"))).toBe("2026-10-09");
  });
});

describe("tender thread facts", () => {
  const award = (slug: string, over: Partial<PastAward> = {}): PastAward => ({
    slug, title: slug, categories: ["Roofing"], province: "Ontario", regionName: null, date: "2026-05-01", winner: "Metro Roofing Ltd.", amount: 120000, winnerSlug: null, ...over,
  });

  it("picks same-trade awards with a named winner, same province first, newest first", () => {
    const out = similarAwards({ slug: "me", categories: ["Roofing"], province: "Ontario" }, [
      award("bc", { province: "British Columbia", date: "2026-09-01" }),
      award("on-old", { date: "2025-01-01" }),
      award("on-new", { date: "2026-08-01" }),
      award("no-winner", { winner: null }),
      award("paint", { categories: ["Painting"] }),
      award("me"),
    ]);
    expect(out.map((a) => a.slug)).toEqual(["on-new", "on-old", "bc"]);
    expect(similarAwards({ slug: "x", categories: [], province: null }, [award("a")])).toEqual([]);
  });

  it("works out the closing state from real dates", () => {
    expect(closingState("2026-10-12", "2026-10-09")).toEqual({ state: "open", days: 3 });
    expect(closingState("2026-10-09", "2026-10-09")).toEqual({ state: "open", days: 0 });
    expect(closingState("2026-10-01", "2026-10-09").state).toBe("closed");
    expect(closingState(null, "2026-10-09")).toEqual({ state: "unknown", days: null });
  });
});
