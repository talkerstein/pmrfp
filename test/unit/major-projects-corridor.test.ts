import { describe, expect, it } from "vitest";
import {
  CORRIDOR_LICENSES,
  CORRIDOR_SOURCES,
  bramptonAppsUrl,
  bramptonPermitsUrl,
  BRAMPTON_APP_LAYERS,
  burlingtonUrl,
  cambridgeUrl,
  hamiltonAppsUrl,
  kitchenerUrl,
  oakvilleAppsUrl,
  oakvillePermitsUrl,
  onePerSite,
  parseBramptonApps,
  parseBramptonPermits,
  parseBurlingtonPermits,
  parseCambridgePermits,
  parseHamiltonApps,
  parseKitchenerPermits,
  parseOakvilleApps,
  parseOakvillePermits,
  parseWaterlooPermits,
  waterlooUrl,
} from "@/lib/major-projects/sources-corridor";
import { sourcesFor } from "@/lib/major-projects/registry";
import { creditFor } from "@/lib/data-credits";

const TODAY = "2026-10-18";
const MIN = 3_000_000;
const ms = (d: string) => Date.parse(`${d}T12:00:00Z`);
const f = (attributes: Record<string, string | number | null>) => ({ attributes });

describe("corridor registry", () => {
  it("runs nine Ontario sources in their own weekly group", () => {
    expect(sourcesFor("corridor").map((s) => s.key)).toEqual([
      "permits-kitchener",
      "permits-waterloo",
      "permits-cambridge",
      "permits-burlington",
      "permits-oakville",
      "permits-brampton",
      "apps-hamilton",
      "apps-oakville",
      "apps-brampton",
    ]);
    expect(CORRIDOR_SOURCES.every((s) => s.group === "corridor")).toBe(true);
  });

  it("every licence line has a credit in en, fr and es", () => {
    for (const v of Object.values(CORRIDOR_LICENSES)) {
      const c = creditFor(v);
      expect(c, v).not.toBeNull();
      expect(c!.fr).not.toBe(c!.en);
    }
  });

  it("queries apply the floor and the 2-year window, and never request personal fields", () => {
    const urls = [
      kitchenerUrl(MIN, TODAY),
      waterlooUrl(MIN, TODAY),
      cambridgeUrl(MIN, TODAY),
      burlingtonUrl(MIN, TODAY),
      oakvillePermitsUrl(MIN, TODAY),
      bramptonPermitsUrl(TODAY),
      hamiltonAppsUrl(TODAY),
      oakvilleAppsUrl(TODAY),
      ...BRAMPTON_APP_LAYERS.map((l) => bramptonAppsUrl(l, TODAY)),
    ].map((u) => decodeURIComponent(u.replace(/\+/g, " ")));
    for (const u of urls.slice(0, 5)) expect(u).toContain(">= 3000000");
    for (const u of urls) {
      expect(u).toMatch(/2024-10-18|>= 2024/);
      expect(u).not.toMatch(/OWNERS|APPLICANT[,&]|CONTRACTOR_CONTACT|CITY_PLANNER|outFields=\*/);
      expect(u).toContain("resultOffset=0");
    }
  });
});

describe("corridor permit parsers", () => {
  it("Kitchener: keeps big buildings, skips houses and small jobs, names no applicant", () => {
    const rows = parseKitchenerPermits(
      [
        f({ PERMITNO: "24107292", PERMIT_TYPE: "Residential Building (Multi)", FOLDERNAME: "210 DUKE ST E", PERMIT_STATUS: "Issued", ISSUE_DATE: ms("2025-11-21"), SUB_WORK_TYPE: "Apartment", WORK_TYPE: "New Construction", PERMIT_DESCRIPTION: "Permit is for a new affordable housing complex with 100 units", CONSTRUCTION_VALUE: 30_000_000, UNITS_CREATED: "100", STOREYS_PROPOSED: "8 storeys + 1 below grade", CONTRACTOR: "Melloul-Blamey Construction Inc" }),
        f({ PERMITNO: "23125098", PERMIT_TYPE: "Residential Building (Multi)", FOLDERNAME: "210 DUKE ST E", PERMIT_STATUS: "Issued", ISSUE_DATE: ms("2025-01-10"), SUB_WORK_TYPE: "Apartment", WORK_TYPE: "Foundation", PERMIT_DESCRIPTION: "Foundation", CONSTRUCTION_VALUE: 4_000_000 }),
        f({ PERMITNO: "1", PERMIT_TYPE: "Residential Building (Single)", FOLDERNAME: "1 A ST", PERMIT_STATUS: "Issued", ISSUE_DATE: ms("2025-01-10"), SUB_WORK_TYPE: "Single Detached Dwelling", WORK_TYPE: "New", CONSTRUCTION_VALUE: 4_000_000 }),
        f({ PERMITNO: "2", PERMIT_TYPE: "Commercial", FOLDERNAME: "2 B ST", PERMIT_STATUS: "Issued", ISSUE_DATE: ms("2025-01-10"), WORK_TYPE: "Alteration", CONSTRUCTION_VALUE: 900_000 }),
        f({ PERMITNO: "3", PERMIT_TYPE: "Commercial", FOLDERNAME: "3 C ST", PERMIT_STATUS: "Cancelled", ISSUE_DATE: ms("2025-01-10"), CONSTRUCTION_VALUE: 9_000_000 }),
      ],
      MIN,
    );
    expect(rows).toHaveLength(1);
    const r = rows[0];
    expect(r.estValueCad).toBe(30_000_000);
    expect(r.city).toBe("Kitchener");
    expect(r.province).toBe("Ontario");
    expect(r.status).toBe("approved");
    expect(r.size).toBe("8 storeys · 100 homes");
    expect(r.generalContractor).toBe("Melloul-Blamey Construction Inc");
    expect(r.owner).toBeNull();
    expect(r.description).toContain("Related permits at this address: 23125098");
    expect(r.license).toBe(CORRIDOR_LICENSES.kitchener);
    expect(r.sourceKey).toBe("permits-kitchener:24107292");
  });

  it("Waterloo, Cambridge, Burlington and Oakville: value floor, building categories, licence on every row", () => {
    const wat = parseWaterlooPermits([f({ PERMIT_NUM: "2025 005416 000 00 MX", ADDRESS: "20 UNIVERSITY AVE E", STATUS: "Issued", PERMITDESC: "Mixed Use Building Permit", SUBDESC: "Mercantile/Residential", WORKDESC: "New", DESCRIPTN: "Construct a new 26 storey mixed use apartment building.AMND #1 - Approved", ISSUEDATE: ms("2025-06-16"), CONTRVALUE: 60_000_000, UNITS: 260 })], MIN);
    expect(wat[0]).toMatchObject({ category: "mixed_use", estValueCad: 60_000_000, city: "Waterloo", size: "260 homes", license: CORRIDOR_LICENSES.waterloo });
    expect(wat[0].description).not.toContain("AMND");

    const cam = parseCambridgePermits(
      [
        f({ HOUSE_NUMBER: "255", STREET_NAME: "KING ST W", FOLDERYEAR: "25", FOLDERSEQUENCE: "001", FOLDERSECTION: "000", FOLDERREVISION: "00", FOLDERDESC: "Building Permit Residential", STATUSDESC: "Issued", ISSUEDATE: ms("2025-08-01"), CONSVALUE: 140_000_000, SUBDESC: "Rental Apartment Building", WORKDESC: "New", PROP_NEW_UNITS: "300" }),
        f({ HOUSE_NUMBER: "155", STREET_NAME: "GUELPH AVE", FOLDERYEAR: "26", FOLDERSEQUENCE: "010921", FOLDERDESC: "Plumbing Permit", STATUSDESC: "Issued", ISSUEDATE: ms("2026-07-24"), CONSVALUE: 4_029_499, SUBDESC: "Rowhouse, Condo", WORKDESC: "Site Service " }),
      ],
      MIN,
    );
    expect(cam).toHaveLength(1);
    expect(cam[0]).toMatchObject({ category: "multi_residential", city: "Cambridge", license: CORRIDOR_LICENSES.cambridge });

    const bur = parseBurlingtonPermits(
      [
        f({ ADDRESS: "741 ASHLEY AVE.", FOLDERTYPE: "SF New Single Detached Dwelling", FILENO: "25-022816", ISSUEDATE: ms("2026-02-13"), WORKDESC: "New", SUBDESC: "Single Detached Dwelling", FOLDERSTATUSDESC: "Issued", CONSTRUCTVALUE: 3_800_000 }),
        f({ ADDRESS: "426 BRANT ST.", FOLDERTYPE: "GP Institutional/Government", FILENO: "26-007972", ISSUEDATE: ms("2026-05-29"), WORKDESC: "Addition", SUBDESC: "Institutional/Government Facility", FOLDERSTATUSDESC: "Issued", CONSTRUCTVALUE: 6_000_000 }),
        f({ ADDRESS: "426 BRANT ST.", FOLDERTYPE: "GP Institutional/Government", FILENO: "26-007973", ISSUEDATE: ms("2026-05-29"), WORKDESC: "Demolition- Partial Building", SUBDESC: "Institutional/Government Facility", FOLDERSTATUSDESC: "Issued", CONSTRUCTVALUE: 4_328_000 }),
      ],
      MIN,
    );
    expect(bur.map((r) => r.sourceKey)).toEqual(["permits-burlington:26-007972"]);
    expect(bur[0].category).toBe("institutional");

    const oak = parseOakvillePermits(
      [
        f({ CUSTOMFOLDERNUMBER: "2024 215715 000 00 SN", FOLDERDESCRIPTION: "Construction of New 3 Storey Secondary High School and Child Care Centre. ", FOLDERNAME: "4020 Sixth Line", Subtype: "Secondary School", Worktype: "New Const.", ISSUEDATE: ms("2026-06-04"), Status: "Issued", StatusGroup: "Permit Issued", Construction_Value: 80_000_000, GFA: 14430 }),
        f({ CUSTOMFOLDERNUMBER: "2026 003015 000 00 BDP", FOLDERDESCRIPTION: "Construction of two (2) story single family dwelling", FOLDERNAME: "338 Maple Grove Drive", Subtype: "House - Part 9 - Detached House", Worktype: "New Construction", ISSUEDATE: ms("2026-06-24"), Status: "Issued", Construction_Value: 4_149_283 }),
      ],
      MIN,
    );
    expect(oak).toHaveLength(1);
    expect(oak[0]).toMatchObject({ category: "institutional", city: "Oakville", estValueCad: 80_000_000, size: "14,430 m²", license: CORRIDOR_LICENSES.oakville });
  });

  it("Brampton: no value field, so permits count on scale, show no value and say why", () => {
    const rows = parseBramptonPermits([
      f({ ADDRESS: "6 Docksteader Rd, Brampton, ON, ", PERMITNUMBER: "25-1", SUBDESC: "D: Business/Services", WORKDESC: "New Complete Building", ISSUEDATE: ms("2025-09-01"), STATUSDESC: "Issued", BUILDER: "Orlando Corporation", CONTRACTOR: "Jane Smith", GFA: "7845", STOREYS: "2", DWELLINGS: "0" }),
      f({ ADDRESS: "1 Small Rd, Brampton, ON, ", PERMITNUMBER: "25-2", SUBDESC: "E: Retail", WORKDESC: "New", ISSUEDATE: ms("2025-09-01"), STATUSDESC: "Issued", GFA: "900", STOREYS: "1" }),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].estValueCad).toBeNull();
    expect(rows[0].caveats).toMatch(/no construction value/);
    expect(rows[0].owner).toBe("Orlando Corporation");
    // A person's name in the contractor field is never stored.
    expect(rows[0].generalContractor).toBeNull();
    expect(rows[0].size).toBe("2 storeys · 7,845 m²");
    expect(rows[0].license).toBe(CORRIDOR_LICENSES.brampton);
  });

  it("one project per address: the biggest permit leads", () => {
    const base = parseWaterlooPermits([f({ PERMIT_NUM: "A", ADDRESS: "1 X ST", STATUS: "Issued", SUBDESC: "Industrial (Group F)", PERMITDESC: "New - Non Residential", WORKDESC: "New", ISSUEDATE: ms("2025-06-16"), CONTRVALUE: 5_000_000 })], MIN)[0];
    const big = { ...base, sourceKey: "permits-waterloo:B", estValueCad: 9_000_000 };
    expect(onePerSite([{ site: "s", row: base, permit: "A" }, { site: "s", row: big, permit: "B" }])).toEqual([{ ...big, description: `${big.description} Related permits at this address: A.` }]);
  });
});

describe("corridor development applications", () => {
  it("Hamilton: big files only, consultations skipped, one project per site, file year as the date", () => {
    const rows = parseHamiltonApps([
      f({ FILE_NUM: "SPC-2026-00041", FILE_TYPE: "Site Plan", ADDRESS: "420 Garner Road West", FILE_YEAR: 2026, DESCRIP: "To construct 12-storey mixed-use and residential buildings totaling 546 dwelling units and 1,409 m2 commercial space." }),
      f({ FILE_NUM: "ZAC-26-001", FILE_TYPE: "Zoning By-law Amendment", ADDRESS: "420 Garner Road West", FILE_YEAR: 2026, DESCRIP: "Rezoning for 12 storeys" }),
      f({ FILE_NUM: "FC-2026-00058", FILE_TYPE: "Formal Consultation", ADDRESS: "10 Kenilworth Ave N", FILE_YEAR: 2026, DESCRIP: "6-storey multiple dwelling with 50 units" }),
      f({ FILE_NUM: "SUB-2026-00309", FILE_TYPE: "Subdivision", ADDRESS: "Alayche Estates", FILE_YEAR: 2026, DESCRIP: "18 single detached residential lots" }),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: "application", city: "Hamilton", estValueCad: null, statusDate: "2026-01-01", license: CORRIDOR_LICENSES.hamilton });
    expect(rows[0].name).toBe("Site plan application: 12-storey mixed-use building, 546 units — 420 Garner Road West");
    expect(rows[0].description).toContain("ZAC-26-001");
  });

  it("Oakville: uses the unit and floor-area fields, drops closed files", () => {
    const rows = parseOakvilleApps([
      f({ FolderRSN: 972853, FolderType: "Zoning Bylaw Amendment", Description: "50-storey, 42,000 square metre, 560-unit mixed-use condominium", FolderName: "118 Cross Ave", IntakeDate: ms("2026-09-16"), Status: "In Circulation", Proposed_Total___of_Units: 429 }),
      f({ FolderRSN: 1, FolderType: "Site Plan", Description: "Warehouse", FolderName: "9 Y Rd", IntakeDate: ms("2026-01-16"), Status: "In Circulation", Employment_GFA__m2_: 12000 }),
      f({ FolderRSN: 952581, FolderType: "Zoning Bylaw Amendment", Description: "Three employment blocks, 400 units", FolderName: "145 Burnhamthorpe Rd W", IntakeDate: ms("2026-03-27"), Status: "Closed" }),
    ]);
    expect(rows.map((r) => r.size)).toEqual(["50 storeys · 560 units · 42,000 m²", "12,000 m²"]);
    expect(rows.every((r) => r.license === CORRIDOR_LICENSES.oakville)).toBe(true);
  });

  it("Brampton: keeps a company applicant, never a person; limited site plans skipped", () => {
    const rows = parseBramptonApps([
      f({ FILE_NUMBER: "OZS-2025-0001", LOCATION: "3407 COUNTRYSIDE DR", DATE_RECEIVED: ms("2025-05-01"), APPLICATION_TYPE: "Official Plan & Zoning By-law Amendment", STATUS: "Under Review", PROPOSAL_DESCRIPTION: "12-storey mixed-use building with 128 units", APPLICANT_COMPANY: "GWD Ltd." }),
      f({ FILE_NUMBER: "OZS-2025-0002", LOCATION: "1 MAIN ST", DATE_RECEIVED: ms("2025-05-01"), APPLICATION_TYPE: "Zoning By-law Amendment", STATUS: "Under Review", PROPOSAL_DESCRIPTION: "8-storey residential building with 90 units", APPLICANT_COMPANY: "John Smith" }),
      f({ FILE_NUMBER: "SPA-2024-0032", LOCATION: "130 SANDALWOOD PKY W", DATE_RECEIVED: ms("2024-11-01"), APPLICATION_TYPE: "Site Plan Approval", DESCRIPTION: "Limited Site Plan", STATUS: "Site Plan Approved", PROPOSAL_DESCRIPTION: "New canopy 6000 m2" }),
    ]);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.owner).sort()).toEqual([null, "GWD Ltd."].sort());
    expect(rows.every((r) => r.license === CORRIDOR_LICENSES.brampton && r.city === "Brampton")).toBe(true);
  });
});
