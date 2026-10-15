/**
 * Open-data feeds for major projects in Canada. Every source here was
 * checked on 2026-10-12 for a reuse licence that allows commercial use and
 * for robots.txt on the exact endpoint (evidence:
 * briefs/strategy/feed-map/major-projects-sources-2026-10-12.csv).
 *
 *   bc-major-projects     BC Major Projects Inventory (WFS, OGL-BC)
 *   ontario-builds        Ontario Builds key infrastructure projects (CSV, OGL-Ontario)
 *   permits-toronto       Toronto building permits >= C$5M (CKAN API, OGL-Toronto)
 *   permits-calgary       Calgary building permits >= C$5M (Socrata, OGL-Calgary)
 *   permits-edmonton      Edmonton building permits >= C$5M (Socrata, OGL-Edmonton)
 *   permits-mississauga   Mississauga issued permits >= C$5M (ArcGIS, City Terms of Use)
 *
 * Wave 2 (funding lists, Halifax / Surrey permits, development applications,
 * city and provincial capital plans) lives in sources-wave2.ts; the full
 * registry is registry.ts.
 *
 * Not imported (see the CSV): Alberta Major Projects (a "Restricted
 * Dataset" under the site's terms), NRCan MPI and Vancouver permits
 * (robots.txt disallows the endpoints), Montréal permits (no value field),
 * Ottawa permits (yearly XLSX with a tab per month: next), Infrastructure
 * Ontario Market Update (PDF, no open licence).
 *
 * Parsers are pure and exported for tests; fetchers make ONE request per
 * source per run (Toronto: one per 32,000 rows of the filtered set), with a
 * named User-Agent. The importer only keeps commercial / institutional /
 * industrial / multi-residential work at or above the permit minimum.
 */
import { parseCsv } from "@/lib/tenders/csv";
import { slugify } from "@/lib/tenders/shared";
import { OGL_TORONTO_ATTRIBUTION } from "@/lib/tenders/sources";
import {
  PERMIT_CATEGORIES,
  cleanText,
  inferTrades,
  isoDate,
  normalizeCategory,
  normalizeStatus,
  parseMoney,
  safeUrl,
  tidyName,
  type MajorProjectCategory,
  type MajorProjectInput,
} from "./model";

export const UA = "PMRFP-MajorProjects/1.0 (+https://pmrfp.com)";
/** Permits issued (or applied for) in this window count as current. */
export const PERMIT_WINDOW_DAYS = 730;

export const LICENSES = {
  bc: "Contains information licensed under the Open Government Licence – British Columbia.",
  ontario: "Contains information licensed under the Open Government Licence – Ontario.",
  toronto: OGL_TORONTO_ATTRIBUTION,
  calgary: "Contains information licensed under the Open Government Licence – City of Calgary.",
  edmonton: "Contains information licensed under the Open Government Licence – City of Edmonton.",
  mississauga:
    "Source: City of Mississauga Open Data, used under the City of Mississauga Terms of Use (http://www5.mississauga.ca/research_catalogue/CityofMississauga_TermsofUse.pdf).",
} as const;

/* ------------------------------------------------------------------ shared */

export async function getText(url: string, timeoutMs = 90_000): Promise<string> {
  const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json, text/csv;q=0.9, */*;q=0.5" }, signal: AbortSignal.timeout(timeoutMs), cache: "no-store" });
  if (!res.ok) throw new Error(`${new URL(url).hostname} ${res.status}`);
  return res.text();
}

export async function getJson<T>(url: string): Promise<T> {
  return JSON.parse(await getText(url)) as T;
}

export function sinceDate(today: string, days = PERMIT_WINDOW_DAYS): string {
  return new Date(Date.parse(`${today}T00:00:00Z`) - days * 86_400_000).toISOString().slice(0, 10);
}

const COMPANY = /\b(inc|ltd|limited|corp|corporation|co|company|construction|constructors?|contracting|contractors?|builders?|build|building|group|developments?|homes|jv|joint venture|management|services|partners|partnership|llp|ulc|lp|l\.p|industries|enterprises|engineering|holdings|properties|realty|mechanical|electric(al)?|design|projects?|infrastructure|general)\b|&|\d{4,}/i;

/** A company name, or null when it may be a person (personal information is excluded from open-data licences). */
export function companyOrNull(name: unknown): string | null {
  const n = cleanText(name, 200);
  if (!n || /\*contractor\*/i.test(n)) return null;
  return COMPANY.test(n) ? tidyName(n) : null;
}

const SINGLE_FAMILY = /single[- ]?(detached|family|dwelling)|semi[- ]?detached|\bduplex\b|detached (house|dwelling)|\bsfd\b|new houses?\b|secondary suite|garden suite|laneway|accessory|swimming pool|\bdeck\b|\bgarage\b|demolition (folder|permit)|^demolition/i;

/**
 * Our category for a city permit, or null to skip it (houses, demolitions,
 * pools). The city's building / structure type decides; the free-text
 * description only helps when the type says nothing, and then only between
 * building categories (a mixed-use building "with rooftop solar collectors"
 * is not an energy project). Anything else non-residential is commercial.
 */
export function permitCategory(types: (string | null | undefined)[], description?: string | null): MajorProjectCategory | null {
  const t = types.filter(Boolean).join(" | ");
  if (SINGLE_FAMILY.test(t)) return null;
  const byType = normalizeCategory(t);
  if (byType !== "other") return byType === "mining" || byType === "oil_gas" ? "industrial" : byType;
  const byText = normalizeCategory(description);
  return PERMIT_CATEGORIES.has(byText) ? byText : "commercial";
}

/** "NEW 2 STOREY BUILDING, CALGARY EVANSTON K-4 SCHOOL (GROUP A2)" → a readable short title. */
export function permitTitle(description: string | null, address: string | null, fallback: string): string {
  const addr = address ? tidyName(cleanText(address, 120)) : null;
  let d = cleanText(description, 600) ?? "";
  // Calgary: "New | Medicine Hill Block D | Group F3,Group C | 11612 sq.m"
  if (d.includes(" | ")) d = d.split(" | ").filter((x) => !/^(new|improvement|alteration)$|^group [a-z]\d|sq\.? ?m\b|sq\.? ?ft\b/i.test(x.trim())).join(", ");
  d = d.replace(/^(proposal|proposed|to construct|construct|permit to)\s+(to\s+)?/i, "").replace(/\s*\((group|grp)[^)]*\)/gi, "");
  d = d.split(/(?<=[a-z0-9)])[.;]\s|\s+-\s+|\*\*/i)[0]?.trim() ?? "";
  if (d.length < 12 || /^group [a-z]\d/i.test(d) || /^[\d. ]+$/.test(d) || /^(partial permit|revision\b)/i.test(d)) d = "";
  if (d === d.toUpperCase()) d = d.toLowerCase();
  if (d) d = d.charAt(0).toUpperCase() + d.slice(1);
  if (d.length > 90) d = `${d.slice(0, 87).replace(/\s+\S*$/, "")}…`;
  const head = d || fallback;
  return addr ? `${head} — ${addr}` : head;
}

export function permitRow(p: {
  source: string;
  id: string;
  title: string;
  description: string | null;
  category: MajorProjectCategory;
  city: string;
  province: string;
  value: number;
  status: string | null;
  issued: string | null;
  completed?: string | null;
  contractor?: string | null;
  owner?: string | null;
  size?: string | null;
  license: string;
  datasetUrl: string;
  datasetLabel: string;
}): MajorProjectInput {
  const statusRaw = p.completed ? "Completed" : p.status ?? (p.issued ? "Permit issued" : "Application received");
  return {
    source: p.source,
    sourceKey: `${p.source}:${p.id}`,
    name: p.title.slice(0, 300),
    description: cleanText(p.description, 2000),
    category: p.category,
    owner: p.owner ?? null,
    city: p.city,
    province: p.province,
    regionSlug: slugify(p.city),
    estValueCad: p.value,
    size: p.size ?? null,
    status: normalizeStatus(statusRaw),
    statusRaw: cleanText(statusRaw, 200),
    statusDate: p.completed ?? p.issued,
    timeline: null,
    generalContractor: p.contractor ?? null,
    bidListUrl: null,
    bidRoute: null,
    tradesNeeded: inferTrades(p.category, p.description),
    sources: [{ label: p.datasetLabel, url: p.datasetUrl }],
    license: p.license,
    evidence: null,
    caveats: null,
  };
}

/* ------------------------------------------------------------------ BC MPI */

export const BC_WFS_URL =
  "https://openmaps.gov.bc.ca/geo/pub/wfs?service=WFS&version=2.0.0&request=GetFeature&typeNames=pub:WHSE_HUMAN_CULTURAL_ECONOMIC.MPI_ECON_MAJOR_PROJECTS_POINT&outputFormat=application/json&srsName=EPSG:4326";
export const BC_DATASET_URL = "https://catalogue.data.gov.bc.ca/dataset/major-projects-inventory-economic-points";

type BcProps = Record<string, string | number | null>;

/** "2023-Q3" → "Q3 2023". */
const quarter = (q: unknown) => {
  const m = String(q ?? "").match(/^(\d{4})-Q([1-4])$/);
  return m ? `Q${m[2]} ${m[1]}` : cleanText(q, 20);
};

export function parseBcMpi(json: { features?: { properties?: BcProps }[] }, today: string): MajorProjectInput[] {
  const out: MajorProjectInput[] = [];
  for (const f of json.features ?? []) {
    const r = f.properties ?? {};
    const id = r.PROJECT_ID ?? r.ECON_MAJOR_PROJECT_ID;
    const name = cleanText(r.PROJECT_NAME, 300);
    if (id == null || !name) continue;
    const category = normalizeCategory(String(r.CONSTRUCTION_TYPE ?? ""), String(r.CONSTRUCTION_SUBTYPE ?? ""), String(r.PROJECT_TYPE ?? ""), name);
    const desc = cleanText(r.PROJECT_DESCRIPTION, 2000);
    const updated = isoDate(String(r.LAST_UPDATE ?? "").replace(/Z$/, ""));
    const start = quarter(r.STANDARDIZED_START_DATE);
    const end = quarter(r.STANDARDIZED_COMPLETION_DATE);
    const statusRaw = cleanText([r.PROJECT_STATUS, r.PROJECT_STAGE].filter(Boolean).join(" · "), 200);
    const site = safeUrl(r.PROJECT_WEBSITE);
    const old = updated && Date.parse(today) - Date.parse(updated) > 180 * 86_400_000;
    out.push({
      source: "bc-major-projects",
      sourceKey: `bc-major-projects:${id}`,
      name,
      description: desc,
      category,
      // DEVELOPER is a company; TELEPHONE (an office line) is left out.
      owner: cleanText(r.DEVELOPER, 300),
      city: cleanText(r.MUNICIPALITY, 120),
      province: "British Columbia",
      regionSlug: r.MUNICIPALITY ? slugify(String(r.MUNICIPALITY)) : "british-columbia",
      estValueCad: parseMoney(r.ESTIMATED_COST, 1e6),
      size: null,
      status: normalizeStatus(statusRaw),
      statusRaw,
      statusDate: updated,
      timeline: start || end ? [start ? `Start ${start}` : null, end ? `completion ${end}` : null].filter(Boolean).join(", ") : null,
      generalContractor: null,
      bidListUrl: null,
      bidRoute: null,
      tradesNeeded: inferTrades(category, desc),
      sources: [{ label: "BC Major Projects Inventory", url: BC_DATASET_URL }, ...(site ? [{ label: "Project website", url: site }] : [])],
      license: LICENSES.bc,
      evidence: null,
      caveats: old ? `The province last updated this inventory entry on ${updated}.` : null,
      // The inventory's own date (every row is 2024-12-01 since the province
      // stopped publishing the layer), shown instead of our import date.
      sourceUpdated: updated,
    });
  }
  return out;
}

/* ------------------------------------------------------------------ Ontario Builds */

export const ONTARIO_BUILDS_PAGE = "https://data.ontario.ca/dataset/ontario-builds-key-infrastructure-projects";
const ONTARIO_BUILDS_RESOURCE = "35dc5416-2b86-4a79-b3e6-acbfe004c81a";
/** Last known download URL (the file name carries a date, so the page is checked first). */
const ONTARIO_BUILDS_FALLBACK =
  "https://data.ontario.ca/dataset/aefd72d3-f67c-44ed-b017-b74e7ecd9258/resource/35dc5416-2b86-4a79-b3e6-acbfe004c81a/download/ontbuilds-all-20260612.csv";

/** The current CSV link from the dataset page (data.ontario.ca disallows /api/ in robots.txt, not dataset pages). */
export function ontarioBuildsCsvUrl(html: string): string | null {
  const m = html.match(new RegExp(`https://data\\.ontario\\.ca/dataset/[a-z0-9-]+/resource/${ONTARIO_BUILDS_RESOURCE}/download/[^"'\\s<>]+\\.csv`, "i"));
  return m ? m[0] : null;
}

const MONTHS: Record<string, string> = { jan: "Jan", feb: "Feb", mar: "Mar", apr: "Apr", may: "May", jun: "Jun", jul: "Jul", aug: "Aug", sep: "Sep", oct: "Oct", nov: "Nov", dec: "Dec" };

/** Excel artefact "28-Nov" → "Nov 2028". */
export function ontarioTarget(s: string | null | undefined): string | null {
  const m = (s ?? "").trim().match(/^(\d{2})-([A-Za-z]{3})$/);
  if (m) return `${MONTHS[m[2].toLowerCase()] ?? m[2]} 20${m[1]}`;
  return cleanText(s, 40);
}

export function hashKey(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
  return h.toString(36);
}

export function parseOntarioBuilds(csv: string, minValue: number): MajorProjectInput[] {
  const out: MajorProjectInput[] = [];
  const seen = new Set<string>();
  for (const r of parseCsv(csv)) {
    const status = (r.Status ?? "").trim();
    if (!/planning|under construction/i.test(status)) continue; // completed work isn't a lead
    const value = parseMoney(r["Estimated Total Budget ($)"]);
    if (!value || value < minValue) continue;
    const project = cleanText(r.Project, 600);
    const community = cleanText(r.Community, 120);
    if (!project) continue;
    const key = hashKey(`${r.Category}|${project}|${community}`.toLowerCase());
    if (seen.has(key)) continue;
    seen.add(key);
    const category = normalizeCategory(r.Category, project);
    const desc = cleanText([cleanText(r.Description, 1200), cleanText(r.Result, 600)].filter(Boolean).join(" "), 2000);
    const ministry = cleanText(r["Supporting Ministry"], 120);
    const site = safeUrl(r.Website);
    const target = ontarioTarget(r["Target Completion Date"]);
    out.push({
      source: "ontario-builds",
      sourceKey: `ontario-builds:${key}`,
      name: project.length > 160 ? `${project.slice(0, 157).replace(/\s+\S*$/, "")}…` : project,
      description: desc,
      category: category === "other" ? "institutional" : category,
      owner: null,
      city: community,
      province: "Ontario",
      regionSlug: community ? slugify(community) : "ontario",
      estValueCad: value,
      size: null,
      status: normalizeStatus(status),
      statusRaw: status,
      statusDate: null,
      timeline: target ? `Target completion ${target}` : null,
      generalContractor: null,
      bidListUrl: null,
      bidRoute: null,
      tradesNeeded: inferTrades(category, desc),
      sources: [{ label: "Ontario Builds: key infrastructure projects", url: ONTARIO_BUILDS_PAGE }, ...(site ? [{ label: "Project page", url: site }] : [])],
      license: LICENSES.ontario,
      evidence: null,
      caveats: ministry ? `Provincial funding through the Ministry of ${ministry.replace(/^ministry of /i, "")}.` : null,
    });
  }
  return out;
}

/* ------------------------------------------------------------------ Toronto */

export const TORONTO_PERMITS_RESOURCE = "6d0229af-bc54-46de-9c2b-26759b01dd05";
export const TORONTO_PERMITS_DATASET = "https://open.toronto.ca/dataset/building-permits-active-permits/";
const TORONTO_TYPES = ["New Building", "Building Additions/Alterations", "Non-Residential Building Permit", "Multiple Use Permit", "Residential Building Permit", "Conditional Permit"];
const TORONTO_FIELDS = ["PERMIT_NUM", "REVISION_NUM", "PERMIT_TYPE", "STRUCTURE_TYPE", "WORK", "STREET_NUM", "STREET_NAME", "STREET_TYPE", "STREET_DIRECTION", "APPLICATION_DATE", "ISSUED_DATE", "COMPLETED_DATE", "STATUS", "DESCRIPTION", "CURRENT_USE", "PROPOSED_USE", "DWELLING_UNITS_CREATED", "EST_CONST_COST", "BUILDER_NAME"];
export const TORONTO_PAGE = 32_000;

export function torontoUrl(offset: number): string {
  const q = new URLSearchParams({
    resource_id: TORONTO_PERMITS_RESOURCE,
    filters: JSON.stringify({ PERMIT_TYPE: TORONTO_TYPES }),
    fields: TORONTO_FIELDS.join(","),
    limit: String(TORONTO_PAGE),
    offset: String(offset),
  });
  return `https://ckan0.cf.opendata.inter.prod-toronto.ca/api/3/action/datastore_search?${q}`;
}

export function parseTorontoPermits(records: Record<string, unknown>[], minValue: number, today: string): MajorProjectInput[] {
  const since = sinceDate(today);
  const byPermit = new Map<string, MajorProjectInput & { rev: string }>();
  for (const r of records) {
    const s = (k: string) => (r[k] == null ? "" : String(r[k]).trim());
    const value = parseMoney(s("EST_CONST_COST"));
    if (!value || value < minValue) continue;
    const issued = isoDate(s("ISSUED_DATE"));
    const applied = isoDate(s("APPLICATION_DATE"));
    if ((issued ?? applied ?? "") < since) continue;
    if (/demolition/i.test(s("WORK"))) continue;
    const category = permitCategory([s("STRUCTURE_TYPE"), s("PROPOSED_USE"), s("PERMIT_TYPE")], s("DESCRIPTION"));
    if (!category) continue;
    const permit = s("PERMIT_NUM");
    if (!permit) continue;
    const address = [s("STREET_NUM"), s("STREET_NAME"), s("STREET_TYPE"), s("STREET_DIRECTION")].filter(Boolean).join(" ");
    const units = Number(s("DWELLING_UNITS_CREATED")) || 0;
    const row = permitRow({
      source: "permits-toronto",
      id: permit,
      title: permitTitle(s("DESCRIPTION"), address, `${s("WORK") || "Building"} (${s("STRUCTURE_TYPE") || "non-residential"})`),
      description: s("DESCRIPTION"),
      category,
      city: "Toronto",
      province: "Ontario",
      value,
      status: s("STATUS") || null,
      issued,
      completed: isoDate(s("COMPLETED_DATE")),
      contractor: companyOrNull(s("BUILDER_NAME")),
      size: units > 0 ? `${units} new homes` : null,
      license: LICENSES.toronto,
      datasetUrl: TORONTO_PERMITS_DATASET,
      datasetLabel: "City of Toronto Open Data: Building Permits, Active Permits",
    });
    // Revisions share a permit number: keep the latest revision.
    const rev = s("REVISION_NUM");
    const prev = byPermit.get(permit);
    if (!prev || rev > prev.rev) byPermit.set(permit, { ...row, rev });
  }
  return [...byPermit.values()].map(({ rev: _rev, ...p }) => p);
}

/* ------------------------------------------------------------------ Calgary */

export const CALGARY_DATASET = "https://data.calgary.ca/Business-and-Economic-Activity/Building-Permits/c2es-76ed";
const CALGARY_GROUPS = ["Commercial", "Institutional", "Industrial", "Apartment", "Government", "Townhouse"];

export function calgaryUrl(minValue: number, today: string): string {
  const where = `estprojectcost >= ${Math.round(minValue)} AND issueddate >= '${sinceDate(today)}' AND permitclassgroup in (${CALGARY_GROUPS.map((g) => `'${g}'`).join(",")})`;
  const q = new URLSearchParams({ $where: where, $limit: "50000", $order: "issueddate DESC" });
  return `https://data.calgary.ca/resource/c2es-76ed.json?${q}`;
}

export function parseCalgaryPermits(rows: Record<string, string>[], minValue: number): MajorProjectInput[] {
  const out: MajorProjectInput[] = [];
  for (const r of rows) {
    const value = parseMoney(r.estprojectcost);
    if (!value || value < minValue || !r.permitnum) continue;
    const group = r.permitclassgroup ?? "";
    const category =
      group === "Apartment" || group === "Townhouse"
        ? "multi_residential"
        : group === "Government"
          ? "institutional"
          : permitCategory([group, r.permitclass?.replace(/^\d+\s*-\s*/, "")], r.description);
    if (!category) continue;
    const units = Number(r.housingunits) || 0;
    out.push(
      permitRow({
        source: "permits-calgary",
        id: r.permitnum,
        title: permitTitle(r.description, r.originaladdress, `${r.workclassgroup ?? "New"} ${group.toLowerCase() || "commercial"} building`),
        description: [r.description, r.permitclass ? `Class: ${r.permitclass.replace(/^\d+\s*-\s*/, "")}` : null, r.communityname ? `Community: ${tidyName(r.communityname)}` : null].filter(Boolean).join(". "),
        category,
        city: "Calgary",
        province: "Alberta",
        value,
        status: r.statuscurrent ?? null,
        issued: isoDate(r.issueddate),
        completed: isoDate(r.completeddate),
        contractor: companyOrNull(r.contractorname),
        owner: null,
        size: [units > 0 ? `${units} homes` : null, Number(r.totalsqft) > 0 ? `${Math.round(Number(r.totalsqft)).toLocaleString("en-CA")} sq ft` : null].filter(Boolean).join(" · ") || null,
        license: LICENSES.calgary,
        datasetUrl: CALGARY_DATASET,
        datasetLabel: "City of Calgary Open Data: Building Permits",
      }),
    );
  }
  return out;
}

/* ------------------------------------------------------------------ Edmonton */

export const EDMONTON_DATASET = "https://data.edmonton.ca/Urban-Planning-Economy/General-Building-Permits/24uj-dj8v";

export function edmontonUrl(minValue: number, today: string): string {
  const q = new URLSearchParams({
    $where: `construction_value >= ${Math.round(minValue)} AND issue_date >= '${sinceDate(today)}'`,
    $limit: "50000",
    $order: "issue_date DESC",
  });
  return `https://data.edmonton.ca/resource/24uj-dj8v.json?${q}`;
}

export function parseEdmontonPermits(rows: Record<string, string>[], minValue: number): MajorProjectInput[] {
  const out: MajorProjectInput[] = [];
  for (const r of rows) {
    const value = parseMoney(r.construction_value);
    if (!value || value < minValue || !r.row_id) continue;
    const type = (r.building_type ?? "").replace(/\s*\(\d+\)\s*$/, "");
    const category = permitCategory([type], r.job_description);
    if (!category) continue;
    const units = Number(r.units_added) || 0;
    const work = (r.work_type ?? "").replace(/^\(\d+\)\s*/, "");
    out.push(
      permitRow({
        source: "permits-edmonton",
        id: r.row_id,
        title: permitTitle(r.job_description, r.address, `${work || "New"} ${type.toLowerCase() || "commercial building"}`),
        description: [r.job_description, type ? `Building type: ${type}` : null, r.neighbourhood ? `Neighbourhood: ${tidyName(r.neighbourhood)}` : null].filter(Boolean).join(". "),
        category,
        city: "Edmonton",
        province: "Alberta",
        value,
        status: r.occupancy_granted_date ? "Completed" : "Permit issued",
        issued: isoDate(r.issue_date),
        completed: isoDate(r.occupancy_granted_date),
        // floor_area's unit isn't documented, so it isn't shown.
        size: units > 0 ? `${units} homes` : null,
        license: LICENSES.edmonton,
        datasetUrl: EDMONTON_DATASET,
        datasetLabel: "City of Edmonton Open Data: General Building Permits",
      }),
    );
  }
  return out;
}

/* ------------------------------------------------------------------ Mississauga */

export const MISSISSAUGA_DATASET = "https://data.mississauga.ca/datasets/issued-building-permits";

export function mississaugaUrl(minValue: number, today: string): string {
  const q = new URLSearchParams({
    where: `EST_CON_VALUE>=${Math.round(minValue)} AND ISSUE_DATE>=DATE '${sinceDate(today)}'`,
    outFields: "BP_NO,STATUS,ADDRESS,DESCRIPTION,SCOPE,FILE_TYPE,BLDG_TYPE,APPL_AREA,STOREYS,EST_CON_VALUE,RES_UNITS,ISSUE_DATE,COMPLETE_DATE",
    returnGeometry: "false",
    resultRecordCount: "2000",
    f: "json",
  });
  return `https://services6.arcgis.com/hM5ymMLbxIyWTjn2/arcgis/rest/services/Issued_Building_Permits/FeatureServer/0/query?${q}`;
}

export function parseMississaugaPermits(json: { features?: { attributes?: Record<string, string | number | null> }[] }, minValue: number): MajorProjectInput[] {
  const out: MajorProjectInput[] = [];
  for (const f of json.features ?? []) {
    const r = f.attributes ?? {};
    const value = parseMoney(r.EST_CON_VALUE);
    const id = cleanText(r.BP_NO, 60);
    if (!value || value < minValue || !id) continue;
    const category = permitCategory([String(r.BLDG_TYPE ?? ""), String(r.FILE_TYPE ?? "")], String(r.DESCRIPTION ?? ""));
    if (!category) continue;
    const units = Number(r.RES_UNITS) || 0;
    const storeys = Number(r.STOREYS) || 0;
    out.push(
      permitRow({
        source: "permits-mississauga",
        id,
        title: permitTitle(String(r.DESCRIPTION ?? ""), String(r.ADDRESS ?? ""), tidyName(String(r.BLDG_TYPE ?? r.SCOPE ?? "New building")) ?? "New building"),
        description: [r.DESCRIPTION, r.SCOPE, r.BLDG_TYPE ? `Building type: ${tidyName(String(r.BLDG_TYPE))}` : null].filter(Boolean).map((x) => tidyName(String(x))).join(". "),
        category,
        city: "Mississauga",
        province: "Ontario",
        value,
        status: cleanText(r.STATUS, 60),
        issued: isoDate(r.ISSUE_DATE),
        completed: isoDate(r.COMPLETE_DATE),
        size: [storeys > 0 ? `${storeys} storeys` : null, units > 0 ? `${units} homes` : null].filter(Boolean).join(" · ") || null,
        license: LICENSES.mississauga,
        datasetUrl: MISSISSAUGA_DATASET,
        datasetLabel: "City of Mississauga Open Data: Issued Building Permits",
      }),
    );
  }
  return out;
}

/* ------------------------------------------------------------------ registry */

/**
 * Which weekly cron run imports a source (each run has its own 300 s budget
 * and its own minute): core = /api/cron/major-projects, funding and local =
 * /api/cron/major-projects/<group>.
 */
export type SourceGroup = "core" | "funding" | "local";

export interface ProjectSource {
  key: string;
  label: string;
  group?: SourceGroup;
  /** Fetch + parse. One request per run (Toronto: one per 32,000 filtered rows). */
  collect: (ctx: { today: string; minValue: number; fundingMin?: number }) => Promise<MajorProjectInput[]>;
}

export const PROJECT_SOURCES: ProjectSource[] = [
  {
    key: "bc-major-projects",
    label: "BC Major Projects Inventory",
    collect: async ({ today }) => parseBcMpi(await getJson(BC_WFS_URL), today),
  },
  {
    key: "ontario-builds",
    label: "Ontario Builds",
    collect: async ({ minValue }) => {
      const page = await getText(ONTARIO_BUILDS_PAGE).catch(() => "");
      return parseOntarioBuilds(await getText(ontarioBuildsCsvUrl(page) ?? ONTARIO_BUILDS_FALLBACK), minValue);
    },
  },
  {
    key: "permits-toronto",
    label: "Toronto building permits",
    collect: async ({ today, minValue }) => {
      const records: Record<string, unknown>[] = [];
      for (let offset = 0; offset < 200_000; offset += TORONTO_PAGE) {
        const json = await getJson<{ success: boolean; result?: { records?: Record<string, unknown>[] } }>(torontoUrl(offset));
        const page = json.result?.records ?? [];
        records.push(...page);
        if (page.length < TORONTO_PAGE) break;
      }
      return parseTorontoPermits(records, minValue, today);
    },
  },
  {
    key: "permits-calgary",
    label: "Calgary building permits",
    collect: async ({ today, minValue }) => parseCalgaryPermits(await getJson(calgaryUrl(minValue, today)), minValue),
  },
  {
    key: "permits-edmonton",
    label: "Edmonton building permits",
    collect: async ({ today, minValue }) => parseEdmontonPermits(await getJson(edmontonUrl(minValue, today)), minValue),
  },
  {
    key: "permits-mississauga",
    label: "Mississauga building permits",
    collect: async ({ today, minValue }) => parseMississaugaPermits(await getJson(mississaugaUrl(minValue, today)), minValue),
  },
];
