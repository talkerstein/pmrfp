import { describe, expect, it } from "vitest";
import type { RfpListItem } from "@/lib/data/types";
import { buildMonthlyReport, buyerFromSummary, monthCsv, monthlyAwards, pctChange, prevMonth, reportMonths } from "./monthly-winners";

let n = 0;
function award(date: string, winner: string, amount: number | null, opts: Partial<RfpListItem> & { buyer?: string } = {}): RfpListItem {
  n++;
  const value = amount ? `$${amount.toLocaleString("en-CA")} CAD` : "value not disclosed";
  return {
    slug: `job-${n}-cba-x${n}`,
    title: `Job ${n}`,
    summary: `Awarded ${date} to ${winner} — ${value}. Past public contract issued by ${opts.buyer ?? "Public Works Canada"}.`,
    categories: ["Roofing"],
    regionName: null,
    propertyTypeName: null,
    city: null,
    province: "Ontario",
    deadline: date,
    isDemo: false,
    photoUrls: [],
    status: "closed",
    sourceType: "public_source",
    ...opts,
  };
}

describe("monthly winners report", () => {
  it("reads the buyer from award summaries", () => {
    expect(buyerFromSummary("Awarded … — $1 CAD. Past public contract issued by Defence Construction Canada.")).toBe("Defence Construction Canada");
    expect(buyerFromSummary("Awarded … Past public contract from the City of Toronto (Transportation Services).")).toBe(
      "the City of Toronto (Transportation Services)",
    );
    expect(buyerFromSummary(null)).toBeNull();
  });

  it("files awards by award-date month and drops untraded / open rows", () => {
    const rfps = [
      award("2026-09-01", "Dexter Construction Ltd.", 100),
      award("2026-09-30", "Dexter Construction Ltd.", 200),
      award("2026-10-01", "Metro Roofing Inc", 50),
      award("2026-09-15", "Other Co Ltd", 10, { categories: [] }), // no property trade
      { ...award("2026-09-15", "Open Co Ltd", 10), slug: "open-job-tor-1" }, // an open tender, not an award
    ];
    const awards = monthlyAwards(rfps);
    expect(awards.map((a) => a.month)).toEqual(["2026-09", "2026-09", "2026-10"]);
    expect(awards[0].buyer).toBe("Public Works Canada");
    expect(awards[0].country).toBe("CA");
  });

  it("only publishes complete months with enough awards", () => {
    const rfps = [
      ...Array.from({ length: 10 }, (_, i) => award(`2026-08-${String(i + 1).padStart(2, "0")}`, `Firm ${i} Ltd`, 1000)),
      ...Array.from({ length: 9 }, (_, i) => award(`2026-07-${String(i + 1).padStart(2, "0")}`, `Firm ${i} Ltd`, 1000)),
      ...Array.from({ length: 12 }, (_, i) => award(`2026-10-${String(i + 1).padStart(2, "0")}`, `Firm ${i} Ltd`, 1000)),
    ];
    const months = reportMonths(monthlyAwards(rfps), "2026-10-20");
    expect(months).toEqual([{ month: "2026-08", awards: 10 }]); // July too thin, October not over
    expect(reportMonths(monthlyAwards(rfps), "2026-11-01").map((m) => m.month)).toEqual(["2026-10", "2026-08"]);
  });

  it("aggregates totals, rankings and month-over-month change", () => {
    const rfps = [
      award("2026-09-02", "Dexter Construction Ltd.", 500_000, { buyer: "Buyer A" }),
      award("2026-09-03", "DEXTER CONSTRUCTION LTD", 100_000, { buyer: "Buyer A", categories: ["Roofing", "HVAC"] }),
      award("2026-09-04", "Metro Roofing Inc", 300_000, { buyer: "Buyer B", province: "Quebec" }),
      award("2026-09-05", "Metro Roofing Inc", null, { buyer: "Buyer B" }),
      award("2026-09-06", "Metro Roofing Inc", 50_000, { buyer: "Buyer C" }),
      award("2026-09-07", "Alain Roy", 75_000, { buyer: "Buyer C" }), // individual: counted, not named
      award("2026-08-10", "Dexter Construction Ltd.", 400_000),
      award("2026-08-11", "Metro Roofing Inc", 100_000),
    ];
    const r = buildMonthlyReport(monthlyAwards(rfps), "2026-09");
    expect(r.totals).toEqual({ awards: 6, withValue: 5, value: 1_025_000, winners: 3 });
    expect(r.previous).toMatchObject({ month: "2026-08", awards: 2, value: 500_000 });
    expect(r.change).toEqual({ awards: 200, value: 105 });
    expect(r.topByValue.map((w) => [w.name, w.awards, w.value])).toEqual([
      ["Dexter Construction Ltd.", 2, 600_000],
      ["Metro Roofing Inc", 3, 350_000],
    ]);
    expect(r.topByCount[0].name).toBe("Metro Roofing Inc");
    expect(r.topByValue.some((w) => w.name.includes("Roy"))).toBe(false);
    expect(r.byRegion.map((x) => [x.name, x.awards])).toEqual([["Ontario", 5], ["Quebec", 1]]);
    expect(r.byTrade.find((x) => x.name === "HVAC")).toMatchObject({ awards: 1, value: 100_000 });
    expect(r.byTrade.find((x) => x.name === "Roofing")).toMatchObject({ awards: 6, value: 1_025_000 });
    expect(r.topBuyers[0]).toMatchObject({ name: "Buyer A", awards: 2, value: 600_000 });
    expect(r.largest.map((a) => a.amount)).toEqual([500_000, 300_000, 100_000, 75_000, 50_000]);
    expect(r.largest[3].winner).toBeNull();
    expect(r.period).toEqual({ from: "2026-09-02", to: "2026-09-07" });

    const csv = monthCsv(r, "https://pmrfp.com");
    const lines = csv.trim().split("\n");
    expect(lines).toHaveLength(7);
    expect(lines[0]).toContain("award_date,contract,winner,value_cad");
    expect(csv).toContain("Individual (not named)");
  });

  it("handles month arithmetic and empty comparisons", () => {
    expect(prevMonth("2026-01")).toBe("2025-12");
    expect(prevMonth("2026-10")).toBe("2026-09");
    expect(pctChange(10, 0)).toBeNull();
    expect(pctChange(5, 10)).toBe(-50);
  });
});
