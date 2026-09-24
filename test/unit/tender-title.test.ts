import { describe, expect, it } from "vitest";
import { tidyTenderTitle } from "@/lib/tenders/title";

// Real titles from the public-tender feeds.
describe("tidyTenderTitle", () => {
  it.each([
    ["EE517-270096 Snow removal from parking lots", "Snow removal from parking lots", "EE517-270096"],
    ["W684H-260287-RISO Roof Cleaning, CFB Halifax, NS", "Roof Cleaning, CFB Halifax, NS", "W684H-260287-RISO"],
    ["EB144-250191-Security System Upgrade, Canadian Coast Guard College", "Security System Upgrade, Canadian Coast Guard College", "EB144-250191"],
    ["R2026-N Electrical Maintenance and Services", "Electrical Maintenance and Services", "R2026-N"],
    ["061120 - Réaménagement de l'accueil", "Réaménagement de l'accueil", "061120"],
    ["N400857584741, Repair Wash Rack B4248", "Repair Wash Rack B4248", "N400857584741"],
    ["18-151 lot 2, remplacement des génératrices", "Lot 2, remplacement des génératrices", "18-151"],
    ["085-240-43174/75-École internationale Lucille-Teasdale", "École internationale Lucille-Teasdale", "085-240-43174/75"],
    ["W6898-270825 – RISO - Video Inspection Clean Oil Interceptors", "Video Inspection Clean Oil Interceptors", "W6898-270825"],
    ["ET025-270110 - PIDS, FAAS Integration and Installation of IDS & MDS – RFP", "PIDS, FAAS Integration and Installation of IDS & MDS", "ET025-270110"],
    ["Retender EQ754-251469 Burlington Lift Bridge Security Gate", "Burlington Lift Bridge Security Gate", "EQ754-251469"],
    ["RFQ CBI26-107 New Roofing Multiple Properties", "New Roofing Multiple Properties", "CBI26-107"],
    ["Tender 2026-01 DRS Renovation Phase 4", "DRS Renovation Phase 4", "2026-01"],
  ])("splits the reference off %s", (raw, title, reference) => {
    expect(tidyTenderTitle(raw)).toEqual({ title, reference });
  });

  it("title-cases all-caps titles, keeping acronyms and French small words", () => {
    expect(tidyTenderTitle("2026-029: FOUR PROJECTS IN KINGS COUNTY, ASPHALT REPAVING").title).toBe(
      "Four Projects in Kings County, Asphalt Repaving",
    );
    expect(tidyTenderTitle("W684E-260446 CLEANING SERVICES DEPARTMENT OF NATIONAL DEFENCE").title).toBe(
      "Cleaning Services Department of National Defence",
    );
    expect(tidyTenderTitle("SERVICE D'ENTRETIEN DE CLIMATISATION ET SYSTÈME CVAC").title).toBe(
      "Service d'Entretien de Climatisation et Système CVAC",
    );
    expect(tidyTenderTitle("SERVICE DE DÉNEIGEMENT-SECTEUR SHAWINIGAN-VALLÉE-DE-LA-BATISCAN").title).toBe(
      "Service de Déneigement-Secteur Shawinigan-Vallée-de-la-Batiscan",
    );
    expect(tidyTenderTitle("PROTECTION INCENDIE - HCM").title).toBe("Protection Incendie - HCM");
  });

  it("leaves seasons, years and already-clean titles alone", () => {
    expect(tidyTenderTitle("2026-2027 Snow Removal Season")).toEqual({ title: "2026-2027 Snow Removal Season", reference: null });
    expect(tidyTenderTitle("2026 Park Street Milling and Paving").reference).toBeNull();
    expect(tidyTenderTitle("2025/26 Cyclical Street Tree Pruning").reference).toBeNull();
    expect(tidyTenderTitle("New Haven Waste Management Facility").reference).toBeNull();
    expect(tidyTenderTitle("B225 Duct Cleaning Services")).toEqual({ title: "B225 Duct Cleaning Services", reference: null });
    expect(tidyTenderTitle("Barrow Observatory Flooring Replacement")).toEqual({
      title: "Barrow Observatory Flooring Replacement",
      reference: null,
    });
  });

  it("repairs the replacement characters some feeds ship for dashes and quotes", () => {
    expect(tidyTenderTitle("Libraries � Janitorial Services").title).toBe("Libraries – Janitorial Services");
    expect(tidyTenderTitle("RFC - Halifax Infirmary (�HI�) Cath Lab").title).toBe("RFC - Halifax Infirmary (HI) Cath Lab");
  });

  it("keeps the original when stripping would leave too little", () => {
    expect(tidyTenderTitle("EE517-270096 - Roof")).toEqual({ title: "EE517-270096 - Roof", reference: null });
  });
});
