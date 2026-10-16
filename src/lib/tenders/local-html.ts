/**
 * Shared by the Canadian buyer-website importers (Ontario Northland, the
 * Saanich/FVRD "tenders-table" sites, SaskTenders): HTML-to-text, a stable
 * hex reference for slugs, the local-work filter, and a polite fetch.
 *
 * Every source here is the buyer's (or province's) OWN website — not a
 * commercial bid platform — with robots.txt allowing the list page and no
 * anti-reuse clause in its terms (checked 2026-10-15; feed-map
 * briefs/strategy/feed-map/municipal-2026-10-15.csv). One list read a day.
 */
import { createHash } from "node:crypto";
import { BUILDING_WORK, CIVIL, EXCLUDE, RULES } from "./shared";
import { TENDER_UA } from "./florida-vbs";

/** Inner HTML → plain text (entities decoded, whitespace collapsed). */
export function htmlText(s: string): string {
  return s
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&rsquo;|&lsquo;|&apos;/g, "'")
    .replace(/&ldquo;|&rdquo;/g, '"')
    .replace(/&ndash;|&mdash;/g, "–")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/[ \t\r]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Slug reference: the first 12 hex chars of SHA-1(official URL). Hex has no
 * dashes, so no other importer's marker can hide inside it, and the same
 * notice always gets the same slug.
 */
export function urlRef(url: string): string {
  return createHash("sha1").update(url).digest("hex").slice(0, 12);
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** "Nov 05, 2026" / "November 5, 2026 at 2:00 PM" → "2026-11-05". */
export function monthDayYear(s: string): string | null {
  const m = s.trim().match(/^([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})/);
  if (!m) return null;
  const month = MONTHS.indexOf(m[1].slice(0, 3).toLowerCase()) + 1;
  return month ? `${m[3]}-${String(month).padStart(2, "0")}-${m[2].padStart(2, "0")}` : null;
}

/** Supplies, sales, vehicles, studies and other non-trade calls local buyers post. */
export const LOCAL_SKIP =
  /\bsupplies\b|supply only|supply and deliver|supply & deliver|purchase of|purchase \w+ \(?\d|\bfor sale\b|sale of|\blease\b|tender for the sale|vehicles?\b|\btrucks?\b|tractor|loader|mower(?!s? services)|equipment(?! (?:installation|replacement))|naming rights|program development|feasibility|inspection services? for|lifting equipment|drug and alcohol|insurance|audit|legal services|\bdesign\b(?! and construction| ?-? ?build)|condition assessment|planning study|master plan|roster|qualified supplier|prequalification|pre-qualification|expression of interest|request for information|\brfi\b|notice of (?:intent|participation)|\bnoi\b|propane|\bfuel\b|chemicals?|\bsalt\b|\bsand\b|aggregate|gravel|culvert|watermain|water main|sanitary|storm sewer|lift station|pump station|lagoon|reservoir|highway|\broads?\b|sidewalk|bridge|crossing closure|\brail\b|railway|locomotive|airport runway|dredg|software|website|it services|telecom|fibre|fiber/;

/**
 * Building work local buyers name in ways the shared RULES miss (measured on
 * the 2026-10-15 SaskTenders, Saanich and FVRD lists): air handlers, fume-hood
 * ducts, BAS, electrical service, pool filtration, stairs, office refits.
 */
const LOCAL_RULES: [slug: string, pattern: RegExp][] = [
  ["hvac", /air handl|\bahu\b|\bducts?\b|ductwork|mechanical upgrades?|mechanical (?:system )?replacement|building automation|\bbas\b|dehumidif/],
  ["plumbing", /mechanical upgrades?|pool filtration|filtration (?:system )?replacement/],
  ["electrical", /(?:main|electrical) service (?:replacement|upgrade)|electrical upgrade/],
  ["landscaping", /tree maintenance|removal of [a-z ]{0,30}trees|\bflowers?\b|planting/],
  ["general-contracting", /stair (?:replacement|repairs?)|office refresh|office expansion|leasehold improvement|foundation repair|shop repair|steam room|\bnew program unit\b/],
];

const LOCAL_ALSO_SKIP = /connection rehabilitation|induction melting|prepurchase|pre-purchase|\bnetwork\b|\bmaterials?\b/;

/** PMRFP trade slugs (max 3) for a buyer-website title, or [] to skip. */
export function classifyLocalTitle(title: string, closing: string | null, today: string): string[] {
  if (!closing || closing < today) return [];
  // Standing arrangements carry placeholder dates years out (2030, 2034).
  const horizon = new Date(Date.parse(`${today}T00:00:00Z`) + 400 * 86_400_000).toISOString().slice(0, 10);
  if (closing > horizon) return [];
  const t = title.toLowerCase().replace(/\s+/g, " ").trim();
  if (t.length < 6 || EXCLUDE.test(t) || CIVIL.test(t) || LOCAL_SKIP.test(t) || LOCAL_ALSO_SKIP.test(t)) return [];
  const byRule = [...new Set([...RULES, ...LOCAL_RULES].filter(([, p]) => p.test(t)).map(([slug]) => slug))];
  if (byRule.length) return byRule.slice(0, 3);
  return BUILDING_WORK.test(t) ? ["general-contracting"] : [];
}

export const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(t);
      reject(signal.reason ?? new Error("aborted"));
    });
  });

/** One polite GET, identified as the PMRFP tender indexer. */
export async function getPage(url: string, signal?: AbortSignal): Promise<string> {
  const res = await fetch(url, { cache: "no-store", signal, headers: { "User-Agent": TENDER_UA, Accept: "text/html,application/xhtml+xml" } });
  if (!res.ok) throw new Error(`fetch failed: HTTP ${res.status} (${url})`);
  return res.text();
}
