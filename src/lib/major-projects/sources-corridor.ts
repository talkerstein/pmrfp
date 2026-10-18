/**
 * Major projects, Toronto–Kitchener corridor: building permits and
 * development applications from the open-data portals of the cities between
 * Toronto and Kitchener-Waterloo. Canada (Ontario) only. Every source was
 * checked on 2026-10-18 for a licence that allows commercial reuse and for
 * robots.txt on the exact host the importer calls (evidence:
 * briefs/strategy/feed-map/corridor-permits-2026-10-18.csv).
 *
 *   permits-kitchener   City of Kitchener building permits >= the permit minimum (OGL-Kitchener)
 *   permits-waterloo    City of Waterloo building permits >= the permit minimum (City of Waterloo Open Data Licence)
 *   permits-cambridge   City of Cambridge building permits >= the permit minimum (OGL-Cambridge v2.1)
 *   permits-burlington  City of Burlington building permits >= the permit minimum (Burlington Open Data Terms of Use)
 *   permits-oakville    Town of Oakville building permits >= the permit minimum (OGL-Oakville)
 *   permits-brampton    City of Brampton building permits (CC BY 4.0). Brampton publishes NO
 *                       construction value, so a permit counts on scale instead
 *                       (5,000 m²+, 50+ homes or 6+ storeys) and shows no value.
 *   apps-hamilton       City of Hamilton development applications (City of Hamilton Open Data Licence)
 *   apps-oakville       Town of Oakville planning and development applications (OGL-Oakville)
 *   apps-brampton       City of Brampton site plan + OPA/ZBA/subdivision applications (CC BY 4.0)
 *
 * Every endpoint is an ArcGIS REST query (services*.arcgis.com, or the city's
 * own ArcGIS Server): no robots.txt rules are served on those hosts; the hub
 * sites' robots.txt only disallows /sites/, /admin/, /sessions/, /groups/,
 * /people/ and /workspace/, none of which is called. One query per page,
 * sequential, once a week (cron group "corridor").
 *
 * Not imported (see the CSV): Hamilton permits (no value field and last
 * issued 2023-12), Guelph, Milton, Vaughan, Markham permits and Halton
 * Region (no open permit / application dataset found; Vaughan publishes PDF
 * reports only), Milton development applications (no scale, date or address
 * fields), Region of Waterloo (issues no building permits). Vaughan and
 * Markham development applications already come in through apps-york.
 *
 * Personal information is never read: applicant / owner fields are not
 * requested except where the city publishes a company field (Brampton
 * BUILDER / CONTRACTOR / APPLICANT_COMPANY, Kitchener CONTRACTOR), and those
 * pass companyOrNull(); Brampton's CITY_PLANNER is never requested.
 *
 * Parsers are pure and exported for tests (test/unit/major-projects-corridor.test.ts).
 */
import { companyOrNull, hashKey, permitCategory, permitRow, permitTitle, sinceDate, type ProjectSource } from "./sources";
import {
  ARCGIS_PAGE,
  DEAD_APP,
  addressKey,
  applicationCategory,
  applicationRow,
  applicationScale,
  arcgisAll,
  groupBySite,
  isMajorScale,
  mergeScale,
  scaleText,
  tidyAddress,
  type Attrs,
  type Scale,
} from "./sources-wave2";
import { cleanText, isoDate, parseMoney, tidyName, type MajorProjectInput, type MajorProjectStatus } from "./model";

export const CORRIDOR_LICENSES = {
  kitchener: "Contains information licensed under the Open Government Licence – The Corporation of the City of Kitchener.",
  waterloo: "Contains information provided by the City of Waterloo under licence.",
  cambridge: "Contains information licensed under the Open Government License – City of Cambridge.",
  burlington:
    "Source: City of Burlington Open Data, used under the City of Burlington Open Data Terms of Use (https://opendata.burlington.ca/opendata-terms-of-use/City%20of%20Burlington%20-%20Open%20Data%20Terms%20of%20Use.pdf).",
  oakville: "Contains information licensed under the Open Government Licence – Town of Oakville.",
  brampton: "Source: City of Brampton Open Data (geohub.brampton.ca), licensed under CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/).",
  hamilton: "Contains public sector Data made available under the City of Hamilton's Open Data Licence.",
} as const;

type Feature = { attributes?: Attrs };

const query = (layer: string, params: Record<string, string>, offset: number) =>
  `${layer}/query?${new URLSearchParams({
    ...params,
    resultOffset: String(offset),
    resultRecordCount: String(ARCGIS_PAGE),
    returnGeometry: "false",
    f: "json",
  })}`;

const str = (v: unknown) => (v == null ? "" : String(v).trim());
const int = (v: unknown) => {
  const n = Number(String(v ?? "").replace(/[^\d.]/g, ""));
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
};
const sizeOf = (storeys: number, units: number, gfaM2 = 0) =>
  [storeys > 0 ? `${storeys} storeys` : null, units > 0 ? `${units.toLocaleString("en-CA")} homes` : null, gfaM2 > 0 ? `${Math.round(gfaM2).toLocaleString("en-CA")} m²` : null].filter(Boolean).join(" · ") || null;

/** Plumbing-, HVAC-, sign-, demolition- or site-service-only permits aren't buildings. */
const NOT_A_BUILDING = /plumbing|hvac|mechanical only|\bsigns?\b|demolition|site servic|sewage|septic|swimming pool|\btent\b|fire alarm|sprinkler|shoring|balcony|retaining wall|change of use/i;

/**
 * One project per site: a city often issues a foundation permit, then the
 * full building permit (and sometimes one per tower) for the same address.
 * The highest-value permit leads; the others are listed in the description.
 */
export function onePerSite(rows: { site: string; row: MajorProjectInput; permit: string }[]): MajorProjectInput[] {
  const by = new Map<string, { site: string; row: MajorProjectInput; permit: string }[]>();
  for (const r of rows) by.set(r.site, [...(by.get(r.site) ?? []), r]);
  const out: MajorProjectInput[] = [];
  for (const group of by.values()) {
    const sorted = [...group].sort((a, b) => (b.row.estValueCad ?? 0) - (a.row.estValueCad ?? 0) || (b.row.statusDate ?? "").localeCompare(a.row.statusDate ?? ""));
    const lead = sorted[0];
    const others = sorted.slice(1).map((o) => o.permit);
    out.push(
      others.length
        ? { ...lead.row, description: cleanText([lead.row.description, `Related permits at this address: ${others.join(", ")}.`].filter(Boolean).join(" "), 2000) }
        : lead.row,
    );
  }
  return out;
}

/** Permit status in the city's words → ours (issued + not finished = approved; occupancy / final = completed). */
function permitStatus(raw: string, completed: string | null, issued: string | null): { status: MajorProjectStatus; statusRaw: string } {
  if (completed || /final|complete|closed|occupancy/i.test(raw)) return { status: "completed", statusRaw: raw || "Completed" };
  if (/cancel|withdrawn|revoked|expired|refused/i.test(raw)) return { status: "cancelled", statusRaw: raw };
  if (/inspect|under construction|construction started/i.test(raw)) return { status: "under_construction", statusRaw: raw };
  if (issued || /issued/i.test(raw)) return { status: "approved", statusRaw: raw && raw !== "Issued" ? raw : "Permit issued" };
  return { status: "proposed", statusRaw: `Permit application: ${raw || "in review"}` };
}

const DEAD_PERMIT = /cancel|withdrawn|revoked|expired|refused|void/i;

/* ------------------------------------------------------------------ Kitchener */

export const KITCHENER_LAYER = "https://services1.arcgis.com/qAo1OsXi67t7XgmS/arcgis/rest/services/Building_Permits/FeatureServer/0";
export const KITCHENER_DATASET = "https://open-kitchenergis.opendata.arcgis.com/datasets/KitchenerGIS::building-permits";

export function kitchenerUrl(minValue: number, today: string, offset = 0): string {
  const since = sinceDate(today);
  return query(
    KITCHENER_LAYER,
    {
      where: `CONSTRUCTION_VALUE >= ${Math.round(minValue)} AND (ISSUE_DATE >= DATE '${since}' OR APPLICATION_DATE >= DATE '${since}')`,
      // OWNERS / APPLICANT / CONTRACTOR_CONTACT can name people: never requested.
      outFields:
        "OBJECTID,PERMITNO,PERMIT_TYPE,FOLDERNAME,PERMIT_STATUS,APPLICATION_DATE,ISSUE_DATE,FINAL_DATE,SUB_WORK_TYPE,WORK_TYPE,PERMIT_DESCRIPTION,CONSTRUCTION_VALUE,UNITS_CREATED,CONTRACTOR,STOREYS_PROPOSED,TOTAL_GFA_M2,OCCUPANCY_PERMITTED_DT",
      orderByFields: "OBJECTID",
    },
    offset,
  );
}

export function parseKitchenerPermits(features: Feature[], minValue: number): MajorProjectInput[] {
  const rows: { site: string; row: MajorProjectInput; permit: string }[] = [];
  for (const f of features) {
    const a = f.attributes ?? {};
    const id = cleanText(a.PERMITNO, 60);
    const value = parseMoney(a.CONSTRUCTION_VALUE);
    const st = str(a.PERMIT_STATUS);
    if (!id || !value || value < minValue || DEAD_PERMIT.test(st)) continue;
    const type = str(a.PERMIT_TYPE);
    const sub = str(a.SUB_WORK_TYPE);
    const desc = cleanText(a.PERMIT_DESCRIPTION, 1500);
    if (NOT_A_BUILDING.test(`${type} ${str(a.WORK_TYPE)}`)) continue;
    const category = /multiple use|mixed/i.test(type) ? "mixed_use" : permitCategory([type, sub], desc);
    if (!category) continue;
    const completed = isoDate(a.OCCUPANCY_PERMITTED_DT) ?? isoDate(a.FINAL_DATE);
    const issued = isoDate(a.ISSUE_DATE);
    const address = tidyAddress(a.FOLDERNAME);
    const { status, statusRaw } = permitStatus(st, completed, issued);
    const row = permitRow({
      source: "permits-kitchener",
      id,
      title: permitTitle(desc, address, `${str(a.WORK_TYPE) || "New"} ${(sub || type || "building").toLowerCase()}`),
      description: [desc, type ? `Permit type: ${type}${sub ? ` (${sub})` : ""}` : null].filter(Boolean).join(". "),
      category,
      city: "Kitchener",
      province: "Ontario",
      value,
      status: statusRaw,
      issued: issued ?? isoDate(a.APPLICATION_DATE),
      completed,
      contractor: companyOrNull(a.CONTRACTOR),
      size: sizeOf(int(String(a.STOREYS_PROPOSED ?? "").match(/^\s*(\d{1,3})/)?.[1]), int(a.UNITS_CREATED), Number(a.TOTAL_GFA_M2) || 0),
      license: CORRIDOR_LICENSES.kitchener,
      datasetUrl: KITCHENER_DATASET,
      datasetLabel: "City of Kitchener Open Data: Building Permits",
    });
    rows.push({ site: `kitchener:${addressKey(address) || id}`, permit: id, row: { ...row, status, statusRaw: cleanText(statusRaw, 200) } });
  }
  return onePerSite(rows);
}

/* ------------------------------------------------------------------ Waterloo */

export const WATERLOO_LAYER = "https://services.arcgis.com/ZpeBVw5o1kjit7LT/arcgis/rest/services/City_of_Waterloo_Building_Permits/FeatureServer/0";
export const WATERLOO_DATASET = "https://data.waterloo.ca/datasets/City-of-Waterloo::city-of-waterloo-building-permits";

export function waterlooUrl(minValue: number, today: string, offset = 0): string {
  return query(
    WATERLOO_LAYER,
    {
      where: `CONTRVALUE >= ${Math.round(minValue)} AND ISSUEDATE >= DATE '${sinceDate(today)}'`,
      outFields: "OBJECTID,PERMIT_ID,PERMIT_NUM,ADDRESS,STATUS,PERMITTYPE,PERMITDESC,SUBDESC,WORKDESC,DESCRIPTN,ISSUEDATE,CONTRVALUE,UNITS,PROPAREA",
      orderByFields: "OBJECTID",
    },
    offset,
  );
}

export function parseWaterlooPermits(features: Feature[], minValue: number): MajorProjectInput[] {
  const rows: { site: string; row: MajorProjectInput; permit: string }[] = [];
  for (const f of features) {
    const a = f.attributes ?? {};
    const id = cleanText(a.PERMIT_NUM, 60) ?? (a.PERMIT_ID != null ? String(a.PERMIT_ID) : null);
    const value = parseMoney(a.CONTRVALUE);
    const st = str(a.STATUS);
    if (!id || !value || value < minValue || DEAD_PERMIT.test(st)) continue;
    const kind = str(a.PERMITDESC);
    const sub = str(a.SUBDESC);
    if (NOT_A_BUILDING.test(`${kind} ${str(a.WORKDESC)}`)) continue;
    const desc = cleanText(String(a.DESCRIPTN ?? "").split(/\s*AMND #\d/)[0], 1500);
    const category = /mixed/i.test(kind) ? "mixed_use" : permitCategory([sub, kind], desc);
    if (!category) continue;
    const issued = isoDate(a.ISSUEDATE);
    const completed = /complete|occupancy final/i.test(st) ? issued : null;
    const address = tidyAddress(a.ADDRESS);
    const { status, statusRaw } = permitStatus(st, null, issued);
    const row = permitRow({
      source: "permits-waterloo",
      id: id.replace(/\s+/g, "-"),
      title: permitTitle(desc, address, `${str(a.WORKDESC) || "New"} ${(sub || "building").toLowerCase()}`),
      description: [desc, kind ? `Permit: ${kind}${sub ? ` (${sub})` : ""}` : null].filter(Boolean).join(". "),
      category,
      city: "Waterloo",
      province: "Ontario",
      value,
      status: statusRaw,
      issued,
      completed,
      size: sizeOf(0, int(a.UNITS)),
      license: CORRIDOR_LICENSES.waterloo,
      datasetUrl: WATERLOO_DATASET,
      datasetLabel: "City of Waterloo Open Data: Building Permits",
    });
    rows.push({ site: `waterloo:${addressKey(address) || id}`, permit: id, row: { ...row, status, statusRaw: cleanText(statusRaw, 200) } });
  }
  return onePerSite(rows);
}

/* ------------------------------------------------------------------ Cambridge */

export const CAMBRIDGE_LAYER = "https://services5.arcgis.com/LTaPSxJTf948f8sm/arcgis/rest/services/Building%20Permits/FeatureServer/0";
export const CAMBRIDGE_DATASET = "https://geohub.cambridge.ca/datasets/9093dbbced88444fb61134187737c547";

export function cambridgeUrl(minValue: number, today: string, offset = 0): string {
  return query(
    CAMBRIDGE_LAYER,
    {
      where: `CONSVALUE >= ${Math.round(minValue)} AND ISSUEDATE >= DATE '${sinceDate(today)}'`,
      outFields: "OBJECTID,HOUSE_NUMBER,STREET_NAME,FOLDERYEAR,FOLDERSEQUENCE,FOLDERSECTION,FOLDERREVISION,FOLDERDESC,STATUSDESC,ISSUEDATE,FINALDATE,CONSVALUE,SUBDESC,WORKDESC,PROP_NEW_UNITS",
      orderByFields: "OBJECTID",
    },
    offset,
  );
}

export function parseCambridgePermits(features: Feature[], minValue: number): MajorProjectInput[] {
  const rows: { site: string; row: MajorProjectInput; permit: string }[] = [];
  for (const f of features) {
    const a = f.attributes ?? {};
    const parts = [a.FOLDERYEAR, a.FOLDERSEQUENCE, a.FOLDERSECTION, a.FOLDERREVISION].map(str);
    const id = parts[0] && parts[1] ? parts.filter(Boolean).join("-") : null;
    const value = parseMoney(a.CONSVALUE);
    const st = str(a.STATUSDESC);
    const folder = str(a.FOLDERDESC);
    if (!id || !value || value < minValue || DEAD_PERMIT.test(st) || NOT_A_BUILDING.test(`${folder} ${str(a.WORKDESC)}`)) continue;
    const sub = str(a.SUBDESC);
    const category = permitCategory([sub], folder);
    if (!category) continue;
    const issued = isoDate(a.ISSUEDATE);
    const completed = isoDate(a.FINALDATE);
    const address = tidyAddress([a.HOUSE_NUMBER, a.STREET_NAME].map(str).filter(Boolean).join(" "));
    const { status, statusRaw } = permitStatus(st === "Closed" ? "" : st, completed, issued);
    const row = permitRow({
      source: "permits-cambridge",
      id,
      title: permitTitle(null, address, `${str(a.WORKDESC) || "New"} ${(sub || "building").toLowerCase()}`.replace(/\s+/g, " ")),
      description: [folder, sub ? `Building: ${sub}` : null, str(a.WORKDESC) ? `Work: ${str(a.WORKDESC)}` : null].filter(Boolean).join(". "),
      category,
      city: "Cambridge",
      province: "Ontario",
      value,
      status: statusRaw,
      issued,
      completed,
      size: sizeOf(0, int(a.PROP_NEW_UNITS)),
      license: CORRIDOR_LICENSES.cambridge,
      datasetUrl: CAMBRIDGE_DATASET,
      datasetLabel: "City of Cambridge Open Data: Building Permits",
    });
    rows.push({ site: `cambridge:${addressKey(address) || id}`, permit: id, row: { ...row, status, statusRaw: cleanText(statusRaw, 200) } });
  }
  return onePerSite(rows);
}

/* ------------------------------------------------------------------ Burlington */

export const BURLINGTON_LAYER = "https://mapping.burlington.ca/arcgisweb/rest/services/COB/Permits/MapServer/1";
export const BURLINGTON_DATASET = "https://navburl-burlington.opendata.arcgis.com/datasets/5a136c9ca8ee4b958d813c7426223cde";

export function burlingtonUrl(minValue: number, today: string, offset = 0): string {
  return query(
    BURLINGTON_LAYER,
    {
      where: `CONSTRUCTVALUE >= ${Math.round(minValue)} AND ISSUEDATE >= DATE '${sinceDate(today)}'`,
      outFields: "OBJECTID,ADDRESS,FOLDERTYPE,FILENO,INDATE,ISSUEDATE,WORKDESC,SUBDESC,FOLDERSTATUSDESC,RESUNITS,CONSTRUCTVALUE",
      orderByFields: "OBJECTID",
    },
    offset,
  );
}

export function parseBurlingtonPermits(features: Feature[], minValue: number): MajorProjectInput[] {
  const rows: { site: string; row: MajorProjectInput; permit: string }[] = [];
  for (const f of features) {
    const a = f.attributes ?? {};
    const id = cleanText(a.FILENO, 60);
    const value = parseMoney(a.CONSTRUCTVALUE);
    const st = str(a.FOLDERSTATUSDESC);
    const type = str(a.FOLDERTYPE).replace(/^[A-Z]{2}\s+/, "");
    const work = str(a.WORKDESC);
    if (!id || !value || value < minValue || DEAD_PERMIT.test(st) || NOT_A_BUILDING.test(`${type} ${work}`)) continue;
    const sub = str(a.SUBDESC);
    const category = permitCategory([type, sub], null);
    if (!category) continue;
    const issued = isoDate(a.ISSUEDATE);
    const address = tidyAddress(str(a.ADDRESS).replace(/\.\s*$/, ""));
    const { status, statusRaw } = permitStatus(st, null, issued);
    const row = permitRow({
      source: "permits-burlington",
      id,
      title: permitTitle(null, address, `${work || "New"} ${(sub || type || "building").toLowerCase()}`),
      description: [type ? `Permit type: ${type}` : null, sub ? `Building: ${sub}` : null, work ? `Work: ${work}` : null].filter(Boolean).join(". "),
      category,
      city: "Burlington",
      province: "Ontario",
      value,
      status: statusRaw,
      issued: issued ?? isoDate(a.INDATE),
      size: sizeOf(0, int(a.RESUNITS)),
      license: CORRIDOR_LICENSES.burlington,
      datasetUrl: BURLINGTON_DATASET,
      datasetLabel: "City of Burlington Open Data: Building Permits",
    });
    rows.push({ site: `burlington:${addressKey(address) || id}`, permit: id, row: { ...row, status, statusRaw: cleanText(statusRaw, 200) } });
  }
  return onePerSite(rows);
}

/* ------------------------------------------------------------------ Oakville */

export const OAKVILLE_PERMITS_LAYER = "https://services5.arcgis.com/QJebCdoMf4PF8fJP/arcgis/rest/services/Building_Permits/FeatureServer/0";
export const OAKVILLE_PERMITS_DATASET = "https://portal-exploreoakville.opendata.arcgis.com/datasets/c8b0e73d060b4c208e603c2bcad90d36";

export function oakvillePermitsUrl(minValue: number, today: string, offset = 0): string {
  const since = sinceDate(today);
  return query(
    OAKVILLE_PERMITS_LAYER,
    {
      where: `Construction_Value >= ${Math.round(minValue)} AND (ISSUEDATE >= DATE '${since}' OR INDATE >= DATE '${since}')`,
      outFields: "OBJECTID_1,CUSTOMFOLDERNUMBER,FOLDERDESCRIPTION,FOLDERNAME,FOLDERTYPE,Subtype,Worktype,INDATE,ISSUEDATE,Status,Construction_Value,Dwelling_Units_Created,GFA,StatusGroup,Number_of_Storeys",
      orderByFields: "OBJECTID_1",
    },
    offset,
  );
}

export function parseOakvillePermits(features: Feature[], minValue: number): MajorProjectInput[] {
  const rows: { site: string; row: MajorProjectInput; permit: string }[] = [];
  for (const f of features) {
    const a = f.attributes ?? {};
    const id = cleanText(a.CUSTOMFOLDERNUMBER, 60);
    const value = parseMoney(a.Construction_Value);
    const st = str(a.Status);
    const sub = str(a.Subtype);
    const work = str(a.Worktype);
    if (!id || !value || value < minValue || DEAD_PERMIT.test(st) || NOT_A_BUILDING.test(`${sub} ${work}`)) continue;
    const desc = cleanText(str(a.FOLDERDESCRIPTION).replace(/&sup2;/g, "²").replace(/\s*Site Services Permit:.*$/i, ""), 1500);
    const category = permitCategory([sub.replace(/^House - Part 9 - /, "")], desc);
    if (!category) continue;
    const issued = isoDate(a.ISSUEDATE);
    const address = tidyAddress(a.FOLDERNAME);
    const { status, statusRaw } = permitStatus(str(a.StatusGroup) || st, null, issued);
    const row = permitRow({
      source: "permits-oakville",
      id: id.replace(/\s+/g, "-"),
      title: permitTitle(desc, address, `${work || "New"} ${(sub || "building").toLowerCase()}`),
      description: [desc, sub ? `Building: ${sub}` : null].filter(Boolean).join(". "),
      category,
      city: "Oakville",
      province: "Ontario",
      value,
      status: statusRaw,
      issued: issued ?? isoDate(a.INDATE),
      size: sizeOf(int(a.Number_of_Storeys), int(a.Dwelling_Units_Created), Number(a.GFA) || 0),
      license: CORRIDOR_LICENSES.oakville,
      datasetUrl: OAKVILLE_PERMITS_DATASET,
      datasetLabel: "Town of Oakville Open Data: Building Permits",
    });
    rows.push({ site: `oakville:${addressKey(address) || id}`, permit: id, row: { ...row, status, statusRaw: cleanText(statusRaw, 200) } });
  }
  return onePerSite(rows);
}

/* ------------------------------------------------------------------ Brampton permits (scale, no value) */

export const BRAMPTON_PERMITS_LAYER = "https://maps1.brampton.ca/arcgis/rest/services/BuildingPermit/Building_Permits/MapServer/0";
export const BRAMPTON_PERMITS_DATASET = "https://geohub.brampton.ca/datasets/f1c647c68b0f429a8575f200a803bce8";

/** Brampton building classes that can be a major building (houses, decks, pools etc. are never requested). */
export const BRAMPTON_BIG_TYPES = [
  "9.6 (>6 Storeys - Residential)",
  "C: Apartments",
  "C: Apartments - Condominium",
  "C: Dormitories, Residences",
  "Stacked Townhouses",
  "A1: Theatres, Studios, Music Halls",
  "A2: Child Care Facility",
  "A2: Churches",
  "A2: Clubs, Halls, Recreation Centres",
  "A2: Community Centre",
  "A2: Courtrooms/Facilities",
  "A2: Museums",
  "A2: School",
  "B1: Detention Facilities",
  "B2: Medical and Care Facilities",
  "B3: Custodial, Convalescent Resid.",
  "D: Business/Services",
  "E: Retail",
  "F1: Industrial",
  "F2: Industrial",
  "F3: Industrial",
  "Fire Station",
] as const;
const BRAMPTON_WORK = ["New", "New Complete Building", "New Complete Building/Custom", "New Shell Building", "Addition - Complete", "Addition Shell", "Foundation Only", "Phased Permit"];
const sqlList = (xs: readonly string[]) => xs.map((x) => `'${x.replace(/'/g, "''")}'`).join(",");

export function bramptonPermitsUrl(today: string, offset = 0): string {
  return query(
    BRAMPTON_PERMITS_LAYER,
    {
      where: `ISSUEDATE >= DATE '${sinceDate(today)}' AND SUBDESC IN (${sqlList(BRAMPTON_BIG_TYPES)}) AND WORKDESC IN (${sqlList(BRAMPTON_WORK)})`,
      outFields: "OBJECTID,ADDRESS,PERMITNUMBER,SUBDESC,WORKDESC,ISSUEDATE,INDATE,STATUSDESC,BUILDER,CONTRACTOR,GFA,STOREYS,DWELLINGS",
      orderByFields: "OBJECTID",
    },
    offset,
  );
}

const BRAMPTON_NOTE =
  "Brampton's open data publishes no construction value for building permits; this permit is listed for its size (5,000 m² or more, 50+ homes or 6+ storeys).";

export function parseBramptonPermits(features: Feature[]): MajorProjectInput[] {
  type P = { id: string; site: string; address: string | null; sub: string; work: string; status: string; issued: string | null; builder: string | null; contractor: string | null; scale: Scale };
  const by = new Map<string, P[]>();
  for (const f of features) {
    const a = f.attributes ?? {};
    const id = cleanText(a.PERMITNUMBER, 60);
    const st = str(a.STATUSDESC);
    if (!id || DEAD_PERMIT.test(st)) continue;
    const address = tidyAddress(str(a.ADDRESS).replace(/,\s*Brampton.*$/i, ""));
    const p: P = {
      id,
      site: addressKey(address) || id,
      address,
      sub: str(a.SUBDESC),
      work: str(a.WORKDESC),
      status: st,
      issued: isoDate(a.ISSUEDATE) ?? isoDate(a.INDATE),
      builder: companyOrNull(a.BUILDER),
      contractor: companyOrNull(a.CONTRACTOR),
      scale: { storeys: int(a.STOREYS) || null, units: int(a.DWELLINGS) || null, gfaM2: Math.round(Number(a.GFA) || 0) || null, buildings: null },
    };
    by.set(p.site, [...(by.get(p.site) ?? []), p]);
  }
  const out: MajorProjectInput[] = [];
  for (const all of by.values()) {
    // Several permits at one address (one per building or phase): add up homes and floor area.
    const scale: Scale = {
      storeys: Math.max(0, ...all.map((p) => p.scale.storeys ?? 0)) || null,
      units: all.reduce((n, p) => n + (p.scale.units ?? 0), 0) || null,
      gfaM2: all.reduce((n, p) => n + (p.scale.gfaM2 ?? 0), 0) || null,
      buildings: all.length > 1 ? all.length : null,
    };
    if (!isMajorScale({ ...scale, buildings: null })) continue;
    const lead = [...all].sort((x, y) => (y.scale.gfaM2 ?? 0) - (x.scale.gfaM2 ?? 0) || (y.issued ?? "").localeCompare(x.issued ?? ""))[0];
    const category = /^9\.6|^C:|Stacked/i.test(lead.sub) ? "multi_residential" : permitCategory([lead.sub.replace(/^[A-F]\d?:\s*/, "")], null);
    if (!category) continue;
    const { status, statusRaw } = permitStatus(lead.status, null, lead.issued);
    const others = all.filter((p) => p !== lead).map((p) => p.id);
    const row = permitRow({
      source: "permits-brampton",
      id: hashKey(`brampton:${lead.site}`),
      title: permitTitle(null, lead.address, `${lead.work || "New"}: ${lead.sub.replace(/^[A-F]\d?:\s*/, "").toLowerCase()}`),
      description: [`Permit ${lead.id}: ${lead.work} (${lead.sub}).`, others.length ? `Related permits at this address: ${others.join(", ")}.` : null].filter(Boolean).join(" "),
      category,
      city: "Brampton",
      province: "Ontario",
      value: 0,
      status: statusRaw,
      issued: lead.issued,
      contractor: all.map((p) => p.contractor).find(Boolean) ?? null,
      owner: all.map((p) => p.builder).find(Boolean) ?? null,
      size: scaleText(scale),
      license: CORRIDOR_LICENSES.brampton,
      datasetUrl: BRAMPTON_PERMITS_DATASET,
      datasetLabel: "City of Brampton Open Data: Building Permits",
    });
    out.push({ ...row, estValueCad: null, status, statusRaw: cleanText(statusRaw, 200), caveats: BRAMPTON_NOTE });
  }
  return out;
}

/* ------------------------------------------------------------------ Hamilton applications */

export const HAMILTON_APPS_LAYER = "https://services.arcgis.com/rYz782eMbySr2srL/arcgis/rest/services/Development_Applications/FeatureServer/2";
export const HAMILTON_APPS_DATASET = "https://open.hamilton.ca/datasets/da765ab0f2f64ce5a4792879ecad9f17";

export function hamiltonAppsUrl(today: string, offset = 0): string {
  return query(
    HAMILTON_APPS_LAYER,
    { where: `FILE_YEAR >= ${Number(sinceDate(today).slice(0, 4))}`, outFields: "OBJECTID,FILE_NUM,FILE_TYPE,ADDRESS,FILE_YEAR,DESCRIP", orderByFields: "OBJECTID" },
    offset,
  );
}

// Pre-application consultations, minor variances, consents and part-lot files aren't projects yet.
const APP_SKIP = /consultation|minor variance|consent|part lot|validation|deeming|severance|exemption|sign|tree|pre-?consult|holding/i;
const appKind = (type: string) =>
  /site plan/i.test(type)
    ? "Site plan application"
    : /zoning|zba|rezon/i.test(type)
      ? "Rezoning application"
      : /official plan|opa/i.test(type)
        ? "Official plan amendment"
        : /condo/i.test(type)
          ? "Condominium application"
          : /subdivision/i.test(type)
            ? "Subdivision application"
            : "Development application";

/** Hamilton has no status field: a description that says the file is dead drops it. */
const HAMILTON_DEAD = /\b(withdrawn|refused|cancell?ed|denied)\b/i;

export function parseHamiltonApps(features: Feature[]): MajorProjectInput[] {
  const apps = [];
  for (const f of features) {
    const a = f.attributes ?? {};
    const id = cleanText(a.FILE_NUM, 60);
    const type = str(a.FILE_TYPE);
    const desc = cleanText(a.DESCRIP, 1500) ?? "";
    if (!id || APP_SKIP.test(type) || HAMILTON_DEAD.test(desc)) continue;
    const address = cleanText(a.ADDRESS, 160);
    const year = int(a.FILE_YEAR);
    apps.push({ id, type, desc, address, received: year ? `${year}-01-01` : null, site: `hamilton:${addressKey(address) || id}`, scale: applicationScale(desc) });
  }
  const out: MajorProjectInput[] = [];
  for (const { lead, all } of groupBySite(apps)) {
    const scale = mergeScale(all);
    if (!isMajorScale(scale)) continue;
    const category = applicationCategory(...all.map((a) => `${a.type} ${a.desc}`));
    if (!category) continue;
    const others = all.filter((a) => a !== lead).map((a) => `${a.id} (${a.type.toLowerCase()})`);
    out.push({
      ...applicationRow({
        source: "apps-hamilton",
        id: hashKey(lead.site),
        kind: appKind(lead.type),
        scale,
        category,
        address: lead.address,
        city: "Hamilton",
        province: "Ontario",
        description: [lead.desc || null, `City of Hamilton file ${lead.id} (${lead.type}).`, others.length ? `Related files on this site: ${others.join("; ")}.` : null].filter(Boolean).join(" "),
        statusRaw: `${lead.type}: received ${lead.received?.slice(0, 4) ?? ""}`.trim(),
        // Hamilton publishes the file year only.
        received: lead.received,
        license: CORRIDOR_LICENSES.hamilton,
        sources: [{ label: "City of Hamilton Open Data: Development Applications", url: HAMILTON_APPS_DATASET }],
      }),
      caveats: "The City of Hamilton publishes the year an application was filed, not its status or date.",
    });
  }
  return out;
}

/* ------------------------------------------------------------------ Oakville applications */

export const OAKVILLE_APPS_LAYER = "https://services5.arcgis.com/QJebCdoMf4PF8fJP/arcgis/rest/services/Planning_and_Development_Applications/FeatureServer/0";
export const OAKVILLE_APPS_DATASET = "https://portal-exploreoakville.opendata.arcgis.com/datasets/b94e0e77b22a48b9ad7a586f32801ff7";

export function oakvilleAppsUrl(today: string, offset = 0): string {
  return query(
    OAKVILLE_APPS_LAYER,
    {
      where: `IntakeDate >= DATE '${sinceDate(today)}'`,
      outFields: "OBJECTID,FolderRSN,FolderType,FolderNumber,Description,FolderName,IntakeDate,Status,Approval_Date,Proposed_Total___of_Units,Approved_Total___of_Units,Total_GFA__m2_,Commercial_GFA__m2_,Employment_GFA__m2_,Institution_GFA__m2_",
      orderByFields: "OBJECTID",
    },
    offset,
  );
}

export function parseOakvilleApps(features: Feature[]): MajorProjectInput[] {
  const apps = [];
  for (const f of features) {
    const a = f.attributes ?? {};
    const id = cleanText(a.FolderNumber, 60) ?? (a.FolderRSN != null ? `rsn-${a.FolderRSN}` : null);
    const type = str(a.FolderType);
    const st = str(a.Status);
    if (!id || APP_SKIP.test(type) || DEAD_APP.test(st)) continue;
    const desc = cleanText(a.Description, 1500) ?? "";
    const address = cleanText(a.FolderName, 160);
    const scale = applicationScale(desc, Math.max(int(a.Proposed_Total___of_Units), int(a.Approved_Total___of_Units)) || null);
    const gfa = Math.max(int(a.Total_GFA__m2_), int(a.Commercial_GFA__m2_) + int(a.Employment_GFA__m2_) + int(a.Institution_GFA__m2_));
    if (gfa > (scale.gfaM2 ?? 0)) scale.gfaM2 = gfa;
    apps.push({ id, type, desc, address, status: st, received: isoDate(a.IntakeDate), site: `oakville:${addressKey(address) || id}`, scale });
  }
  const out: MajorProjectInput[] = [];
  for (const { lead, all } of groupBySite(apps)) {
    const scale = mergeScale(all);
    if (!isMajorScale(scale)) continue;
    const category = applicationCategory(...all.map((a) => `${a.type} ${a.desc}`), scale.units ? "residential units" : null);
    if (!category) continue;
    const others = all.filter((a) => a !== lead).map((a) => `${a.id} (${a.type.toLowerCase()}, ${a.status.toLowerCase()})`);
    out.push(
      applicationRow({
        source: "apps-oakville",
        id: hashKey(lead.site),
        kind: appKind(lead.type),
        scale,
        category,
        address: lead.address,
        city: "Oakville",
        province: "Ontario",
        description: [lead.desc || null, `Town of Oakville file ${lead.id} (${lead.type}).`, others.length ? `Related files on this site: ${others.join("; ")}.` : null].filter(Boolean).join(" "),
        statusRaw: `${lead.type}: ${lead.status || "received"}`,
        received: lead.received,
        license: CORRIDOR_LICENSES.oakville,
        sources: [{ label: "Town of Oakville Open Data: Planning and Development Applications", url: OAKVILLE_APPS_DATASET }],
      }),
    );
  }
  return out;
}

/* ------------------------------------------------------------------ Brampton applications */

const BRAMPTON_PLANNING = "https://services3.arcgis.com/rl7ACuZkiFsmDA2g/ArcGIS/rest/services/Planning_Land_Use_Development/FeatureServer";
/** Layer 9: OPA / ZBA / subdivision; layer 11: site plan approval. */
export const BRAMPTON_APP_LAYERS = [`${BRAMPTON_PLANNING}/9`, `${BRAMPTON_PLANNING}/11`] as const;
export const BRAMPTON_APPS_DATASET = "https://geohub.brampton.ca/search?q=Planning_Land_Use_Development";

export function bramptonAppsUrl(layer: string, today: string, offset = 0): string {
  return query(
    layer,
    {
      where: `DATE_RECEIVED >= DATE '${sinceDate(today)}'`,
      // CITY_PLANNER (staff) is never requested.
      outFields: "FILE_NUMBER,LOCATION,DATE_RECEIVED,APPLICATION_TYPE,DESCRIPTION,STATUS,PROPOSAL_DESCRIPTION,APPLICANT_COMPANY",
      orderByFields: "FILE_NUMBER",
    },
    offset,
  );
}

export function parseBramptonApps(features: Feature[]): MajorProjectInput[] {
  const apps = [];
  for (const f of features) {
    const a = f.attributes ?? {};
    const id = cleanText(a.FILE_NUMBER, 60);
    const type = str(a.APPLICATION_TYPE);
    const st = str(a.STATUS);
    if (!id || APP_SKIP.test(type) || DEAD_APP.test(st) || /limited site plan/i.test(str(a.DESCRIPTION))) continue;
    const desc = cleanText(a.PROPOSAL_DESCRIPTION, 1500) ?? "";
    const address = cleanText(a.LOCATION, 160);
    apps.push({ id, type, desc, address, status: st, received: isoDate(a.DATE_RECEIVED), developer: companyOrNull(a.APPLICANT_COMPANY), site: `brampton:${addressKey(address) || id}`, scale: applicationScale(desc) });
  }
  const out: MajorProjectInput[] = [];
  for (const { lead, all } of groupBySite(apps)) {
    const scale = mergeScale(all);
    if (!isMajorScale(scale)) continue;
    const category = applicationCategory(...all.map((a) => `${a.type} ${a.desc}`));
    if (!category) continue;
    const others = all.filter((a) => a !== lead).map((a) => `${a.id} (${a.type.toLowerCase()})`);
    out.push(
      applicationRow({
        source: "apps-brampton",
        id: hashKey(lead.site),
        kind: appKind(lead.type),
        scale,
        category,
        address: lead.address ? tidyName(lead.address) : null,
        city: "Brampton",
        province: "Ontario",
        description: [lead.desc || null, `City of Brampton file ${lead.id} (${lead.type}).`, others.length ? `Related files on this site: ${others.join("; ")}.` : null].filter(Boolean).join(" "),
        statusRaw: `${lead.type}: ${lead.status || "received"}`,
        received: lead.received,
        owner: all.map((a) => a.developer).find(Boolean) ?? null,
        license: CORRIDOR_LICENSES.brampton,
        sources: [{ label: "City of Brampton Open Data: Planning applications", url: BRAMPTON_APPS_DATASET }],
      }),
    );
  }
  return out;
}

/* ------------------------------------------------------------------ registry */

export const CORRIDOR_SOURCES: ProjectSource[] = [
  { key: "permits-kitchener", label: "Kitchener building permits", group: "corridor", collect: async ({ today, minValue }) => parseKitchenerPermits(await arcgisAll((o) => kitchenerUrl(minValue, today, o)), minValue) },
  { key: "permits-waterloo", label: "Waterloo building permits", group: "corridor", collect: async ({ today, minValue }) => parseWaterlooPermits(await arcgisAll((o) => waterlooUrl(minValue, today, o)), minValue) },
  { key: "permits-cambridge", label: "Cambridge building permits", group: "corridor", collect: async ({ today, minValue }) => parseCambridgePermits(await arcgisAll((o) => cambridgeUrl(minValue, today, o)), minValue) },
  { key: "permits-burlington", label: "Burlington building permits", group: "corridor", collect: async ({ today, minValue }) => parseBurlingtonPermits(await arcgisAll((o) => burlingtonUrl(minValue, today, o)), minValue) },
  { key: "permits-oakville", label: "Oakville building permits", group: "corridor", collect: async ({ today, minValue }) => parseOakvillePermits(await arcgisAll((o) => oakvillePermitsUrl(minValue, today, o)), minValue) },
  { key: "permits-brampton", label: "Brampton building permits", group: "corridor", collect: async ({ today }) => parseBramptonPermits(await arcgisAll((o) => bramptonPermitsUrl(today, o))) },
  { key: "apps-hamilton", label: "Hamilton development applications", group: "corridor", collect: async ({ today }) => parseHamiltonApps(await arcgisAll((o) => hamiltonAppsUrl(today, o))) },
  { key: "apps-oakville", label: "Oakville development applications", group: "corridor", collect: async ({ today }) => parseOakvilleApps(await arcgisAll((o) => oakvilleAppsUrl(today, o))) },
  {
    key: "apps-brampton",
    label: "Brampton development applications",
    group: "corridor",
    collect: async ({ today }) => {
      const features: Feature[] = [];
      for (const layer of BRAMPTON_APP_LAYERS) features.push(...(await arcgisAll((o) => bramptonAppsUrl(layer, today, o))));
      return parseBramptonApps(features);
    },
  },
];
