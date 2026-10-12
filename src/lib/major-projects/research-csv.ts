/**
 * Manual research CSVs (briefs/research/*.csv, e.g. the 2026-10-11 Canada
 * data-centre scan, and the weekly briefs/research/major-projects/
 * major-projects.csv) → major_projects rows with source = 'manual'.
 *
 * These are research notes, not open data: every row lands in the admin
 * review queue (approved = false) and stays private until an admin
 * approves it. Its evidence flag (F = page read, S = search summary,
 * A = aggregator only), caveats and source links travel with it.
 *
 * Column names are matched loosely (aliases below) so the weekly research
 * file can grow columns without breaking the import. Canada only: rows
 * outside a Canadian province are skipped.
 */
import { parseCsv } from "@/lib/tenders/csv";
import { slugify } from "@/lib/tenders/shared";
import {
  cleanText,
  inferTrades,
  isoDate,
  normalizeCategory,
  normalizeStatus,
  parseMoney,
  provinceName,
  provinceSlug,
  safeUrl,
  urlsIn,
  MAJOR_PROJECT_CATEGORIES,
  type MajorProjectCategory,
  type MajorProjectInput,
} from "./model";

export const MANUAL_SOURCE = "manual";
export const MANUAL_LICENSE =
  "PMRFP research summary of the public sources linked on this page. Facts belong to their publishers; check them before you rely on them.";

const ALIASES: Record<string, string[]> = {
  name: ["project", "name", "project_name"],
  owner: ["developer_owner", "owner", "developer", "proponent"],
  city: ["city_region", "city", "municipality", "location"],
  province: ["province", "prov"],
  site: ["address_or_site", "address", "site"],
  sizeMw: ["size_mw", "mw"],
  sizeSqft: ["size_sqft", "sqft", "square_feet"],
  size: ["size"],
  value: ["est_value_cad", "value_cad", "estimated_value", "value"],
  status: ["status_category", "status"],
  statusDetail: ["status_detail_and_evidence_date", "status_detail", "status_notes"],
  statusDate: ["status_date", "evidence_date"],
  gc: ["general_contractor", "gc", "contractor"],
  team: ["known_subs_and_team", "team", "known_subs"],
  timeline: ["timeline", "schedule"],
  refs: ["permit_or_planning_refs", "permit_refs", "planning_refs"],
  trades: ["trades_needed", "trades"],
  bidRoute: ["bid_access_route", "bid_route", "how_to_bid", "bid_list"],
  bidUrl: ["bid_list_url", "prequal_url"],
  evidence: ["evidence_level", "evidence"],
  caveats: ["conflicts_and_caveats", "caveats", "notes"],
  sources: ["source_urls", "sources", "source_url"],
  category: ["category", "sector"],
  description: ["description", "summary"],
};

function pick(row: Record<string, string>, field: keyof typeof ALIASES): string {
  const keys = Object.keys(row);
  for (const alias of ALIASES[field]) {
    const k = keys.find((x) => x.trim().toLowerCase() === alias);
    if (k && row[k]?.trim()) return row[k];
  }
  return "";
}

/** "Sturgeon County (Alberta Industrial Heartland, N of Edmonton)" → "Sturgeon County". */
function placeName(s: string): string | null {
  return cleanText(s.replace(/\([^)]*\)/g, " ").split(/[;,/]/)[0], 120);
}

/** The last ISO date mentioned in the text ("Groundbreaking announced 2026-07-08; …"). */
function lastDateIn(s: string): string | null {
  const all = [...s.matchAll(/\b(20\d{2}-\d{2}-\d{2})\b/g)].map((m) => m[1]);
  return all.length ? all.sort()[all.length - 1] : null;
}

function sizeOf(row: Record<string, string>): string | null {
  const mw = cleanText(pick(row, "sizeMw"), 90);
  const sqft = cleanText(pick(row, "sizeSqft"), 60);
  const parts = [mw ? (/\bmw\b/i.test(mw) ? mw : `${mw} MW`) : null, sqft ? (/sq/i.test(sqft) ? sqft : `${sqft} sq ft`) : null, cleanText(pick(row, "size"), 100)];
  return cleanText(parts.filter(Boolean).join(" · "), 200);
}

function hostLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export interface ResearchParseResult {
  rows: MajorProjectInput[];
  skipped: { line: number; reason: string }[];
}

/**
 * Parse a research CSV. `defaultCategory` applies when neither a category
 * column nor the project name says what it is (the data-centre file names
 * "eStruxture CAL-3", not "data centre").
 */
export function parseResearchCsv(text: string, opts: { defaultCategory?: MajorProjectCategory } = {}): ResearchParseResult {
  const rows: MajorProjectInput[] = [];
  const skipped: ResearchParseResult["skipped"] = [];
  const seen = new Set<string>();
  parseCsv(text).forEach((row, i) => {
    const line = i + 2;
    const name = cleanText(pick(row, "name"), 300);
    if (!name) return void skipped.push({ line, reason: "no project name" });
    const province = provinceName(pick(row, "province"));
    if (!province) return void skipped.push({ line, reason: "not a Canadian province" });

    const statusRaw = cleanText(pick(row, "status"), 200);
    const detail = cleanText(pick(row, "statusDetail"), 1200);
    const declared = cleanText(pick(row, "category"), 60)?.toLowerCase().replace(/[\s-]+/g, "_");
    const guessed = normalizeCategory(name);
    // A file-level default (the data-centre scan) wins over loose name
    // guesses ("West Woodbridge" is not a bridge); only a power plant or a
    // pipeline named as such keeps its own type.
    const strong = guessed === "energy" || guessed === "oil_gas" || guessed === "data_centre";
    const category: MajorProjectCategory =
      declared && (MAJOR_PROJECT_CATEGORIES as readonly string[]).includes(declared)
        ? (declared as MajorProjectCategory)
        : opts.defaultCategory && !strong
          ? opts.defaultCategory
          : guessed !== "other"
            ? guessed
            : opts.defaultCategory ?? normalizeCategory(declared, detail);
    const bidRoute = cleanText(pick(row, "bidRoute"), 2000);
    const bidListUrl = safeUrl(pick(row, "bidUrl")) ?? urlsIn(bidRoute)[0] ?? null;
    const sources = urlsIn(pick(row, "sources")).map((url) => ({ label: hostLabel(url), url }));
    const evidence = pick(row, "evidence").trim().toUpperCase().slice(0, 1);
    const city = placeName(pick(row, "city"));
    const team = cleanText(pick(row, "team"), 600);
    const description = cleanText([cleanText(pick(row, "description"), 800), detail, team ? `Team: ${team}` : null].filter(Boolean).join(" "), 2000);
    const sourceKey = `${MANUAL_SOURCE}:${slugify(name).slice(0, 120)}-${slugify(province)}`;
    if (seen.has(sourceKey)) return void skipped.push({ line, reason: "duplicate project in file" });
    seen.add(sourceKey);

    rows.push({
      source: MANUAL_SOURCE,
      sourceKey,
      name,
      description,
      category,
      owner: cleanText(pick(row, "owner"), 300),
      city,
      province,
      regionSlug: city ? slugify(city) : provinceSlug(province),
      estValueCad: /not public|^\s*$/i.test(pick(row, "value")) ? null : parseMoney(pick(row, "value")),
      size: sizeOf(row),
      status: normalizeStatus(statusRaw),
      statusRaw,
      statusDate: isoDate(pick(row, "statusDate")) ?? lastDateIn(`${detail ?? ""} ${statusRaw ?? ""}`),
      timeline: cleanText(pick(row, "timeline"), 500),
      generalContractor: cleanText(pick(row, "gc"), 300),
      bidListUrl,
      bidRoute,
      tradesNeeded: inferTrades(category, pick(row, "trades")),
      sources,
      license: MANUAL_LICENSE,
      evidence: evidence === "F" || evidence === "S" || evidence === "A" ? evidence : null,
      caveats: cleanText([cleanText(pick(row, "caveats"), 1500), cleanText(pick(row, "refs"), 400) ? `Permits / planning: ${cleanText(pick(row, "refs"), 400)}` : null].filter(Boolean).join(" "), 2000),
    });
  });
  return { rows, skipped };
}

/** Category to assume for a research file, from its file name. */
export function defaultCategoryForFile(fileName: string): MajorProjectCategory | undefined {
  return /data[-_ ]?cent(re|er)/i.test(fileName) ? "data_centre" : undefined;
}
