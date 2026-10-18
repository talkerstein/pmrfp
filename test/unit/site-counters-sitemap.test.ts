import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn }));

import type { RfpListItem } from "@/lib/data/types";
import {
  aggregateSuppliers,
  buildIndex,
  isTorontoSupplierIndexable,
  rowsFromCsv,
  torontoContractSlugsForSitemap,
} from "@/lib/data/toronto-awards";
import { indexableWinners, isWinnerIndexable, winnerProfiles } from "@/lib/data/winners";
import {
  awardsOnRecord,
  boardStatsByCountry,
  countClosingWithinDays,
  countOpenListings,
  countPostedLastNDays,
  countWinnersLastNDays,
  isOpenListing,
  repeatWinnerTotals,
} from "@/lib/data/site-counters";

/* ------------------------------------------------------------ Toronto */

const HEADER =
  "_id,Document Number,RFx (Solicitation) Type,High Level Category,Successful Supplier,Award,Award Authority Obtained Date,Division,Buyer Name,Buyer Email,Buyer Phone Number,Solicitation Document Description,Supplier Address,Wards";
const row = (id: number, supplier: string, amount: string, date: string) =>
  `${id},Doc-${id},RFQ,Construction Services,${supplier},"${amount}",${date},Transportation Services,City Buyer,b@toronto.ca,416,Road work ${id},1 Main St,Ward 1`;
const CSV = [
  HEADER,
  row(1, "GUILD ELECTRIC LTD.", "12,000.00", "2025-01-10"),
  row(2, "Guild Electric Limited", "8,000.00", "2026-03-01"), // same supplier, 2 awards -> indexable
  row(3, "Big Paving Inc", "300,000.00", "2026-02-02"), // one big award -> indexable
  row(4, "Small Cleaning Co", "5,000.00", "2026-04-04"), // one small award -> page exists, noindex
  row(5, "Mr. John Smith", "900,000.00", "2026-05-05"), // a person -> no page at all
].join("\n");

describe("Toronto supplier sitemap = the page's existence + indexing rule", () => {
  const suppliers = aggregateSuppliers(rowsFromCsv(CSV));
  const index = buildIndex(rowsFromCsv(CSV), suppliers);
  // What the page resolves: getTorontoSupplier finds the slug among `suppliers`.
  const pageExists = (slug: string) => suppliers.some((s) => s.slug === slug);

  it("lists exactly the suppliers whose page exists and is indexable", () => {
    const listed = torontoContractSlugsForSitemap(index, 2000).map((s) => s.slug);
    const expected = suppliers.filter((s) => pageExists(s.slug) && isTorontoSupplierIndexable(s)).map((s) => s.slug);
    expect(listed).toEqual(expected);
    expect(new Set(listed)).toEqual(new Set(["big-paving-inc", "guild-electric-limited"]));
    for (const slug of listed) expect(pageExists(slug)).toBe(true);
  });

  it("keeps thin and personal entries out", () => {
    const listed = torontoContractSlugsForSitemap(index, 2000).map((s) => s.slug);
    expect(pageExists("small-cleaning-co")).toBe(true);
    expect(listed).not.toContain("small-cleaning-co");
    expect(suppliers.some((s) => /smith/.test(s.slug))).toBe(false);
  });

  it("respects the limit, biggest first", () => {
    expect(torontoContractSlugsForSitemap(index, 1).map((s) => s.slug)).toEqual(["big-paving-inc"]);
  });

  it("rejects slugs the page's slug check would 404", () => {
    expect(isTorontoSupplierIndexable({ slug: "Bad_Slug", indexable: true })).toBe(false);
  });
});

describe("Toronto supplier lookup: a failed download is an error, never a (cached) 404", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("throws while the CSV can't be fetched, then resolves once it can", async () => {
    vi.resetModules();
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response("down", { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "error").mockImplementation(() => {});
    const mod = await import("@/lib/data/toronto-awards");
    await expect(mod.getTorontoSupplier("guild-electric-limited")).rejects.toThrow();

    fetchMock.mockImplementation(async () => new Response(CSV, { status: 200 }));
    const s = await mod.getTorontoSupplier("guild-electric-limited");
    expect(s?.count).toBe(2);
    expect(await mod.getTorontoSupplier("no-such-supplier")).toBeNull();
  });
});

/* ------------------------------------------------------------ winners + counters */

let n = 0;
const base = (over: Partial<RfpListItem>): RfpListItem => ({
  slug: `x-${++n}`,
  title: "x",
  summary: null,
  categories: ["Roofing"],
  regionName: null,
  propertyTypeName: null,
  city: null,
  province: "Ontario",
  deadline: "2099-01-01",
  isDemo: false,
  photoUrls: [],
  status: "open",
  sourceType: "public_source",
  ...over,
});
/** A past public contract (award notice, CanadaBuys marker). */
const award = (winner: string, date: string, amount: number | null, province = "Ontario"): RfpListItem =>
  base({
    slug: `award-${++n}-cba-a${n}`,
    summary: `Awarded ${date} to ${winner} — ${amount ? `$${amount.toLocaleString("en-CA")} CAD` : "value not disclosed"}. Past public contract issued by Public Works.`,
    deadline: date,
    status: "closed",
    province,
  });

describe("contract-winner profiles: sitemap and robots share isWinnerIndexable", () => {
  const rfps = [
    award("Dexter Construction Ltd.", "2026-09-01", 100_000),
    award("DEXTER CONSTRUCTION LTD", "2026-08-01", 50_000),
    award("Metro Roofing Inc", "2026-07-01", 20_000),
    award("Alain Roy", "2026-07-01", 5_000), // a person: no profile at all
  ];

  it("sitemap list = profiles the page renders, filtered by the page's own robots rule", () => {
    const profiles = winnerProfiles(rfps);
    expect(profiles.map((w) => w.name).sort()).toEqual(["Dexter Construction Ltd.", "Metro Roofing Inc"]);
    expect(indexableWinners(rfps).map((w) => w.slug)).toEqual(profiles.filter(isWinnerIndexable).map((w) => w.slug));
    expect(indexableWinners(rfps).map((w) => w.slug)).toEqual(["dexter-construction-ltd"]);
  });

  it("one award = noindex, two = indexable", () => {
    const [dexter, metro] = winnerProfiles(rfps);
    expect(isWinnerIndexable(dexter)).toBe(true);
    expect(isWinnerIndexable(metro)).toBe(false);
  });

  it("indexed slugs don't move when one-award profiles are added", () => {
    const repeat = indexableWinners(rfps).map((w) => w.slug);
    const all = winnerProfiles(rfps).map((w) => w.slug);
    for (const s of repeat) expect(all).toContain(s);
  });
});

describe("site counters", () => {
  const now = new Date("2026-10-18T16:00:00Z");
  const today = "2026-10-18";
  const rows: RfpListItem[] = [
    base({ province: "Ontario", deadline: "2026-10-20", publishedAt: "2026-10-10T00:00:00Z" }), // CA open, closes in 2 days, posted 8 days ago
    base({ province: "Quebec", deadline: "2026-12-01", publishedAt: "2026-08-01T00:00:00Z" }), // CA open, posted 78 days ago
    base({ province: "Ontario", deadline: "2026-10-01", status: "closed", publishedAt: "2026-09-25T00:00:00Z" }), // CA closed, posted 23 days ago
    base({ province: "Ontario", isDemo: true, publishedAt: "2026-10-15T00:00:00Z" }), // demo: open, never "posted"
    base({ province: "Texas", deadline: "2026-10-19", publishedAt: "2026-10-17T00:00:00Z" }), // US open
    award("Dexter Construction Ltd.", "2026-09-01", 100_000),
    award("Dexter Construction Ltd", "2026-05-01", 50_000), // outside 90 days
    award("Metro Roofing Inc", "2026-10-01", null),
    award("City of Toronto", "2026-10-02", 10_000), // public body: not a "winner"
    award("Lone Star Paving LLC", "2026-10-05", 70_000, "Texas"),
    // An award notice whose row reads "open" (no deadline) is still never open work.
    { ...award("Odd Co Ltd", "2026-10-06", 1_000), deadline: null, status: "open" as const },
  ];

  it("open = status open and not an award notice, per country", () => {
    expect(isOpenListing(rows[rows.length - 1])).toBe(false);
    expect(countOpenListings(rows, "CA")).toBe(3); // incl. the demo listing on the board
    expect(countOpenListings(rows, "US")).toBe(1);
  });

  it("closing within 7 days", () => {
    expect(countClosingWithinDays(rows, "CA", 7, now)).toBe(1);
    expect(countClosingWithinDays(rows, "US", 7, now)).toBe(1);
  });

  it("posted in the last N days: by posting date, no demos, no award notices", () => {
    expect(countPostedLastNDays(rows, "CA", 30, now)).toBe(2);
    expect(countPostedLastNDays(rows, "CA", 90, now)).toBe(3);
    expect(countPostedLastNDays(rows, "US", 30, now)).toBe(1);
  });

  it("winners in the last N days: distinct companies, no public bodies, per country", () => {
    expect(countWinnersLastNDays(rows, "CA", 90, today)).toBe(2); // Dexter, Metro (Odd Co has no award date)
    expect(countWinnersLastNDays(rows, "CA", 30, today)).toBe(1); // Metro
    expect(countWinnersLastNDays(rows, "US", 90, today)).toBe(1);
  });

  it("awards on record = every award notice; repeat-winner totals are a subset", () => {
    expect(awardsOnRecord(rows, "CA")).toEqual({ contracts: 5, value: 161_000 });
    expect(awardsOnRecord(rows, "US")).toEqual({ contracts: 1, value: 70_000 });
    expect(repeatWinnerTotals(rows, "CA")).toEqual({ companies: 1, contracts: 2, value: 150_000 });
    expect(repeatWinnerTotals(rows, "CA").contracts).toBeLessThanOrEqual(awardsOnRecord(rows, "CA").contracts);
  });

  it("boardStatsByCountry agrees with the named counters", () => {
    const s = boardStatsByCountry(rows, now);
    for (const c of ["CA", "US"] as const) {
      expect(s[c].open).toBe(countOpenListings(rows, c));
      expect(s[c].closingThisWeek).toBe(countClosingWithinDays(rows, c, 7, now));
      expect(s[c].pastContracts).toBe(awardsOnRecord(rows, c).contracts);
      expect(s[c].awardedValue).toBe(awardsOnRecord(rows, c).value);
    }
  });
});
