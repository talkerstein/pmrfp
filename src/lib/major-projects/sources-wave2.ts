/**
 * Major projects, wave 2: funding lists, capital plans, two more permit
 * feeds and development applications. Canada only. Every source was checked
 * again on 2026-10-12 for a licence that allows commercial reuse and for
 * robots.txt on the exact host the importer calls (evidence:
 * briefs/strategy/feed-map/major-projects-sources-wave2-2026-10-12.csv).
 *
 *   infrastructure-canada  Infrastructure Canada projects list, >= C$1M, not finished
 *                          (OGL-Canada). UPLOAD ONLY: infrastructure.gc.ca's
 *                          robots.txt disallows /alt-format/, where the file lives,
 *                          so an admin downloads it in a browser and uploads it at
 *                          /admin/major-projects. The importer never fetches it.
 *   quebec-pqi             Québec PQI dashboard of $20M+ projects (CC BY 4.0). The
 *                          dataset page, then the newest /download/ CSV, 10 s apart
 *                          (Crawl-Delay 10; the CKAN /api/ is disallowed, not used).
 *   capital-edmonton       City of Edmonton capital projects (OGL-Edmonton)
 *   manitoba-capital       Manitoba capital plans project status (OpenMB licence)
 *   permits-halifax        Halifax building permits >= C$5M (OGL-Halifax)
 *   permits-surrey         Surrey building permits >= C$5M, GC company named (OGL-Surrey)
 *   apps-toronto           Toronto development applications (OGL-Toronto)
 *   apps-edmonton          Edmonton major development permits (OGL-Edmonton)
 *   apps-calgary           Calgary development permits for new buildings (OGL-Calgary)
 *   apps-york              York Region development applications (York Open Data Licence)
 *
 * Development applications carry no dollar value, so only ones that show
 * real scale are kept (6+ storeys, 50+ units, 5,000+ m², or 3+ buildings);
 * their status is 'application'. Staff contact names, phone numbers and
 * e-mails in these feeds are never read; applicant / developer /
 * contractor names are kept only when they read as a company.
 *
 * Parsers are pure and exported for tests (test/unit/major-projects-wave2.test.ts).
 */
import { parseCsv } from "@/lib/tenders/csv";
import { slugify } from "@/lib/tenders/shared";
import {
  LICENSES,
  companyOrNull,
  getJson,
  getText,
  hashKey,
  permitCategory,
  permitRow,
  permitTitle,
  sinceDate,
  type ProjectSource,
} from "./sources";
import {
  DEFAULT_FUNDING_MIN_CAD,
  PERMIT_CATEGORIES,
  cleanText,
  inferTrades,
  isoDate,
  normalizeCategory,
  parseMoney,
  provinceName,
  provinceSlug,
  safeUrl,
  tidyName,
  type MajorProjectCategory,
  type MajorProjectInput,
  type MajorProjectStatus,
} from "./model";

export const WAVE2_LICENSES = {
  canada: "Contains information licensed under the Open Government Licence – Canada.",
  pqi:
    "Source: Secrétariat du Conseil du trésor du Québec, « Tableau de bord des projets d'infrastructures de 20 M$ et plus », Données Québec, licence CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). Labels translated and summarised by PMRFP.",
  halifax: "Contains information licenced under the Open Government Licence – Halifax.",
  surrey: "Contains information licensed under the Open Government License – City of Surrey.",
  york: "Contains public sector information made available under The Regional Municipality of York's Open Data Licence.",
  manitoba: "Contains information from the Government of Manitoba, licensed under the OpenMB Information and Data Use License (Manitoba.ca/OpenMB).",
  toronto: LICENSES.toronto,
  edmonton: LICENSES.edmonton,
  calgary: LICENSES.calgary,
} as const;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const money = (n: number) => `C$${Math.round(n).toLocaleString("en-CA")}`;

/* ------------------------------------------------------------------ names */

// Words that make a recipient / owner name an organisation, not a person.
const ORG_WORDS =
  /\b(city|town|village|township|county|municipal(ity)?|district|region(al)?|hamlet|first nations?|nations?|band|m[ée]tis|inuit|inuvialuit|government|province|provincial|federal|authority|board|commission|corporation|corp|society|association|club|league|foundation|cent(re|er)|museum|church|parish|universit(y|é)|college|coll[eè]ge|school|scolaire|h[oô]pital|hospital|institute?|council|conseil|co-?op(erative)?|coop[ée]rative|trust|agency|agence|services?|inc|ltd|limit[ée]e?|company|compagnie|ville|municipalit[ée]|r[ée]gie|soci[ée]t[ée]|f[ée]d[ée]ration|organisme|fondation|mus[ée]e|maison|r[ée]seau|transit|transport|ymca|ywca|housing|habitat|ventures?|group|groupe|partners(hip)?|enterprises?|holdings|developments?|properties|construction|ministry|minist[eè]re|department|airport|a[ée]roport|port|harbour|utilit(y|ies)|hydro|energy|[ée]nergie|water|library|biblioth[eè]que|arena|ar[ée]na|legion|chamber|chambre|community|communautaire|clinic|clinique|health|sant[ée]|nursing|lodge|manor|residence|r[ée]sidence|centre-ville|sports?|arts?|cultur(e|al)|heritage|patrimoine)\b|&|\d/i;
// "Jane Smith", "Jean-Luc Tremblay", "J. R. Smith", "Smith, Jane".
const W = "[A-ZÀ-Ý][a-zà-ÿ'’]+(?:-[A-ZÀ-Ý]?[a-zà-ÿ'’]+)*";
const PERSON = new RegExp(`^(?:(?:mr|mrs|ms|dr|m|mme)\\.?\\s+)?${W}(?:\\s+[A-Z]\\.)?(?:\\s+${W}){1,2}$|^${W},\\s*${W}(?:\\s+[A-Z]\\.?)?$`);

/**
 * An owner / recipient name, or null when it may be a person (personal
 * information is excluded from every open-data licence used here). Broader
 * than companyOrNull: municipalities, First Nations, leagues and museums
 * count, not just companies.
 */
export function organisationOrNull(name: unknown): string | null {
  const n = cleanText(name, 300);
  if (!n) return null;
  if (ORG_WORDS.test(n)) return n;
  return PERSON.test(n) ? null : n;
}

/** First line of a multi-line "Name\nStreet\nCity" field. */
const firstLine = (s: unknown) => (typeof s === "string" ? s.split(/\r?\n/)[0]?.trim() ?? "" : "");

/* ------------------------------------------------------------------ scale */

const WORD_NUM: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17,
  eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50,
};
const NUM = `\\d{1,3}(?:,\\d{3})+|\\d+(?:\\.\\d+)?|${Object.keys(WORD_NUM).join("|")}`;
const num = (s: string) => WORD_NUM[s.toLowerCase()] ?? Number(s.replace(/,/g, ""));

export interface Scale {
  storeys: number | null;
  units: number | null;
  gfaM2: number | null;
  buildings: number | null;
}

/** Minimums for a development application to count as a major project. */
export const APP_MIN = { storeys: 6, units: 50, gfaM2: 5000, buildings: 3 } as const;

function maxOf(text: string, re: RegExp, pick: (m: RegExpMatchArray) => number): number | null {
  let best: number | null = null;
  for (const m of text.matchAll(re)) {
    const n = pick(m);
    if (Number.isFinite(n) && n > 0 && (best == null || n > best)) best = n;
  }
  return best;
}

/**
 * Storeys, units, floor area and building count named in an application
 * description ("a 6-Storey 73 Dwelling Multi-Unit Housing", "an apartment
 * building with 328 units and a 808m² commercial building", "(6 BUILDINGS)").
 */
export function applicationScale(text: string | null | undefined, unitsField?: unknown): Scale {
  const s = (text ?? "").replace(/\s+/g, " ");
  const storeys = maxOf(
    s,
    new RegExp(`\\b(${NUM})(?:\\s*(?:-|to|and)\\s*(\\d{1,3}))?[\\s-]*(?:storeys?|story|stories|étages?)\\b`, "gi"),
    (m) => Math.max(num(m[1]), m[2] ? num(m[2]) : 0),
  );
  const unitsText = maxOf(
    s,
    new RegExp(
      `\\b(${NUM})(?:-unit\\b|\\s+(?:new\\s+|additional\\s+|proposed\\s+|total\\s+)?(?:(?:residential|dwelling|rental|condominium|condo|apartment|housing|market|affordable|purpose-built|student|seniors?|townhouse|stacked|back-to-back|multi-unit|mixed)\\s+)*(?:dwelling units?|dwellings?|units?|suites|homes|apartments|residences|logements)\\b)`,
      "gi",
    ),
    (m) => num(m[1]),
  );
  const fieldUnits = Number(String(unitsField ?? "").replace(/[^\d.]/g, "")) || null;
  const units = Math.max(unitsText ?? 0, fieldUnits ?? 0) || null;
  const m2 = maxOf(s, new RegExp(`(${NUM})\\s*(?:m2|m²|sq\\.?\\s?m\\.?|square met(?:re|er)s?|sqm|mètres carrés)(?![a-z])`, "gi"), (m) => num(m[1]));
  const ft2 = maxOf(s, new RegExp(`(${NUM})\\s*(?:sq\\.?\\s?ft\\.?|square feet|sf)(?![a-z])`, "gi"), (m) => num(m[1]) / 10.7639);
  const gfa = Math.max(m2 ?? 0, ft2 ?? 0);
  const buildings = maxOf(s, new RegExp(`\\(?\\b(${NUM})\\s+(?:new\\s+|residential\\s+|mixed[- ]use\\s+|apartment\\s+|condominium\\s+|commercial\\s+|industrial\\s+)?(?:buildings|towers)\\b`, "gi"), (m) => num(m[1]));
  return { storeys, units, gfaM2: gfa > 0 ? Math.round(gfa) : null, buildings };
}

export function isMajorScale(s: Scale): boolean {
  return (
    (s.storeys ?? 0) >= APP_MIN.storeys ||
    (s.units ?? 0) >= APP_MIN.units ||
    (s.gfaM2 ?? 0) >= APP_MIN.gfaM2 ||
    (s.buildings ?? 0) >= APP_MIN.buildings
  );
}

export function scaleText(s: Scale): string | null {
  return (
    [
      s.storeys ? `${s.storeys} storeys` : null,
      s.units ? `${s.units.toLocaleString("en-CA")} units` : null,
      s.gfaM2 ? `${s.gfaM2.toLocaleString("en-CA")} m²` : null,
      s.buildings && s.buildings > 1 ? `${s.buildings} buildings` : null,
    ]
      .filter(Boolean)
      .join(" · ") || null
  );
}

const SFD_ONLY = /(single|semi)[- ]detached|\bduplex\b/i;
const MULTI = /multi|apartment|mixed[- ]use|storey|stor(y|ies)|town ?house|row ?house|condo|stacked|tower/i;

/** Category of a development application, or null for houses-only files. */
export function applicationCategory(...texts: (string | null | undefined)[]): MajorProjectCategory | null {
  const t = texts.filter(Boolean).join(" | ");
  if (SFD_ONLY.test(t) && !MULTI.test(t)) return null;
  const residential = /residential|dwelling|apartment|condo|\bunits?\b|homes|housing|town ?house|row ?house|rental|student/i.test(t);
  const commercial = /commercial|retail|office|restaurant|hotel/i.test(t);
  if (/mixed[- ]use/i.test(t) || (residential && commercial)) return "mixed_use";
  if (residential) return "multi_residential";
  const c = normalizeCategory(t);
  if (c === "mining" || c === "oil_gas" || c === "energy") return "industrial";
  return PERMIT_CATEGORIES.has(c) ? c : "commercial";
}

const NOUN: Partial<Record<MajorProjectCategory, string>> = {
  multi_residential: "residential building",
  mixed_use: "mixed-use building",
  commercial: "commercial building",
  industrial: "industrial building",
  institutional: "institutional building",
  data_centre: "data centre",
};

/** "Site plan application: 12-storey mixed-use building, 240 units — 221 Finch Ave W". */
export function applicationTitle(kind: string, scale: Scale, category: MajorProjectCategory, address: string | null): string {
  const noun = NOUN[category] ?? "development";
  const head =
    scale.buildings && scale.buildings > 1
      ? `${scale.buildings} ${noun.replace(/building$/, "buildings")}`
      : `${scale.storeys ? `${scale.storeys}-storey ` : ""}${noun}`;
  const extra = scale.units ? `, ${scale.units.toLocaleString("en-CA")} units` : scale.gfaM2 ? `, ${scale.gfaM2.toLocaleString("en-CA")} m²` : "";
  const addr = address ? tidyName(cleanText(address, 120)) : null;
  return `${kind}: ${head}${extra}${addr ? ` — ${addr}` : ""}`.slice(0, 300);
}

/** "101, 9862 - 90 AVENUE NW" → "9862 90 Avenue NW"; unit prefixes and stray dashes dropped. */
export function tidyAddress(a: unknown): string | null {
  const s = cleanText(a, 200);
  if (!s) return null;
  const parts = [...new Set(s.split(/\s*,\s*/).filter(Boolean))];
  // "101, 9862 - 90 AVENUE NW": the first part is a unit number.
  const main = parts.length > 1 && /^\d+[a-z]?$/i.test(parts[0]) ? parts.slice(1).join(", ") : parts.join(", ");
  return tidyName(main.replace(/\s+-\s+/g, " ").replace(/\s+/g, " ").trim())?.replace(/\b(Nw|Ne|Sw|Se)\b/g, (m) => m.toUpperCase()) ?? null;
}

export interface AppRow {
  source: string;
  id: string;
  kind: string;
  scale: Scale;
  category: MajorProjectCategory;
  address: string | null;
  city: string;
  province: string;
  description: string | null;
  statusRaw: string;
  received: string | null;
  owner?: string | null;
  license: string;
  sources: { label: string; url: string }[];
}

export function applicationRow(a: AppRow): MajorProjectInput {
  return {
    source: a.source,
    sourceKey: `${a.source}:${a.id}`,
    name: applicationTitle(a.kind, a.scale, a.category, a.address),
    description: cleanText(a.description, 2000),
    category: a.category,
    owner: a.owner ?? null,
    city: a.city,
    province: a.province,
    regionSlug: slugify(a.city),
    estValueCad: null,
    size: scaleText(a.scale),
    status: "application",
    statusRaw: cleanText(a.statusRaw, 200),
    statusDate: a.received,
    timeline: null,
    generalContractor: null,
    bidListUrl: null,
    bidRoute: null,
    tradesNeeded: inferTrades(a.category, a.description),
    sources: a.sources,
    license: a.license,
    evidence: null,
    caveats: null,
  };
}

/** Closed, refused, withdrawn or cancelled files aren't leads. */
export const DEAD_APP = /closed|refused|withdrawn|cancel|denied|rejected|abandon|expired/i;

/* ------------------------------------------------------------------ Infrastructure Canada (upload) */

export const IC_DATASET = "https://open.canada.ca/data/en/dataset/beee0771-dab9-4be8-9b80-f8e8b3fdfd9d";
/** The file an admin downloads by hand (robots.txt disallows automated access to /alt-format/). */
export const IC_FILE_URL = "https://infrastructure.gc.ca/alt-format/opendata/project-list-liste-de-projets-bil.csv";
/** Projects whose forecast end passed more than this long ago (with no actual end) are dropped. */
export const IC_GRACE_DAYS = 365;

const IC_CATEGORY: Record<string, MajorProjectCategory | null> = {
  "public transit": "infrastructure",
  "highways and roads": "infrastructure",
  "active transportation": "infrastructure",
  "drinking water": "infrastructure",
  wastewater: "infrastructure",
  "disaster mitigation": "infrastructure",
  "solid waste management": "infrastructure",
  marine: "infrastructure",
  "regional and local airports": "infrastructure",
  "shortline rail": "infrastructure",
  "border infrastructure": "infrastructure",
  "broadband and connectivity": "infrastructure",
  "brownfield remediation and redevelopment": "infrastructure",
  "trade and transportation": "infrastructure",
  "green energy": "energy",
  recreation: "institutional",
  culture: "institutional",
  sport: "institutional",
  "education, training and childcare": "institutional",
  "healthcare infrastructure": "institutional",
  "administration, emergency and public works": "institutional",
  ventilation: "institutional",
  tourism: "commercial",
  "affordable and temporary housing": "multi_residential",
  // Plans and studies, not construction.
  "capacity building": null,
};

/**
 * Infrastructure Canada's projects list (one row per funded project) → open
 * or upcoming projects at or above `minValue` total eligible cost. A
 * project with an actual construction end, or a forecast end more than a
 * year ago, is finished and skipped.
 */
export function parseInfrastructureCanada(csv: string, minValue: number, today: string): MajorProjectInput[] {
  const cutoff = sinceDate(today, IC_GRACE_DAYS);
  const out: MajorProjectInput[] = [];
  const seen = new Set<string>();
  for (const r of parseCsv(csv)) {
    const id = cleanText(r.PROJECT_NUMBER, 40);
    const name = cleanText(r.PROJECT_TITLE, 300) ?? cleanText(r.PROJECT_TITLE_FR, 300);
    const value = parseMoney(r.TOTAL_ELIGIBLE_COST);
    if (!id || !name || !value || value < minValue || seen.has(id)) continue;
    if (isoDate(r.CONSTRUCTION_END_DATE)) continue; // finished
    const forecastEnd = isoDate(r.CONST_END_FORECAST_DATE);
    if (forecastEnd && forecastEnd < cutoff) continue;
    const province = provinceName(r.REGION_CD);
    if (!province) continue;
    const std = (r.STANDARD_CATEGORY ?? "").trim().toLowerCase();
    const mapped = std in IC_CATEGORY ? IC_CATEGORY[std] : undefined;
    if (mapped === null) continue;
    const guessed = normalizeCategory(name, std);
    const category: MajorProjectCategory = mapped ?? (guessed === "other" ? "institutional" : guessed);
    seen.add(id);
    const locations = (r.LOCATION ?? "").split(/\s*;\s*/).map((x) => cleanText(x, 120)).filter((x): x is string => Boolean(x));
    const city = locations.length === 1 ? locations[0] : null;
    const started = isoDate(r.CONSTRUCTION_START_DATE);
    const approved = isoDate(r.APPROVED_DATE);
    const fStart = isoDate(r.CONST_START_FORECAST_DATE);
    const federal = parseMoney(r.FEDERAL_CONTRIBUTION);
    const program = cleanText(r.PROGRAM_EN, 200);
    const desc = [
      program ? `Funded through the ${program}${r.PROGRAM_ABR_EN ? ` (${r.PROGRAM_ABR_EN.trim()})` : ""}.` : null,
      r.STANDARD_CATEGORY && std !== "other" ? `Category: ${r.STANDARD_CATEGORY.trim()}.` : null,
      federal ? `Federal contribution ${money(federal)} of ${money(value)} total eligible cost.` : `Total eligible cost ${money(value)}.`,
      locations.length > 1 ? `Locations: ${locations.join(", ")}.` : null,
    ]
      .filter(Boolean)
      .join(" ");
    const status: MajorProjectStatus = started ? "under_construction" : "approved";
    out.push({
      source: "infrastructure-canada",
      sourceKey: `infrastructure-canada:${id}`,
      name,
      description: desc,
      category,
      owner: organisationOrNull(r.ULTIMATE_RECIPIENT_EN) ?? organisationOrNull(r.ULTIMATE_RECIPIENT_FR),
      city,
      province,
      regionSlug: city ? slugify(city) : provinceSlug(province),
      estValueCad: value,
      size: null,
      status,
      statusRaw: started ? `Construction started ${started}` : approved ? `Federal funding approved ${approved}` : "Federal funding approved",
      statusDate: started ?? approved,
      timeline:
        fStart || forecastEnd
          ? `Construction forecast: ${[fStart ? `start ${fStart}` : null, forecastEnd ? `end ${forecastEnd}` : null].filter(Boolean).join(", ")}`
          : null,
      generalContractor: null,
      bidListUrl: null,
      bidRoute: null,
      tradesNeeded: inferTrades(category, `${name} ${r.STANDARD_CATEGORY ?? ""}`),
      sources: [{ label: "Infrastructure Canada: projects list (open.canada.ca)", url: IC_DATASET }],
      license: WAVE2_LICENSES.canada,
      evidence: null,
      caveats:
        "The value is the total eligible cost under the federal program; the full project cost can be higher. Infrastructure Canada's list trails new approvals by several months.",
    });
  }
  return out;
}

/* ------------------------------------------------------------------ Québec PQI */

export const PQI_DATASET = "https://www.donneesquebec.ca/recherche/dataset/tableau-de-bord-des-projets-d-infrastructures";

/** The newest dashboard CSV linked from the dataset page (file names carry the snapshot date). */
export function pqiCsvUrl(html: string): string | null {
  let best: { url: string; date: string } | null = null;
  const re = /https:\/\/www\.donneesquebec\.ca\/recherche\/dataset\/[a-z0-9-]+\/resource\/[a-z0-9-]+\/download\/donnees_ouvertes_tb_(\d{8})[a-z0-9_.-]*?\.csv/gi;
  for (const m of html.matchAll(re)) if (!best || m[1] >= best.date) best = { url: m[0], date: m[1] };
  return best?.url ?? null;
}

const fold = (s: string) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

const PQI_STATUS: Record<string, MajorProjectStatus> = {
  "a l'etude": "proposed",
  "en planification": "approved",
  "en realisation": "under_construction",
  "en service": "completed",
};

const PQI_SECTOR: Record<string, MajorProjectCategory> = {
  education: "institutional",
  "enseignement superieur": "institutional",
  "sante et services sociaux": "institutional",
  "reseau routier": "infrastructure",
  "logements sociaux et communautaires": "multi_residential",
  "transport collectif": "infrastructure",
  "administration gouvernementale": "institutional",
  "transports maritime, aerien, ferroviaire et autres": "infrastructure",
  "developpement du sport": "institutional",
  "tourisme et activites recreatives": "institutional",
  culture: "institutional",
  municipalites: "infrastructure",
  "developpement du territoire nordique et des communautes autochtones": "infrastructure",
  environnement: "infrastructure",
  recherche: "institutional",
  "agriculture, forets et faune": "other",
};

const FR_MONTHS: Record<string, [string, string]> = {
  janvier: ["01", "Jan"], fevrier: ["02", "Feb"], mars: ["03", "Mar"], avril: ["04", "Apr"], mai: ["05", "May"], juin: ["06", "Jun"],
  juillet: ["07", "Jul"], aout: ["08", "Aug"], septembre: ["09", "Sep"], octobre: ["10", "Oct"], novembre: ["11", "Nov"], decembre: ["12", "Dec"],
};

/** "Septembre 2031" → { iso: "2031-09-01", en: "Sep 2031" }. */
export function frenchMonth(s: string | null | undefined): { iso: string; en: string } | null {
  const m = fold(s ?? "").match(/^([a-z]+)\s+(\d{4})$/);
  const mo = m ? FR_MONTHS[m[1]] : undefined;
  return m && mo ? { iso: `${m[2]}-${mo[0]}-01`, en: `${mo[1]} ${m[2]}` } : null;
}

/** The change log, newest first: [{ month, text }]. */
function pqiChanges(log: string | null | undefined): { month: string; text: string }[] {
  const out: { month: string; text: string }[] = [];
  for (const line of (log ?? "").split(/\r?\n/)) {
    const head = frenchMonth(line.trim());
    if (head) out.push({ month: head.iso, text: "" });
    else if (out.length) out[out.length - 1].text += ` ${line.trim()}`;
  }
  return out;
}

export function parsePqi(csv: string): MajorProjectInput[] {
  const out: MajorProjectInput[] = [];
  for (const r of parseCsv(csv)) {
    const id = cleanText(r.no_projet, 40);
    const name = cleanText(r.nom_projet, 300);
    if (!id || !name) continue;
    const etat = cleanText(r.etat_avancement, 60) ?? "";
    const status = PQI_STATUS[fold(etat)] ?? "unknown";
    // Costs are in $ millions ("530.40"; a decimal comma is tolerated).
    const cost = (r.cout_total ?? "").trim().replace(/^(\d+),(\d{1,2})$/, "$1.$2");
    const value = parseMoney(cost, 1e6);
    const sector = cleanText(r.secteur_activite, 120);
    const category = PQI_SECTOR[fold(sector ?? "")] ?? normalizeCategory(name, r.nature_travaux);
    const loc = cleanText(r.localisation, 120);
    const city = loc && !/[,;/]|plusieurs|divers|r[ée]gions/i.test(loc) ? loc : null;
    const changes = pqiChanges(r.suivi_modifications);
    const atStage = changes.find((c) => fold(c.text).includes(fold(etat)));
    const inService = frenchMonth(r.date_fin_mise_en_service);
    const manager = cleanText(r.gestionnaire, 200);
    const owner = cleanText(r.organisme, 300);
    out.push({
      source: "quebec-pqi",
      sourceKey: `quebec-pqi:${id}`,
      name,
      description: cleanText(r.description, 2000),
      category,
      owner,
      city,
      province: "Quebec",
      regionSlug: city ? (fold(city) === "quebec" ? "quebec-city" : slugify(city)) : "quebec",
      estValueCad: value,
      size: null,
      status,
      statusRaw: etat || null,
      statusDate: atStage?.month ?? null,
      timeline: inService ? `Target in service: ${inService.en}` : null,
      generalContractor: null,
      bidListUrl: null,
      bidRoute: manager ? `Project manager: ${manager}. Québec public bodies post their tenders on SEAO (seao.gouv.qc.ca).` : null,
      tradesNeeded: inferTrades(category, `${r.nature_travaux ?? ""} ${name}`),
      sources: [{ label: "Données Québec: Tableau de bord des projets d'infrastructures de 20 M$ et plus", url: PQI_DATASET }],
      license: WAVE2_LICENSES.pqi,
      evidence: null,
      caveats: [
        sector ? `Sector (Québec Infrastructure Plan): ${sector}.` : null,
        r.region ? `Region: ${cleanText(r.region, 120)}.` : null,
        value ? "Cost is the authorised total cost; it changes as the project moves through stages." : "Cost not published yet at this stage.",
      ]
        .filter(Boolean)
        .join(" "),
      sourceUpdated: changes[0]?.month ?? null,
    });
  }
  return out;
}

/* ------------------------------------------------------------------ Halifax permits */

export const HALIFAX_DATASET = "https://data-hrm.hub.arcgis.com/datasets/HRM::pplc-building-permits";
const HALIFAX_LAYER = "https://services2.arcgis.com/11XBiaBYA9Ep0yNJ/arcgis/rest/services/PPLC_Issued_Building_Permits/FeatureServer/0/query";
export const ARCGIS_PAGE = 1000;

export function halifaxUrl(minValue: number, today: string, offset = 0): string {
  const since = sinceDate(today);
  const q = new URLSearchParams({
    where: `Estimated_Project_Value >= ${Math.round(minValue)} AND (Date_of_Permit_Issuance >= DATE '${since}' OR Date_of_Submission >= DATE '${since}')`,
    outFields:
      "Permit_Number,Date_of_Submission,Date_of_Permit_Issuance,Completed_Date,Permit_Name,Work_Type,Permit_Status,Civic_Number,Street_Name,Community,Estimated_Project_Value,Most_Recent_Inspection,Type_of_Structure,Occupancy_Type,Total_End_Residential_Units,Number_of_Storeys,Work_Description",
    orderByFields: "OBJECTID",
    resultOffset: String(offset),
    resultRecordCount: String(ARCGIS_PAGE),
    returnGeometry: "false",
    f: "json",
  });
  return `${HALIFAX_LAYER}?${q}`;
}

export type Attrs = Record<string, string | number | null>;

export function parseHalifaxPermits(features: { attributes?: Attrs }[], minValue: number): MajorProjectInput[] {
  // One row per occupancy type: group by permit number.
  const byPermit = new Map<string, Attrs[]>();
  for (const f of features) {
    const a = f.attributes ?? {};
    const id = cleanText(a.Permit_Number, 60);
    if (!id) continue;
    byPermit.set(id, [...(byPermit.get(id) ?? []), a]);
  }
  const out: MajorProjectInput[] = [];
  for (const [id, rows] of byPermit) {
    const a = rows[0];
    const value = parseMoney(a.Estimated_Project_Value);
    if (!value || value < minValue) continue;
    const st = String(a.Permit_Status ?? "").trim();
    if (/cancel|withdrawn|expired|revoked/i.test(st)) continue;
    const type = cleanText(a.Type_of_Structure, 120);
    const occupancies = [...new Set(rows.map((r) => cleanText(r.Occupancy_Type, 80)).filter((x): x is string => Boolean(x)))];
    const desc = cleanText(String(a.Work_Description ?? "").replace(/\r/g, " "), 1500);
    const category = type ? permitCategory([type]) : permitCategory(occupancies, desc);
    if (!category) continue;
    const completed = isoDate(a.Completed_Date);
    const issued = isoDate(a.Date_of_Permit_Issuance);
    const inspected = cleanText(a.Most_Recent_Inspection, 80);
    let status: MajorProjectStatus;
    let raw: string;
    if (completed || /complet/i.test(st)) [status, raw] = ["completed", "Completed"];
    else if (/issued/i.test(st) && inspected) [status, raw] = ["under_construction", `Permit issued; inspections under way (latest: ${inspected})`];
    else if (/issued|ready for issue/i.test(st)) [status, raw] = ["approved", st === "Issued" ? "Permit issued" : st];
    else [status, raw] = ["proposed", `Permit application: ${st || "in review"}`];
    const units = Number(a.Total_End_Residential_Units) || 0;
    const storeys = Number(a.Number_of_Storeys) || 0;
    const address = [a.Civic_Number, a.Street_Name].filter(Boolean).join(" ");
    const row = permitRow({
      source: "permits-halifax",
      id,
      title: permitTitle(desc, address, tidyName(cleanText(a.Permit_Name, 120)) ?? "New building"),
      description: [desc, a.Community ? `Community: ${tidyName(String(a.Community))}` : null, occupancies.length ? `Occupancy: ${occupancies.join(", ")}` : null].filter(Boolean).join(". "),
      category,
      city: "Halifax",
      province: "Nova Scotia",
      value,
      status: raw,
      issued: issued ?? isoDate(a.Date_of_Submission),
      completed,
      size: [storeys > 0 ? `${storeys} storeys` : null, units > 0 ? `${units} homes` : null].filter(Boolean).join(" · ") || null,
      license: WAVE2_LICENSES.halifax,
      datasetUrl: HALIFAX_DATASET,
      datasetLabel: "Halifax Regional Municipality Open Data: PPL&C Building Permits",
    });
    out.push({ ...row, status, statusRaw: cleanText(raw, 200) });
  }
  return out;
}

/* ------------------------------------------------------------------ Surrey permits */

export const SURREY_DATASET = "https://opendata-surrey.hub.arcgis.com/datasets/f3ec200f59a342e38c52248f07fe610d";
const SURREY_LAYER = "https://services5.arcgis.com/YRpe0VKTJytZSSIB/arcgis/rest/services/IssuedBuildingPermits/FeatureServer/0/query";

export function surreyUrl(minValue: number, offset = 0): string {
  const q = new URLSearchParams({
    where: `ValueOfConstruction >= ${Math.round(minValue)}`,
    outFields: "PermitNumber,IssuedDate,ValueOfConstruction,ProjectAddress,WorkDescription,SubDescription,DwellingUnits,ApplicantOrganization,BuildingGeneralContractorOrganization",
    orderByFields: "ObjectId",
    resultOffset: String(offset),
    resultRecordCount: String(ARCGIS_PAGE),
    returnGeometry: "false",
    f: "json",
  });
  return `${SURREY_LAYER}?${q}`;
}

/** "20261001" → "2026-10-01". */
const ymd = (s: unknown) => {
  const m = String(s ?? "").match(/^(\d{4})(\d{2})(\d{2})$/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : isoDate(s);
};

export function parseSurreyPermits(features: { attributes?: Attrs }[], minValue: number, today: string): MajorProjectInput[] {
  const since = sinceDate(today);
  const out: MajorProjectInput[] = [];
  const seen = new Set<string>();
  for (const f of features) {
    const a = f.attributes ?? {};
    const id = cleanText(a.PermitNumber, 60);
    const value = parseMoney(a.ValueOfConstruction);
    if (!id || !value || value < minValue || seen.has(id)) continue;
    const issued = ymd(a.IssuedDate);
    if (issued && issued < since) continue;
    const work = cleanText(a.WorkDescription, 80)?.replace(/^\*\s*/, "") ?? "";
    const sub = cleanText(a.SubDescription, 120) ?? "";
    const category = permitCategory([sub], work);
    if (!category) continue;
    seen.add(id);
    const units = Number(a.DwellingUnits) || 0;
    // Organisation fields hold "Name\nStreet\nCity"; several are joined with ";".
    const applicants = [
      ...new Map(
        String(a.ApplicantOrganization ?? "")
          .split(";")
          .map((x) => companyOrNull(firstLine(x)))
          .filter((x): x is string => Boolean(x))
          .map((x) => [x.toLowerCase().replace(/[^a-z0-9]/g, ""), x] as const),
      ).values(),
    ];
    const what = [work && !/see description/i.test(work) ? work : "", sub.toLowerCase()].filter(Boolean).join(" ") || "Building permit";
    out.push(
      permitRow({
        source: "permits-surrey",
        id,
        title: permitTitle(null, cleanText(a.ProjectAddress, 120), `${what.charAt(0).toUpperCase()}${what.slice(1)}${units > 0 ? `, ${units} homes` : ""}`),
        description: [`${work || "Work"}: ${sub || "building"}`, units > 0 ? `${units} dwelling units` : null, applicants.length ? `Applicant: ${applicants.join(", ")}` : null].filter(Boolean).join(". "),
        category,
        city: "Surrey",
        province: "British Columbia",
        value,
        status: "Permit issued",
        issued,
        contractor: companyOrNull(firstLine(a.BuildingGeneralContractorOrganization)),
        size: units > 0 ? `${units} homes` : null,
        license: WAVE2_LICENSES.surrey,
        datasetUrl: SURREY_DATASET,
        datasetLabel: "City of Surrey Open Data: Issued Building Permits",
      }),
    );
  }
  return out;
}

/* ------------------------------------------------------------------ Edmonton capital projects */

export const EDMONTON_CAPITAL_DATASET = "https://data.edmonton.ca/d/552h-hjwj";

export function edmontonCapitalUrl(): string {
  // Contact name, e-mail and phone columns are never requested.
  const q = new URLSearchParams({
    $select:
      "ebuilder_number,asset_type,project_name,profile_name,scope,update,current_phase,approved_budget_m,forecasted_budget,approved_profile_schedule,forecasted_completion_date,neighbourhood,address,website_url",
    $limit: "5000",
  });
  return `https://data.edmonton.ca/resource/552h-hjwj.json?${q}`;
}

const EDMONTON_PHASE: Record<string, MajorProjectStatus> = {
  concept: "proposed",
  "development design": "approved",
  "detailed design": "approved",
  build: "under_construction",
};

export function parseEdmontonCapital(rows: Record<string, string>[], minValue: number): MajorProjectInput[] {
  const out: MajorProjectInput[] = [];
  for (const r of rows) {
    const id = cleanText(r.ebuilder_number, 40);
    const name = cleanText(r.project_name, 300) ?? cleanText(r.profile_name, 300);
    // "approved_budget_m" is in dollars despite its name.
    const value = Math.max(parseMoney(r.forecasted_budget) ?? 0, parseMoney(r.approved_budget_m) ?? 0) || null;
    if (!id || !name || !value || value < minValue) continue;
    const phase = cleanText(r.current_phase, 60) ?? "";
    const status = EDMONTON_PHASE[phase.toLowerCase()] ?? "unknown";
    if (/complete|closed/i.test(phase)) continue;
    const guessed = normalizeCategory(r.asset_type, name);
    const category: MajorProjectCategory = guessed === "other" ? "infrastructure" : guessed;
    const addresses = [...new Set(String(r.address ?? "").split(",").map((x) => x.trim()).filter(Boolean))].slice(0, 3);
    const desc = [cleanText(r.scope, 1200), r.update ? `Update: ${cleanText(r.update, 600)}` : null, addresses.length ? `Location: ${addresses.join("; ")}` : null]
      .filter(Boolean)
      .join(" ");
    const end = isoDate(r.forecasted_completion_date);
    const site = safeUrl(r.website_url);
    out.push({
      source: "capital-edmonton",
      sourceKey: `capital-edmonton:${id}`,
      name,
      description: cleanText(desc, 2000),
      category,
      owner: "City of Edmonton",
      city: "Edmonton",
      province: "Alberta",
      regionSlug: "edmonton",
      estValueCad: value,
      size: null,
      status,
      statusRaw: phase ? `City capital project, phase: ${phase}` : null,
      statusDate: null,
      timeline: end ? `Forecast completion ${end}` : null,
      generalContractor: null,
      bidListUrl: null,
      bidRoute: null,
      tradesNeeded: inferTrades(category, `${r.asset_type ?? ""} ${r.scope ?? ""}`),
      sources: [{ label: "City of Edmonton Open Data: Capital Projects", url: EDMONTON_CAPITAL_DATASET }, ...(site ? [{ label: "Project page", url: site }] : [])],
      license: WAVE2_LICENSES.edmonton,
      evidence: null,
      caveats: r.neighbourhood ? `Neighbourhood: ${tidyName(cleanText(r.neighbourhood, 120))}.` : null,
    });
  }
  return out;
}

/* ------------------------------------------------------------------ Manitoba capital plans */

export const MANITOBA_DATASET = "https://www.arcgis.com/home/item.html?id=e8d3f8dc1b1842068ca789b6326f0f22";
const MANITOBA_LAYER = "https://services.arcgis.com/mMUesHYPkXjaFGfS/arcgis/rest/services/Manitoba_Capital_Plans_Project_Status/FeatureServer/0/query";

export function manitobaUrl(offset = 0): string {
  const q = new URLSearchParams({
    where: "Project_Status <> 'Complete'",
    outFields:
      "Project__,Hwy,Location_Description,Project_length_in_km,Project_Type,Total_Project_Status,Project_Status,Anticipated_Construction_Start_Date,Anticipated_Construction_Completion_Date,Municipality_Name,Department_Program,ObjectId",
    orderByFields: "ObjectId",
    resultOffset: String(offset),
    resultRecordCount: String(ARCGIS_PAGE),
    returnGeometry: "false",
    f: "json",
  });
  return `${MANITOBA_LAYER}?${q}`;
}

export function parseManitobaCapital(features: { attributes?: Attrs }[]): MajorProjectInput[] {
  const out: MajorProjectInput[] = [];
  const seen = new Set<string>();
  for (const f of features) {
    const a = f.attributes ?? {};
    const st = cleanText(a.Project_Status, 60) ?? "";
    if (!st || /complete/i.test(st)) continue;
    const id = cleanText(a.Project__, 40) ?? (a.ObjectId != null ? `oid-${a.ObjectId}` : null);
    const type = cleanText(a.Project_Type, 120);
    const where = cleanText(a.Location_Description, 200);
    if (!id || !type || seen.has(id)) continue;
    seen.add(id);
    const hwyRaw = cleanText(a.Hwy, 40);
    const hwy = hwyRaw ? (/^\d+[a-z]?$/i.test(hwyRaw) ? `Highway ${hwyRaw}` : hwyRaw) : null;
    // "Design" / "Construction Prep & Purchases" are funded and coming;
    // "Construction" / "Seasonal Shut Down" are under way.
    const status: MajorProjectStatus = !/prep|design/i.test(st) && /construction|seasonal/i.test(st) ? "under_construction" : "approved";
    const start = cleanText(a.Anticipated_Construction_Start_Date, 40);
    const end = cleanText(a.Anticipated_Construction_Completion_Date, 40);
    const km = Number(a.Project_length_in_km) || 0;
    const program = cleanText(a.Department_Program, 120);
    const name = [type, [hwy, where].filter(Boolean).join(": ")].filter(Boolean).join(" — ");
    out.push({
      source: "manitoba-capital",
      sourceKey: `manitoba-capital:${id}`,
      name: name.slice(0, 300),
      description: cleanText(
        [`${type}${hwy ? ` on ${hwy}` : ""}${where ? `: ${where}` : ""}.`, km > 0 ? `${km} km.` : null, program ? `Program: ${program}.` : null, `Status in the provincial capital plan: ${st}.`]
          .filter(Boolean)
          .join(" "),
        2000,
      ),
      category: "infrastructure",
      owner: "Government of Manitoba",
      // "ISLAND LAKE-NORTHERN AFFAIRS ACT" → "Island Lake".
      city: tidyName(cleanText(String(a.Municipality_Name ?? "").replace(/-?\s*northern affairs act$/i, ""), 120)),
      province: "Manitoba",
      regionSlug: a.Municipality_Name ? slugify(String(a.Municipality_Name).replace(/-?\s*northern affairs act$/i, "")) : "manitoba",
      estValueCad: null,
      size: km > 0 ? `${km} km` : null,
      status,
      statusRaw: st,
      statusDate: null,
      timeline: start || end ? `Anticipated construction: ${[start, end].filter(Boolean).join(" to ")}` : null,
      generalContractor: null,
      bidListUrl: null,
      bidRoute: null,
      tradesNeeded: inferTrades("infrastructure", type),
      sources: [{ label: "Manitoba Capital Plans Project Status (Manitoba open data)", url: MANITOBA_DATASET }],
      license: WAVE2_LICENSES.manitoba,
      evidence: null,
      caveats: "The provincial capital plan does not publish a value per project.",
    });
  }
  return out;
}

/* ------------------------------------------------------------------ development applications */

/** Normalised address for grouping several applications on one site. */
export function addressKey(a: string | null | undefined): string {
  return slugify(a ?? "")
    .replace(/\b(avenue)\b/g, "ave")
    .replace(/\b(street)\b/g, "st")
    .replace(/\b(road)\b/g, "rd")
    .replace(/\b(drive)\b/g, "dr")
    .replace(/\b(boulevard)\b/g, "blvd")
    .replace(/\b(crescent)\b/g, "cres")
    .replace(/\b(west)\b/g, "w")
    .replace(/\b(east)\b/g, "e")
    .replace(/\b(north)\b/g, "n")
    .replace(/\b(south)\b/g, "s");
}

/** Several applications on one site (rezoning + site plan) become one project: the biggest scale wins the title. */
export function groupBySite<T extends { site: string; scale: Scale; received: string | null }>(apps: T[]): { lead: T; all: T[] }[] {
  const by = new Map<string, T[]>();
  for (const a of apps) by.set(a.site, [...(by.get(a.site) ?? []), a]);
  const size = (s: Scale) => (s.units ?? 0) + (s.storeys ?? 0) * 10 + (s.gfaM2 ?? 0) / 100 + (s.buildings ?? 0) * 20;
  return [...by.values()].map((all) => ({
    lead: [...all].sort((x, y) => size(y.scale) - size(x.scale) || (y.received ?? "").localeCompare(x.received ?? ""))[0],
    all,
  }));
}

export const mergeScale = (all: { scale: Scale }[]): Scale => ({
  storeys: Math.max(0, ...all.map((a) => a.scale.storeys ?? 0)) || null,
  units: Math.max(0, ...all.map((a) => a.scale.units ?? 0)) || null,
  gfaM2: Math.max(0, ...all.map((a) => a.scale.gfaM2 ?? 0)) || null,
  buildings: Math.max(0, ...all.map((a) => a.scale.buildings ?? 0)) || null,
});

/* Toronto */

export const TORONTO_APPS_RESOURCE = "8907d8ed-c515-4ce9-b674-9f8c6eefcf0d";
export const TORONTO_APPS_DATASET = "https://open.toronto.ca/dataset/development-applications/";
export const TORONTO_APPS_PAGE = 2000;
const TORONTO_APP_TYPES: Record<string, string> = { OZ: "Rezoning application", SA: "Site plan application", SB: "Subdivision application" };
// CONTACT_NAME / CONTACT_PHONE / CONTACT_EMAIL (City planners) are never requested.
const TORONTO_APP_FIELDS = ["APPLICATION_TYPE", "APPLICATION#", "STREET_NUM", "STREET_NAME", "STREET_TYPE", "STREET_DIRECTION", "DATE_SUBMITTED", "STATUS", "DESCRIPTION", "APPLICATION_URL", "WARD_NAME"];

export function torontoAppsUrl(offset: number): string {
  const q = new URLSearchParams({
    resource_id: TORONTO_APPS_RESOURCE,
    filters: JSON.stringify({ APPLICATION_TYPE: Object.keys(TORONTO_APP_TYPES) }),
    fields: TORONTO_APP_FIELDS.join(","),
    sort: "DATE_SUBMITTED desc",
    limit: String(TORONTO_APPS_PAGE),
    offset: String(offset),
  });
  return `https://ckan0.cf.opendata.inter.prod-toronto.ca/api/3/action/datastore_search?${q}`;
}

/** "(_)" placeholders in Toronto's templates ("an (_)-storey building"). */
const unplaceholder = (s: string) => s.replace(/\(_\)/g, "[not stated]");

export function parseTorontoApps(records: Record<string, unknown>[], today: string): MajorProjectInput[] {
  const since = sinceDate(today);
  const apps = [];
  for (const r of records) {
    const s = (k: string) => (r[k] == null ? "" : String(r[k]).trim());
    const type = s("APPLICATION_TYPE");
    const id = s("APPLICATION#");
    const received = isoDate(s("DATE_SUBMITTED"));
    if (!TORONTO_APP_TYPES[type] || !id || !received || received < since || DEAD_APP.test(s("STATUS"))) continue;
    const desc = unplaceholder(s("DESCRIPTION"));
    const address = [s("STREET_NUM"), s("STREET_NAME"), s("STREET_TYPE"), s("STREET_DIRECTION")].filter(Boolean).join(" ");
    apps.push({ id, type, received, desc, address, status: s("STATUS"), url: safeUrl(s("APPLICATION_URL")), site: addressKey(address) || id, scale: applicationScale(desc) });
  }
  const out: MajorProjectInput[] = [];
  for (const { lead, all } of groupBySite(apps)) {
    const scale = mergeScale(all);
    if (!isMajorScale(scale)) continue;
    const category = applicationCategory(...all.map((a) => a.desc));
    if (!category) continue;
    const others = all.filter((a) => a !== lead).map((a) => `${a.id} (${TORONTO_APP_TYPES[a.type]?.toLowerCase()}, ${a.status})`);
    out.push(
      applicationRow({
        source: "apps-toronto",
        // One project per site, so a new application on the same site updates it.
        id: hashKey(lead.site),
        kind: TORONTO_APP_TYPES[lead.type],
        scale,
        category,
        address: lead.address,
        city: "Toronto",
        province: "Ontario",
        description: [lead.desc, `Application ${lead.id}.`, others.length ? `Related applications on this site: ${others.join("; ")}.` : null].filter(Boolean).join(" "),
        statusRaw: `${TORONTO_APP_TYPES[lead.type]}: ${lead.status || "received"}`,
        received: lead.received,
        license: WAVE2_LICENSES.toronto,
        sources: [
          { label: "City of Toronto Open Data: Development Applications", url: TORONTO_APPS_DATASET },
          ...(lead.url ? [{ label: "Application Information Centre", url: lead.url }] : []),
        ],
      }),
    );
  }
  return out;
}

/* Edmonton */

export const EDMONTON_DP_DATASET = "https://data.edmonton.ca/d/2ccn-pwtu";

export function edmontonAppsUrl(today: string): string {
  const q = new URLSearchParams({
    $select: "city_file_number,permit_type,permit_class,permit_date,status,description_of_development,address,neighbourhood,zoning",
    $where: `permit_type = 'Major Development Permit' AND permit_date >= '${sinceDate(today)}' AND status != 'Refused'`,
    $order: "permit_date DESC",
    $limit: "50000",
  });
  return `https://data.edmonton.ca/resource/2ccn-pwtu.json?${q}`;
}

export function parseEdmontonApps(rows: Record<string, string>[]): MajorProjectInput[] {
  const out: MajorProjectInput[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    const id = cleanText(r.city_file_number, 40);
    const desc = cleanText(r.description_of_development, 2000);
    if (!id || !desc || seen.has(id) || DEAD_APP.test(r.status ?? "")) continue;
    const scale = applicationScale(desc);
    if (!isMajorScale(scale)) continue;
    const category = applicationCategory(desc);
    if (!category) continue;
    seen.add(id);
    out.push(
      applicationRow({
        source: "apps-edmonton",
        id,
        kind: "Development permit",
        scale,
        category,
        address: tidyAddress(r.address),
        city: "Edmonton",
        province: "Alberta",
        description: [desc, r.permit_class ? `Class: ${r.permit_class}.` : null, r.neighbourhood ? `Neighbourhood: ${tidyName(r.neighbourhood)}.` : null, r.zoning ? `Zoning: ${r.zoning}.` : null]
          .filter(Boolean)
          .join(" "),
        statusRaw: `Major development permit: ${r.status || "in progress"}`,
        received: isoDate(r.permit_date),
        license: WAVE2_LICENSES.edmonton,
        sources: [{ label: "City of Edmonton Open Data: Development Permits", url: EDMONTON_DP_DATASET }],
      }),
    );
  }
  return out;
}

/* Calgary */

export const CALGARY_DP_DATASET = "https://data.calgary.ca/d/6933-unw5";

export function calgaryAppsUrl(today: string): string {
  const q = new URLSearchParams({
    $select: "permitnum,address,applicant,category,description,proposedusedescription,statuscurrent,applieddate,communityname",
    $where: `applieddate >= '${sinceDate(today)}' AND starts_with(upper(description), 'NEW')`,
    $order: "applieddate DESC",
    $limit: "50000",
  });
  return `https://data.calgary.ca/resource/6933-unw5.json?${q}`;
}

export function parseCalgaryApps(rows: Record<string, string>[]): MajorProjectInput[] {
  const out: MajorProjectInput[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    const id = cleanText(r.permitnum, 40);
    const desc = cleanText(r.description, 2000);
    if (!id || !desc || seen.has(id) || DEAD_APP.test(r.statuscurrent ?? "")) continue;
    if (/single|semi|secondary suite|\bsigns?\b/i.test(r.category ?? "") && !/multi/i.test(r.category ?? "")) continue;
    const scale = applicationScale(desc);
    if (!isMajorScale(scale)) continue;
    const category = applicationCategory(r.category, desc, r.proposedusedescription);
    if (!category) continue;
    seen.add(id);
    const applicant = companyOrNull(r.applicant);
    out.push(
      applicationRow({
        source: "apps-calgary",
        id,
        kind: "Development permit application",
        scale,
        category,
        address: tidyAddress(r.address),
        city: "Calgary",
        province: "Alberta",
        description: [
          `${desc.charAt(0)}${desc.slice(1).toLowerCase()}.`,
          r.proposedusedescription ? `Proposed use: ${r.proposedusedescription.toLowerCase()}.` : null,
          r.communityname ? `Community: ${tidyName(r.communityname)}.` : null,
          applicant ? `Applicant: ${applicant}.` : null,
        ]
          .filter(Boolean)
          .join(" "),
        statusRaw: `Development permit: ${r.statuscurrent || "submitted"}`,
        received: isoDate(r.applieddate),
        license: WAVE2_LICENSES.calgary,
        sources: [{ label: "City of Calgary Open Data: Development Permits", url: CALGARY_DP_DATASET }],
      }),
    );
  }
  return out;
}

/* York Region */

export const YORK_LAYER_URL = "https://ww8.yorkmaps.ca/arcgis/rest/services/OpenData/DevelopmentApplicationStatusAndTeams/MapServer/0";

export function yorkAppsUrl(today: string, offset = 0): string {
  const q = new URLSearchParams({
    where: `DATE_RECVD >= DATE '${sinceDate(today)}'`,
    // RegionalLead / LocalLead / ConstructionCoordinator (staff) are never requested.
    outFields: "OBJECTID,REG_FILE_NUM,EXT_REF_NUM,APPL_TYPE,APPL_SUBTYPE,DATE_RECVD,APPL_STAGE,APPL_STATUS,APPL_NAME,APPL_DESC,UNITS,MUN_NAME,ADDRESS",
    orderByFields: "OBJECTID",
    resultOffset: String(offset),
    resultRecordCount: String(ARCGIS_PAGE),
    returnGeometry: "false",
    f: "json",
  });
  return `${YORK_LAYER_URL}/query?${q}`;
}

const YORK_SKIP = /consent|minor variance|part lot|validation|deeming|holding|pre-?consult|tree|sign|severance|exemption|registered plan/i;
const yorkKind = (type: string) =>
  /site plan/i.test(type)
    ? "Site plan application"
    : /zoning/i.test(type)
      ? "Rezoning application"
      : /official plan/i.test(type)
        ? "Official plan amendment"
        : /condominium/i.test(type)
          ? "Condominium application"
          : /subdivision/i.test(type)
            ? "Subdivision application"
            : "Development application";

export function parseYorkApps(features: { attributes?: Attrs }[]): MajorProjectInput[] {
  const apps = [];
  for (const f of features) {
    const a = f.attributes ?? {};
    const id = cleanText(a.REG_FILE_NUM, 60) ?? (a.OBJECTID != null ? `oid-${a.OBJECTID}` : null);
    const type = cleanText(a.APPL_TYPE, 120) ?? "";
    const city = cleanText(a.MUN_NAME, 120);
    if (!id || !city || YORK_SKIP.test(type) || DEAD_APP.test(String(a.APPL_STATUS ?? ""))) continue;
    const desc = cleanText(a.APPL_DESC, 1500) ?? "";
    const address = cleanText(String(a.ADDRESS ?? "").split(",")[0], 160);
    apps.push({
      id,
      type,
      city,
      desc,
      address,
      status: cleanText([a.APPL_STATUS, a.APPL_STAGE].filter(Boolean).join(", "), 120),
      received: isoDate(a.DATE_RECVD),
      developer: companyOrNull(a.APPL_NAME),
      site: `${slugify(city)}:${addressKey(address) || id}`,
      scale: applicationScale(desc, a.UNITS),
    });
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
        source: "apps-york",
        id: hashKey(lead.site),
        kind: yorkKind(lead.type),
        scale,
        category,
        address: lead.address,
        city: lead.city,
        province: "Ontario",
        description: [lead.desc || null, `York Region file ${lead.id} (${lead.type}).`, others.length ? `Related files on this site: ${others.join("; ")}.` : null].filter(Boolean).join(" "),
        statusRaw: `${lead.type}: ${lead.status ?? "in progress"}`,
        received: lead.received,
        owner: all.map((a) => a.developer).find(Boolean) ?? null,
        license: WAVE2_LICENSES.york,
        sources: [{ label: "York Region Open Data: Development Application Status and Teams", url: YORK_LAYER_URL }],
      }),
    );
  }
  return out;
}

/* ------------------------------------------------------------------ fetch helpers */

type ArcgisPage = { features?: { attributes?: Attrs }[]; exceededTransferLimit?: boolean; error?: { message?: string } };

/** Every page of an ArcGIS query (sequential, at most `maxPages`). */
export async function arcgisAll(url: (offset: number) => string, maxPages = 20): Promise<{ attributes?: Attrs }[]> {
  const out: { attributes?: Attrs }[] = [];
  for (let page = 0; page < maxPages; page++) {
    const j = await getJson<ArcgisPage>(url(page * ARCGIS_PAGE));
    if (j.error) throw new Error(`arcgis: ${j.error.message ?? "query failed"}`);
    const rows = j.features ?? [];
    out.push(...rows);
    if (!j.exceededTransferLimit && rows.length < ARCGIS_PAGE) break;
  }
  return out;
}

/* ------------------------------------------------------------------ registry */

export const WAVE2_SOURCES: ProjectSource[] = [
  {
    key: "quebec-pqi",
    label: "Québec PQI dashboard ($20M+)",
    group: "funding",
    collect: async () => {
      const page = await getText(PQI_DATASET);
      const csvUrl = pqiCsvUrl(page);
      if (!csvUrl) throw new Error("PQI: no CSV link on the dataset page");
      await sleep(10_000); // donneesquebec.ca asks for Crawl-Delay: 10
      return parsePqi(await getText(csvUrl));
    },
  },
  {
    key: "capital-edmonton",
    label: "Edmonton capital projects",
    group: "funding",
    collect: async ({ fundingMin }) => parseEdmontonCapital(await getJson(edmontonCapitalUrl()), fundingMin ?? DEFAULT_FUNDING_MIN_CAD),
  },
  {
    key: "manitoba-capital",
    label: "Manitoba capital plans",
    group: "funding",
    collect: async () => parseManitobaCapital(await arcgisAll((o) => manitobaUrl(o))),
  },
  {
    key: "permits-halifax",
    label: "Halifax building permits",
    group: "local",
    collect: async ({ today, minValue }) => parseHalifaxPermits(await arcgisAll((o) => halifaxUrl(minValue, today, o)), minValue),
  },
  {
    key: "permits-surrey",
    label: "Surrey building permits",
    group: "local",
    collect: async ({ today, minValue }) => parseSurreyPermits(await arcgisAll((o) => surreyUrl(minValue, o)), minValue, today),
  },
  {
    key: "apps-toronto",
    label: "Toronto development applications",
    group: "local",
    collect: async ({ today }) => {
      const since = sinceDate(today);
      const records: Record<string, unknown>[] = [];
      // Newest first; stop once a page reaches past the window.
      for (let offset = 0; offset < 40_000; offset += TORONTO_APPS_PAGE) {
        const json = await getJson<{ result?: { records?: Record<string, unknown>[] } }>(torontoAppsUrl(offset));
        const page = json.result?.records ?? [];
        records.push(...page);
        const last = isoDate(String(page[page.length - 1]?.DATE_SUBMITTED ?? ""));
        if (page.length < TORONTO_APPS_PAGE || (last && last < since)) break;
      }
      return parseTorontoApps(records, today);
    },
  },
  {
    key: "apps-edmonton",
    label: "Edmonton development permits",
    group: "local",
    collect: async ({ today }) => parseEdmontonApps(await getJson(edmontonAppsUrl(today))),
  },
  {
    key: "apps-calgary",
    label: "Calgary development permits",
    group: "local",
    collect: async ({ today }) => parseCalgaryApps(await getJson(calgaryAppsUrl(today))),
  },
  {
    key: "apps-york",
    label: "York Region development applications",
    group: "local",
    collect: async ({ today }) => parseYorkApps(await arcgisAll((o) => yorkAppsUrl(today, o))),
  },
];

/* ------------------------------------------------------------------ admin uploads */

export interface UploadSource {
  key: string;
  label: string;
  /** Where the admin downloads the file by hand. */
  fileUrl: string;
  /** A column the file must have (guards against uploading the wrong file). */
  header: string;
  parse: (text: string, ctx: { today: string; fundingMin: number }) => MajorProjectInput[];
}

/** Sources whose host disallows automated fetches: an admin uploads the file instead. */
export const UPLOAD_SOURCES: Record<string, UploadSource> = {
  "infrastructure-canada": {
    key: "infrastructure-canada",
    label: "Infrastructure Canada projects list (CSV)",
    fileUrl: IC_FILE_URL,
    header: "PROJECT_NUMBER",
    parse: (text, { today, fundingMin }) => parseInfrastructureCanada(text, fundingMin, today),
  },
};
