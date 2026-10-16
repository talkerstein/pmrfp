import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

vi.mock("server-only", () => ({}));

// Real-data fixtures behind the server run (the snapshot and this week's listings).
const fixtures = vi.hoisted(() => ({ awards: [] as unknown[], records: [] as unknown[] }));
vi.mock("@/lib/data/price-benchmarks-load", () => ({
  loadBenchmarkData: async () => ({ awards: fixtures.awards, categories: [{ slug: "electrical", name: "Electrical" }, { slug: "plumbing", name: "Plumbing" }], today: "", combos: [] }),
}));
vi.mock("@/lib/forum/auto-threads-server", () => ({
  loadSourceRecords: async () => fixtures.records,
  ensureSystemProfile: async () => "board",
}));
vi.mock("@/lib/forum/staff-guides-server", () => ({ ensureTeamProfile: async () => "team" }));

import {
  OFFICIAL_WEATHER_HOSTS,
  POLLS,
  WEATHER_LINKS,
  isoWeek,
  openBidFrom,
  planAwardsWeek,
  planOpenBids,
  planPrompts,
  planRecurring,
  planSoldFor,
  planWeather,
  pollFor,
  previousMonth,
  weekBounds,
  winterSeason,
  type OpenBid,
} from "@/lib/forum/recurring";
import { runRecurringThreads, recurringRow } from "@/lib/forum/recurring-server";
import { resetForumV2Probe } from "@/lib/forum/schema-v2";
import { isIndexableThread } from "@/lib/forum/rules";
import { roomCountry } from "@/lib/forum/categories";
import type { AutoSourceRecord } from "@/lib/forum/auto-threads";
import type { BenchmarkAward } from "@/lib/data/price-benchmarks";

const MONDAY = "2026-11-02"; // a Monday, in winter

function record(over: Partial<AutoSourceRecord>): AutoSourceRecord {
  return {
    id: over.id ?? "r1",
    slug: "led-lighting-retrofit-rec1",
    title: "LED lighting retrofit at the regional office",
    summary: null,
    city: "Ottawa",
    province: "ON",
    deadline: "2026-11-20",
    publishedAt: "2026-10-30T14:00:00Z",
    createdAt: "2026-10-30T14:00:00Z",
    sourceType: "public_source",
    isDemo: false,
    status: "published",
    tradeSlugs: ["electrical"],
    tradeNames: ["Electrical"],
    ...over,
  };
}

function award(over: Partial<BenchmarkAward>): BenchmarkAward {
  return {
    slug: over.slug ?? "award-1",
    title: "Electrical maintenance services",
    buyer: "City of Ottawa",
    winner: "Bright Line Electric Ltd.",
    winnerSlug: null,
    amount: 50000,
    date: "2026-10-28",
    country: "CA",
    currency: "CAD",
    province: "Ontario",
    city: "Ottawa",
    trades: ["Electrical"],
    sourceKey: "canadabuys",
    attribution: "Open Government Licence – Canada",
    noticeUrl: null,
    noticeExact: false,
    ...over,
  };
}

const bid = (over: Partial<OpenBid>): OpenBid => ({
  slug: "b1",
  title: "Rooftop unit replacement",
  issuer: "the Government of Canada",
  city: "Toronto",
  province: "Ontario",
  country: "CA",
  deadline: "2026-11-20",
  published: "2026-10-30",
  rooms: ["hvac-mechanical"],
  ...over,
});

describe("periods", () => {
  it("computes ISO weeks, week bounds, the previous month and the winter season", () => {
    expect(isoWeek("2026-11-02")).toBe("2026-W45");
    expect(isoWeek("2026-01-01")).toBe("2026-W01");
    expect(isoWeek("2027-01-01")).toBe("2026-W53");
    expect(weekBounds("2026-11-04")).toEqual({ from: "2026-11-02", to: "2026-11-08" });
    expect(previousMonth("2026-11-02")).toEqual({ key: "2026-10", from: "2026-10-01", to: "2026-10-31" });
    expect(previousMonth("2026-01-15")).toEqual({ key: "2025-12", from: "2025-12-01", to: "2025-12-31" });
    expect(winterSeason("2026-11-01")).toBe("2026-27");
    expect(winterSeason("2027-03-31")).toBe("2026-27");
    expect(winterSeason("2026-10-16")).toBeNull();
  });
});

describe("open bids this week (PMRFP Board, real listings only)", () => {
  it("posts nothing when there are no open bids", () => {
    expect(planOpenBids([], MONDAY)).toEqual([]);
    // Closed, stale or future-dated rows aren't "open this week".
    expect(planOpenBids([bid({ deadline: "2026-11-01" }), bid({ published: "2026-10-20" }), bid({ published: "2026-11-09" })], MONDAY)).toEqual([]);
  });

  it("keeps Canada and the U.S. apart: one thread per trade room per country, regional rooms only their own country", () => {
    const drafts = planOpenBids(
      [
        bid({ slug: "ca1", rooms: ["electrical"], province: "Ontario", country: "CA" }),
        bid({ slug: "us1", rooms: ["electrical"], province: "Texas", country: "US", city: "Austin" }),
        bid({ slug: "qc1", rooms: ["plumbing"], province: "Quebec", country: "CA", city: "Laval" }),
      ],
      MONDAY,
    );
    const keys = drafts.map((d) => d.key).sort();
    expect(keys).toEqual([
      "recurring:open-bids:electrical:CA:2026-W45",
      "recurring:open-bids:electrical:US:2026-W45",
      "recurring:open-bids:ontario:CA:2026-W45",
      "recurring:open-bids:plumbing:CA:2026-W45",
      "recurring:open-bids:quebec:CA:2026-W45",
      "recurring:open-bids:us-south:US:2026-W45",
    ]);
    for (const d of drafts) {
      expect(d.author).toBe("board");
      expect(d.body.startsWith("**PMRFP Board")).toBe(d.lang === "en");
      const regional = roomCountry(d.category);
      if (regional) expect(regional).toBe(d.country);
      // Only that country's listings are in the body.
      if (d.country === "CA") expect(d.body).not.toContain("/rfps/us1");
      if (d.country === "US") expect(d.body).not.toMatch(/\/rfps\/(ca1|qc1)/);
    }
    const qc = drafts.find((d) => d.category === "quebec")!;
    expect(qc.lang).toBe("fr");
    expect(qc.title).toMatch(/^Appels d'offres ouverts cette semaine : Québec/);
  });

  it("builds bids only from real, open, in-scope listings with a place and a closing date", () => {
    expect(openBidFrom(record({}))?.country).toBe("CA");
    expect(openBidFrom(record({ isDemo: true }))).toBeNull();
    expect(openBidFrom(record({ status: "draft" }))).toBeNull();
    expect(openBidFrom(record({ province: null }))).toBeNull();
    expect(openBidFrom(record({ deadline: null }))).toBeNull();
    expect(openBidFrom(record({ title: "Dredging of the harbour channel" }))).toBeNull();
    expect(openBidFrom(record({ province: "TX" }))?.country).toBe("US");
  });
});

describe("what jobs sold for (price benchmarks, n ≥ 5)", () => {
  const six = [1, 2, 3, 4, 5, 6].map((i) => award({ slug: `e${i}`, amount: 40000 + i * 1000, date: i === 6 ? "2026-10-12" : `2026-0${i}-15` }));
  it("posts only where the benchmark has 5+ valued awards and last month had at least one", () => {
    const drafts = planSoldFor(six, [{ slug: "electrical", name: "Electrical" }], MONDAY);
    expect(drafts).toHaveLength(1);
    expect(drafts[0]).toMatchObject({ key: "recurring:sold-for:electrical:ontario:2026-10", category: "electrical", country: "CA", author: "board" });
    expect(drafts[0].body).toContain("$46,000 CAD");
    // The range itself stays on the benchmark page.
    expect(drafts[0].body).not.toMatch(/median|percentile/i);
    // Four valued awards: not enough.
    expect(planSoldFor(six.slice(2), [{ slug: "electrical", name: "Electrical" }], MONDAY)).toEqual([]);
    // Nothing awarded last month: nothing to post.
    expect(planSoldFor(six.slice(0, 5).concat(award({ slug: "e9", date: "2026-09-02" })), [{ slug: "electrical", name: "Electrical" }], MONDAY)).toEqual([]);
  });
});

describe("who won public work this week", () => {
  it("one thread per country with last week's awards; individuals are not named; nothing without awards", () => {
    const drafts = planAwardsWeek(
      [
        award({ slug: "a-ca", date: "2026-10-28" }),
        award({ slug: "a-ind", date: "2026-10-29", winner: null }),
        award({ slug: "a-us", date: "2026-10-30", country: "US", currency: "USD", province: "Texas", winner: "Lone Star Mechanical LLC" }),
        award({ slug: "a-old", date: "2026-10-10" }),
      ],
      MONDAY,
    );
    expect(drafts.map((d) => d.key).sort()).toEqual(["recurring:awards-week:CA:2026-W45", "recurring:awards-week:US:2026-W45"]);
    const ca = drafts.find((d) => d.country === "CA")!;
    expect(ca.category).toBe("finding-work");
    expect(ca.body).toContain("An individual (not named)");
    expect(ca.body).not.toContain("Lone Star");
    expect(ca.body).not.toContain("a-old");
    expect(planAwardsWeek([award({ date: "2026-10-10" })], MONDAY)).toEqual([]);
  });
});

describe("weather threads and member prompts (PMRFP Team)", () => {
  it("opens one weather thread per regional room each winter, with official forecast links only", () => {
    expect(planWeather("2026-07-01")).toEqual([]);
    const w = planWeather(MONDAY);
    expect(w.length).toBe(10);
    for (const d of w) {
      expect(d.author).toBe("team");
      expect(d.key).toMatch(/^recurring:weather:[a-z-]+:2026-27$/);
      const hosts = [...d.body.matchAll(/https:\/\/([^/\s]+)/g)].map((m) => m[1]);
      expect(hosts.length).toBeGreaterThan(0);
      for (const h of hosts) expect(OFFICIAL_WEATHER_HOSTS).toContain(h);
      expect(roomCountry(d.category)).toBe(d.country);
    }
    expect(Object.keys(WEATHER_LINKS)).not.toContain("united-states");
  });

  it("opens the weekly, monthly and poll prompts once per country, with no fake replies or votes", () => {
    const p = planPrompts(MONDAY);
    expect(p.map((d) => d.key).sort()).toEqual([
      `recurring:poll:${pollFor(MONDAY).key}:CA:2026-11`,
      `recurring:poll:${pollFor(MONDAY).key}:US:2026-11`,
      "recurring:prompt:photo:CA:2026-11",
      "recurring:prompt:photo:US:2026-11",
      "recurring:prompt:waywo:CA:2026-W45",
      "recurring:prompt:waywo:US:2026-W45",
    ]);
    const poll = p.find((d) => d.kind === "poll")!;
    expect(poll.poll!.options.length).toBeGreaterThanOrEqual(2);
    expect(poll.poll!.options.length).toBeLessThanOrEqual(6);
    for (const q of POLLS) expect(new Set(q.options).size).toBe(q.options.length);
  });
});

describe("idempotency", () => {
  it("skips drafts whose key was already posted this period", () => {
    const input = { today: MONDAY, bids: [bid({})], awards: [], trades: [] };
    const first = planRecurring(input, new Set());
    expect(first.length).toBeGreaterThan(0);
    expect(planRecurring(input, new Set(first.map((d) => d.key)))).toEqual([]);
  });

  it("stamps rows by the database (never backdated) and keeps them noindex until a member replies", () => {
    const d = planPrompts(MONDAY)[0];
    const row = recurringRow(d, "cat", "team", "abcd1234");
    expect(row).not.toHaveProperty("created_at");
    expect(row).not.toHaveProperty("last_post_at");
    expect(row).toMatchObject({ is_staff: true, status: "approved", country: d.country, auto_source_key: d.key });
    const base = { status: "approved" as const, type: "discussion" as const, wordsTotal: 900, recurring: true };
    expect(isIndexableThread({ ...base, replyCount: 0 })).toBe(false);
    expect(isIndexableThread({ ...base, replyCount: 2 })).toBe(true);
  });
});

/** A fake service client: forum_threads with the unique auto_source_key, polls, options. */
function fakeDb() {
  const threads: Record<string, unknown>[] = [];
  const polls: Record<string, unknown>[] = [];
  const options: Record<string, unknown>[] = [];
  const other: { table: string }[] = [];
  const cats = ["electrical", "plumbing", "hvac-mechanical", "ontario", "quebec", "us-south", "finding-work", "show-your-work", "pricing-estimating", "getting-paid", "running-the-business", "alberta", "british-columbia", "prairies", "atlantic", "us-northeast", "us-midwest", "us-west"].map((slug) => ({ id: `cat-${slug}`, slug }));
  const db = {
    from(table: string) {
      let inKeys: string[] | null = null;
      const q: Record<string, unknown> = {};
      const self = () => q;
      for (const m of ["select", "eq", "limit", "order"]) q[m] = self;
      q.in = (_c: string, v: string[]) => {
        inKeys = v;
        return q;
      };
      q.then = (res: (v: unknown) => unknown) => {
        const rows = table === "forum_categories" ? cats : table === "forum_threads" ? threads.filter((t) => !inKeys || inKeys.includes(t.auto_source_key as string)) : [];
        return Promise.resolve({ data: rows, error: null }).then(res);
      };
      q.insert = (row: Record<string, unknown> | Record<string, unknown>[]) => {
        const rows = Array.isArray(row) ? row : [row];
        let error: { code: string; message: string } | null = null;
        let id: string | null = null;
        if (table === "forum_threads") {
          const r = rows[0];
          if (threads.some((t) => t.auto_source_key === r.auto_source_key)) error = { code: "23505", message: "duplicate key forum_threads_auto_source_key_idx" };
          else {
            id = `t${threads.length + 1}`;
            threads.push({ ...r, id });
          }
        } else if (table === "forum_polls") {
          id = `p${polls.length + 1}`;
          polls.push({ ...rows[0], id });
        } else if (table === "forum_poll_options") options.push(...rows);
        else other.push({ table });
        const result = { data: id ? { id } : null, error };
        return { select: () => ({ single: async () => result }), then: (res: (v: unknown) => unknown) => Promise.resolve(result).then(res) };
      };
      return q;
    },
  } as unknown as SupabaseClient;
  return { db, threads, polls, options, other };
}

describe("recurring run (DB side)", () => {
  beforeEach(() => {
    resetForumV2Probe();
    fixtures.records = [
      record({ id: "ca", slug: "lighting-ca-1" }),
      record({ id: "us", slug: "lighting-us-1", province: "TX", city: "Austin" }),
      record({ id: "old", slug: "old-1", publishedAt: "2026-09-01T00:00:00Z" }),
    ];
    fixtures.awards = [award({ slug: "w1", date: "2026-10-28" })];
  });

  it("previews without writing, posts once per period, and a re-run posts nothing", async () => {
    const f = fakeDb();
    const now = new Date("2026-11-02T15:00:00Z");
    const dry = await runRecurringThreads(f.db, { dry: true, now });
    expect(dry.ready).toBe(true);
    expect(dry.planned).toBeGreaterThan(0);
    expect(f.threads).toHaveLength(0);

    const first = await runRecurringThreads(f.db, { dry: false, now });
    expect(first.created).toBe(dry.planned);
    // Thread rows and poll rows only: never replies, votes or ratings.
    expect(f.other).toEqual([]);
    expect(f.polls.length).toBe(2);
    expect(f.options.length).toBeGreaterThanOrEqual(4);
    expect(f.threads.every((t) => (t.country === "CA" || t.country === "US") && t.is_staff === true && !("created_at" in t))).toBe(true);
    expect(f.threads.filter((t) => t.auto_source === "open-bids").map((t) => t.auto_source_key).sort()).toEqual([
      "recurring:open-bids:electrical:CA:2026-W45",
      "recurring:open-bids:electrical:US:2026-W45",
      "recurring:open-bids:ontario:CA:2026-W45",
      "recurring:open-bids:us-south:US:2026-W45",
    ]);
    // The data threads are by the Board; prompts and weather by the Team.
    for (const t of f.threads) expect(t.author_id).toBe(["open-bids", "sold-for", "awards-week"].includes(t.auto_source as string) ? "board" : "team");

    const again = await runRecurringThreads(f.db, { dry: false, now });
    expect(again.created).toBe(0);
    expect(again.skippedExisting).toBe(first.created);
  });

  it("posts no data threads when there is no data", async () => {
    fixtures.records = [];
    fixtures.awards = [];
    const f = fakeDb();
    await runRecurringThreads(f.db, { dry: false, now: new Date("2026-07-06T15:00:00Z") });
    expect(f.threads.filter((t) => ["open-bids", "sold-for", "awards-week", "weather"].includes(t.auto_source as string))).toEqual([]);
  });

  it("does nothing until the rework migration is applied", async () => {
    const db = { from: () => ({ select: () => ({ limit: async () => ({ error: { code: "42703", message: "column forum_threads.country does not exist" } }) }) }) } as unknown as SupabaseClient;
    const r = await runRecurringThreads(db, { dry: false });
    expect(r.ready).toBe(false);
    expect(r.reason).toMatch(/20261017000001_forum_rework/);
  });
});
