import { describe, expect, it } from "vitest";
import { applyThreadSort, cleanSearch, filterThreads, ilikePattern, parseSort, sortQuery, timeAgo, type FilterableQuery } from "@/lib/forum/organize";
import type { ThreadSummary } from "@/lib/forum/data";
import forumMessages from "@/i18n/messages/forum";

/** Records every builder call so the tab → query mapping can be asserted. */
class Rec implements FilterableQuery<Rec> {
  calls: unknown[][] = [];
  eq(c: string, v: unknown) { this.calls.push(["eq", c, v]); return this; }
  is(c: string, v: null) { this.calls.push(["is", c, v]); return this; }
  not(c: string, op: string, v: unknown) { this.calls.push(["not", c, op, v]); return this; }
  gt(c: string, v: unknown) { this.calls.push(["gt", c, v]); return this; }
  order(c: string, o: { ascending: boolean }) { this.calls.push(["order", c, o.ascending]); return this; }
}

const th = (p: Partial<ThreadSummary> & { id: string }): ThreadSummary => ({
  shortId: p.id, slug: p.id, path: `/forum/x/${p.id}`, title: p.id, type: "question", status: "approved", isPinned: false, isLocked: false,
  isStaff: false, hasAccepted: false, replyCount: 0, viewCount: 0, ratingAvg: null, ratingCount: 0, createdAt: "2026-10-01T00:00:00Z",
  lastPostAt: "2026-10-01T00:00:00Z", author: null, lastUser: null, region: null, ...p,
});

describe("forum sort tabs", () => {
  it("parses ?sort= and falls back to latest", () => {
    expect(parseSort("unanswered")).toBe("unanswered");
    expect(parseSort(["solved", "top"])).toBe("solved");
    expect(parseSort("bogus")).toBe("latest");
    expect(parseSort(undefined)).toBe("latest");
  });

  it("keeps the default tab on the clean base URL", () => {
    expect(sortQuery("latest")).toBe("");
    expect(sortQuery("top")).toBe("?sort=top");
  });

  it("latest orders by last activity only", () => {
    expect(applyThreadSort(new Rec(), "latest").calls).toEqual([["order", "last_post_at", false]]);
  });

  it("unanswered = questions with no accepted answer", () => {
    expect(applyThreadSort(new Rec(), "unanswered").calls).toEqual([
      ["eq", "type", "question"],
      ["is", "accepted_post_id", null],
      ["order", "last_post_at", false],
    ]);
  });

  it("solved = has an accepted answer", () => {
    expect(applyThreadSort(new Rec(), "solved").calls).toEqual([
      ["not", "accepted_post_id", "is", null],
      ["order", "last_post_at", false],
    ]);
  });

  it("top rated = rated threads by rating total", () => {
    const c = applyThreadSort(new Rec(), "top").calls;
    expect(c[0]).toEqual(["gt", "rating_count", 0]);
    expect(c[1]).toEqual(["order", "rating_sum", false]);
  });

  it("in-memory filter matches the query semantics", () => {
    const list = [
      th({ id: "a", lastPostAt: "2026-10-03T00:00:00Z" }),
      th({ id: "b", hasAccepted: true, lastPostAt: "2026-10-02T00:00:00Z", ratingAvg: 4, ratingCount: 2 }),
      th({ id: "c", type: "discussion", lastPostAt: "2026-10-04T00:00:00Z", ratingAvg: 5, ratingCount: 3 }),
    ];
    expect(filterThreads(list, "latest").map((t) => t.id)).toEqual(["c", "a", "b"]);
    expect(filterThreads(list, "unanswered").map((t) => t.id)).toEqual(["a"]);
    expect(filterThreads(list, "solved").map((t) => t.id)).toEqual(["b"]);
    expect(filterThreads(list, "top").map((t) => t.id)).toEqual(["c", "b"]);
  });
});

describe("forum search", () => {
  it("cleans the box value", () => {
    expect(cleanSearch("  panel   upgrade ")).toBe("panel upgrade");
    expect(cleanSearch("a")).toBeNull();
    expect(cleanSearch(undefined)).toBeNull();
    expect(cleanSearch("x".repeat(200))!.length).toBe(80);
  });

  it("escapes LIKE wildcards and PostgREST syntax", () => {
    expect(ilikePattern("100%")).toBe("%100\\%%");
    expect(ilikePattern("a_b")).toBe("%a\\_b%");
    expect(ilikePattern("x,y(z)*")).toBe("%x y z%");
  });
});

describe("timeAgo", () => {
  const now = new Date("2026-10-08T12:00:00Z");
  it("labels relative times", () => {
    expect(timeAgo("2026-10-08T09:00:00Z", "en", now)).toBe("3 hours ago");
    expect(timeAgo("2026-10-07T12:00:00Z", "en", now)).toBe("yesterday");
    expect(timeAgo("2026-09-08T12:00:00Z", "en", now)).toMatch(/month|weeks/);
  });
});

describe("forum org strings", () => {
  it("exist in every language", () => {
    for (const l of ["en", "fr", "es"] as const) {
      const o = forumMessages[l].org;
      expect(Object.keys(o.tabs)).toEqual(["latest", "unanswered", "top", "solved"]);
      expect(o.searchTitle).toContain("{q}");
    }
  });
});
