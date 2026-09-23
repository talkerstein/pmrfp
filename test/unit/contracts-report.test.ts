import { describe, expect, it } from "vitest";
import { buildContractsReport, reportContracts } from "@/lib/data/contracts-report";
import type { RfpListItem } from "@/lib/data/types";

let n = 0;
function award(winner: string, amount: number | null, suffix = "cba", date = "2026-06-01"): RfpListItem {
  n++;
  return {
    slug: `contract-${n}-${suffix}-${n}`,
    title: `Contract ${n}`,
    summary: `Awarded June 1, 2026 to ${winner} — ${amount ? `$${amount.toLocaleString("en-CA")} CAD` : "value not disclosed"}. Past public contract.`,
    categories: ["Roofing"],
    regionName: null,
    propertyTypeName: null,
    city: null,
    province: null,
    deadline: date,
    isDemo: false,
    photoUrls: [],
    status: "closed",
    sourceType: "public_source",
  };
}

describe("public building contracts report", () => {
  const rfps = [
    award("Dexter Construction Company Limited", 500_000),
    award("DEXTER CONSTRUCTION CO. LTD.", 300_000, "nsa"),
    award("Metro Roofing Ltd.", 100_000, "qca"),
    award("Alain Roy", 50_000, "tora"), // an individual: counted, never named
    award("Small Paving Inc.", null),
    { ...award("Ignored", 1), sourceType: null }, // not a past public contract
  ];
  const r = buildContractsReport(rfps);

  it("counts contracts, published values and grouped winners", () => {
    expect(r.contracts).toBe(5);
    expect(r.withValue).toBe(4);
    expect(r.totalValue).toBe(950_000);
    expect(r.winners).toBe(4); // Dexter's two spellings are one company
    expect(r.singleWinners).toBe(3);
    expect(r.repeatWinners).toBe(1);
    expect(r.multiJurisdiction).toBe(1);
  });

  it("measures concentration", () => {
    expect(r.top5pct.count).toBe(1);
    expect(r.top5pct.share).toBe(84.2); // 800k of 950k
    expect(r.repeatShare).toBe(84.2);
  });

  it("never names individuals", () => {
    const named = [...r.topByValue, ...r.topByCount].map((w) => w.name);
    expect(named).not.toContain("Alain Roy");
    expect(reportContracts(rfps).find((c) => c.winner === "Alain Roy")?.publicWinner).toBeNull();
    expect(r.topByValue[0]).toMatchObject({ name: "Dexter Construction Company Limited", contracts: 2, value: 800_000 });
    expect(r.topByValue[0].jurisdictions).toEqual(["Federal (CanadaBuys)", "Nova Scotia"]);
  });

  it("breaks down by jurisdiction", () => {
    expect(r.jurisdictions.map((j) => j.jurisdiction)).toEqual(["Federal (CanadaBuys)", "Nova Scotia", "Quebec (SEAO)", "City of Toronto"]);
    expect(r.everywhere).toEqual([]);
  });
});
