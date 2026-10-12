/**
 * Major projects in Canada — the shared shape and the pure normalisers every
 * importer uses (status, category, money, province, trades). Canada only:
 * nothing here ever produces a U.S. row. Pure, so it's unit tested
 * (test/unit/major-projects.test.ts).
 */
import { CA_PROVINCE_CODES } from "@/lib/visitor-geo";
import { RULES, slugify } from "@/lib/tenders/shared";

export const MAJOR_PROJECT_CATEGORIES = [
  "commercial",
  "institutional",
  "industrial",
  "multi_residential",
  "mixed_use",
  "infrastructure",
  "energy",
  "mining",
  "oil_gas",
  "data_centre",
  "other",
] as const;
export type MajorProjectCategory = (typeof MAJOR_PROJECT_CATEGORIES)[number];

export const MAJOR_PROJECT_STATUSES = [
  // A development application (rezoning, site plan, development permit): an
  // early signal, usually 1-3 years before construction, rarely with a value.
  "application",
  "proposed",
  "approved",
  "under_construction",
  "completed",
  "on_hold",
  "cancelled",
  "unknown",
] as const;
export type MajorProjectStatus = (typeof MAJOR_PROJECT_STATUSES)[number];

export interface ProjectSourceLink {
  label: string;
  url: string;
}

/** What an importer produces for one project (a row of major_projects, minus bookkeeping). */
export interface MajorProjectInput {
  source: string;
  /** '<source>:<id in the source>' — unique across all sources. */
  sourceKey: string;
  name: string;
  description: string | null;
  category: MajorProjectCategory;
  owner: string | null;
  city: string | null;
  /** Full province name ("Ontario"). */
  province: string | null;
  /** Region slug to resolve to regions.id ("toronto", "alberta"). */
  regionSlug: string | null;
  estValueCad: number | null;
  size: string | null;
  status: MajorProjectStatus;
  statusRaw: string | null;
  statusDate: string | null;
  timeline: string | null;
  generalContractor: string | null;
  bidListUrl: string | null;
  bidRoute: string | null;
  tradesNeeded: string[];
  sources: ProjectSourceLink[];
  license: string;
  evidence: "F" | "S" | "A" | null;
  caveats: string | null;
  /**
   * When the PUBLISHER last updated this record (not when we last saw it),
   * if the source says. BC's inventory stopped at 2024-12-01, so its pages
   * show that date instead of the import date.
   */
  sourceUpdated?: string | null;
}

/** Default minimum value for a city building permit to count as a major project. */
export const DEFAULT_PERMIT_MIN_CAD = 3_000_000;

/** MAJOR_PROJECT_PERMIT_MIN (CAD) or C$3M. Never below C$1M (that's not "major"). */
export function permitMinValue(env: string | undefined = process.env.MAJOR_PROJECT_PERMIT_MIN): number {
  const n = Number(env);
  return Number.isFinite(n) && n >= 1_000_000 ? n : DEFAULT_PERMIT_MIN_CAD;
}

/** Default minimum for funded / capital-plan projects (Infrastructure Canada, city capital plans). */
export const DEFAULT_FUNDING_MIN_CAD = 3_000_000;

/** MAJOR_PROJECT_FUNDING_MIN (CAD) or C$3M. Never below C$100k. */
export function fundingMinValue(env: string | undefined = process.env.MAJOR_PROJECT_FUNDING_MIN): number {
  const n = Number(env);
  return Number.isFinite(n) && n >= 100_000 ? n : DEFAULT_FUNDING_MIN_CAD;
}

/* ------------------------------------------------------------------ text */

export function cleanText(s: unknown, max = 2000): string | null {
  if (s == null) return null;
  const t = String(s).replace(/ /g, " ").replace(/\s+/g, " ").trim();
  if (!t || /^(n\/?a|none|null|not public|unknown|-+)$/i.test(t)) return null;
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

/** "SMITH CONSTRUCTION LTD" → "Smith Construction Ltd"; mixed case is left alone. */
export function tidyName(s: string | null): string | null {
  if (!s) return null;
  if (s !== s.toUpperCase()) return s;
  return s
    .toLowerCase()
    // Word starts only: "NA'A DR" → "Na'a Dr", "BIRD-WRIGHT" → "Bird-Wright".
    .replace(/(^|[\s\-/(#])([a-z])/g, (_m, pre: string, c: string) => pre + c.toUpperCase())
    .replace(/\b(Ulc|Llp|Lp)\b/g, (m) => m.toUpperCase());
}

/* ------------------------------------------------------------------ money */

/**
 * A dollar amount from messy text: "13000000000+ (excl. chips)", "$1.2B",
 * "750 million", "214000000 (US$155M)", "1,250,000.00", 3.5 (with
 * `unit: 1e6` for inventories that publish $ millions). Null when none.
 */
export function parseMoney(input: unknown, unit = 1): number | null {
  if (input == null) return null;
  if (typeof input === "number") return Number.isFinite(input) && input > 0 ? Math.round(input * unit) : null;
  const s = String(input).replace(/ /g, " ").trim();
  if (!s) return null;
  const m = s.match(/(?:C?\$\s*)?(\d[\d,\s]*(?:\.\d+)?)\s*(billion|bn|b\b|million|mm|m\b|k\b|thousand)?/i);
  if (!m) return null;
  const n = Number(m[1].replace(/[,\s]/g, ""));
  if (!Number.isFinite(n) || n <= 0) return null;
  const word = (m[2] ?? "").toLowerCase();
  const mult = /^(billion|bn|b)$/.test(word) ? 1e9 : /^(million|mm|m)$/.test(word) ? 1e6 : /^(k|thousand)$/.test(word) ? 1e3 : unit;
  return Math.round(n * mult);
}

/* ------------------------------------------------------------------ province */

const PROVINCE_NAMES = Object.values(CA_PROVINCE_CODES);

/** "AB", "Alberta", "alberta", "Québec", "PQ" → full name; anything else → null. */
export function provinceName(input: string | null | undefined): string | null {
  const s = (input ?? "").trim();
  if (!s) return null;
  const up = s.toUpperCase();
  if (CA_PROVINCE_CODES[up]) return CA_PROVINCE_CODES[up];
  if (up === "PQ") return "Quebec";
  if (up === "NFLD" || up === "NF") return "Newfoundland and Labrador";
  const plain = s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();
  return PROVINCE_NAMES.find((n) => n.toLowerCase() === plain) ?? null;
}

/** Region slug for a province ("British Columbia" → "british-columbia"). */
export function provinceSlug(province: string | null): string | null {
  return province ? slugify(province) : null;
}

/* ------------------------------------------------------------------ status */

/**
 * Source wording → one of our statuses. The phrase that comes FIRST in the
 * text wins ("Under construction / building complete" is under
 * construction); on a tie, the earlier rule here.
 */
const STATUS_RULES: [MajorProjectStatus, RegExp][] = [
  ["proposed", /approvals? (in progress|pending|underway)|under review|seeking approval|in (the )?queue|queue only|response received/i],
  ["on_hold", /pending cancell?ation|revocation pending/i],
  ["approved", /ready for issuance|issuance pending|forwarded for issuance|not started|extension granted|application acceptable/i],
  ["cancelled", /cancel|withdrawn|rejected|denied|terminated|abandon|refused|revoked/i],
  ["on_hold", /on hold|\bhold\b|paused?|suspend|stalled|deferred|inactive/i],
  ["under_construction", /under construction|construction (started|underway|ongoing|in progress)|\bstarted\b|underway|in progress|\bactive\b|inspection/i],
  ["completed", /complet|finished|operat|in service|occupancy|\bclosed\b|\bbuilt\b/i],
  ["approved", /approv|pre-?construction|sanctioned|\bfid\b|final investment|permitted|\bissued\b|licen[cs]ed|tender|procurement|awarded/i],
  ["proposed", /propos|plann|announc|application|applied|review|feasib|concept|design|study|in development|pending|submitted|received|potential|consult|mou\b/i],
];

export function normalizeStatus(raw: string | null | undefined): MajorProjectStatus {
  const s = (raw ?? "").trim();
  if (!s) return "unknown";
  let best: { status: MajorProjectStatus; at: number } | null = null;
  for (const [status, re] of STATUS_RULES) {
    const at = s.search(re);
    if (at >= 0 && (!best || at < best.at)) best = { status, at };
  }
  return best?.status ?? "unknown";
}

/* ------------------------------------------------------------------ category */

const CATEGORY_RULES: [MajorProjectCategory, RegExp][] = [
  ["data_centre", /data cent(re|er)|datacent|hyperscale|colocation|\bhpc\b/i],
  ["oil_gas", /oil|gas (plant|processing|pipeline)|natural gas|lng\b|petroleum|pipeline|refin|oil ?sands|bitumen|petrochem/i],
  ["mining", /\bmin(e|es|ing)\b|mineral|quarry|potash|smelter|\bore\b/i],
  ["energy", /energy|power|electric|hydro|wind|solar|transmission|substation|generat|nuclear|utility|battery storage|hydrogen|renewable/i],
  ["infrastructure", /infrastructure|transport|transit|road|highway|bridge|rail|airport|port\b|water ?(treatment|main)|wastewater|sewer|dam\b|municipal (services|infrastructure)|civic infrastructure/i],
  ["institutional", /institution|hospital|health|school|education|universit|college|government|civic|library|recreation|arena|community cent|long[- ]term care|police|fire hall|fire station|courthouse|museum|church|place of worship|assembly|day ?care|child ?care/i],
  ["mixed_use", /mixed[- ]use|mixed use/i],
  ["multi_residential", /residential|apartment|condo|housing|multi[- ]?(family|unit|res)|rental|townho|dwelling|seniors|tourism.*residential|dormitor/i],
  ["industrial", /industr|manufactur|warehouse|distribution|logistic|plant|factory|agri|forestry|chemical|processing/i],
  ["commercial", /commerc|retail|office|hotel|tourism|restaurant|shopping|mall|store|business|mercantile/i],
];

/** Free-text sector / type → our category (first match), else "other". */
export function normalizeCategory(...texts: (string | null | undefined)[]): MajorProjectCategory {
  // "Non-residential" is the opposite of residential.
  const s = texts.filter(Boolean).join(" | ").replace(/non[- ]?res(idential)?\b/gi, "commercial");
  if (!s) return "other";
  for (const [cat, re] of CATEGORY_RULES) if (re.test(s)) return cat;
  return "other";
}

/** Building categories a city permit may have; permits outside these are skipped. */
export const PERMIT_CATEGORIES: ReadonlySet<MajorProjectCategory> = new Set([
  "commercial",
  "institutional",
  "industrial",
  "multi_residential",
  "mixed_use",
  "data_centre",
]);

/* ------------------------------------------------------------------ trades */

// Extra trade keywords for big projects (RULES covers facilities work).
const EXTRA_TRADES: [slug: string, re: RegExp][] = [
  ["electrical", /\bmv\b|medium voltage|switchyard|substation|ups\b|electrical/i],
  ["hvac", /mechanical|chiller|cooling|hvac|ventilat/i],
  ["plumbing", /plumbing|piping|process piping|drainage/i],
  ["concrete-and-asphalt", /concrete|foundation|piling|site civil|civil|paving|excavat/i],
  ["fire-safety", /fire protection|sprinkler|fire alarm|life safety/i],
  ["building-automation", /controls|\bbms\b|building automation/i],
  ["security-systems", /security/i],
  ["glass-and-windows", /envelope|glazing|curtain wall/i],
  ["roofing", /roof/i],
  ["drywall", /drywall|interior/i],
  ["demolition", /demolition/i],
  ["general-contracting", /general contract|construction management|design-build|fit-?out|structural steel|steel/i],
];

/** Trade slugs mentioned in free text ("MV electrical + switchgear, piling, fire protection"). */
export function tradesFromText(text: string | null | undefined): string[] {
  const s = (text ?? "").toLowerCase();
  if (!s) return [];
  const out = new Set<string>();
  for (const [slug, re] of RULES) if (re.test(s)) out.add(slug);
  for (const [slug, re] of EXTRA_TRADES) if (re.test(s)) out.add(slug);
  return [...out];
}

/** What a big job of this kind usually needs, when the source doesn't say. */
const DEFAULT_TRADES: Record<MajorProjectCategory, string[]> = {
  commercial: ["general-contracting", "electrical", "hvac", "plumbing", "fire-safety", "drywall", "flooring", "glass-and-windows", "roofing"],
  institutional: ["general-contracting", "electrical", "hvac", "plumbing", "fire-safety", "building-automation", "drywall", "flooring", "roofing"],
  industrial: ["general-contracting", "concrete-and-asphalt", "electrical", "hvac", "plumbing", "fire-safety", "roofing"],
  multi_residential: ["general-contracting", "concrete-and-asphalt", "electrical", "plumbing", "hvac", "drywall", "flooring", "glass-and-windows", "elevator-services"],
  mixed_use: ["general-contracting", "concrete-and-asphalt", "electrical", "plumbing", "hvac", "drywall", "glass-and-windows", "elevator-services", "fire-safety"],
  data_centre: ["general-contracting", "electrical", "hvac", "concrete-and-asphalt", "fire-safety", "building-automation", "security-systems"],
  energy: ["general-contracting", "electrical", "concrete-and-asphalt"],
  infrastructure: ["general-contracting", "concrete-and-asphalt", "electrical"],
  mining: ["general-contracting", "electrical", "concrete-and-asphalt"],
  oil_gas: ["general-contracting", "electrical", "concrete-and-asphalt"],
  other: ["general-contracting"],
};

/** Trades from the text when it names some, else the category's usual trades. Max 10. */
export function inferTrades(category: MajorProjectCategory, ...texts: (string | null | undefined)[]): string[] {
  const named = tradesFromText(texts.filter(Boolean).join(" "));
  return (named.length >= 2 ? named : [...new Set([...named, ...DEFAULT_TRADES[category]])]).slice(0, 10);
}

/* ------------------------------------------------------------------ dates & urls */

/** "2026-07-08T00:00:00.000", "2026/07/08", 1751932800000 → "2026-07-08"; else null. */
export function isoDate(input: unknown): string | null {
  if (input == null || input === "") return null;
  if (typeof input === "number") {
    const d = new Date(input);
    return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  }
  const s = String(input).trim();
  const m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) || d.getUTCFullYear() < 1950 ? null : d.toISOString().slice(0, 10);
}

/** Every http(s) URL in a blob of text, plus bare "domain.tld/path" mentions, de-duplicated. */
export function urlsIn(text: string | null | undefined): string[] {
  const s = text ?? "";
  const out: string[] = [];
  for (const m of s.matchAll(/https?:\/\/[^\s;,)'"<>]+/gi)) out.push(m[0].replace(/[.]+$/, ""));
  for (const m of s.matchAll(/(?<![@/\w.])((?:[a-z0-9-]+\.)+(?:com|ca|org|net|io)\/[^\s;,)'"<>]*)/gi)) {
    const u = `https://${m[1].replace(/[.]+$/, "")}`;
    if (!out.some((o) => o.replace(/^https?:\/\/(www\.)?/, "") === u.replace(/^https?:\/\/(www\.)?/, ""))) out.push(u);
  }
  return [...new Set(out)];
}

/** A safe http(s) URL or null. */
export function safeUrl(u: unknown): string | null {
  if (typeof u !== "string") return null;
  const s = u.trim();
  if (!s) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ slug */

/** Stable page slug: the name plus a short source-key hash so renames don't collide. */
export function projectSlug(name: string, sourceKey: string): string {
  let h = 0;
  for (const c of sourceKey) h = (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0;
  const base = slugify(name).slice(0, 80).replace(/-+$/, "") || "project";
  return `${base}-${h.toString(36)}`;
}

/* ------------------------------------------------------------------ value bands */

export const VALUE_BANDS = ["5m", "25m", "100m", "1b"] as const;
export type ValueBand = (typeof VALUE_BANDS)[number];

/** Lower bound (CAD) of each band: 5m = C$3M–25M, 25m = 25M–100M, 100m = 100M–1B, 1b = C$1B+. */
export const VALUE_BAND_RANGES: Record<ValueBand, [number, number]> = {
  "5m": [3e6, 25e6], // key kept for existing URLs; floor is C$3M
  "25m": [25e6, 100e6],
  "100m": [100e6, 1e9],
  "1b": [1e9, Number.POSITIVE_INFINITY],
};

export function valueBand(v: number | null): ValueBand | null {
  if (v == null) return null;
  return VALUE_BANDS.find((b) => v >= VALUE_BAND_RANGES[b][0] && v < VALUE_BAND_RANGES[b][1]) ?? null;
}
