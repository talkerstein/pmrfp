import { describe, expect, it } from "vitest";
import {
  inferTrades,
  isoDate,
  normalizeCategory,
  normalizeStatus,
  parseMoney,
  permitMinValue,
  projectSlug,
  provinceName,
  urlsIn,
  valueBand,
  type MajorProjectInput,
} from "@/lib/major-projects/model";
import { defaultCategoryForFile, parseResearchCsv } from "@/lib/major-projects/research-csv";
import {
  calgaryUrl,
  companyOrNull,
  edmontonUrl,
  mississaugaUrl,
  ontarioBuildsCsvUrl,
  ontarioTarget,
  parseBcMpi,
  parseCalgaryPermits,
  parseEdmontonPermits,
  parseMississaugaPermits,
  parseOntarioBuilds,
  parseTorontoPermits,
  permitCategory,
  permitTitle,
  torontoUrl,
} from "@/lib/major-projects/sources";
import { fingerprint, groupByShape, planSync, type ExistingProject } from "@/lib/major-projects/sync";
import { filterProjects, isThinProject, parseProjectFilters, provinceCounts, relatedWork, sortProjects, type RelatedCandidate } from "@/lib/major-projects/filters";
import { projectAlertLine, projectAlertsFor, projectEvents, type ProjectAlertRow } from "@/lib/major-projects/alerts";
import type { MajorProject } from "@/lib/major-projects/data";

const TODAY = "2026-10-12";
const MIN = 5_000_000;

describe("normalisers", () => {
  it("parses money in every shape the feeds use", () => {
    expect(parseMoney("13000000000+ (excl. chips)")).toBe(13_000_000_000);
    expect(parseMoney("214000000 (US$155M)")).toBe(214_000_000);
    expect(parseMoney("900,000")).toBe(900_000);
    expect(parseMoney("$1.2B")).toBe(1_200_000_000);
    expect(parseMoney("750 million")).toBe(750_000_000);
    expect(parseMoney("3,864.00", 1e6)).toBe(3_864_000_000);
    expect(parseMoney(24, 1e6)).toBe(24_000_000);
    expect(parseMoney("not public")).toBeNull();
    expect(parseMoney("")).toBeNull();
    expect(parseMoney(0)).toBeNull();
  });

  it("maps source status wording, first phrase wins", () => {
    expect(normalizeStatus("Under construction / building complete")).toBe("under_construction");
    expect(normalizeStatus("Construction started")).toBe("under_construction");
    expect(normalizeStatus("Approvals in progress")).toBe("proposed");
    expect(normalizeStatus("Approved / pre-construction")).toBe("approved");
    expect(normalizeStatus("Issued Permit")).toBe("approved");
    expect(normalizeStatus("Permit Issued")).toBe("approved");
    expect(normalizeStatus("Stalled (power plant rejected)")).toBe("on_hold");
    expect(normalizeStatus("Denied at committee")).toBe("cancelled");
    expect(normalizeStatus("Completed / energizing")).toBe("completed");
    expect(normalizeStatus("Planning")).toBe("proposed");
    expect(normalizeStatus("Unverified")).toBe("unknown");
    expect(normalizeStatus("Work Not Started")).toBe("approved");
    expect(normalizeStatus("Ready for Issuance")).toBe("approved");
    expect(normalizeStatus("Pending Cancellation")).toBe("on_hold");
    expect(normalizeStatus("Inspection")).toBe("under_construction");
    expect(normalizeStatus(null)).toBe("unknown");
  });

  it("maps sectors to categories", () => {
    expect(normalizeCategory("Sturgeon Data Centre")).toBe("data_centre");
    expect(normalizeCategory("Residential", "Primarily residential - Single use")).toBe("multi_residential");
    expect(normalizeCategory("Education")).toBe("institutional");
    expect(normalizeCategory("Transit")).toBe("infrastructure");
    expect(normalizeCategory("Warehouses")).toBe("industrial");
    expect(normalizeCategory("Retail and Shops")).toBe("commercial");
    expect(normalizeCategory("")).toBe("other");
  });

  it("reads provinces by code or name, Canada only", () => {
    expect(provinceName("AB")).toBe("Alberta");
    expect(provinceName("québec")).toBe("Quebec");
    expect(provinceName("British Columbia")).toBe("British Columbia");
    expect(provinceName("TX")).toBeNull();
    expect(provinceName("Texas")).toBeNull();
  });

  it("permit minimum is C$5M unless configured (never below C$1M)", () => {
    expect(permitMinValue(undefined)).toBe(5_000_000);
    expect(permitMinValue("10000000")).toBe(10_000_000);
    expect(permitMinValue("50000")).toBe(5_000_000);
    expect(permitMinValue("abc")).toBe(5_000_000);
  });

  it("dates, urls, slugs, bands and trades", () => {
    expect(isoDate("2026-07-08T00:00:00.000")).toBe("2026-07-08");
    expect(isoDate(1788825600000)).toBe("2026-09-08");
    expect(urlsIn("Register via sturgeondatacentre.com/procurement and https://www.clarkbuilders.com/trade-partners.")).toEqual([
      "https://www.clarkbuilders.com/trade-partners",
      "https://sturgeondatacentre.com/procurement",
    ]);
    expect(projectSlug("Sturgeon Data Centre (Meta)", "manual:x")).toMatch(/^sturgeon-data-centre-meta-[a-z0-9]+$/);
    expect(projectSlug("A", "k1")).not.toBe(projectSlug("A", "k2"));
    expect(valueBand(6e6)).toBe("5m");
    expect(valueBand(2e9)).toBe("1b");
    expect(valueBand(null)).toBeNull();
    expect(inferTrades("data_centre", "MV electrical + switchgear, piling, fire protection, controls/BMS")).toEqual(
      expect.arrayContaining(["electrical", "concrete-and-asphalt", "fire-safety", "building-automation"]),
    );
    expect(inferTrades("institutional", "")).toContain("general-contracting");
  });
});

const RESEARCH = `"id","project","developer_owner","city_region","province","size_mw","est_value_cad","status_category","status_detail_and_evidence_date","general_contractor","trades_needed","bid_access_route","evidence_level","conflicts_and_caveats","source_urls"
"AB01","Sturgeon Data Centre (Meta)","Meta Platforms","Sturgeon County (Alberta Industrial Heartland)","AB","1000","13000000000+ (excl. chips)","Under construction","Groundbreaking announced 2026-07-08; grading May 2026","Frost Collective = Clark Builders + PCL","MV electrical, piling, fire protection","Register via sturgeondatacentre.com/procurement and prequalify through Clark Builders COMPASS (clarkbuilders.com/trade-partners)","F","MW figures conflict","https://about.fb.com/news/x ; https://www.clarkbuilders.com/sturgeon-data-centre"
"ON01","Microsoft Vaughan (YTO11), West Woodbridge","Microsoft","Vaughan","ON","","not public","Under construction / building complete","Building complete 2026-07-02","Not public","","","S","",""
"US01","Some Texas campus","X","Dallas","TX","","1000000000","Announced","","","","","A","",""`;

describe("research CSV (manual rows, review queue only)", () => {
  const { rows, skipped } = parseResearchCsv(RESEARCH, { defaultCategory: defaultCategoryForFile("2026-10-11-canada-data-centres.csv") });

  it("keeps Canadian rows and skips the rest", () => {
    expect(rows).toHaveLength(2);
    expect(skipped).toEqual([{ line: 4, reason: "not a Canadian province" }]);
  });

  it("carries evidence, sources, caveats and the bid route; GC 'Not public' is empty", () => {
    const [meta, msft] = rows;
    expect(meta).toMatchObject({
      source: "manual",
      sourceKey: "manual:sturgeon-data-centre-meta-alberta",
      province: "Alberta",
      city: "Sturgeon County",
      category: "data_centre",
      status: "under_construction",
      statusDate: "2026-07-08",
      estValueCad: 13_000_000_000,
      evidence: "F",
      generalContractor: "Frost Collective = Clark Builders + PCL",
      bidListUrl: "https://sturgeondatacentre.com/procurement",
      size: "1000 MW",
    });
    expect(meta.sources.map((s) => s.label)).toEqual(["about.fb.com", "clarkbuilders.com"]);
    expect(meta.caveats).toContain("MW figures conflict");
    expect(meta.tradesNeeded).toEqual(expect.arrayContaining(["electrical", "fire-safety"]));
    // File default beats a loose name guess ("Woodbridge" is not a bridge).
    expect(msft.category).toBe("data_centre");
    expect(msft.generalContractor).toBeNull();
    expect(msft.estValueCad).toBeNull();
    expect(msft.evidence).toBe("S");
  });
});

describe("open-data parsers", () => {
  it("BC MPI: $ millions, developer as owner, no phone, stale note", () => {
    const rows = parseBcMpi(
      {
        features: [
          { properties: { PROJECT_ID: 4566, PROJECT_NAME: "Hawksley Condominium", PROJECT_DESCRIPTION: "Eleven storey development of a 77-unit condominium.", ESTIMATED_COST: 20, CONSTRUCTION_TYPE: "Residential", MUNICIPALITY: "West Vancouver", DEVELOPER: "British Pacific Properties", PROJECT_STATUS: "Construction started", STANDARDIZED_START_DATE: "2023-Q3", STANDARDIZED_COMPLETION_DATE: "2025-Q4", TELEPHONE: "(604) 435-3321", LAST_UPDATE: "2024-12-01Z" } },
          { properties: { PROJECT_ID: null, PROJECT_NAME: "No id" } },
        ],
      },
      TODAY,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ sourceKey: "bc-major-projects:4566", estValueCad: 20_000_000, owner: "British Pacific Properties", province: "British Columbia", city: "West Vancouver", status: "under_construction", category: "multi_residential", statusDate: "2024-12-01", timeline: "Start Q3 2023, completion Q4 2025" });
    expect(JSON.stringify(rows[0])).not.toContain("435-3321");
    expect(rows[0].caveats).toContain("2024-12-01");
  });

  it("Ontario Builds: open work over the minimum, Excel dates fixed", () => {
    const csv = `Category,Supporting Ministry,Community,Project,Status,Target Completion Date,Description,Result,Estimated Total Budget ($),Website
Health care,Health,Brampton,New Peel Memorial hospital tower,Under construction,29-Mar,A new inpatient tower.,More beds.,1200000000,https://example.ca/peel
Education,Education,Guelph,Small school roof,Planning,27-Jan,Roof.,,1000000,
Transit,Transportation,Toronto,Finished line,Complete,24-Jan,Done.,,9000000000,`;
    const rows = parseOntarioBuilds(csv, MIN);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ city: "Brampton", province: "Ontario", category: "institutional", status: "under_construction", estValueCad: 1_200_000_000, timeline: "Target completion Mar 2029" });
    expect(rows[0].sourceKey).toMatch(/^ontario-builds:[a-z0-9]+$/);
    expect(ontarioTarget("28-Nov")).toBe("Nov 2028");
    expect(ontarioBuildsCsvUrl('<a href="https://data.ontario.ca/dataset/aefd/resource/35dc5416-2b86-4a79-b3e6-acbfe004c81a/download/ontbuilds-all-20261001.csv">')).toBe(
      "https://data.ontario.ca/dataset/aefd/resource/35dc5416-2b86-4a79-b3e6-acbfe004c81a/download/ontbuilds-all-20261001.csv",
    );
  });

  it("Toronto: value and category filters, latest revision, no personal builder names", () => {
    const base = { PERMIT_TYPE: "New Building", WORK: "New Building", STREET_NUM: "100", STREET_NAME: "KING", STREET_TYPE: "ST", STREET_DIRECTION: "W", APPLICATION_DATE: "2025-01-10", ISSUED_DATE: "2025-06-01", STATUS: "Permit Issued" };
    const rows = parseTorontoPermits(
      [
        { ...base, PERMIT_NUM: "25 1 BLD", REVISION_NUM: "00", STRUCTURE_TYPE: "Office", DESCRIPTION: "PROPOSED 12 STOREY OFFICE BUILDING", EST_CONST_COST: "48,000,000", BUILDER_NAME: "ELLISDON CORPORATION" },
        { ...base, PERMIT_NUM: "25 1 BLD", REVISION_NUM: "01", STRUCTURE_TYPE: "Office", DESCRIPTION: "PROPOSED 12 STOREY OFFICE BUILDING - REVISED", EST_CONST_COST: "52,000,000", BUILDER_NAME: "ELLISDON CORPORATION" },
        { ...base, PERMIT_NUM: "25 2 BLD", REVISION_NUM: "00", STRUCTURE_TYPE: "Apartment Building", DESCRIPTION: "New rental apartment", EST_CONST_COST: "30,000,000", BUILDER_NAME: "AHMET DERECI" },
        { ...base, PERMIT_NUM: "25 3 BLD", REVISION_NUM: "00", PERMIT_TYPE: "New Houses", STRUCTURE_TYPE: "SFD - Detached", DESCRIPTION: "New detached dwelling", EST_CONST_COST: "6,000,000" },
        { ...base, PERMIT_NUM: "25 4 BLD", REVISION_NUM: "00", STRUCTURE_TYPE: "Office", DESCRIPTION: "Small fit-out", EST_CONST_COST: "900,000" },
        { ...base, PERMIT_NUM: "20 5 BLD", REVISION_NUM: "00", STRUCTURE_TYPE: "Office", DESCRIPTION: "Old permit", EST_CONST_COST: "90,000,000", APPLICATION_DATE: "2019-01-01", ISSUED_DATE: "2020-01-01" },
      ],
      MIN,
      TODAY,
    );
    expect(rows.map((r) => r.sourceKey)).toEqual(["permits-toronto:25 1 BLD", "permits-toronto:25 2 BLD"]);
    expect(rows[0]).toMatchObject({ estValueCad: 52_000_000, generalContractor: "Ellisdon Corporation", category: "commercial", status: "approved", city: "Toronto", province: "Ontario" });
    expect(rows[1].generalContractor).toBeNull(); // a person's name is personal information
    expect(rows[1].category).toBe("multi_residential");
  });

  it("Calgary, Edmonton and Mississauga", () => {
    const cal = parseCalgaryPermits(
      [
        { permitnum: "BP2026-07470", statuscurrent: "Issued Permit", issueddate: "2026-10-08T00:00:00.000", permitclass: "5109 - School, Public", permitclassgroup: "Institutional", workclassgroup: "New", description: "New 2 Storey Building, Calgary Evanston K-4 School (Group A2)", contractorname: "BIRD-WRIGHT JOINT VENTURE", estprojectcost: "25577822", originaladdress: "1070 EVANSTON DR NW", communityname: "EVANSTON" },
        { permitnum: "BP2026-1", permitclassgroup: "Commercial", estprojectcost: "4000000" },
      ],
      MIN,
    );
    expect(cal).toHaveLength(1);
    expect(cal[0]).toMatchObject({ category: "institutional", generalContractor: "Bird-Wright Joint Venture", city: "Calgary", province: "Alberta", status: "approved", statusDate: "2026-10-08" });
    expect(cal[0].name).toBe("New 2 Storey Building, Calgary Evanston K-4 School — 1070 Evanston Dr Nw");

    const edm = parseEdmontonPermits(
      [
        { row_id: "13-637329393", issue_date: "2026-10-07T00:00:00.000", job_description: "To construct a 6-storey mixed-use building (224 dwelling units).", building_type: "Mixed Use (522)", work_type: "(01) New", construction_value: "43442875", units_added: "223", address: "7008 FANE ROAD NW" },
        { row_id: "1-1", building_type: "Single Detached House (110)", construction_value: "6000000", job_description: "House" },
      ],
      MIN,
    );
    expect(edm).toHaveLength(1);
    expect(edm[0]).toMatchObject({ category: "mixed_use", size: "223 homes", generalContractor: null, city: "Edmonton" });

    const mis = parseMississaugaPermits({ features: [{ attributes: { BP_NO: "BP 3ALT 26-557", STATUS: "ISSUED PERMIT", ADDRESS: "1515 MATHESON BLVD E", DESCRIPTION: "INTERIOR ALTERATIONS GROUND AND SECOND FLOOR", SCOPE: "ALTERATION TO EXISTING BLDG", FILE_TYPE: "COMMERCIAL", BLDG_TYPE: "COMMERCIAL OFFICE - MULTI-USER", EST_CON_VALUE: 5546661, ISSUE_DATE: 1788825600000 } }] }, MIN);
    expect(mis[0]).toMatchObject({ sourceKey: "permits-mississauga:BP 3ALT 26-557", category: "commercial", status: "approved", statusDate: "2026-09-08", city: "Mississauga" });
  });

  it("server-side filters carry the minimum value and the window", () => {
    const q = (u: string, k: string) => new URL(u).searchParams.get(k) ?? "";
    expect(q(calgaryUrl(MIN, TODAY), "$where")).toContain("estprojectcost >= 5000000 AND issueddate >= '2024-10-12'");
    expect(q(edmontonUrl(MIN, TODAY), "$where")).toContain("construction_value >= 5000000");
    expect(q(mississaugaUrl(MIN, TODAY), "where")).toBe("EST_CON_VALUE>=5000000 AND ISSUE_DATE>=DATE '2024-10-12'");
    expect(q(torontoUrl(0), "filters")).toContain('"PERMIT_TYPE":["New Building"');
  });

  it("permit helpers", () => {
    expect(permitCategory(["SFD - Detached"])).toBeNull();
    expect(permitCategory(["Parkade"])).toBe("commercial");
    expect(permitCategory(["Hospital"])).toBe("institutional");
    expect(permitCategory(["Multiple Use/Non Residential"])).toBe("commercial");
    // The type decides; a description mentioning solar panels doesn't make it an energy project.
    expect(permitCategory(["Mixed Use"], "mixed-use building with rooftop solar collectors")).toBe("mixed_use");
    expect(permitCategory([""], "new 6 storey apartment building with underground garage")).toBe("multi_residential");
    expect(permitTitle("New | Medicine Hill Block D | Group F3,Group C | 11612 sq.m", "#25 1878 NA'A DR SW", "x")).toBe("Medicine Hill Block D — #25 1878 Na'a Dr Sw");
    expect(companyOrNull("Kinetic Construction Ltd")).toBe("Kinetic Construction Ltd");
    expect(companyOrNull("Alison Lau")).toBeNull();
    expect(companyOrNull("*CONTRACTOR*")).toBeNull();
    expect(permitTitle("Group F2 3.2.2.79.", "21 CROWFOOT CI NW", "Commercial improvement")).toBe("Commercial improvement — 21 Crowfoot Ci Nw");
  });
});

function input(over: Partial<MajorProjectInput> = {}): MajorProjectInput {
  return {
    source: "permits-calgary", sourceKey: "permits-calgary:A", name: "A", description: null, category: "commercial", owner: null,
    city: "Calgary", province: "Alberta", regionSlug: "calgary", estValueCad: 6e6, size: null, status: "approved", statusRaw: "Issued Permit",
    statusDate: null, timeline: null, generalContractor: null, bidListUrl: null, bidRoute: null, tradesNeeded: ["electrical"], sources: [],
    license: "OGL", evidence: null, caveats: null, ...over,
  };
}

function existing(p: MajorProjectInput, over: Partial<ExistingProject> = {}): ExistingProject {
  return { id: `id-${p.sourceKey}`, slug: `slug-${p.sourceKey}`, source_key: p.sourceKey, status: p.status, stale: false, approved: true, review_status: "approved", last_seen: "2026-10-05", import_fingerprint: fingerprint(p), ...over };
}

const plan = (incoming: MajorProjectInput[], have: ExistingProject[], source = "permits-calgary") =>
  planSync({ source, incoming, existing: have, today: TODAY, now: `${TODAY}T09:26:00Z`, regionIdBySlug: new Map([["calgary", "r-cal"]]), provinceRegionId: (p) => (p === "Alberta" ? "r-ab" : null) });

describe("sync plan (stale, never delete)", () => {
  const a = input();
  const b = input({ sourceKey: "permits-calgary:B", name: "B", regionSlug: "airdrie" });

  it("inserts new open-data rows as public, with the region resolved (city, else province)", () => {
    const p = plan([a, b], []);
    expect(p.inserts).toHaveLength(2);
    expect(p.inserts[0]).toMatchObject({ approved: true, review_status: "approved", region_id: "r-cal", first_seen: TODAY, country: "CA" });
    expect(p.inserts[1].region_id).toBe("r-ab");
  });

  it("only bumps last_seen when nothing changed, and records status changes", () => {
    const moved = input({ status: "under_construction" });
    const p = plan([a], [existing(a)]);
    expect(p.touch).toEqual(["permits-calgary:A"]);
    expect(p.updates).toHaveLength(0);
    const q = plan([moved], [existing(a)]);
    expect(q.updates[0]).toMatchObject({ previous_status: "approved", status: "under_construction", slug: "slug-permits-calgary:A" });
    expect(q.updates[0]).not.toHaveProperty("approved"); // open data: review state untouched
    expect(q.statusChanges).toEqual([{ sourceKey: "permits-calgary:A", from: "approved", to: "under_construction" }]);
  });

  it("marks rows the source dropped as stale, and brings them back", () => {
    const rows = Array.from({ length: 4 }, (_, i) => input({ sourceKey: `permits-calgary:${i}` }));
    const p = plan(rows.slice(0, 3), rows.map((r) => existing(r)));
    expect(p.stale).toEqual(["permits-calgary:3"]);
    const back = plan(rows, rows.map((r, i) => existing(r, { stale: i === 3 })));
    expect(back.touch).toContain("permits-calgary:3");
  });

  it("marks nothing stale when the feed suddenly shrinks (broken endpoint)", () => {
    const rows = Array.from({ length: 10 }, (_, i) => input({ sourceKey: `permits-calgary:${i}` }));
    const p = plan(rows.slice(0, 2), rows.map((r) => existing(r)));
    expect(p.stale).toEqual([]);
    expect(p.staleGuardTripped).toBe(true);
  });

  it("manual rows: pending on insert, re-queued on change, never stale", () => {
    const m = input({ source: "manual", sourceKey: "manual:x" });
    const ins = plan([m], [], "manual");
    expect(ins.inserts[0]).toMatchObject({ approved: false, review_status: "pending" });
    const changed = plan([{ ...m, estValueCad: 9e9 }], [existing(m)], "manual");
    expect(changed.updates[0]).toMatchObject({ approved: false, review_status: "pending" });
    expect(changed.requeued).toBe(1);
    const dropped = plan([], [existing(m)], "manual");
    expect(dropped.stale).toEqual([]);
  });

  it("ignores rows from another source and duplicates", () => {
    const p = plan([a, a, input({ source: "manual", sourceKey: "manual:z" })], []);
    expect(p.inserts).toHaveLength(1);
  });

  it("groups update rows by identical column sets", () => {
    expect(groupByShape([{ a: 1, b: 2 }, { b: 1, a: 2 }, { a: 1 }]).map((g) => g.length)).toEqual([2, 1]);
  });
});

function project(over: Partial<MajorProject> = {}): MajorProject {
  return {
    id: "1", slug: "p", source: "permits-calgary", name: "Project", description: "A long enough description of a big building project in town.", category: "commercial",
    owner: null, city: "Calgary", province: "Alberta", regionId: null, estValueCad: 10e6, size: null, status: "approved", statusRaw: null, statusDate: null,
    timeline: null, tradesNeeded: ["electrical"], sources: [], license: "OGL", evidence: null, caveats: null, firstSeen: TODAY, lastSeen: TODAY,
    stale: false, staleSince: null, statusChangedAt: null, updatedAt: TODAY, hasGc: false, hasBidRoute: false, sourceUpdated: null, linkGroup: null, ...over,
  };
}

describe("list filters, sort and thin pages", () => {
  const rows = [
    project({ slug: "a", province: "Alberta", estValueCad: 10e6, status: "approved" }),
    project({ slug: "b", province: "Ontario", city: "Toronto", estValueCad: 2e9, status: "under_construction", category: "institutional", tradesNeeded: ["hvac"] }),
    project({ slug: "c", province: "Ontario", estValueCad: 50e6, status: "proposed", stale: true }),
  ];

  it("parses query filters, ignoring junk", () => {
    expect(parseProjectFilters({ province: "british-columbia", category: "data_centre", status: "nope", value: "1b", trade: "hvac" })).toMatchObject({
      province: "British Columbia", category: "data_centre", status: null, band: "1b", trade: "hvac", showStale: false,
    });
    expect(parseProjectFilters({ province: "texas" }).province).toBeNull();
  });

  it("filters by province, value band, trade; hides stale rows unless asked", () => {
    const f = parseProjectFilters({});
    expect(filterProjects(rows, f).map((r) => r.slug)).toEqual(["a", "b"]);
    expect(filterProjects(rows, { ...f, showStale: true })).toHaveLength(3);
    expect(filterProjects(rows, parseProjectFilters({ province: "ontario" })).map((r) => r.slug)).toEqual(["b"]);
    expect(filterProjects(rows, parseProjectFilters({ value: "1b" })).map((r) => r.slug)).toEqual(["b"]);
    expect(filterProjects(rows, parseProjectFilters({ value: "5m" })).map((r) => r.slug)).toEqual(["a"]);
    expect(filterProjects(rows, parseProjectFilters({ trade: "hvac" })).map((r) => r.slug)).toEqual(["b"]);
    expect(filterProjects(rows, parseProjectFilters({ q: "toronto" })).map((r) => r.slug)).toEqual(["b"]);
  });

  it("puts the visitor's province first, then live work, biggest first", () => {
    expect(sortProjects(rows, null).map((r) => r.slug)).toEqual(["b", "a", "c"]);
    expect(sortProjects(rows, "Alberta").map((r) => r.slug)).toEqual(["a", "b", "c"]);
    expect(provinceCounts(rows)).toEqual([{ province: "Alberta", n: 1 }, { province: "Ontario", n: 1 }]);
  });

  it("noindexes thin pages", () => {
    expect(isThinProject(project())).toBe(false);
    expect(isThinProject(project({ stale: true }))).toBe(true);
    expect(isThinProject(project({ estValueCad: null }))).toBe(true);
    expect(isThinProject(project({ description: "Short", owner: null }))).toBe(true);
    expect(isThinProject(project({ description: "Short", owner: "Meta" }))).toBe(false);
    expect(isThinProject(project({ source: "manual", estValueCad: null, description: null }))).toBe(false);
  });

  it("related work: same province and trade, own city first, never another country", () => {
    const c = (over: Partial<RelatedCandidate>): RelatedCandidate => ({ slug: "x", title: "x", city: "Calgary", province: "Alberta", categorySlugs: ["electrical"], deadline: "2026-11-01", isOpen: true, isAward: false, ...over });
    const r = relatedWork(project(), [
      c({ slug: "edm", city: "Edmonton", deadline: "2026-10-20" }),
      c({ slug: "cal", deadline: "2026-12-01" }),
      c({ slug: "hvac", categorySlugs: ["hvac"] }),
      c({ slug: "us", province: "Texas" }),
      c({ slug: "award", isAward: true, isOpen: false }),
    ]);
    expect(r.open.map((x) => x.slug)).toEqual(["cal", "edm"]);
    expect(r.awards.map((x) => x.slug)).toEqual(["award"]);
  });
});

describe("Trade Pro alerts (country-scoped)", () => {
  const since = "2026-10-05T00:00:00Z";
  const row = (over: Partial<ProjectAlertRow>): ProjectAlertRow => ({
    slug: "p", name: "P", province: "Alberta", city: "Calgary", status: "under_construction", previousStatus: "approved", estValueCad: 50e6,
    tradesNeeded: ["electrical"], firstSeenAt: "2026-01-01T00:00:00Z", statusChangedAt: "2026-10-11T09:26:00Z", stale: false, ...over,
  });
  const events = projectEvents(
    [
      row({ slug: "moved" }),
      row({ slug: "new", previousStatus: null, statusChangedAt: null, firstSeenAt: "2026-10-11T09:26:00Z", status: "approved" }),
      row({ slug: "old", statusChangedAt: "2026-09-01T00:00:00Z" }),
      row({ slug: "done", status: "completed" }),
      row({ slug: "stale", stale: true }),
      row({ slug: "ontario", province: "Ontario" }),
    ],
    since,
  );

  it("keeps new projects and real status changes in the window", () => {
    expect(events.map((e) => e.slug).sort()).toEqual(["moved", "new", "ontario"]);
    expect(events.find((e) => e.slug === "moved")?.kind).toBe("status");
  });

  it("matches province + trade, Canada only, and never repeats", () => {
    const member = { tradeSlugs: new Set(["electrical"]), provinces: new Set(["Alberta"]), countries: new Set<"CA" | "US">(["CA"]) };
    expect(projectAlertsFor(events, member).map((e) => e.slug).sort()).toEqual(["moved", "new"]);
    expect(projectAlertsFor(events, { ...member, countries: new Set<"CA" | "US">(["US"]) })).toEqual([]);
    expect(projectAlertsFor(events, { ...member, tradeSlugs: new Set(["roofing"]) })).toEqual([]);
    expect(projectAlertsFor(events, { ...member, alreadySent: new Set(["moved|under_construction"]) }).map((e) => e.slug)).toEqual(["new"]);
  });

  it("writes a plain line", () => {
    const moved = events.find((e) => e.slug === "moved")!;
    expect(projectAlertLine(moved, (n) => `$${n / 1e6}M`)).toBe("Now under construction (was approved) · Calgary, Alberta · $50M");
  });
});
