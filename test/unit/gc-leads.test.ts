import { describe, expect, it } from "vitest";
import { gcLeadsFromRfps, isGiantOrPublicBody, parseAwardBuyer } from "@/lib/gc/leads";
import type { RfpListItem } from "@/lib/data/types";

function award(slug: string, winner: string, value: string, date: string, categories = ["General Contracting"]): RfpListItem {
  return {
    slug,
    title: `Contract ${slug}`,
    summary: `Awarded ${date} to ${winner} (Halifax) — ${value}. Past public contract issued by Public Services and Procurement Canada.`,
    categories,
    regionName: "Nova Scotia",
    propertyTypeName: null,
    city: null,
    province: "Nova Scotia",
    deadline: date,
    isDemo: false,
    photoUrls: [],
    status: "closed",
    sourceType: "public_source",
  };
}

const today = "2026-09-24";

describe("GC leads", () => {
  it("reads the buyer from either award summary style", () => {
    expect(parseAwardBuyer("Awarded X to Y — $1 CAD. Past public contract issued by Defence Construction Canada.")).toBe(
      "Defence Construction Canada",
    );
    expect(parseAwardBuyer("Awarded X to Y — $1 CAD. Past public contract from the City of Toronto (Parks).")).toBe(
      "the City of Toronto (Parks)",
    );
    expect(parseAwardBuyer("Public tender from somewhere")).toBeNull();
    expect(parseAwardBuyer(null)).toBeNull();
  });

  it("leaves out national firms and public bodies", () => {
    expect(isGiantOrPublicBody("PCL Constructors Eastern Inc.")).toBe(true);
    expect(isGiantOrPublicBody("EllisDon Corporation")).toBe(true);
    expect(isGiantOrPublicBody("Black & McDonald Limited")).toBe(true);
    expect(isGiantOrPublicBody("City of Halifax")).toBe(true);
    expect(isGiantOrPublicBody("Dexter Construction Company Ltd")).toBe(false);
    expect(isGiantOrPublicBody("Metro Roofing Ltd.")).toBe(false);
    expect(isGiantOrPublicBody("Rogers Roofing Inc.")).toBe(false);
  });

  it("groups the last 30 days of awards by winner, newest first", () => {
    const leads = gcLeadsFromRfps(
      [
        award("a-cba-1", "Dexter Construction Company Ltd", "$500,000 CAD", "2026-09-20"),
        award("b-cba-2", "DEXTER CONSTRUCTION CO. LTD.", "$250,000 CAD", "2026-09-01"),
        award("c-cba-3", "Metro Roofing Ltd.", "$90,000 CAD", "2026-09-22", ["Roofing"]),
        award("old-cba-4", "Metro Roofing Ltd.", "$10,000 CAD", "2026-07-01", ["Roofing"]), // too old
        award("d-cba-5", "PCL Constructors Eastern Inc.", "$9,000,000 CAD", "2026-09-21"), // giant
        award("e-cba-6", "Alain Roy", "$5,000 CAD", "2026-09-21"), // a person
        { ...award("f-tor-7", "Someone Ltd", "$1 CAD", "2026-09-21"), status: "open" }, // open tender, not an award
      ],
      { today },
    );
    expect(leads.map((l) => l.name)).toEqual(["Metro Roofing Ltd.", "Dexter Construction Company Ltd"]);
    const dexter = leads[1];
    expect(dexter.awards.map((a) => a.slug)).toEqual(["a-cba-1", "b-cba-2"]);
    expect(dexter.totalValue).toBe(750_000);
    expect(dexter.generalContracting).toBe(true);
    expect(dexter.awards[0].buyer).toBe("Public Services and Procurement Canada");
    expect(dexter.awards[0].noticeUrl).toBe("https://canadabuys.canada.ca/en/tender-opportunities/award-notice/1");
    expect(leads[0].generalContracting).toBe(false);
  });
});
