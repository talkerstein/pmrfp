/**
 * Public-tender titles arrive with the buyer's solicitation number glued to
 * the front ("EE517-270096 Snow removal…", "2026-029: FOUR PROJECTS IN…") and
 * a fair share are in all caps. On a card that reads like a raw data feed.
 *
 * `tidyTenderTitle` splits the number off into `reference` (the notice page
 * still shows it, since trades quote it when they bid) and calms all-caps
 * titles down to title case. Anything it isn't sure about is left alone.
 */

/** A code segment: letters optional, at least one digit ("EE517", "270096", "43174/75"). */
const SEG = String.raw`[A-Z]*\d[A-Z0-9]*(?:/\d+)?`;
/** A short all-caps suffix some buyers append ("RISO", "D", "N"). */
const TAIL = String.raw`[A-Z]{1,4}`;
/** Hyphenated code: two or more segments, then a separator or the end. */
const HYPHEN_CODE = new RegExp(String.raw`^(${SEG}(?:-(?:${SEG}|${TAIL}))+)-?(?=[\s,:;|–—-]|$)`);
/** Single-token code, only when a separator follows ("N400857584741, …", "061120 - …"). */
const SINGLE_CODE = new RegExp(String.raw`^(${SEG})(?=\s*[,:;|–—]|\s*-\s|-\s)`);
const LEADING_SEPARATORS = /^[\s,:;|–—-]+/;
/** Procurement boilerplate that says nothing on an RFP board. */
const NOISE_PREFIX = /^(?:RISO|RFP|RFQ)\s*[-–—:]\s*/i;
const NOISE_SUFFIX = /\s*[-–—]\s*(?:RISO|RFP|RFQ)\.?$/i;
/** "Retender EQ754-…", "RFQ CBI26-107 …": a procurement word in front of the code. */
const LEAD_WORD = /^(?:re-?tender|tender|rfp|rfq|rft|rfsq)\s+(?=[A-Z]*\d)/i;
const YEAR = /^(?:19|20)\d\d$/;

/** "2026-2027", "2025/26": a season, not a reference number ("2026-01" is a tender number). */
function isSeason(code: string): boolean {
  const m = code.match(/^((?:19|20)\d\d)[-/](\d{2}|\d{4})$/);
  if (!m) return false;
  const start = Number(m[1]);
  const end = m[2].length === 4 ? Number(m[2]) : Math.floor(start / 100) * 100 + Number(m[2]);
  return end > start && end - start <= 2;
}

const SMALL_WORDS = new Set([
  "a", "an", "and", "as", "at", "by", "for", "from", "in", "into", "of", "on", "or", "the", "to", "with",
  "à", "au", "aux", "avec", "dans", "de", "des", "du", "en", "entre", "et", "la", "le", "les", "par", "pour",
  "sans", "sous", "sur", "un", "une",
]);
/** Kept upper-case when an all-caps title is converted. */
const ACRONYMS = new Set([
  "HVAC", "CVAC", "HRV", "ERV", "RTU", "AHU", "LED", "UPS", "CCTV", "PA", "AC", "DC", "EV", "IT", "ITQ", "SA",
  "US", "USA", "VA", "VAMC", "NCO", "NRM", "IDIQ", "FY", "FFP", "NOAA", "FEMA", "NASA", "USDA", "USACE", "GSA", "DOD",
  "CFB", "DND", "RCMP", "CFIA", "PWGSC", "PSPC", "CGC", "NS", "NB", "NL", "PEI", "QC", "BC", "AB", "MB", "SK",
  "YT", "NT", "NU", "GTA", "HRM", "CBRM", "TTC", "TCHC", "CMHC", "GIWW", "SEAO", "EPIC", "QG",
]);
/** Short all-consonant tokens are initialisms ("HCM", "HPB", "APN"). */
const INITIALISM = /^[B-DF-HJ-NP-TV-XZ]{2,5}$/;
/** French elision: d', l', qu' … followed by the word. */
const ELISION = /^([dlcjmnst]|qu)(['’])(.+)$/i;

export interface TidyTitle {
  title: string;
  reference: string | null;
}

function isShouting(s: string): boolean {
  const letters = s.replace(/[^A-Za-zÀ-ÖØ-öø-ÿ]/g, "");
  if (letters.length < 12) return false;
  const upper = letters.replace(/[^A-ZÀ-ÖØ-Þ]/g, "").length;
  return upper / letters.length > 0.85;
}

const lower = (s: string) => s.toLocaleLowerCase("fr-CA");
const cap = (s: string) => s.charAt(0).toLocaleUpperCase("fr-CA") + s.slice(1);

/** One hyphen-free piece of a word, e.g. "VALLÉE", "D'ALARME", "J.O.R.". */
function casePiece(piece: string, first: boolean): string {
  const bare = piece.replace(/^[^A-Za-zÀ-ÿ0-9]+|[^A-Za-zÀ-ÿ0-9]+$/g, "");
  if (!bare || /\d/.test(bare) || ACRONYMS.has(bare.toUpperCase()) || INITIALISM.test(bare)) return piece;
  const elided = piece.match(ELISION);
  if (elided) return (first ? cap(lower(elided[1])) : lower(elided[1])) + elided[2] + casePiece(elided[3], true);
  if (!first && SMALL_WORDS.has(lower(bare))) return lower(piece);
  // Capitalise after an opening bracket, slash or full stop: "(périmètre", "J.O.R."
  return lower(piece).replace(/(^|[(/.])([a-zà-ÿ])/g, (_, sep: string, ch: string) => sep + ch.toLocaleUpperCase("fr-CA"));
}

function caseWord(word: string, first: boolean): string {
  return word
    .split("-")
    .map((piece, i) => casePiece(piece, first && i === 0))
    .join("-");
}

function titleCase(s: string): string {
  return s
    .split(/(\s+)/)
    .map((part, i) => (/^\s+$/.test(part) ? part : caseWord(part, i === 0)))
    .join("");
}

export function tidyTenderTitle(raw: string): TidyTitle {
  const original = raw.trim();
  let title = original;
  let reference: string | null = null;

  const lead = title.match(LEAD_WORD)?.[0] ?? "";
  const candidate = title.slice(lead.length);
  const code = candidate.match(HYPHEN_CODE)?.[1] ?? candidate.match(SINGLE_CODE)?.[1] ?? null;
  if (code && !isSeason(code) && !YEAR.test(code)) {
    const rest = candidate.slice(code.length).replace(LEADING_SEPARATORS, "");
    // Only strip when a real title is left behind.
    if (rest.length >= 8 && /[A-Za-zÀ-ÿ]{3}/.test(rest) && /\s/.test(rest)) {
      title = rest;
      reference = code;
    }
  }

  const trimmed = title.replace(NOISE_PREFIX, "").replace(NOISE_SUFFIX, "");
  if (trimmed.length >= 8) title = trimmed;
  if (isShouting(title)) title = titleCase(title);
  return { title: cap(title), reference };
}

/** Public tenders get tidied; titles a property manager wrote are shown exactly as written. */
export function displayTitle(title: string, sourceType: string | null | undefined): TidyTitle {
  return sourceType === "public_source" ? tidyTenderTitle(title) : { title, reference: null };
}
