import { describe, expect, it } from "vitest";
import {
  BUYER_TYPES,
  CLOSING_WINDOWS,
  bandOfAmount,
  boardQuery,
  boardRobots,
  buyerTypeOf,
  classifyBuyerName,
  inClosingWindow,
  isFilteredBoard,
  parseBoardParams,
  postedDate,
  valueBandOf,
  withBoardPatch,
} from "@/lib/data/board-filters";

const NOW = new Date("2026-10-22T15:00:00Z"); // 11:00 in Toronto

describe("parseBoardParams: URL parsing and canonicalization", () => {
  it("keeps known parameters with valid values and drops everything else", () => {
    const p = parseBoardParams({
      category: "Snow-Removal",
      region: "ontario",
      closing: "month",
      value: "1m-5m",
      buyer: "school",
      source: "public",
      utm_source: "newsletter",
      bogus: "1",
    });
    expect(p).toEqual({ category: "snow-removal", region: "ontario", closing: "month", value: "1m-5m", buyer: "school", source: "public" });
  });

  it("drops invalid values instead of passing them on", () => {
    const p = parseBoardParams({ closing: "tomorrow-ish", value: "huge", buyer: "alien", source: "x", view: "all", country: "mx", category: "a b", page: "-3", sort: "oldest" });
    expect(p).toEqual({});
  });

  it("writes parameters in one fixed order, defaults left out, so one view has one URL", () => {
    const a = boardQuery(parseBoardParams({ buyer: "federal", category: "hvac", closing: "week", page: "1", sort: "closing" }));
    const b = boardQuery(parseBoardParams({ sort: "closing", closing: "week", category: "hvac", buyer: "federal", page: "1" }));
    expect(a).toBe("category=hvac&closing=week&buyer=federal");
    expect(b).toBe(a);
  });

  it("normalizes the keyword and takes the first of repeated parameters", () => {
    expect(parseBoardParams({ q: "  snow   plow  " }).q).toBe("snow plow");
    expect(parseBoardParams({ category: ["hvac", "roofing"] }).category).toBe("hvac");
    expect(parseBoardParams({ q: "x".repeat(200) }).q).toHaveLength(80);
  });

  it("round-trips: parsing the canonical query gives the same parameters", () => {
    const p = parseBoardParams({ country: "us", view: "awarded", category: "roofing", value: "not-stated", buyer: "private", page: "3", sort: "newest" });
    expect(parseBoardParams(Object.fromEntries(new URLSearchParams(boardQuery(p))))).toEqual(p);
  });

  it("a filter change goes back to page 1; a page change keeps the filters", () => {
    const p = parseBoardParams({ category: "hvac", page: "4" });
    expect(withBoardPatch(p, { closing: "week" })).toEqual({ category: "hvac", closing: "week" });
    expect(withBoardPatch(p, { page: 5 })).toEqual({ category: "hvac", page: 5 });
    expect(withBoardPatch(p, { category: null })).toEqual({});
  });
});

describe("robots and canonical rules for filtered views", () => {
  it("the base board and its country switch stay indexable", () => {
    expect(boardRobots(parseBoardParams({}))).toBeUndefined();
    expect(boardRobots(parseBoardParams({ country: "us" }))).toBeUndefined();
    expect(isFilteredBoard(parseBoardParams({ country: "all" }))).toBe(false);
  });

  it("any filter, tab, sort or later page is noindex,follow", () => {
    for (const raw of [
      { category: "hvac" },
      { region: "ontario" },
      { q: "roof" },
      { closing: "week" },
      { source: "pm" },
      { value: "under-100k" },
      { buyer: "health" },
      { view: "awarded" },
      { sort: "newest" },
      { page: "2" },
      { country: "us", buyer: "federal" },
    ]) {
      expect(boardRobots(parseBoardParams(raw))).toEqual({ index: false, follow: true });
    }
  });

  it("junk parameters do not make the base board noindex (they are dropped)", () => {
    expect(boardRobots(parseBoardParams({ utm_campaign: "x", fbclid: "y" }))).toBeUndefined();
  });
});

describe("closing windows", () => {
  const w = (deadline: string | null, win: (typeof CLOSING_WINDOWS)[number]) => inClosingWindow(deadline, win, NOW);

  it("covers today, tomorrow, 7, 14 and 30 days, then later", () => {
    expect(w("2026-10-22", "today")).toBe(true);
    expect(w("2026-10-23", "tomorrow")).toBe(true);
    expect(w("2026-10-29", "week")).toBe(true); // 7 days
    expect(w("2026-10-30", "week")).toBe(false); // 8 days
    expect(w("2026-10-30", "two-weeks")).toBe(true);
    expect(w("2026-11-05", "two-weeks")).toBe(true); // 14 days
    expect(w("2026-11-06", "two-weeks")).toBe(false);
    expect(w("2026-11-21", "month")).toBe(true); // 30 days
    expect(w("2026-11-22", "month")).toBe(false);
    expect(w("2026-11-22", "later")).toBe(true);
    expect(w("2026-11-21", "later")).toBe(false);
  });

  it("a listing with no closing date (an ongoing list) is only 'later'", () => {
    expect(w(null, "later")).toBe(true);
    expect(w(null, "month")).toBe(false);
    expect(inClosingWindow(null, "all", NOW)).toBe(true);
  });
});

describe("value bands", () => {
  it("puts an amount in exactly one band; lower bound in, upper bound out", () => {
    expect(bandOfAmount(99_999)).toBe("under-100k");
    expect(bandOfAmount(100_000)).toBe("100k-500k");
    expect(bandOfAmount(499_999)).toBe("100k-500k");
    expect(bandOfAmount(500_000)).toBe("500k-1m");
    expect(bandOfAmount(1_000_000)).toBe("1m-5m");
    expect(bandOfAmount(5_000_000)).toBe("5m-10m");
    expect(bandOfAmount(10_000_000)).toBe("over-10m");
    expect(bandOfAmount(2_500_000_000)).toBe("over-10m");
  });

  it("no value, zero or garbage is 'not stated', never a guessed band", () => {
    expect(bandOfAmount(null)).toBe("not-stated");
    expect(bandOfAmount(undefined)).toBe("not-stated");
    expect(bandOfAmount(0)).toBe("not-stated");
    expect(bandOfAmount(Number.NaN)).toBe("not-stated");
  });

  it("reads the stated value from an award notice and a closed tender's award", () => {
    expect(valueBandOf({ summary: "Awarded Sep 14, 2026 to TRIUMPH ROOFING & SHEET METAL INC — $1,250,000 CAD." })).toBe("1m-5m");
    expect(valueBandOf({ summary: "Awarded Aug 31, 2026 to MOPAL CONSTRUCTION LTD — value not disclosed." })).toBe("not-stated");
    expect(
      valueBandOf({ summary: "Public tender from X, closed Oct 1. Contract awarded Oct 9, 2026 to Acme Ltd — $74,500 CAD (CanadaBuys award CB-123-45)." }),
    ).toBe("under-100k");
  });

  it("an open public tender states no value in our data", () => {
    expect(valueBandOf({ summary: "Public tender from City of Toronto, posted on the city's portal." })).toBe("not-stated");
    expect(valueBandOf({ summary: null })).toBe("not-stated");
  });
});

describe("buyer type classification", () => {
  const cases: [string, (typeof BUYER_TYPES)[number]][] = [
    ["City of Toronto", "municipal"],
    ["Township of Wellington North", "municipal"],
    ["Ville de Montréal", "municipal"],
    ["District of Saanich", "municipal"],
    ["Regional Municipality of Peel", "regional"],
    ["County of Simcoe", "regional"],
    ["Fraser Valley Regional District", "regional"],
    ["Toronto District School Board", "school"],
    ["Centre de services scolaire de Montréal", "school"],
    ["Peel DSB", "school"],
    ["Unified School District 259", "school"],
    ["University Health Network", "health"],
    ["Hôpital Charles-Le Moyne", "health"],
    ["CIUSSS du Centre-Sud-de-l'Île-de-Montréal", "health"],
    ["Santé Québec", "health"],
    ["Toronto Community Housing Corporation", "housing"],
    ["Cégep régional de Lanaudière", "college"],
    ["University of Waterloo", "college"],
    ["Southwestern Community College", "college"],
    ["Government of Canada", "federal"],
    ["Public Services and Procurement Canada", "federal"],
    ["Department of Veterans Affairs", "federal"],
    ["U.S. Army Corps of Engineers", "federal"],
    ["Ministère des Transports du Québec", "provincial"],
    ["Metrolinx", "provincial"],
    ["State of Florida", "provincial"],
  ];
  for (const [name, type] of cases) {
    it(`${name} is ${type}`, () => expect(classifyBuyerName(name)).toBe(type));
  }

  it("a name that says nothing has no type (and so matches no type filter)", () => {
    expect(classifyBuyerName("Toronto Public Library")).toBeNull();
    expect(classifyBuyerName("Acme Holdings")).toBeNull();
    expect(classifyBuyerName(null)).toBeNull();
    expect(classifyBuyerName("")).toBeNull();
  });

  const row = (over: Record<string, unknown>) => ({ slug: "x-cb-123-45", sourceType: "public_source", summary: null as string | null, isDemo: false, ...over });

  it("reads the buyer named in a public tender, else what its source is", () => {
    expect(buyerTypeOf(row({ summary: "Public tender from Cégep régional de Lanaudière (Repentigny), posted on SEAO." }))).toBe("college");
    // CanadaBuys with no buyer line: the source is the federal government.
    expect(buyerTypeOf(row({}))).toBe("federal");
    // Toronto's feed is the City.
    expect(buyerTypeOf(row({ slug: "resurfacing-tor-5830241025" }))).toBe("municipal");
    // SEAO with no buyer line: a Quebec public body could be anything.
    expect(buyerTypeOf(row({ slug: "toiture-qc-2026-001" }))).toBeNull();
  });

  it("listings posted on PMRFP by property managers and builders are private", () => {
    expect(buyerTypeOf(row({ sourceType: null, slug: "roof-pm-1" }))).toBe("private");
    expect(buyerTypeOf(row({ sourceType: "property_manager_direct", slug: "roof-pm-2" }))).toBe("private");
    expect(buyerTypeOf(row({ sourceType: "gc_package", slug: "roof-gc-3" }))).toBe("private");
  });

  it("demo rows and a town's own post (no buyer name in the snapshot) get no type", () => {
    expect(buyerTypeOf(row({ sourceType: null, isDemo: true }))).toBeNull();
    expect(buyerTypeOf(row({ sourceType: "public_buyer_direct", slug: "town-post-1" }))).toBeNull();
  });
});

describe("posted date", () => {
  it("uses the buyer's posting date, else when PMRFP first stored it", () => {
    expect(postedDate({ publishedAt: "2026-10-12T00:00:00Z", createdAt: "2026-10-20T08:00:00Z" })).toBe("2026-10-12");
    expect(postedDate({ publishedAt: null, createdAt: "2026-10-20T08:00:00Z" })).toBe("2026-10-20");
    expect(postedDate({ publishedAt: null, createdAt: null })).toBeNull();
    expect(postedDate({ publishedAt: "garbage", createdAt: null })).toBeNull();
  });
});
