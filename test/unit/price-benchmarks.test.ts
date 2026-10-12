import { describe, expect, it } from "vitest";
import {
  FREE_EXAMPLES,
  MIN_RANGE_AWARDS,
  benchmarkAwards,
  benchmarkCombos,
  benchmarkCsv,
  benchmarkView,
  canonicalProvince,
  computeBenchmark,
  parseAwardValue,
  percentile,
  priceStats,
  provinceFromSlug,
  provinceSlug,
  windowStart,
  type BenchmarkAward,
} from "@/lib/data/price-benchmarks";
import type { RfpListItem } from "@/lib/data/types";

const TODAY = "2026-10-12";

/** A past public contract on the board ("-cba-" = Government of Canada award notice). */
const award = (i: number, amount: number | null, over: Partial<RfpListItem> & { winner?: string; currency?: "CAD" | "USD" } = {}): RfpListItem => {
  const { winner = `Company ${i} Construction Ltd`, currency = "CAD", ...rest } = over;
  const value = amount === null ? "value not disclosed" : `$${amount.toLocaleString("en-US")} ${currency}`;
  return {
    slug: `snow-removal-${i}-cba-w${i}`,
    title: `Snow removal ${i}`,
    summary: `Awarded March 1, 2026 to ${winner} (Ottawa) — ${value}. Past public contract issued by Buyer ${i % 2 ? "A" : "B"}.`,
    categories: ["Snow Removal"],
    regionName: "Ontario",
    propertyTypeName: null,
    city: null,
    province: "ON",
    deadline: `2026-0${(i % 9) + 1}-15`,
    isDemo: false,
    photoUrls: [],
    status: "closed",
    sourceType: "public_source",
    ...rest,
  };
};

const ontario = (amounts: (number | null)[]) => amounts.map((a, i) => award(i + 1, a));

describe("percentile math", () => {
  it("interpolates linearly between ranks (PERCENTILE.INC)", () => {
    const xs = [10, 20, 30, 40, 50];
    expect(percentile(xs, 0.25)).toBe(20);
    expect(percentile(xs, 0.5)).toBe(30);
    expect(percentile(xs, 0.75)).toBe(40);
    expect(percentile([1, 2, 3, 4], 0.25)).toBeCloseTo(1.75);
    expect(percentile([1, 2, 3, 4], 0.5)).toBeCloseTo(2.5);
    expect(percentile([7], 0.75)).toBe(7);
    expect(percentile(xs, 0)).toBe(10);
    expect(percentile(xs, 1)).toBe(50);
    expect(() => percentile([], 0.5)).toThrow();
  });

  it("summarizes unsorted values into whole dollars", () => {
    expect(priceStats([50_000, 10_000, 40_000, 20_000, 30_000, 25_001])).toEqual({
      n: 6,
      min: 10_000,
      p25: 21_250,
      median: 27_501,
      p75: 37_500,
      max: 50_000,
    });
  });
});

describe("the n ≥ 5 rule", () => {
  it("shows no range below five valued awards", () => {
    expect(MIN_RANGE_AWARDS).toBe(5);
    expect(priceStats([1000, 2000, 3000, 4000])).toBeNull();
    const b = computeBenchmark(benchmarkAwards(ontario([40_000, 60_000, 80_000, 100_000, null, null, null])), { trade: "Snow Removal", province: "Ontario" }, TODAY);
    expect(b.total).toBe(7);
    expect(b.valued).toBe(4);
    expect(b.undisclosed).toBe(3);
    expect(b.enough).toBe(false);
    expect(b.stats).toBeNull();
  });

  it("quotes the range from five valued awards", () => {
    const b = computeBenchmark(benchmarkAwards(ontario([40_000, 60_000, 80_000, 100_000, 120_000, null])), { trade: "Snow Removal", province: "Ontario" }, TODAY);
    expect(b.enough).toBe(true);
    expect(b.stats).toMatchObject({ n: 5, min: 40_000, p25: 60_000, median: 80_000, p75: 100_000, max: 120_000 });
    expect(b.undisclosed).toBe(1);
  });

  it("treats values under $1,000 as not disclosed (unit rates)", () => {
    const b = computeBenchmark(benchmarkAwards(ontario([500, 40_000, 60_000, 80_000, 100_000])), { trade: "Snow Removal", province: "Ontario" }, TODAY);
    expect(b.valued).toBe(4);
    expect(b.enough).toBe(false);
  });

  it("only counts the last 24 months", () => {
    expect(windowStart("2026-10-12")).toBe("2024-10-12");
    expect(windowStart("2026-02-28", 24)).toBe("2024-02-28");
    expect(windowStart("2026-03-31", 1)).toBe("2026-02-28");
    const rows = [...ontario([40_000, 60_000, 80_000, 100_000]), award(20, 120_000, { deadline: "2024-10-01" })];
    const b = computeBenchmark(benchmarkAwards(rows), { trade: "Snow Removal", province: "Ontario" }, TODAY);
    expect(b.valued).toBe(4);
    expect(b.enough).toBe(false);
  });

  it("flags outliers without removing them", () => {
    const b = computeBenchmark(benchmarkAwards(ontario([40_000, 50_000, 60_000, 70_000, 80_000, 9_000_000])), { trade: "Snow Removal", province: "Ontario" }, TODAY);
    expect(b.stats?.n).toBe(6);
    expect(b.stats?.max).toBe(9_000_000);
    expect(b.outliers).toBe(1);
    expect(b.awards.find((a) => a.amount === 9_000_000)?.outlier).toBe(true);
    expect(b.awards.filter((a) => a.outlier)).toHaveLength(1);
  });

  it("gives a city its own count and only a range once it has five", () => {
    const regionProvince = new Map([["Ottawa", "Ontario"], ["Ontario", "Ontario"]]);
    const rows = [
      ...[40_000, 60_000, 80_000, 100_000, 120_000].map((a, i) => award(i + 1, a, { regionName: "Ottawa", province: null })),
      award(9, 70_000),
    ];
    const all = benchmarkAwards(rows, { regionProvince });
    const b = computeBenchmark(all, { trade: "Snow Removal", province: "Ontario" }, TODAY);
    expect(b.total).toBe(6);
    expect(b.cities).toEqual([{ city: "Ottawa", total: 5, valued: 5, enough: true }]);
    const city = computeBenchmark(all, { trade: "Snow Removal", province: "Ontario", city: "Ottawa" }, TODAY);
    expect(city.valued).toBe(5);
    expect(city.stats?.median).toBe(80_000);
  });
});

describe("currency and country separation", () => {
  it("reads CAD and USD values and the winner", () => {
    expect(parseAwardValue("Awarded May 12, 2026 to Dillon Consulting Limited — $97,625 CAD. Past public contract from X.")).toEqual({ winner: "Dillon Consulting Limited", amount: 97_625, currency: "CAD" });
    expect(parseAwardValue("Awarded May 12, 2026 to Acme LLC (Austin) — $5,000 USD.")).toEqual({ winner: "Acme LLC", amount: 5000, currency: "USD" });
    expect(parseAwardValue("Awarded May 12, 2026 to Acme LLC — value not disclosed.")).toEqual({ winner: "Acme LLC", amount: null, currency: null });
  });

  it("never mixes Canadian and U.S. awards, and drops a value in the other country's currency", () => {
    const rows = [
      ...ontario([40_000, 60_000, 80_000, 100_000, 120_000]),
      ...[1_000_000, 2_000_000, 3_000_000, 4_000_000, 5_000_000].map((a, i) => award(30 + i, a, { province: "TX", regionName: "Texas", currency: "USD" })),
      award(50, 7_777_777, { currency: "USD" }), // USD on an Ontario award: left out entirely
      award(51, 6_666_666, { province: "Texas", currency: "CAD" }), // CAD on a Texas award: left out
    ];
    const all = benchmarkAwards(rows);
    expect(all.some((a) => a.amount === 7_777_777 || a.amount === 6_666_666)).toBe(false);

    const on = computeBenchmark(all, { trade: "Snow Removal", province: "Ontario" }, TODAY);
    expect(on.country).toBe("CA");
    expect(on.currency).toBe("CAD");
    expect(on.awards.every((a) => a.country === "CA" && a.currency === "CAD")).toBe(true);
    expect(on.stats?.max).toBe(120_000);

    const tx = computeBenchmark(all, { trade: "Snow Removal", province: "Texas" }, TODAY);
    expect(tx.country).toBe("US");
    expect(tx.currency).toBe("USD");
    expect(tx.awards.every((a) => a.country === "US" && a.currency === "USD")).toBe(true);
    expect(tx.stats?.min).toBe(1_000_000);

    const combos = benchmarkCombos(all, TODAY);
    expect(combos.map((c) => [c.province, c.country, c.currency])).toEqual([
      ["Ontario", "CA", "CAD"],
      ["Texas", "US", "USD"],
    ]);
  });

  it("never lets a hand-built award from the other country into a benchmark", () => {
    const base = benchmarkAwards(ontario([40_000, 60_000, 80_000, 100_000]))[0];
    const smuggled: BenchmarkAward = { ...base, slug: "x", country: "US", currency: "USD", amount: 1_000_000 };
    const b = computeBenchmark([...benchmarkAwards(ontario([40_000, 60_000, 80_000, 100_000])), smuggled], { trade: "Snow Removal", province: "Ontario" }, TODAY);
    expect(b.valued).toBe(4);
    expect(b.enough).toBe(false);
  });

  it("maps provinces and states to URL slugs and back", () => {
    expect(canonicalProvince("ON")).toBe("Ontario");
    expect(canonicalProvince("Québec")).toBe("Quebec");
    expect(canonicalProvince("tx")).toBe("Texas");
    expect(canonicalProvince("Canada")).toBeNull();
    expect(provinceSlug("British Columbia")).toBe("british-columbia");
    expect(provinceSlug("Texas")).toBe("us-texas");
    expect(provinceFromSlug("newfoundland-and-labrador")).toBe("Newfoundland and Labrador");
    expect(provinceFromSlug("us-new-york")).toBe("New York");
    expect(provinceFromSlug("texas")).toBeNull(); // U.S. states always carry the us- prefix
    expect(provinceFromSlug("narnia")).toBeNull();
  });

  it("skips awards with no province (federal notices with no place of work)", () => {
    const all = benchmarkAwards([award(1, 50_000, { province: null, regionName: "Canada" })]);
    expect(all).toHaveLength(0);
  });
});

describe("gating", () => {
  const rows = [41_111, 62_222, 83_333, 104_444, 125_555, 146_666, null].map((a, i) => award(i + 1, a));
  const b = computeBenchmark(benchmarkAwards(rows), { trade: "Snow Removal", province: "Ontario" }, TODAY);

  it("gives Trade Pro the range, percentiles, winners and every award", () => {
    const v = benchmarkView(b, true);
    expect(v.pro).toBe(true);
    if (!v.pro) return;
    expect(v.data.stats).not.toBeNull();
    expect(v.data.awards).toHaveLength(7);
    expect(v.data.topWinners.length).toBeGreaterThan(0);
  });

  it("gives free viewers counts, that a range exists and two example awards, nothing else", () => {
    const v = benchmarkView(b, false);
    expect(v.pro).toBe(false);
    if (v.pro) return;
    expect(v.data.enough).toBe(true);
    expect(v.data.valued).toBe(6);
    expect(v.data.total).toBe(7);
    expect(v.data.examples.length).toBeLessThanOrEqual(FREE_EXAMPLES);
    expect(v.data.examples).toHaveLength(2);
    expect(v.data.topBuyers.every((x) => !("value" in x))).toBe(true);
    const json = JSON.stringify(v);
    for (const key of ["stats", "p25", "p75", "median", "topWinners", "outlier"]) expect(json).not.toContain(`"${key}"`);
    const s = b.stats!;
    const exampleAmounts = new Set(v.data.examples.map((a) => a.amount));
    for (const x of [s.p25, s.median, s.p75, s.min, s.max].filter((x) => !exampleAmounts.has(x))) expect(json).not.toContain(String(x));
  });

  it("exports every award as CSV with currency and outlier columns", () => {
    const csv = benchmarkCsv(b, "https://pmrfp.com");
    const lines = csv.replace(/^﻿/, "").trim().split("\n");
    expect(lines[0]).toContain("value_cad,currency,outlier");
    expect(lines).toHaveLength(8);
    expect(csv).toContain("https://pmrfp.com/rfps/snow-removal-1-cba-w1");
  });
});

describe("names", () => {
  it("counts individuals but never names them", () => {
    const rows = [...ontario([40_000, 60_000, 80_000, 100_000]), award(9, 120_000, { winner: "Alain Roy" })];
    const b = computeBenchmark(benchmarkAwards(rows), { trade: "Snow Removal", province: "Ontario" }, TODAY);
    expect(b.valued).toBe(5);
    expect(b.awards.find((a) => a.amount === 120_000)?.winner).toBeNull();
    expect(b.topWinners.map((w) => w.name)).not.toContain("Alain Roy");
  });
});
