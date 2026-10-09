import { describe, expect, it } from "vitest";
import {
  awardForTender,
  classifyClosedTender,
  closedTenderToRfpInsert,
  fiscalYearsInWindow,
  indexAwards,
  latestAmendments,
  parseClosedAward,
  tenderFileUrl,
  type ClosedRow,
} from "./canadabuys-closed";
import { classifyConstructionTitle, classifyTender } from "./canadabuys";
import { parseAward } from "@/lib/data/fomo";
import { buyerFromSummary } from "@/lib/seo/rfp-meta";

const TODAY = "2026-10-09";

// Shaped like real rows of 2025-2026-TenderNotice-AvisAppelOffres.csv.
const tender = (extra: Partial<ClosedRow> = {}): ClosedRow => ({
  "title-titre-eng": "Hot Water Tank Replacements HSC Borden",
  "referenceNumber-numeroReference": "cb-161-43955128",
  "amendmentNumber-numeroModification": "000",
  "solicitationNumber-numeroSollicitation": "W0137-26-0042",
  "publicationDate-datePublication": "2026-07-14",
  "tenderClosingDate-appelOffresDateCloture": "2026-08-20T14:00:00",
  "tenderStatus-appelOffresStatut-eng": "Expired",
  "procurementCategory-categorieApprovisionnement": "*CNST",
  "noticeType-avisType-eng": "Request for Proposal",
  "contractingEntityName-nomEntitContractante-eng": "Department of National Defence (DND)",
  "regionsOfDelivery-regionsLivraison-eng": "*Ontario (except NCR)",
  "tenderDescription-descriptionAppelOffres-eng": "Replace domestic hot water tanks in building A-142.\n\nSite visit optional.",
  ...extra,
});

const award = (extra: Partial<ClosedRow> = {}): ClosedRow => ({
  "referenceNumber-numeroReference": "cb-161-43955128",
  "amendmentNumber-numeroModification": "000",
  "solicitationNumber-numeroSollicitation": "W0137-26-0042",
  "contractingEntityName-nomEntitContractante-eng": "Department of National Defence (DND)",
  "supplierLegalName-nomLegalFournisseur-eng": "Crystal Mechanical Inc",
  "supplierAddressCity-fournisseurAdresseVille-eng": "Barrie",
  "contractAwardDate-dateAttributionContrat": "2026-09-29",
  "contractAmount-montantContrat": "84500.00",
  "totalContractValue-valeurTotaleContrat": "0.00",
  "contractCurrency-contratMonnaie": "CAD",
  ...extra,
});

describe("CanadaBuys closed archive — files and window", () => {
  it("reads every fiscal-year file the 18-month window touches", () => {
    expect(fiscalYearsInWindow("2026-10-09")).toEqual([2025, 2026]);
    // April 2027: the window reaches back into FY 2025-26.
    expect(fiscalYearsInWindow("2027-04-15")).toEqual([2025, 2026, 2027]);
    expect(tenderFileUrl(2025)).toBe("https://canadabuys.canada.ca/opendata/pub/2025-2026-TenderNotice-AvisAppelOffres.csv");
  });

  it("keeps the newest amendment of each notice", () => {
    const rows = latestAmendments([
      tender({ "amendmentNumber-numeroModification": "001", "tenderClosingDate-appelOffresDateCloture": "2026-08-10" }),
      tender({ "amendmentNumber-numeroModification": "003" }),
      tender({ "amendmentNumber-numeroModification": "002", "tenderClosingDate-appelOffresDateCloture": "2026-08-15" }),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]["amendmentNumber-numeroModification"]).toBe("003");
  });
});

describe("CanadaBuys closed archive — classification", () => {
  it("keeps real expired building-trade tenders", () => {
    expect(classifyClosedTender(tender(), TODAY)).toEqual(["plumbing"]);
    expect(classifyClosedTender(tender({ "title-titre-eng": "SNOW REMOVAL SERVICES", "referenceNumber-numeroReference": "cb-213-4610028", "procurementCategory-categorieApprovisionnement": "*SRV" }), TODAY)).toEqual(["snow-removal"]);
    expect(classifyClosedTender(tender({ "title-titre-eng": "EC645-261679 – Janitorial Services - St. Andrews Biological Station", "referenceNumber-numeroReference": "WS5725524894-Doc5725524961" }), TODAY)).toEqual(["cleaning-janitorial"]);
  });

  it("never imports cancelled notices, RFIs or award notices", () => {
    expect(classifyClosedTender(tender({ "tenderStatus-appelOffresStatut-eng": "Cancelled" }), TODAY)).toEqual([]);
    expect(classifyClosedTender(tender({ "noticeType-avisType-eng": "Request for Information" }), TODAY)).toEqual([]);
    expect(classifyClosedTender(tender({ "noticeType-avisType-eng": "Advance Contract Award Notice" }), TODAY)).toEqual([]);
    expect(classifyClosedTender(tender({ "procurementCategory-categorieApprovisionnement": "*GD" }), TODAY)).toEqual([]);
  });

  it("only takes tenders that closed between 3 days and 18 months ago", () => {
    expect(classifyClosedTender(tender({ "tenderClosingDate-appelOffresDateCloture": "2026-10-08T14:00:00" }), TODAY)).toEqual([]);
    expect(classifyClosedTender(tender({ "tenderClosingDate-appelOffresDateCloture": "2026-11-01" }), TODAY)).toEqual([]);
    expect(classifyClosedTender(tender({ "tenderClosingDate-appelOffresDateCloture": "2025-01-15" }), TODAY)).toEqual([]);
    expect(classifyClosedTender(tender({ "tenderClosingDate-appelOffresDateCloture": "" }), TODAY)).toEqual([]);
    expect(classifyClosedTender(tender({ "tenderClosingDate-appelOffresDateCloture": "2026-10-05T14:00:00" }), TODAY)).toEqual(["plumbing"]);
  });

  it("skips references whose CanadaBuys page isn't at the verified URL", () => {
    expect(classifyClosedTender(tender({ "referenceNumber-numeroReference": "SSC-26-00033990:T" }), TODAY)).toEqual([]);
  });

  it("drops design, laundry, civil and foreign work", () => {
    expect(classifyClosedTender(tender({ "title-titre-eng": "RFP - Roof Replacement Design Services - KRDC B49" }), TODAY)).toEqual([]);
    expect(classifyClosedTender(tender({ "title-titre-eng": "Provision of Laundry and dry-cleaning services" }), TODAY)).toEqual([]);
    expect(classifyClosedTender(tender({ "title-titre-eng": "Culvert replacement and road resurfacing" }), TODAY)).toEqual([]);
    expect(classifyClosedTender(tender({ "regionsOfDelivery-regionsLivraison-eng": "*Germany" }), TODAY)).toEqual([]);
  });
});

describe("CanadaBuys closed archive — award link", () => {
  it("matches the award for the same solicitation and buyer", () => {
    const awards = indexAwards([award()], TODAY);
    const a = awardForTender(tender(), awards);
    expect(a).toMatchObject({ ref: "cb-161-43955128", supplier: "Crystal Mechanical Inc", value: "$84,500 CAD", date: "2026-09-29" });
  });

  it("does not link amendments, foreign currency, other buyers, or several winners", () => {
    expect(awardForTender(tender(), indexAwards([award({ "amendmentNumber-numeroModification": "001" })], TODAY))).toBeNull();
    expect(awardForTender(tender(), indexAwards([award({ "contractCurrency-contratMonnaie": "USD" })], TODAY))).toBeNull();
    expect(awardForTender(tender(), indexAwards([award({ "contractingEntityName-nomEntitContractante-eng": "Parks Canada Agency (PC)" })], TODAY))).toBeNull();
    const two = indexAwards([award(), award({ "referenceNumber-numeroReference": "cb-161-99999999", "supplierLegalName-nomLegalFournisseur-eng": "Other Co" })], TODAY);
    expect(awardForTender(tender(), two)).toBeNull();
  });

  it("ignores an award dated before the tender closed", () => {
    const early = indexAwards([award({ "contractAwardDate-dateAttributionContrat": "2026-07-01" })], TODAY);
    expect(awardForTender(tender(), early)).toBeNull();
  });
});

describe("CanadaBuys closed archive — listing", () => {
  it("lists it as closed on its real date, with the official notice link", () => {
    const row = closedTenderToRfpInsert(tender(), null)!;
    expect(row.deadline).toBe("2026-08-20");
    expect(row.deadline! < TODAY).toBe(true);
    expect(row.slug).toMatch(/-cbc-cb-161-43955128$/);
    expect(row.source_url).toBe("https://canadabuys.canada.ca/en/tender-opportunities/tender-notice/cb-161-43955128");
    expect(row.published_at).toBe("2026-07-14T00:00:00Z");
    expect(row.summary.startsWith("Public tender from Department of National Defence (DND), closed August 20, 2026.")).toBe(true);
    expect(buyerFromSummary(row.summary)).toBe("Department of National Defence");
    expect(parseClosedAward(row.summary)).toBeNull();
  });

  it("carries the real award without counting as a separate win", () => {
    const a = awardForTender(tender(), indexAwards([award()], TODAY));
    const row = closedTenderToRfpInsert(tender(), a)!;
    expect(row.summary).toContain("Contract awarded September 29, 2026 to Crystal Mechanical Inc (Barrie) — $84,500 CAD (CanadaBuys award cb-161-43955128).");
    // The award notice is already its own listing; win counters must not see this one.
    expect(parseAward(row.summary).winner).toBeNull();
    expect(parseClosedAward(row.summary)).toEqual({
      date: "September 29, 2026",
      winner: "Crystal Mechanical Inc",
      value: "$84,500 CAD",
      ref: "cb-161-43955128",
    });
  });
});

describe("CanadaBuys open feed — construction titles without a trade keyword", () => {
  const open = (title: string, extra: Partial<ClosedRow> = {}): ClosedRow => ({
    "title-titre-eng": title,
    "procurementCategory-categorieApprovisionnement": "*CNST",
    "noticeType-avisType-eng": "Invitation to Qualify",
    "tenderClosingDate-appelOffresDateCloture": "2027-03-31T14:00:00",
    "regionsOfDelivery-regionsLivraison-eng": "*Nova Scotia",
    ...extra,
  });

  it("picks up DCC contractor source lists and building projects (real titles, 2026-10-09)", () => {
    expect(classifyTender(open("Open Construction Source List for CFB Halifax"), TODAY)).toEqual(["general-contracting"]);
    expect(classifyTender(open("Mechanical Contractors Source List for Quick Response Tenders – CFB Edmonton, AB"), TODAY)).toEqual(["hvac", "plumbing", "general-contracting"]);
    expect(classifyTender(open("Liri Valley Apartments and Rowhouses"), TODAY)).toEqual(["general-contracting"]);
    expect(classifyTender(open("EB144-270878 - ITT - AHU Replacement at BIO"), TODAY)).toEqual(["hvac"]);
    expect(classifyTender(open("Step 2 for 2 Service Battalion HQ Administration Company Building"), TODAY)).toEqual(["general-contracting"]);
  });

  it("still skips advance notices, RFIs, marine and civil work", () => {
    for (const t of [
      "APN - 2026/2027 BASE PROGRAM CFB ESQUIMALT, BC",
      "APN_UPGRADE ACCOMODATIONS BUILDINGS A-147 & A-149, CFB BORDEN, ON",
      "E6HAL-250005-RFI - Indigenous Business Capacity for Construction Projects",
      "Ladner Dredging and Harbour Repairs, Ladner, BC",
      "Civil Contractors Source List for Quick Response Tenders, 15 Wing Moose Jaw, SK",
      "Walpole Island Swing Bridge Health and Safety Repairs",
      "EB144-270738 - Battery Charging Cooling Design",
      "Building of the Snowflake Kingdom",
    ]) {
      expect(classifyConstructionTitle(t)).toEqual([]);
    }
  });

  it("applies only to the construction category", () => {
    expect(classifyTender(open("Open Construction Source List for CFB Halifax", { "procurementCategory-categorieApprovisionnement": "*SRV" }), TODAY)).toEqual([]);
  });
});
