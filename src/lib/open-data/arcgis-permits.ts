/**
 * OPEN DATA: generic ArcGIS permit connector (pilot: 5 cities).
 *
 * One config entry per city turns a municipal ArcGIS FeatureServer /
 * MapServer permit layer into permit leads (permits.ts): the server filters
 * to value >= $100K and the last 24 months BEFORE any row is sent, we page
 * through the result 1,000 rows at a time with one request a second, and a
 * run is capped at ARCGIS_MAX_REQUESTS requests per city.
 *
 * HOW TO ADD A CITY (≈10 minutes, no code):
 *   1. Find the permit layer's REST URL (…/FeatureServer/0 or …/MapServer/0)
 *      and open it with ?f=json: the layer must expose a CONTRACTOR (business)
 *      field AND a declared / construction VALUE field AND an issue date.
 *   2. Add an entry to ARCGIS_CITIES below: key, city, province, layerUrl,
 *      fields {id, issued, value, contractor, workType[]}, dateKind (how the
 *      date field filters: "date" for esriFieldTypeDate, "string-iso" for
 *      "2026-10-15", "string-compact" for "20261015"), the licence and the
 *      attribution the city requires, and estimatedRows (24-month filtered).
 *   3. Dry-run: node scripts/run-open-data.mjs arcgis --city=<key>
 *      (prints rows kept and a sample, writes nothing).
 *   4. Re-read the city's open-data licence (set licenceChecked) and add the
 *      credit to the Data sources block (src/lib/open-data/sources.ts).
 *
 * What is NEVER read: owner, applicant, street address and description
 * fields. outFields lists only the id, date, value, contractor and
 * work-type columns.
 */
import { openDataJson, RequestBudget } from "./fetch";
import { foldPermits, permitWindowStart, workType, type PermitBatch, type RawPermit } from "./permits";

export const ARCGIS_PAGE = 1000;
export const ARCGIS_MAX_REQUESTS = 12;

export type DateKind = "date" | "string-iso" | "string-compact";

export interface ArcgisCity {
  key: string;
  /** award_history-style source key stored on every lead. */
  source: string;
  city: string;
  province: string;
  layerUrl: string;
  fields: { id: string; issued: string; value: string; contractor: string; workType: string[] };
  dateKind: DateKind;
  /** The layer's own OBJECTID field, for stable paging. */
  oidField: string;
  /** Credit shown wherever the data surfaces, exactly as the city's licence asks. */
  attribution: string;
  licence: string;
  /** false = the clause text was not read yet (listed for counsel). */
  licenceChecked: boolean;
  datasetUrl: string;
  /** Expected leads after the filter (24 months, >= $100K, business contractor). */
  estimatedRows: number;
  enabled: boolean;
}

export const ARCGIS_CITIES: ArcgisCity[] = [
  {
    key: "surrey",
    source: "permits-lead-surrey",
    city: "Surrey",
    province: "British Columbia",
    layerUrl: "https://services5.arcgis.com/YRpe0VKTJytZSSIB/arcgis/rest/services/IssuedBuildingPermits/FeatureServer/0",
    fields: { id: "PermitNumber", issued: "IssuedDate", value: "ValueOfConstruction", contractor: "BuildingGeneralContractorOrganization", workType: ["SubDescription", "WorkDescription"] },
    dateKind: "string-compact",
    oidField: "ObjectId",
    attribution: "Contains information licensed under the Open Government License – City of Surrey.",
    licence: "Open Government Licence – City of Surrey",
    licenceChecked: false,
    datasetUrl: "https://opendata-surrey.hub.arcgis.com/datasets/f3ec200f59a342e38c52248f07fe610d",
    estimatedRows: 850,
    enabled: true,
  },
  {
    key: "maple-ridge",
    source: "permits-lead-maple-ridge",
    city: "Maple Ridge",
    province: "British Columbia",
    layerUrl: "https://geoservices.mapleridge.ca/server/rest/services/DataCatalog/EconomicDevelopment/MapServer/0",
    fields: { id: "PermitNumber", issued: "IssueDate", value: "ConstructionValue", contractor: "ContractorName", workType: ["SubDescription", "WorkDescription"] },
    dateKind: "date",
    oidField: "OBJECTID",
    attribution: "Contains information licensed under the Open Government Licence – Maple Ridge.",
    licence: "Open Government Licence – Maple Ridge",
    licenceChecked: false,
    datasetUrl: "https://data-mapleridge.opendata.arcgis.com/",
    estimatedRows: 300,
    enabled: true,
  },
  {
    key: "airdrie",
    source: "permits-lead-airdrie",
    city: "Airdrie",
    province: "Alberta",
    layerUrl: "https://services1.arcgis.com/bctnJobT0aahg98G/arcgis/rest/services/Airdrie_BuildingAndTradePermits/FeatureServer/0",
    fields: { id: "PermitNumber", issued: "DateIssued", value: "ConstructionValue", contractor: "Contractor", workType: ["Workclass", "ApplicationType"] },
    dateKind: "string-iso",
    oidField: "OBJECTID",
    attribution: "Contains information licensed under the Open Government Licence – City of Airdrie.",
    licence: "Open Government Licence – City of Airdrie",
    licenceChecked: false,
    datasetUrl: "https://data-airdrie.opendata.arcgis.com/",
    estimatedRows: 1_400,
    enabled: true,
  },
  {
    key: "grande-prairie",
    source: "permits-lead-grande-prairie",
    city: "Grande Prairie",
    province: "Alberta",
    layerUrl: "https://services7.arcgis.com/2IF4itZw5lplW9PO/arcgis/rest/services/2026_Inspection_Permits/FeatureServer/0",
    fields: { id: "PermitNumber", issued: "DateIssued", value: "VALUATION", contractor: "CONTRACTOR_NAME", workType: ["PermitType", "PermitWorkItemType"] },
    dateKind: "date",
    oidField: "RecordID",
    attribution: "Contains information licensed under the Open Government Licence – City of Grande Prairie.",
    licence: "Open Government Licence – City of Grande Prairie",
    licenceChecked: false,
    datasetUrl: "https://opendata.cityofgp.com/",
    estimatedRows: 300,
    enabled: true,
  },
  {
    key: "kitchener",
    source: "permits-lead-kitchener",
    city: "Kitchener",
    province: "Ontario",
    layerUrl: "https://services1.arcgis.com/qAo1OsXi67t7XgmS/arcgis/rest/services/Building_Permits/FeatureServer/0",
    fields: { id: "PERMITNO", issued: "ISSUE_DATE", value: "CONSTRUCTION_VALUE", contractor: "CONTRACTOR", workType: ["PERMIT_TYPE", "SUB_WORK_TYPE"] },
    dateKind: "date",
    oidField: "OBJECTID",
    attribution: "Contains information licensed under the Open Government Licence – The Corporation of the City of Kitchener.",
    licence: "Open Government Licence – City of Kitchener",
    licenceChecked: false,
    datasetUrl: "https://open-kitchenergis.opendata.arcgis.com/datasets/KitchenerGIS::building-permits",
    estimatedRows: 900,
    enabled: true,
  },
];

export const arcgisCity = (key: string): ArcgisCity | undefined => ARCGIS_CITIES.find((c) => c.key === key);

/** The WHERE clause: value >= min AND issued on/after the window start, in the layer's own date type. */
export function whereClause(c: ArcgisCity, today: string, minValue: number): string {
  const from = permitWindowStart(today);
  const date =
    c.dateKind === "date"
      ? `${c.fields.issued} >= timestamp '${from} 00:00:00'`
      : c.dateKind === "string-compact"
        ? `${c.fields.issued} >= '${from.replace(/-/g, "")}'`
        : `${c.fields.issued} >= '${from}'`;
  return `${c.fields.value} >= ${minValue} AND ${date}`;
}

export function outFields(c: ArcgisCity): string {
  return [c.oidField, c.fields.id, c.fields.issued, c.fields.value, c.fields.contractor, ...c.fields.workType].join(",");
}

/** The /query URL for one page (or the count when `count`). */
export function queryUrl(c: ArcgisCity, today: string, minValue: number, o: { offset?: number; count?: boolean } = {}): string {
  const q = new URLSearchParams({ f: "json", where: whereClause(c, today, minValue) });
  if (o.count) {
    q.set("returnCountOnly", "true");
  } else {
    q.set("outFields", outFields(c));
    q.set("returnGeometry", "false");
    q.set("orderByFields", c.oidField);
    q.set("resultOffset", String(o.offset ?? 0));
    q.set("resultRecordCount", String(ARCGIS_PAGE));
  }
  return `${c.layerUrl}/query?${q}`;
}

type Attrs = Record<string, unknown>;

/** Features -> raw permits (the permit filter then decides what is kept). */
export function rawPermits(c: ArcgisCity, features: { attributes?: Attrs }[]): RawPermit[] {
  return features.map((f) => {
    const a = f.attributes ?? {};
    return {
      source: c.source,
      id: a[c.fields.id],
      city: c.city,
      province: c.province,
      issued: a[c.fields.issued],
      value: a[c.fields.value],
      contractor: a[c.fields.contractor],
      workType: workType(...c.fields.workType.map((f2) => a[f2])),
    };
  });
}

export interface ArcgisResult extends PermitBatch {
  city: string;
  /** Server-side count of rows matching value + window (before the business-name filter). */
  serverCount: number | null;
  requests: number;
}

/** Fetch and filter one city. `limit` stops paging after that many raw rows (dry runs, tests). */
export async function collectArcgisCity(c: ArcgisCity, today: string, o: { minValue?: number; limit?: number } = {}): Promise<ArcgisResult> {
  const minValue = o.minValue ?? 100_000;
  const budget = new RequestBudget(ARCGIS_MAX_REQUESTS);
  const count = await openDataJson<{ count?: number; error?: { message?: string } }>(queryUrl(c, today, minValue, { count: true }), budget);
  if (count.error) throw new Error(`${c.key}: ${count.error.message ?? "query error"}`);
  const raws: RawPermit[] = [];
  for (let offset = 0; ; offset += ARCGIS_PAGE) {
    const page = await openDataJson<{ features?: { attributes?: Attrs }[]; exceededTransferLimit?: boolean; error?: { message?: string } }>(
      queryUrl(c, today, minValue, { offset }),
      budget,
    );
    if (page.error) throw new Error(`${c.key}: ${page.error.message ?? "query error"}`);
    const features = page.features ?? [];
    raws.push(...rawPermits(c, features));
    if (features.length < ARCGIS_PAGE && !page.exceededTransferLimit) break;
    if (o.limit && raws.length >= o.limit) break;
  }
  const batch = foldPermits(o.limit ? raws.slice(0, o.limit) : raws, today, minValue);
  return { ...batch, city: c.city, serverCount: count.count ?? null, requests: budget.used };
}
