import { describe, expect, it } from "vitest";
import { parseCsv } from "@/lib/tenders/csv";
import { classifyTender, regionForTender, toRfpInsert, type TenderRow } from "@/lib/tenders/canadabuys";

const TODAY = "2026-09-22";

function row(over: Partial<Record<string, string>>): TenderRow {
  return {
    "title-titre-eng": "Test",
    "referenceNumber-numeroReference": "cb-123-45678",
    "tenderClosingDate-appelOffresDateCloture": "2026-10-15T14:00:00",
    "procurementCategory-categorieApprovisionnement": "*SRV",
    "noticeType-avisType-eng": "Request for Proposal",
    "gsinDescription-nibsDescription-eng": "",
    "unspscDescription-eng": "",
    "regionsOfDelivery-regionsLivraison-eng": "*Ontario (except NCR)",
    "contractingEntityName-nomEntitContractante-eng": "Public Works and Government Services Canada",
    "noticeURL-URLavis-eng": "https://canadabuys.canada.ca/en/tender-opportunities/tender-notice/cb-123-45678",
    "tenderDescription-descriptionAppelOffres-eng": "Provide the services described.",
    ...over,
  } as TenderRow;
}

describe("parseCsv", () => {
  it("handles BOM, quoted commas, escaped quotes and newlines in fields", () => {
    const rows = parseCsv('﻿"a","b"\r\n"x, y","say ""hi""\nthere"\r\n');
    expect(rows).toEqual([{ a: "x, y", b: 'say "hi"\nthere' }]);
  });
});

describe("classifyTender", () => {
  it("maps real trade work to PMRFP categories", () => {
    expect(classifyTender(row({ "title-titre-eng": "Snow removal and de-icing services for AAFC's Kentville RDC" }), TODAY)).toEqual(["snow-removal"]);
    expect(classifyTender(row({ "title-titre-eng": "Furnace Replacements (HSC) Borden" }), TODAY)).toEqual(["hvac"]);
    expect(classifyTender(row({ "title-titre-eng": "EJ196-261312 - Maintenance Services Fire Protection and Life Safety Systems - Block 3" }), TODAY)).toContain("fire-safety");
    expect(classifyTender(row({ "title-titre-eng": "CFHA - HSC Trenton - Kitchen and Bathroom Renovations Services" }), TODAY)).toEqual(["general-contracting"]);
  });

  it("does not read 'Defence' as fencing", () => {
    expect(classifyTender(row({ "title-titre-eng": "Production Digital Press for the Department of National Defence" }), TODAY)).toEqual([]);
  });

  it("skips goods, non-trade services, closed and foreign tenders", () => {
    expect(classifyTender(row({ "title-titre-eng": "Uninterruptible Power Supply (UPS) Equipment", "procurementCategory-categorieApprovisionnement": "*GD" }), TODAY)).toEqual([]);
    expect(classifyTender(row({ "title-titre-eng": "Cybersecurity services" }), TODAY)).toEqual([]);
    expect(classifyTender(row({ "title-titre-eng": "Architectural and Engineering (A&E) Services for Building Fit-Up" }), TODAY)).toEqual([]);
    expect(classifyTender(row({ "title-titre-eng": "Janitorial services", "tenderClosingDate-appelOffresDateCloture": "2026-09-01" }), TODAY)).toEqual([]);
    expect(classifyTender(row({ "title-titre-eng": "Cleaning Services for the Consulate of Canada to Germany", "regionsOfDelivery-regionsLivraison-eng": "*Germany" }), TODAY)).toEqual([]);
    expect(classifyTender(row({ "title-titre-eng": "Janitorial services", "noticeType-avisType-eng": "Advance Contract Award Notice" }), TODAY)).toEqual([]);
  });
});

describe("regionForTender", () => {
  it("prefers a PMRFP city, then province, then national", () => {
    expect(regionForTender(row({ "regionsOfDelivery-regionsLivraison-eng": "*Edmonton" })).regionSlug).toBe("edmonton");
    expect(regionForTender(row({ "regionsOfDelivery-regionsLivraison-eng": "*National Capital Region (NCR)" })).regionSlug).toBe("ottawa");
    expect(regionForTender(row({ "regionsOfDelivery-regionsLivraison-eng": "*Ontario (except NCR)" })).regionSlug).toBe("ontario");
    expect(regionForTender(row({ "regionsOfDelivery-regionsLivraison-eng": "*Nova Scotia" }))).toEqual({ regionSlug: "nova-scotia", province: "Nova Scotia" });
    expect(regionForTender(row({ "regionsOfDelivery-regionsLivraison-eng": "*British Columbia" })).regionSlug).toBe("british-columbia");
    expect(regionForTender(row({ "regionsOfDelivery-regionsLivraison-eng": "*Newfoundland and Labrador" })).regionSlug).toBe("newfoundland-and-labrador");
    expect(regionForTender(row({ "regionsOfDelivery-regionsLivraison-eng": "*Canada\n*Ontario\n*British Columbia" })).regionSlug).toBe("canada");
  });
});

describe("toRfpInsert", () => {
  it("builds an honest, attributed public-source row", () => {
    const out = toRfpInsert(row({ "title-titre-eng": "Furnace Replacements (HSC) Borden" }), TODAY)!;
    expect(out.source_type).toBe("public_source");
    expect(out.source_url).toContain("canadabuys.canada.ca");
    expect(out.source_notes).toContain("Open Government Licence – Canada");
    expect(out.deadline).toBe("2026-10-15");
    expect(out.slug).toBe("furnace-replacements-hsc-borden-cb-cb-123-45678");
  });

  it("labels far-future supply arrangements as ongoing instead of showing year 2076", () => {
    const out = toRfpInsert(row({ "tenderClosingDate-appelOffresDateCloture": "2076-12-31T14:00:00" }), TODAY)!;
    expect(out.deadline).toBeNull();
    expect(out.summary).toMatch(/^Ongoing qualification list/);
  });
});
