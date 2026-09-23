import { describe, expect, it } from "vitest";
import { awardToRfpInsert, awardsUrl, classifyAward, type AwardRow } from "@/lib/tenders/awards";
import { publicTenderSource } from "@/lib/tenders/sources";

const TODAY = "2026-09-23";
const row = (over: Partial<Record<string, string>> = {}): AwardRow =>
  ({
    "title-titre-eng": "Multi Year Overhead Door Inspections and Maintenance, Banff National Park",
    "referenceNumber-numeroReference": "MX-444028039551",
    "contractNumber-numeroContrat": "C-1",
    "amendmentNumber-numeroModification": "000",
    "contractAwardDate-dateAttributionContrat": "2026-08-12",
    "contractAmount-montantContrat": "0.00",
    "totalContractValue-valeurTotaleContrat": "84500.00",
    "contractCurrency-contratMonnaie": "CAD",
    "procurementCategory-categorieApprovisionnement": "*SRV",
    "supplierLegalName-nomLegalFournisseur-eng": "Ultralite Overhead Doors ULC",
    "supplierAddressCity-fournisseurAdresseVille-eng": "Calgary",
    "contractingEntityName-nomEntitContractante-eng": "Parks Canada",
    "regionsOfDelivery-regionsLivraison-eng": "*Alberta",
    ...over,
  }) as AwardRow;

describe("awards", () => {
  it("uses the current fiscal year file", () => {
    expect(awardsUrl("2026-09-23")).toContain("2026-2027-awardNotice");
    expect(awardsUrl("2027-02-01")).toContain("2026-2027-awardNotice");
  });

  it("keeps recent trade awards; skips amendments, old, future-dated and IT work", () => {
    expect(classifyAward(row(), TODAY)).toEqual(["garage-doors"]);
    expect(classifyAward(row({ "amendmentNumber-numeroModification": "001" }), TODAY)).toEqual([]);
    expect(classifyAward(row({ "contractAwardDate-dateAttributionContrat": "2026-01-02" }), TODAY)).toEqual([]);
    expect(classifyAward(row({ "contractAwardDate-dateAttributionContrat": "2029-06-15" }), TODAY)).toEqual([]);
    expect(classifyAward(row({ "title-titre-eng": "Senior IT security TRA and C&A analyst" }), TODAY)).toEqual([]);
  });

  it("states winner and value honestly and is recognised as a past contract", () => {
    const ins = awardToRfpInsert(row(), TODAY)!;
    expect(ins.summary).toMatch(/^Awarded August 12, 2026 to Ultralite Overhead Doors ULC \(Calgary\) — \$84,500 CAD\./);
    expect(ins.summary).toContain("Past public contract");
    expect(ins.deadline).toBe("2026-08-12");
    expect(ins.source_url).toBe("https://canadabuys.canada.ca/en/tender-opportunities/award-notice/mx-444028039551");
    expect(publicTenderSource(ins.slug).key).toBe("awards");
  });
});
