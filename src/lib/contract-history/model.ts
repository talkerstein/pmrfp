/**
 * CONTRACT HISTORY: the canonical award row every history importer writes
 * (table award_history, migration 20261017000040), and the rules they all
 * share. Pure, so it is unit tested and safe anywhere.
 *
 *  - Business names only. A winner or bidder that looks like a private
 *    individual (a person's name with no business word or legal suffix) is
 *    stored as "individual": no name is ever written. See businessNameOrNull.
 *  - One country, one currency: CA rows are CAD, US rows are USD. A row in
 *    the other currency is dropped, never converted.
 *  - End dates carry where they came from (end_date_source):
 *      stated              the source publishes the contract end date
 *      derived_from_title  computed from a term the notice text states
 *                          ("3 ans", "6 winter seasons", "2026-2029")
 *      estimated           award date + the typical 3-year term
 *    The renewal radar prefers stated > derived_from_title > estimated.
 */
import { canonicalProvince } from "@/lib/data/price-benchmarks";
import { isUsState } from "@/lib/geo";
import { winnerKey } from "@/lib/data/winners";
import { addMonths, parseTerm, TYPICAL_TERM_YEARS } from "@/lib/intel/model";
import type { CountryCode } from "@/lib/visitor-geo";

export type EndDateSource = "stated" | "derived_from_title" | "estimated";
export type DatePrecision = "day" | "month" | "half_year";
export type HistoryCurrency = "CAD" | "USD";

/** The User-Agent every history importer sends (named, with a contact page). */
export const HISTORY_UA = "PMRFP-AwardHistory/1.0 (+https://pmrfp.com/about)";

/** A row ready for award_history (snake_case = the column). */
export interface AwardHistoryInput {
  source: string;
  source_key: string;
  board_ref: string | null;
  title: string;
  description: string | null;
  buyer: string | null;
  buyer_key: string | null;
  winner_business_name: string | null;
  winner_key: string | null;
  winner_is_individual: boolean;
  value: number | null;
  currency: HistoryCurrency;
  country: CountryCode;
  province: string | null;
  city: string | null;
  award_date: string;
  award_date_precision: DatePrecision;
  start_date: string | null;
  end_date: string | null;
  end_date_source: EndDateSource | null;
  potential_end_date: string | null;
  number_of_bids: number | null;
  trade_slugs: string[];
  notice_url: string | null;
  licence: string;
  attribution: string;
  as_of: string;
}

export type BidStatus = "awarded" | "apparent_low" | "not_awarded" | "submitted";

/** A row ready for bid_results, keyed to its award by (source, source_key) until the award has an id. */
export interface BidResultInput {
  award_source: string;
  award_source_key: string;
  bidder_business_name: string | null;
  bidder_key: string;
  bidder_is_individual: boolean;
  bid_amount: number | null;
  currency: HistoryCurrency;
  rank: number | null;
  status_label: BidStatus;
  as_of: string;
  source: string;
}

export interface ParsedBatch {
  awards: AwardHistoryInput[];
  bids: BidResultInput[];
  /** Rows read from the source before any filtering. */
  read: number;
  /** Why rows were skipped (counts), for the dry-run report. */
  skipped: Record<string, number>;
}

export const emptyBatch = (): ParsedBatch => ({ awards: [], bids: [], read: 0, skipped: {} });
export const skip = (b: ParsedBatch, why: string) => {
  b.skipped[why] = (b.skipped[why] ?? 0) + 1;
};

export const currencyForCountry = (c: CountryCode): HistoryCurrency => (c === "US" ? "USD" : "CAD");

/* ------------------------------------------------------------------ names */

/** Placeholders some buyers publish instead of a supplier. */
const JUNK = /^(no bids?|multiple bidders|multiple vendors|various( vendors)?|info only|n\/?a|none|cancel+ed|tbd|not awarded|confidential|redacted|vendor|unknown|\W+)$/i;
const LEGAL =
  /\b(inc|incorporated|ltd|ltée|ltee|limited|limitée|limitee|llc|l\.l\.c|llp|lp|l\.p|ulc|corp|corporation|co|company|cie|plc|pllc|pc|p\.c|gmbh|ag|sa|sas|sarl|s\.a|bv|pty|s\.e\.n\.c|senc|senc\.?r\.?l|enr|gp|trust|cooperative|coop|co-op)\b\.?/i;
/** Words that make a name a business ("Jean Tremblay Excavation" is a trade name, not a person). */
const BUSINESS =
  /\b(construction|constructors?|contracting|contractors?|roofing|paving|pavage|asphalt|concrete|b[ée]ton|electric\w*|[ée]lectri\w*|mechanical|m[ée]canique|plumbing|plomberie|heating|chauffage|hvac|cvac|services?|cleaning|cleaners|nettoyage|janitorial|entretien|systems?|syst[èe]mes?|group|groupe|enterprises?|entreprises?|industries|industriel\w*|solutions|maintenance|environmental|environnement\w*|builders?|building|b[âa]timents?|restoration|technolog\w*|elevators?|ascenseurs?|fenc\w*|cl[ôo]tures?|floor\w*|landscap\w*|paysag\w*|excavation|excavating|painting|peinture|painters|glass|glazing|vitrerie|doors?|portes?|windows?|fen[êe]tres?|security|s[ée]curit[ée]|fire|incendie|waste|d[ée]chets|management|gestion|supply|supplies|projects?|projets?|developments?|d[ée]veloppement|infrastructure|engineering|ing[ée]nierie|energy|[ée]nergie|power|drain\w*|masonry|ma[çc]onnerie|steel|acier|welding|soudure|demolition|d[ée]molition|abatement|lawn|snow|neige|d[ée]neigement|transport\w*|associates|associ[ée]s|partners|partenaires|consult\w*|holdings|products|produits|equipment|[ée]quipements?|international|national|canada|qu[ée]bec|ontario|america|american|usa|us|north|nord|west|ouest|east|est|south|sud|global|services|municipality|municipalit[ée]|city|ville|county|government|gouvernement|university|universit[ée]|college|coll[èe]ge|school|[ée]cole|hospital|h[ôo]pital|authority|board|agency|agence|society|soci[ée]t[ée]|association|institute|institut|foundation|fondation|centre|center|sons|fils|fr[èe]res|brothers|bros|family|famille|properties|propri[ée]t[ée]s|realty|rentals?|location|lumber|bois|sales|ventes|distribution|manufacturing|fabrication|logistics|marine|mining|petroleum|oil|gas|labs?|laboratories|design|architects?|architecture|studio|works|shop|store|depot|centres|tech|mfg|intl|div|division|unlimited|specialties|sp[ée]cialit[ée]s|installations?|r[ée]novations?|renovations?|repairs?|r[ée]parations?|exterminat\w*|pest|elevator|irrigation|septic|sanitation|sanitaire|hydro|utility|utilities|telecom\w*|communications?|networks?|r[ée]seaux?|media|m[ée]dias|printing|imprimerie|signs?|enseignes|auto|automotive|garage|towing|remorquage|disposal|recycl\w*|demo|excavations|scaffold\w*|[ée]chafaud\w*|rigging|crane|grues?|pumps?|pompes?|plus|pro|pros|experts?|direct|express|first|premier|premi[èe]re|best|quality|qualit[ée]|general|g[ée]n[ée]ral)\b/i;
/** A person's name token: "Jean-Marc", "O'Neil", "McDonald", "A." */
const NAME_TOKEN = /^(?:[A-Za-zÀ-ÖØ-öø-ÿ][A-Za-zÀ-ÖØ-öø-ÿ'’-]*\.?|(?:[A-Za-zÀ-ÖØ-öø-ÿ]\.){1,3})$/;
/** "doing business as" markers: the trading name after it is the business. */
const DBA = /\s+(?:d\/?b\/?a|o\/a|doing business as|operating as|faisant affaires sous(?: le nom de)?|f\.a\.s\.)\s+/i;

const tidy = (s: string) => s.replace(/\s+/g, " ").replace(/^[\s,;:.-]+|[\s,;:-]+$/g, "").trim();

/**
 * The name as published when it is a business, or null when it may be a
 * private individual ("John Smith", "SMITH, JOHN", "J. A. Smith",
 * "Marie-Ève Tremblay") or a placeholder. Open-data licences exclude
 * personal information, so an individual is counted, never named.
 * "John Smith dba Smith Roofing" keeps the trading name only.
 */
export function businessNameOrNull(raw: string | null | undefined): string | null {
  let name = tidy(String(raw ?? ""));
  if (!name || name.length < 2 || JUNK.test(name)) return null;
  const dba = name.split(DBA);
  if (dba.length > 1) {
    const trade = tidy(dba[dba.length - 1]);
    return trade && trade !== name ? businessNameOrNull(trade) : null;
  }
  if (name.length > 300) name = name.slice(0, 300).trim();
  if (LEGAL.test(name) || BUSINESS.test(name) || /\d/.test(name) || /[&+@/]/.test(name)) return name;
  // "SMITH, JOHN A." → "SMITH JOHN A."
  const tokens = name.replace(/,/g, " ").split(/\s+/).filter(Boolean);
  if (tokens.length === 1) return name.length >= 3 ? name : null;
  if (tokens.length <= 5 && tokens.every((t) => NAME_TOKEN.test(t))) return null;
  return name;
}

/** Grouping key for a business name ("GUILD ELECTRIC LTD." ≡ "Guild Electric Limited"). */
export const nameKey = (name: string): string => winnerKey(name.replace(/\band\b/gi, "&")).replace(/^the\s+/, "").replace(/\s+/g, " ").trim();

/** "Ville de Montréal" ≡ "VILLE DE MONTREAL" (same rule as the intel buyer key). */
export function buyerKey(name: string | null | undefined): string | null {
  if (!name) return null;
  const k = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9&]+/g, " ")
    .trim();
  return k || null;
}

/** Supplier fields for a row: the business name and key, or the individual flag. */
export function winnerFields(raw: string | null | undefined): Pick<AwardHistoryInput, "winner_business_name" | "winner_key" | "winner_is_individual"> | null {
  if (!tidy(String(raw ?? "")) || JUNK.test(tidy(String(raw ?? "")))) return null;
  const name = businessNameOrNull(raw);
  if (!name) return { winner_business_name: null, winner_key: null, winner_is_individual: true };
  const key = nameKey(name);
  return key ? { winner_business_name: name, winner_key: key, winner_is_individual: false } : null;
}

/* ------------------------------------------------------------------ dates & money */

/** "2026-03-31", "2026-03-31T00:00:00-04:00", "2026/03/31" → "2026-03-31"; anything else → null. */
export function isoDay(v: unknown): string | null {
  const s = String(v ?? "").trim();
  const m = s.match(/^(\d{4})[-/](\d{2})[-/](\d{2})/);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (y < 1990 || y > 2100 || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

/** "1,234.50", "$1 234,50", 1234.5 → 1234.5; blanks, junk, negatives, absurd values → null. */
export function money(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) && v >= 0 && v < 1e11 ? Math.round(v * 100) / 100 : null;
  let s = String(v ?? "").replace(/[$\s ]|CAD|USD/gi, "");
  if (!s) return null;
  // "1 234,50" (French) → "1234.50"; "1,234.50" → "1234.50".
  if (/^\d{1,3}(\.\d{3})*,\d{1,2}$/.test(s)) s = s.replace(/\./g, "").replace(",", ".");
  else if (/^\d+,\d{1,2}$/.test(s)) s = s.replace(",", ".");
  else s = s.replace(/,/g, "");
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 && n < 1e11 ? Math.round(n * 100) / 100 : null;
}

export function intOrNull(v: unknown): number | null {
  const s = String(v ?? "").trim();
  if (!/^\d{1,4}(\.0+)?$/.test(s)) return null;
  const n = Math.round(Number(s));
  return n >= 0 && n <= 1000 ? n : null;
}

/* ------------------------------------------------------------------ end dates */

export interface EndDate {
  end_date: string | null;
  end_date_source: EndDateSource | null;
}

/**
 * The contract end date with its provenance: a stated end date wins (when it
 * falls on or after the award); else a term the text states; else the
 * typical-term estimate (only for recurring work, `estimate`). The stated
 * value must be a real date within 30 years of the award (data-entry typos
 * like 2202-03-31 are dropped).
 */
export function endDateFor(p: { awardDate: string; stated?: string | null; text?: string | null; estimate?: boolean }): EndDate {
  const stated = p.stated ? isoDay(p.stated) : null;
  if (stated && stated >= p.awardDate && stated <= addMonths(p.awardDate, 30 * 12)) return { end_date: stated, end_date_source: "stated" };
  if (p.text) {
    const term = parseTerm(p.text, p.awardDate);
    if (term.source !== "typical") {
      return { end_date: addMonths(p.awardDate, term.months), end_date_source: "derived_from_title" };
    }
  }
  if (p.estimate) return { end_date: addMonths(p.awardDate, TYPICAL_TERM_YEARS * 12), end_date_source: "estimated" };
  return { end_date: null, end_date_source: null };
}

const END_RANK: Record<EndDateSource, number> = { stated: 3, derived_from_title: 2, estimated: 1 };

/** Of two end dates for the same contract, the better-sourced one (stated > derived > estimated). */
export function preferEndDate(a: EndDate, b: EndDate): EndDate {
  const ra = a.end_date_source ? END_RANK[a.end_date_source] : 0;
  const rb = b.end_date_source ? END_RANK[b.end_date_source] : 0;
  return rb > ra ? b : a;
}

/* ------------------------------------------------------------------ places */

/** Province/state display name ("QC" → "Quebec", "TX" → "Texas"), only when it belongs to `country`. */
export function provinceFor(country: CountryCode, v: string | null | undefined): string | null {
  const p = canonicalProvince(v);
  if (!p) return null;
  return (country === "US") === isUsState(p) ? p : null;
}

/* ------------------------------------------------------------------ validation */

/** The row as the DB will accept it, or the reason it can't be stored. */
export function validateAward(r: AwardHistoryInput): string | null {
  if (!r.source || !r.source_key) return "no-key";
  if (!r.title) return "no-title";
  if (!isoDay(r.award_date)) return "no-award-date";
  if (r.currency !== currencyForCountry(r.country)) return "currency-mismatch";
  if (!r.winner_is_individual && !r.winner_business_name) return "no-winner";
  if ((r.end_date === null) !== (r.end_date_source === null)) return "end-date-source";
  if (r.notice_url && !/^https:\/\//.test(r.notice_url)) return "notice-url";
  return null;
}

/** Keep the last row per (source, source_key): later rows in a feed are newer amendments. */
export function dedupeAwards(rows: AwardHistoryInput[]): AwardHistoryInput[] {
  const m = new Map<string, AwardHistoryInput>();
  for (const r of rows) m.set(`${r.source}|${r.source_key}`, r);
  return [...m.values()];
}

export const clip = (s: string | null | undefined, n: number): string | null => {
  const t = tidy(String(s ?? "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " "));
  if (!t) return null;
  return t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t;
};

export const httpsOrNull = (u: string | null | undefined): string | null => {
  const s = String(u ?? "").trim().replace(/^http:\/\//i, "https://");
  return /^https:\/\/[^\s"'<>]+$/.test(s) ? s : null;
};
