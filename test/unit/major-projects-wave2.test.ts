import { describe, expect, it } from "vitest";
import { gzipSync } from "node:zlib";
import { fundingMinValue, type MajorProjectInput } from "@/lib/major-projects/model";
import {
  WAVE2_LICENSES,
  applicationCategory,
  applicationScale,
  applicationTitle,
  calgaryAppsUrl,
  edmontonAppsUrl,
  frenchMonth,
  halifaxUrl,
  isMajorScale,
  organisationOrNull,
  parseCalgaryApps,
  parseEdmontonApps,
  parseEdmontonCapital,
  parseHalifaxPermits,
  parseInfrastructureCanada,
  parseManitobaCapital,
  parsePqi,
  parseSurreyPermits,
  parseTorontoApps,
  parseYorkApps,
  pqiCsvUrl,
  surreyUrl,
  tidyAddress,
  torontoAppsUrl,
  yorkAppsUrl,
} from "@/lib/major-projects/sources-wave2";
import { ALL_SOURCES, sourcesFor } from "@/lib/major-projects/registry";
import { computeLinkGroups, nameTokens, titleAddress, type LinkRow } from "@/lib/major-projects/links";
import { collapseLinked, frozenSourceDate, linkedListings } from "@/lib/major-projects/filters";
import { planSync, type ExistingProject } from "@/lib/major-projects/sync";
import { decodeText, hasHeader, uploadText } from "@/lib/major-projects/upload";

const TODAY = "2026-10-12";
const MIN = 5_000_000;

/* ------------------------------------------------------------------ fixtures */

const IC_HEAD =
  '"PROJECT_NUMBER","PROJECT_TITLE","PROJECT_TITLE_FR","PROGRAM_ABR_EN","PROGRAM_ABR_FR","PROGRAM_EN","PROGRAM_FR","STANDARD_CATEGORY","STANDARD_CATEGORY_FR","LOCATION","LOCATION_FR","REGION_CD","APPROVED_DATE","CONSTRUCTION_START_DATE","CONSTRUCTION_END_DATE","FEDERAL_CONTRIBUTION","TOTAL_ELIGIBLE_COST","ULTIMATE_RECIPIENT_EN","ULTIMATE_RECIPIENT_FR","ANNOUNCEMENT_DATE","CONST_START_FORECAST_DATE","CONST_END_FORECAST_DATE"';
const icRow = (o: Partial<Record<string, string>>) => {
  const r: Record<string, string> = {
    PROJECT_NUMBER: "1", PROJECT_TITLE: "Main Street Water Treatment Plant", PROJECT_TITLE_FR: "", PROGRAM_ABR_EN: "GIS", PROGRAM_ABR_FR: "", PROGRAM_EN: "Green Infrastructure Stream",
    PROGRAM_FR: "", STANDARD_CATEGORY: "Drinking Water", STANDARD_CATEGORY_FR: "", LOCATION: "Kingston", LOCATION_FR: "", REGION_CD: "on", APPROVED_DATE: "2025-03-01",
    CONSTRUCTION_START_DATE: "", CONSTRUCTION_END_DATE: "", FEDERAL_CONTRIBUTION: "4000000", TOTAL_ELIGIBLE_COST: "12000000", ULTIMATE_RECIPIENT_EN: "Kingston, City of",
    ULTIMATE_RECIPIENT_FR: "", ANNOUNCEMENT_DATE: "", CONST_START_FORECAST_DATE: "2026-05-01", CONST_END_FORECAST_DATE: "2028-10-31", ...o,
  };
  return IC_HEAD.split(",").map((h) => `"${r[h.replace(/"/g, "")] ?? ""}"`).join(",");
};

const PQI_CSV = [
  '"no_projet","nom_projet","description","cout_total","contribution_quebec","contribution_partenaires","date_fin_mise_en_service","etat_avancement","suivi_modifications","ministre","organisme","gestionnaire","secteur_activite","region","nom_infrastructure","localisation","nature_travaux"',
  '"247","Hôtel-Dieu de Lévis – Agrandissement","Le projet vise l\'agrandissement.",530.40,507.00,23.40,"Septembre 2031","En réalisation","Août 2026\nUne hausse au coût du projet a été autorisée.\nMars 2026\nLe projet a été autorisé à l\'étape « En réalisation ».\nJuin 2021\nLe projet a été autorisé à l\'étape « En planification ».","Ministre de la Santé","Santé Québec Chaudière-Appalaches","Société québécoise des infrastructures","Santé et Services sociaux","12 – Chaudière-Appalaches","Hôtel-Dieu de Lévis","Lévis","Agrandissement"',
  '"900","École primaire de Québec","Construction d\'une école.","","","","","À l\'étude","","Ministre de l\'Éducation","CSS de la Capitale","Société québécoise des infrastructures","Éducation","03 – Capitale-Nationale","","Québec","Construction"',
  '"901","Route 138","Réfection.",45,45,0,"Juin 2025","En service","","Ministre des Transports","MTMD","Ministère des Transports et de la Mobilité durable","Réseau routier","09 – Côte-Nord","","Plusieurs régions","Réfection"',
].join("\n");

const arc = (rows: Record<string, string | number | null>[]) => rows.map((attributes) => ({ attributes }));
const allRows = (): MajorProjectInput[] => [
  ...parseInfrastructureCanada([IC_HEAD, icRow({})].join("\n"), 1e6, TODAY),
  ...parsePqi(PQI_CSV),
  ...parseHalifaxPermits(arc([{ Permit_Number: "BP-1", Estimated_Project_Value: 70e6, Permit_Status: "Issued", Type_of_Structure: "Mixed Use - Residential & Other Use(s)", Occupancy_Type: "Retail Use", Work_Description: "New 11 storey student housing", Civic_Number: "6249", Street_Name: "COBURG RD", Date_of_Permit_Issuance: 1791374400000 }]), MIN),
  ...parseSurreyPermits(arc([{ PermitNumber: "26-1", IssuedDate: "20261001", ValueOfConstruction: 21.5e6, ProjectAddress: "6871 153 St", WorkDescription: "New", SubDescription: "Offices", DwellingUnits: 0, ApplicantOrganization: "Pontem Consulting Group Ltd\nSuite 309", BuildingGeneralContractorOrganization: "ICE Constructors Ltd\nUnit 100" }]), MIN, TODAY),
  ...parseEdmontonCapital([{ ebuilder_number: "eB-1", project_name: "Metro Line LRT Extension", asset_type: "LRT", scope: "A 4.2 km LRT extension.", current_phase: "Development Design", approved_budget_m: "44318000", forecasted_budget: "44318000" }], 1e6),
  ...parseManitobaCapital(arc([{ Project__: "M1", Project_Type: "Bridge Replacement", Hwy: "10", Location_Description: "Swan River crossing", Project_Status: "Design", Municipality_Name: "Swan Valley West" }])),
  ...parseTorontoApps([{ APPLICATION_TYPE: "SA", "APPLICATION#": "26 1 SA", STREET_NUM: "221", STREET_NAME: "FINCH", STREET_TYPE: "AVE", STREET_DIRECTION: "W", DATE_SUBMITTED: "2026-10-02T00:00:00", STATUS: "Application Received", DESCRIPTION: "A 12-storey mixed-use building with 240 residential units." }], TODAY),
  ...parseEdmontonApps([{ city_file_number: "E-1", permit_date: "2026-09-08T00:00:00.000", status: "Approved", address: "101, 9862 - 90 AVENUE NW", description_of_development: "To construct a Residential Use building in the form of a 6-Storey 73 Dwelling Multi-Unit Housing." }]),
  ...parseCalgaryApps([{ permitnum: "DP1", applieddate: "2026-09-01T00:00:00.000", statuscurrent: "Under Review", category: "Residential - Multi-Family", address: "1 MAIN ST SW", description: "NEW: MULTI-RESIDENTIAL DEVELOPMENT (6 BUILDINGS)", applicant: "JANE DOE" }]),
  ...parseYorkApps(arc([{ REG_FILE_NUM: "SP.26.G.0065", APPL_TYPE: "Site Plan", APPL_STATUS: "In Progress", APPL_NAME: "John Smith", APPL_DESC: "An apartment building with 328 units and a 808m² commercial building.", MUN_NAME: "Georgina", ADDRESS: "232 Cameron Crescent", DATE_RECVD: 1780891200000 }])),
];

/* ------------------------------------------------------------------ tests */

describe("wave 2: registry and licences", () => {
  it("every source has a group, the groups split as scheduled, keys are unique", () => {
    expect(new Set(ALL_SOURCES.map((s) => s.key)).size).toBe(ALL_SOURCES.length);
    expect(sourcesFor("funding").map((s) => s.key)).toEqual(["quebec-pqi", "capital-edmonton", "manitoba-capital"]);
    expect(sourcesFor("local").map((s) => s.key)).toEqual(["permits-halifax", "permits-surrey", "apps-toronto", "apps-edmonton", "apps-calgary", "apps-york"]);
    expect(sourcesFor("core")).toHaveLength(6);
    expect(sourcesFor("core", "apps-york").map((s) => s.key)).toEqual(["apps-york"]);
    // Robots-blocked sources are never fetched by a cron.
    expect(ALL_SOURCES.map((s) => s.key)).not.toContain("infrastructure-canada");
    expect(ALL_SOURCES.map((s) => s.key)).not.toContain("nrcan-major-projects");
  });

  it("every parsed row carries its source's licence line, Canada only", () => {
    const rows = allRows();
    expect(new Set(rows.map((r) => r.source)).size).toBe(10);
    const bySource: Record<string, string> = {
      "infrastructure-canada": WAVE2_LICENSES.canada,
      "quebec-pqi": WAVE2_LICENSES.pqi,
      "permits-halifax": WAVE2_LICENSES.halifax,
      "permits-surrey": WAVE2_LICENSES.surrey,
      "capital-edmonton": WAVE2_LICENSES.edmonton,
      "manitoba-capital": WAVE2_LICENSES.manitoba,
      "apps-toronto": WAVE2_LICENSES.toronto,
      "apps-edmonton": WAVE2_LICENSES.edmonton,
      "apps-calgary": WAVE2_LICENSES.calgary,
      "apps-york": WAVE2_LICENSES.york,
    };
    for (const r of rows) {
      expect(r.license, r.sourceKey).toBe(bySource[r.source]);
      expect(r.license.length).toBeGreaterThan(20);
      expect(r.sourceKey.startsWith(`${r.source}:`)).toBe(true);
      expect(r.sources.length).toBeGreaterThan(0);
      expect(r.province).toMatch(/^(Ontario|Quebec|Nova Scotia|British Columbia|Alberta|Manitoba)$/);
    }
    expect(WAVE2_LICENSES.pqi).toMatch(/CC BY 4\.0/);
    expect(WAVE2_LICENSES.pqi).toMatch(/translated/);
  });
});

describe("wave 2: personal names", () => {
  it("keeps organisations, drops names that may be people", () => {
    expect(organisationOrNull("Kingston, City of")).toBe("Kingston, City of");
    expect(organisationOrNull("Selkirk First Nation")).toBe("Selkirk First Nation");
    expect(organisationOrNull("Ritchie Community League")).toBe("Ritchie Community League");
    expect(organisationOrNull("Espace LGBTQ+")).toBe("Espace LGBTQ+");
    expect(organisationOrNull("Jane Smith")).toBeNull();
    expect(organisationOrNull("Smith, Jane")).toBeNull();
    expect(organisationOrNull("Jean-Luc Tremblay")).toBeNull();
    expect(organisationOrNull("N/A")).toBeNull();
  });

  it("feeds never carry a person's name into owner, contractor or text", () => {
    const rows = allRows();
    const york = rows.find((r) => r.source === "apps-york")!;
    expect(york.owner).toBeNull(); // APPL_NAME "John Smith"
    expect(JSON.stringify(york)).not.toMatch(/John Smith/);
    const calgary = rows.find((r) => r.source === "apps-calgary")!;
    expect(JSON.stringify(calgary)).not.toMatch(/JANE DOE|Jane Doe/i);
    const surrey = rows.find((r) => r.source === "permits-surrey")!;
    expect(surrey.generalContractor).toBe("ICE Constructors Ltd");
    expect(surrey.description).toContain("Applicant: Pontem Consulting Group Ltd");
    expect(surrey.description).not.toMatch(/Suite 309/);
    expect(parseInfrastructureCanada([IC_HEAD, icRow({ ULTIMATE_RECIPIENT_EN: "Jane Smith" })].join("\n"), 1e6, TODAY)[0].owner).toBeNull();
  });

  it("never requests staff contact columns", () => {
    expect(torontoAppsUrl(0)).not.toMatch(/CONTACT/);
    expect(yorkAppsUrl(TODAY)).not.toMatch(/Lead|Coordinator/);
    expect(edmontonAppsUrl(TODAY)).not.toMatch(/contact|email|phone/);
  });
});

describe("wave 2: thresholds and filters", () => {
  it("Infrastructure Canada: >= the funding minimum, unfinished, recent forecast; capacity building skipped", () => {
    const csv = [
      IC_HEAD,
      icRow({ PROJECT_NUMBER: "1" }),
      icRow({ PROJECT_NUMBER: "2", TOTAL_ELIGIBLE_COST: "900000" }),
      icRow({ PROJECT_NUMBER: "3", CONSTRUCTION_END_DATE: "2024-01-01" }),
      icRow({ PROJECT_NUMBER: "4", CONST_END_FORECAST_DATE: "2024-06-30" }),
      icRow({ PROJECT_NUMBER: "5", STANDARD_CATEGORY: "Capacity Building" }),
      icRow({ PROJECT_NUMBER: "6", CONSTRUCTION_START_DATE: "2026-05-12", LOCATION: "Bruce; Grey" }),
    ].join("\n");
    const rows = parseInfrastructureCanada(csv, 1e6, TODAY);
    expect(rows.map((r) => r.sourceKey)).toEqual(["infrastructure-canada:1", "infrastructure-canada:6"]);
    expect(rows[0]).toMatchObject({ status: "approved", category: "infrastructure", estValueCad: 12e6, city: "Kingston", province: "Ontario", owner: "Kingston, City of" });
    expect(rows[1]).toMatchObject({ status: "under_construction", city: null, regionSlug: "ontario" });
    expect(rows[1].description).toContain("Locations: Bruce, Grey");
    expect(parseInfrastructureCanada(csv, 20e6, TODAY)).toHaveLength(0);
    expect(fundingMinValue(undefined)).toBe(1_000_000);
    expect(fundingMinValue("250000")).toBe(250_000);
    expect(fundingMinValue("5")).toBe(1_000_000);
  });

  it("PQI: $ millions, French stages, newest snapshot link, stage date from the change log", () => {
    const rows = parsePqi(PQI_CSV);
    expect(rows.map((r) => r.status)).toEqual(["under_construction", "proposed", "completed"]);
    expect(rows[0]).toMatchObject({ estValueCad: 530_400_000, city: "Lévis", statusDate: "2026-03-01", sourceUpdated: "2026-08-01", timeline: "Target in service: Sep 2031", category: "institutional" });
    expect(rows[0].bidRoute).toContain("SEAO");
    expect(rows[1]).toMatchObject({ estValueCad: null, regionSlug: "quebec-city" });
    expect(rows[2]).toMatchObject({ city: null, category: "infrastructure" });
    expect(frenchMonth("Décembre 2027")).toEqual({ iso: "2027-12-01", en: "Dec 2027" });
    const page = `
      <a href="https://www.donneesquebec.ca/recherche/dataset/x/resource/a/download/donnees_ouvertes_tb_20260918.csv">
      <a href="https://www.donneesquebec.ca/recherche/dataset/x/resource/b/download/donnees_ouvertes_tb_20261008.csv">
      <a href="https://www.donneesquebec.ca/recherche/dataset/x/resource/c/download/donnees_ouvertes_tb_20261008.xlsx">
      <a href="https://www.donneesquebec.ca/recherche/dataset/x/resource/d/download/donnees_ouvertes_tb_pqi-2024-2034_20240312.csv">`;
    expect(pqiCsvUrl(page)).toBe("https://www.donneesquebec.ca/recherche/dataset/x/resource/b/download/donnees_ouvertes_tb_20261008.csv");
    expect(pqiCsvUrl("<html></html>")).toBeNull();
    // robots.txt disallows /api/ on donneesquebec.ca.
    expect(page).not.toMatch(/\/api\//);
  });

  it("Halifax: one row per permit, value floor, houses and cancelled skipped, inspections mean under construction", () => {
    const base = { Estimated_Project_Value: 11e6, Type_of_Structure: "Dwelling - Multiple Units", Work_Description: "New Construction for 33-unit Student Housing Complex", Civic_Number: "6319", Street_Name: "COBURG RD", Community: "HALIFAX" };
    const rows = parseHalifaxPermits(
      arc([
        { ...base, Permit_Number: "A", Permit_Status: "Issued", Occupancy_Type: "Residential Use", Most_Recent_Inspection: "Footing" },
        { ...base, Permit_Number: "A", Permit_Status: "Issued", Occupancy_Type: "Recreation Use", Most_Recent_Inspection: "Footing" },
        { ...base, Permit_Number: "B", Permit_Status: "In Review" },
        { ...base, Permit_Number: "C", Permit_Status: "Cancelled" },
        { ...base, Permit_Number: "D", Permit_Status: "Issued", Type_of_Structure: "Dwelling - Single Detached" },
        { ...base, Permit_Number: "E", Permit_Status: "Issued", Estimated_Project_Value: 2e6 },
      ]),
      MIN,
    );
    expect(rows.map((r) => [r.sourceKey, r.status])).toEqual([["permits-halifax:A", "under_construction"], ["permits-halifax:B", "proposed"]]);
    expect(rows[0]).toMatchObject({ category: "multi_residential", city: "Halifax", province: "Nova Scotia" });
    expect(rows[0].name).toContain("6319 Coburg Rd");
    expect(rows[0].description).toContain("Occupancy: Residential Use, Recreation Use");
    expect(halifaxUrl(MIN, TODAY)).toContain("Estimated_Project_Value+%3E%3D+5000000");
    expect(surreyUrl(MIN)).toContain("ValueOfConstruction+%3E%3D+5000000");
  });

  it("Surrey and Edmonton capital: value floors", () => {
    expect(parseSurreyPermits(arc([{ PermitNumber: "x", IssuedDate: "20261001", ValueOfConstruction: 4e6, SubDescription: "Offices", WorkDescription: "New" }]), MIN, TODAY)).toHaveLength(0);
    expect(parseEdmontonCapital([{ ebuilder_number: "e", project_name: "Small", current_phase: "Build", approved_budget_m: "500000" }], 1e6)).toHaveLength(0);
    const [cap] = parseEdmontonCapital([{ ebuilder_number: "e", project_name: "Bridge renewal", current_phase: "Build", approved_budget_m: "5923095", forecasted_budget: "6587000" }], 1e6);
    expect(cap).toMatchObject({ estValueCad: 6_587_000, status: "under_construction", owner: "City of Edmonton" });
  });

  it("applications: scale parsing, the major-scale bar, houses skipped, status 'application'", () => {
    expect(applicationScale("a 6-Storey 73 Dwelling Multi-Unit Housing with underground parkade")).toEqual({ storeys: 6, units: 73, gfaM2: null, buildings: null });
    expect(applicationScale("a seven-storey mixed-use building with 276 residential units")).toMatchObject({ storeys: 7, units: 276 });
    expect(applicationScale("an apartment building with 328 units and a 808m² commercial building")).toMatchObject({ units: 328, gfaM2: 808 });
    expect(applicationScale("warehouse of 120,000 sq. ft.").gfaM2).toBe(11148);
    expect(applicationScale("NEW: MULTI-RESIDENTIAL DEVELOPMENT (6 BUILDINGS)").buildings).toBe(6);
    expect(applicationScale("Zoning By-law Amendment", "120").units).toBe(120);
    expect(isMajorScale(applicationScale("3 Storey 18 Dwelling Multi-Unit Housing"))).toBe(false);
    expect(isMajorScale(applicationScale("6-storey building"))).toBe(true);
    expect(isMajorScale(applicationScale("an (_)-storey building with (_) units"))).toBe(false);
    expect(applicationCategory("69 single detached units")).toBeNull();
    expect(applicationCategory("6-Storey Multi-Unit Housing and to demolish Single Detached Houses")).toBe("multi_residential");
    expect(applicationCategory("apartment building with 328 units and a commercial building")).toBe("mixed_use");
    expect(applicationTitle("Site plan application", { storeys: 12, units: 240, gfaM2: null, buildings: null }, "mixed_use", "221 FINCH AVE W")).toBe(
      "Site plan application: 12-storey mixed-use building, 240 units — 221 Finch Ave W",
    );
    expect(tidyAddress("101, 9862 - 90 AVENUE NW")).toBe("9862 90 Avenue NW");

    const apps = allRows().filter((r) => r.source.startsWith("apps-"));
    expect(apps).toHaveLength(4);
    for (const a of apps) expect(a).toMatchObject({ status: "application", estValueCad: null });
    expect(parseEdmontonApps([{ city_file_number: "x", status: "Approved", description_of_development: "To construct a 2-Storey 8 Dwelling Multi-unit Housing building" }])).toHaveLength(0);
    expect(parseEdmontonApps([{ city_file_number: "y", status: "Refused", description_of_development: "To construct a 12-Storey building" }])).toHaveLength(0);
    expect(calgaryAppsUrl(TODAY)).toContain("starts_with");
  });

  it("Toronto / York: several applications on one site become one project keyed by the site", () => {
    const t = parseTorontoApps(
      [
        { APPLICATION_TYPE: "OZ", "APPLICATION#": "26 2 OZ", STREET_NUM: "221", STREET_NAME: "FINCH", STREET_TYPE: "AVE", STREET_DIRECTION: "W", DATE_SUBMITTED: "2026-10-01T00:00:00", STATUS: "Under Review", DESCRIPTION: "Rezoning to permit a 20-storey residential building with 300 units." },
        { APPLICATION_TYPE: "SA", "APPLICATION#": "26 1 SA", STREET_NUM: "221", STREET_NAME: "FINCH", STREET_TYPE: "AVE", STREET_DIRECTION: "W", DATE_SUBMITTED: "2026-10-02T00:00:00", STATUS: "Application Received", DESCRIPTION: "Site plan for the building." },
        { APPLICATION_TYPE: "SA", "APPLICATION#": "20 1 SA", STREET_NUM: "1", STREET_NAME: "OLD", STREET_TYPE: "RD", DATE_SUBMITTED: "2020-01-01T00:00:00", STATUS: "Under Review", DESCRIPTION: "A 30-storey tower." },
        { APPLICATION_TYPE: "SA", "APPLICATION#": "25 9 SA", STREET_NUM: "9", STREET_NAME: "GONE", STREET_TYPE: "ST", DATE_SUBMITTED: "2026-01-01T00:00:00", STATUS: "Closed", DESCRIPTION: "A 30-storey tower." },
      ],
      TODAY,
    );
    expect(t).toHaveLength(1);
    expect(t[0].name).toBe("Rezoning application: 20-storey residential building, 300 units — 221 Finch Ave W");
    expect(t[0].description).toContain("26 1 SA");
    const again = parseTorontoApps([{ APPLICATION_TYPE: "OZ", "APPLICATION#": "26 2 OZ", STREET_NUM: "221", STREET_NAME: "FINCH", STREET_TYPE: "AVENUE", STREET_DIRECTION: "WEST", DATE_SUBMITTED: "2026-10-01T00:00:00", STATUS: "Under Review", DESCRIPTION: "A 20-storey building." }], TODAY);
    expect(again[0].sourceKey).toBe(t[0].sourceKey);
    expect(parseYorkApps(arc([{ REG_FILE_NUM: "C1", APPL_TYPE: "Consent to Sever", APPL_DESC: "100 units", MUN_NAME: "Vaughan", ADDRESS: "1 A St" }]))).toHaveLength(0);
  });

  it("Manitoba: open projects only, no value", () => {
    const rows = parseManitobaCapital(arc([
      { Project__: "1", Project_Type: "Grading", Hwy: "6", Location_Description: "north of Grand Rapids", Project_Status: "Construction" },
      { Project__: "2", Project_Type: "Culvert", Project_Status: "Construction Prep & Purchases" },
      { Project__: "3", Project_Type: "Paving", Project_Status: "Complete" },
    ]));
    expect(rows.map((r) => r.status)).toEqual(["under_construction", "approved"]);
    expect(rows[0].name).toBe("Grading — Highway 6: north of Grand Rapids");
    expect(rows.every((r) => r.estValueCad == null)).toBe(true);
  });
});

describe("wave 2: stale handling", () => {
  const existing = (key: string): ExistingProject => ({ id: key, slug: key, source_key: key, status: "approved", stale: false, approved: true, review_status: "approved", last_seen: "2026-10-05", import_fingerprint: "old" });

  it("an uploaded file that drops projects marks them stale; a truncated file marks nothing", () => {
    const one = parseInfrastructureCanada([IC_HEAD, icRow({ PROJECT_NUMBER: "1" })].join("\n"), 1e6, TODAY);
    const plan = planSync({ source: "infrastructure-canada", incoming: one, existing: [existing("infrastructure-canada:1"), existing("infrastructure-canada:2")], today: TODAY, now: `${TODAY}T10:00:00Z`, regionIdBySlug: new Map() });
    expect(plan.stale).toEqual(["infrastructure-canada:2"]);
    const many = Array.from({ length: 10 }, (_, i) => existing(`infrastructure-canada:${i + 1}`));
    const guarded = planSync({ source: "infrastructure-canada", incoming: one, existing: many, today: TODAY, now: `${TODAY}T10:00:00Z`, regionIdBySlug: new Map() });
    expect(guarded.staleGuardTripped).toBe(true);
    expect(guarded.stale).toEqual([]);
  });

  it("BC's frozen inventory: its real date, and a note only once it is old", () => {
    const rows = [{ source: "bc-major-projects", sourceUpdated: "2024-12-01", stale: false }, { source: "permits-toronto", sourceUpdated: null, stale: false }];
    expect(frozenSourceDate(rows, "bc-major-projects", 180, Date.parse("2026-10-12"))).toBe("2024-12-01");
    expect(frozenSourceDate(rows, "bc-major-projects", 180, Date.parse("2025-01-15"))).toBeNull();
    expect(frozenSourceDate(rows, "permits-toronto")).toBeNull();
  });

  it("the source date is only written by sources that publish one", () => {
    const pqi = parsePqi(PQI_CSV)[0];
    const ic = parseInfrastructureCanada([IC_HEAD, icRow({})].join("\n"), 1e6, TODAY)[0];
    const plan = planSync({ source: "quebec-pqi", incoming: [pqi], existing: [], today: TODAY, now: TODAY, regionIdBySlug: new Map() });
    expect(plan.inserts[0].source_updated).toBe("2026-08-01");
    const plan2 = planSync({ source: "infrastructure-canada", incoming: [ic], existing: [], today: TODAY, now: TODAY, regionIdBySlug: new Map() });
    expect(plan2.inserts[0]).not.toHaveProperty("source_updated");
  });
});

describe("wave 2: dedupe (linked, never merged)", () => {
  const row = (o: Partial<LinkRow> & { id: string; source: string; name: string }): LinkRow => ({ city: "Montréal", province: "Quebec", estValueCad: null, ...o });

  it("links the same project across sources by name, city and value", () => {
    const groups = computeLinkGroups([
      row({ id: "a", source: "quebec-pqi", name: "Hôpital de Verdun – Modernisation", estValueCad: 1.2e9 }),
      row({ id: "b", source: "infrastructure-canada", name: "Hopital de Verdun modernisation project", estValueCad: 0.9e9 }),
      row({ id: "c", source: "quebec-pqi", name: "Hôpital de Verdun – Stationnement", estValueCad: 30e6 }),
      row({ id: "d", source: "infrastructure-canada", name: "Verdun Hospital modernization", city: "Gatineau" }),
      row({ id: "e", source: "infrastructure-canada", name: "Hôpital de Verdun – Modernisation", estValueCad: 9e9 }),
    ]);
    expect(groups.get("a")).toBe("a");
    expect(groups.get("b")).toBe("a");
    expect(groups.has("c")).toBe(false); // same source as a, different project
    expect(groups.has("d")).toBe(false); // other city
    expect(groups.has("e")).toBe(false); // value 7x apart
  });

  it("links an application and a permit on the same address; never links within one source", () => {
    const groups = computeLinkGroups([
      row({ id: "p", source: "permits-toronto", name: "New 20 storey building — 221 Finch Ave W", city: "Toronto", province: "Ontario", estValueCad: 80e6 }),
      row({ id: "q", source: "apps-toronto", name: "Rezoning application: 20-storey residential building, 300 units — 221 Finch Ave W", city: "Toronto", province: "Ontario" }),
      row({ id: "r", source: "permits-toronto", name: "Other building — 221 Finch Ave W", city: "Toronto", province: "Ontario" }),
      row({ id: "s", source: "apps-toronto", name: "Site plan application: 6-storey residential building — 221 Finch Ave W", city: "Mississauga", province: "Ontario" }),
    ]);
    expect(groups.get("p")).toBe("p");
    expect(groups.get("q")).toBe("p");
    expect(groups.get("r")).toBe("p"); // same site via q
    expect(groups.has("s")).toBe(false);
    expect(titleAddress("Rezoning application: x — 221 Finch Ave W")).toBe("221-finch-ave-w");
    expect(titleAddress("Bridge — Highway 10: north")).toBeNull();
    expect([...nameTokens("Hôpital de Verdun – Modernisation", "Montréal")]).toEqual(["hopital", "verdun", "modernisation"]);
  });

  it("the list shows one card per group; the page lists the others", () => {
    const rows = [
      { id: "1", linkGroup: "1", stale: false },
      { id: "2", linkGroup: null, stale: false },
      { id: "3", linkGroup: "1", stale: false },
      { id: "4", linkGroup: "1", stale: true },
    ];
    expect(collapseLinked(rows).map((c) => [c.row.id, c.sources])).toEqual([["1", 3], ["2", 1]]);
    expect(linkedListings({ id: "1", linkGroup: "1" }, rows).map((r) => r.id)).toEqual(["3"]);
    expect(linkedListings({ id: "2", linkGroup: null }, rows)).toEqual([]);
  });
});

describe("wave 2: admin upload decoding", () => {
  it("gunzips the browser's upload and reads Latin-1 or UTF-8", () => {
    const latin1 = new Uint8Array([...Buffer.from('"PROJECT_NUMBER","PROJECT_TITLE"\n1,"Centre des congr', "latin1"), 0xe8, ...Buffer.from('s"\n', "latin1")]);
    expect(decodeText(latin1)).toContain("Centre des congrès");
    expect(uploadText(new Uint8Array(gzipSync(latin1)))).toContain("Centre des congrès");
    expect(uploadText(new Uint8Array(Buffer.from("﻿a,b\n1,é", "utf8")))).toBe("a,b\n1,é");
    expect(hasHeader('"PROJECT_NUMBER","PROJECT_TITLE"\n1,2', "PROJECT_NUMBER")).toBe(true);
    expect(hasHeader("no_projet,nom_projet\n", "PROJECT_NUMBER")).toBe(false);
  });
});
