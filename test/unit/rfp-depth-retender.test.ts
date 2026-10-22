import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn, revalidatePath: vi.fn(), revalidateTag: vi.fn() }));

import { RETENDER_MAX_YEARS, distinctiveWords, findRetender, retenderView, sameBuyer, titleMatch, type RetenderListing } from "@/lib/rfp-detail/retender";
import type { BenchmarkAward } from "@/lib/data/price-benchmarks";

/**
 * "Looks like a re-tender": a strong match only. A wrong "this renews X" is
 * worse than silence, so these tests are mostly about what must NOT match.
 */
const TODAY = "2026-10-22";

let n = 0;
function award(o: Partial<BenchmarkAward> = {}): BenchmarkAward {
  n++;
  return {
    slug: `award-${n}-tora-${n}`,
    title: "Roof replacement, Fire Station 3",
    buyer: "City of Oshawa",
    winner: "Apex Roofing Ltd",
    winnerSlug: "apex-roofing-ltd",
    amount: 412_500,
    date: "2024-09-10",
    country: "CA",
    currency: "CAD",
    province: "Ontario",
    city: "Oshawa",
    trades: ["Roofing"],
    sourceKey: "toronto-awards",
    attribution: "x",
    noticeUrl: null,
    noticeExact: false,
    ...o,
  };
}

const listing = (o: Partial<RetenderListing> = {}): RetenderListing => ({
  slug: "roof-fire-station-3-cb-1-1",
  title: "Fire Station 3 roof replacement 2026",
  categories: ["Roofing"],
  province: "Ontario",
  deadline: "2026-11-20",
  buyer: "City of Oshawa",
  country: "CA",
  ...o,
});

describe("what identifies the work in a title", () => {
  it("drops years, reference numbers, the buyer's name, the trade's words and filler", () => {
    const w = [...distinctiveWords("RFT 2026-045 City of Oshawa: Roof replacement services, Fire Station No. 3 (2025/2026)", "City of Oshawa", ["Roofing"])].sort();
    expect(w).toContain("fire");
    expect(w).toContain("station");
    expect(w).toContain("3");
    for (const gone of ["2026", "045", "city", "oshawa", "services", "rft", "of"]) expect(w).not.toContain(gone);
  });

  it("scores the same work high and different work low", () => {
    const same = titleMatch("Fire Station 3 roof replacement 2026", "Roof replacement, Fire Station 3", "City of Oshawa", ["Roofing"]);
    expect(same.shared).toBeGreaterThanOrEqual(3);
    expect(same.score).toBeGreaterThanOrEqual(0.6);
    const other = titleMatch("Fire Station 3 roof replacement", "Fire Station 5 roof replacement", "City of Oshawa", ["Roofing"]);
    expect(other.score).toBeLessThan(0.6);
  });
});

describe("the same buyer", () => {
  it("ignores 'City of' / 'Town of' / divisions, never joins two different places", () => {
    expect(sameBuyer("City of Oshawa", "Oshawa")).toBe(true);
    expect(sameBuyer("City of Toronto", "the City of Toronto (Facilities)")).toBe(true);
    expect(sameBuyer("City of Oshawa", "City of Whitby")).toBe(false);
    expect(sameBuyer("Region of Waterloo", "City of Waterloo")).toBe(false);
    expect(sameBuyer(null, "City of Oshawa")).toBe(false);
    expect(sameBuyer("City of Oshawa", "")).toBe(false);
  });
});

describe("finding the earlier contract", () => {
  it("matches the same buyer, trade, place and work", () => {
    const r = findRetender(listing(), [award()], TODAY)!;
    expect(r).not.toBeNull();
    expect(r.best.winner).toBe("Apex Roofing Ltd");
    expect(r.best.amount).toBe(412_500);
    expect(r.best.monthsBefore).toBe(26);
    expect(r.count).toBe(1);
    expect(r.cycleMonths).toBeNull();
  });

  it("is not fooled by generic titles: nothing says WHICH work", () => {
    const generic = findRetender(
      listing({ title: "Snow removal services", categories: ["Snow Removal"] }),
      [award({ title: "Snow removal services", trades: ["Snow Removal"] }), award({ title: "Snow Removal", trades: ["Snow Removal"] }), award({ title: "Snow removal and sanding services 2024-2025", trades: ["Snow Removal"] })],
      TODAY,
    );
    expect(generic).toBeNull();
    expect(findRetender(listing({ title: "Janitorial services", categories: ["Cleaning / Janitorial"] }), [award({ title: "Janitorial services", trades: ["Cleaning / Janitorial"] })], TODAY)).toBeNull();
    expect(findRetender(listing({ title: "Roof replacement", categories: ["Roofing"] }), [award({ title: "Roof replacement services" })], TODAY)).toBeNull();
  });

  it("does not match a different building, buyer, trade, province or country", () => {
    expect(findRetender(listing(), [award({ title: "Roof replacement, Fire Station 5" })], TODAY)).toBeNull();
    expect(findRetender(listing(), [award({ buyer: "City of Whitby" })], TODAY)).toBeNull();
    expect(findRetender(listing(), [award({ trades: ["HVAC"] })], TODAY)).toBeNull();
    expect(findRetender(listing(), [award({ province: "Alberta" })], TODAY)).toBeNull();
    expect(findRetender(listing(), [award({ country: "US", currency: "USD" })], TODAY)).toBeNull();
    expect(findRetender(listing({ buyer: null }), [award()], TODAY)).toBeNull();
    expect(findRetender(listing({ categories: [] }), [award()], TODAY)).toBeNull();
  });

  it("ignores itself, awards after the closing date, and awards older than a contract cycle", () => {
    const a = award();
    expect(findRetender(listing({ slug: a.slug }), [a], TODAY)).toBeNull();
    expect(findRetender(listing(), [award({ date: "2026-12-01" })], TODAY)).toBeNull();
    const old = `${Number(TODAY.slice(0, 4)) - RETENDER_MAX_YEARS - 1}-06-01`;
    expect(findRetender(listing(), [award({ date: old })], TODAY)).toBeNull();
  });

  it("picks the closest title, then the newest, and reads the cycle from several awards", () => {
    const r = findRetender(
      listing(),
      [
        award({ date: "2020-09-10", winner: "Old Co" }),
        award({ date: "2022-09-10", winner: "Mid Co" }),
        award({ date: "2024-09-10", winner: "Newest Co" }),
        award({ title: "Roof replacement, Fire Station 3 and Fire Station 4", date: "2025-01-01", winner: "Looser Co" }),
      ],
      TODAY,
    )!;
    expect(r.best.winner).toBe("Newest Co");
    expect(r.count).toBeGreaterThanOrEqual(3);
    expect(r.cycleMonths).toBe(24);
  });
});

describe("what each viewer gets", () => {
  it("Trade Pro gets the winner, amount and date; everyone else gets only that a similar contract exists", () => {
    const r = findRetender(listing(), [award()], TODAY)!;
    const pro = retenderView(r, true);
    expect(pro.pro).toBe(true);
    expect(JSON.stringify(pro)).toContain("Apex Roofing Ltd");
    const free = retenderView(r, false);
    expect(free).toEqual({ pro: false, data: { count: 1 } });
    const text = JSON.stringify(free);
    for (const secret of ["Apex", "412500", "2024-09-10", "award-", "apex-roofing"]) expect(text).not.toContain(secret);
  });
});
