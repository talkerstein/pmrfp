import type { RfpListItem } from "@/lib/data/types";
import { daysUntil, parseAward } from "@/lib/data/fomo";
import { buyerFromSummary } from "@/lib/seo/rfp-meta";
import { parseClosedAward } from "@/lib/tenders/canadabuys-closed";
import { publicTenderSource } from "@/lib/tenders/sources";

/**
 * The /rfps list filters, as pure functions (unit tested in
 * test/unit/board-filters.test.ts): URL parsing and canonicalization, closing
 * windows, value bands, buyer types and the robots rule for filtered views.
 *
 * Rules:
 *  - Every filter is a query parameter, so any filtered view is a shareable link.
 *    Unknown parameters and unknown values are dropped; parameters are written in
 *    one fixed order and defaults are left out, so one view has one URL.
 *  - Only real data. A value band needs a stated value (an award amount): an open
 *    public tender states none in our data, so it is "not stated", never guessed.
 *    A buyer type is read from the buyer's name (or its source); when neither says,
 *    the listing has no buyer type and no type filter matches it.
 *  - Work type (new build / alteration / service) is deliberately NOT here: the
 *    existing classifier only knows trades, and keyword guesses from titles were
 *    wrong too often (see the PR notes).
 */

/* ------------------------------------------------------------------ closing */

/** "later" means beyond the next 30 days (or no date: ongoing lists). */
export const CLOSING_WINDOWS = ["today", "tomorrow", "week", "two-weeks", "month", "later"] as const;
export type ClosingWindow = (typeof CLOSING_WINDOWS)[number];

/** Does a deadline fall in the window? (Toronto time, like every countdown on the site.) */
export function inClosingWindow(deadline: string | null, window: ClosingWindow | "all", now = new Date()): boolean {
  if (window === "all") return true;
  const d = daysUntil(deadline, now);
  if (d === null) return window === "later";
  if (window === "today") return d <= 0;
  if (window === "tomorrow") return d === 1;
  if (window === "week") return d <= 7;
  if (window === "two-weeks") return d <= 14;
  if (window === "month") return d <= 30;
  return d > 30;
}

/* ------------------------------------------------------------------ value bands */

/** Contract value bands. Lower bound inclusive, upper bound exclusive. */
export const VALUE_BANDS = [
  { key: "under-100k", min: 0, max: 100_000 },
  { key: "100k-500k", min: 100_000, max: 500_000 },
  { key: "500k-1m", min: 500_000, max: 1_000_000 },
  { key: "1m-5m", min: 1_000_000, max: 5_000_000 },
  { key: "5m-10m", min: 5_000_000, max: 10_000_000 },
  { key: "over-10m", min: 10_000_000, max: Infinity },
] as const;
export type ValueBandKey = (typeof VALUE_BANDS)[number]["key"] | "not-stated";
export const VALUE_KEYS: readonly ValueBandKey[] = [...VALUE_BANDS.map((b) => b.key), "not-stated"];

export function bandOfAmount(amount: number | null | undefined): ValueBandKey {
  if (amount == null || !Number.isFinite(amount) || amount <= 0) return "not-stated";
  return VALUE_BANDS.find((b) => amount >= b.min && amount < b.max)?.key ?? "not-stated";
}

/**
 * The value a listing states, in its own currency: the contract value on an
 * award notice ("Awarded … to X — $1,234 CAD.") or on a closed tender that
 * carries its award. Open tenders state none in our data, and property-manager
 * budgets are not part of the shared board snapshot, so those are "not stated".
 */
export function statedValue(r: Pick<RfpListItem, "summary">): number | null {
  const award = parseAward(r.summary).amount;
  if (award) return award;
  const closed = parseClosedAward(r.summary)?.value;
  if (closed) {
    const n = Number(closed.replace(/[^\d]/g, ""));
    return n > 0 ? n : null;
  }
  return null;
}

export function valueBandOf(r: Pick<RfpListItem, "summary">): ValueBandKey {
  return bandOfAmount(statedValue(r));
}

/* ------------------------------------------------------------------ buyer types */

export const BUYER_TYPES = ["municipal", "regional", "school", "health", "housing", "provincial", "federal", "college", "private"] as const;
export type BuyerType = (typeof BUYER_TYPES)[number];

/** Whole-word match that also works next to accented letters (JS \b does not). `\p{L}*` in a word allows a longer ending. */
const words = (alternatives: string) => new RegExp(`(?<![\\p{L}\\p{N}])(?:${alternatives})(?![\\p{L}\\p{N}])`, "iu");

// Order matters: the first match wins. Health before college ("University Health
// Network" is a hospital), regional before municipal ("Regional Municipality of Peel").
const NAME_RULES: [BuyerType, RegExp][] = [
  ["health", words("hospitals?|h[oô]pital\\p{L}*|health|sant[ée]|ciusss|cisss|medical cent\\p{L}*|clinics?|cl[iî]nique\\p{L}*|cancer")],
  ["college", words("universit\\p{L}*|college\\p{L}*|coll[eè]ge\\p{L}*|c[ée]gep\\p{L}*|polytechni\\p{L}*|institute of technology")],
  ["school", words("school boards?|school districts?|school divisions?|district school|board of education|public schools|catholic district|schools?|[ée]coles?|dsb|cdsb|csc|conseil scolaire|commission scolaire|centre de services scolaire|isd|unified school")],
  ["housing", words("housing|habitation\\p{L}*|logement\\p{L}*|tchc")],
  ["regional", words("county|counties|regional municipality|regional district|region of|municipalit[ée] r[ée]gionale|mrc|district municipality|united counties|parish")],
  ["municipal", words("city of|town of|township|village|municipality|municipalit[ée]|ville de|ville|canton\\p{L}*|borough|district of|rural municipality|rm of|resort municipality|hamlet|city")],
  ["federal", words("government of canada|public services and procurement|pspc|national defence|dnd|parks canada|canada border|rcmp|royal canadian|federal|canadian forces|veterans affairs|u\\.?s\\.? (?:army|navy|air force|coast guard)|general services administration")],
  ["provincial", words("province of|government of (?:ontario|quebec|alberta|manitoba|saskatchewan|yukon|british columbia|nova scotia|new brunswick|newfoundland|prince edward|nunavut|northwest)|gouvernement du qu[ée]bec|minist[eè]re\\p{L}*|ministry|state of|commonwealth of|department of transportation|metrolinx|infrastructure ontario|ontario northland")],
];

/** What the buyer's name says it is, or null when it doesn't say. */
export function classifyBuyerName(name: string | null | undefined): BuyerType | null {
  const n = (name ?? "").trim();
  if (!n) return null;
  return NAME_RULES.find(([, re]) => re.test(n))?.[0] ?? null;
}

/** When a source is one kind of buyer, whatever the name ("SAM.gov" is the U.S. federal government). */
const SOURCE_TYPES: Record<string, BuyerType> = {
  sam: "federal",
  canadabuys: "federal",
  "canadabuys-closed": "federal",
  awards: "federal",
  toronto: "municipal",
  "toronto-awards": "municipal",
  nyc: "municipal",
  "la-city": "municipal",
  nanaimo: "municipal",
  saanich: "municipal",
  "portage-la-prairie": "municipal",
  "guelph-eramosa": "municipal",
  fvrd: "regional",
  "la-county": "regional",
  yukon: "provincial",
  "yukon-closed": "provincial",
  "ontario-northland": "provincial",
  delaware: "provincial",
  "florida-vbs": "provincial",
  "nc-evp": "provincial",
  "unc-system": "provincial",
  scbo: "provincial",
};

/**
 * The kind of buyer behind a listing. Imported public tenders: the buyer named in
 * the notice, else what the source itself is. Listings posted on PMRFP by property
 * managers, landlords and builders (not demo rows) are "private". A town's own post
 * has no buyer name in the shared snapshot, so it only counts when its name says.
 */
export function buyerTypeOf(r: Pick<RfpListItem, "slug" | "sourceType" | "summary" | "isDemo">): BuyerType | null {
  if (r.sourceType === "public_source") {
    const src = publicTenderSource(r.slug);
    const byName = classifyBuyerName(buyerFromSummary(r.summary));
    return byName ?? SOURCE_TYPES[src.key] ?? null;
  }
  if (r.sourceType === "public_buyer_direct") return classifyBuyerName(buyerFromSummary(r.summary));
  return r.isDemo ? null : "private";
}

/* ------------------------------------------------------------------ posted date */

/** When the buyer posted it (else when PMRFP first stored it), as YYYY-MM-DD; null when neither is known. */
export function postedDate(r: Pick<RfpListItem, "publishedAt" | "createdAt">): string | null {
  const raw = r.publishedAt ?? r.createdAt ?? null;
  const day = raw?.slice(0, 10) ?? "";
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null;
}

/* ------------------------------------------------------------------ URL parameters */

export type BoardCountryParam = "ca" | "us" | "all";
export type BoardSourceParam = "public" | "pm";
export type BoardViewParam = "awarded" | "gc";

export interface BoardParams {
  country?: BoardCountryParam;
  category?: string;
  region?: string;
  propertyType?: string;
  q?: string;
  view?: BoardViewParam;
  sort?: "newest";
  closing?: ClosingWindow;
  source?: BoardSourceParam;
  value?: ValueBandKey;
  buyer?: BuyerType;
  page?: number;
}

/** The order parameters are written in, so one view always has one URL. */
const ORDER = ["country", "view", "category", "region", "propertyType", "q", "closing", "source", "value", "buyer", "sort", "page"] as const;

type RawParams = Record<string, string | string[] | undefined>;

const first = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);
const slug = (v: string | undefined) => {
  const s = (v ?? "").trim().toLowerCase();
  return /^[a-z0-9][a-z0-9-]{0,63}$/.test(s) ? s : undefined;
};
const oneOf = <T extends string>(v: string | undefined, allowed: readonly T[]): T | undefined => allowed.find((a) => a === v);

/** Reads the query string into known, valid parameters; everything else is dropped. */
export function parseBoardParams(raw: RawParams): BoardParams {
  const q = (first(raw.q) ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
  const page = Math.floor(Number(first(raw.page)));
  const out: BoardParams = {
    country: oneOf(first(raw.country), ["ca", "us", "all"] as const),
    view: oneOf(first(raw.view), ["awarded", "gc"] as const),
    category: slug(first(raw.category)),
    region: slug(first(raw.region)),
    propertyType: slug(first(raw.propertyType)),
    q: q || undefined,
    closing: oneOf(first(raw.closing), CLOSING_WINDOWS),
    source: oneOf(first(raw.source), ["public", "pm"] as const),
    value: oneOf(first(raw.value), VALUE_KEYS),
    buyer: oneOf(first(raw.buyer), BUYER_TYPES),
    sort: first(raw.sort) === "newest" ? "newest" : undefined,
    page: Number.isFinite(page) && page > 1 ? page : undefined,
  };
  for (const k of Object.keys(out) as (keyof BoardParams)[]) if (out[k] === undefined) delete out[k];
  return out;
}

/** Query string (no leading "?") for these parameters, in canonical order. */
export function boardQuery(params: BoardParams): string {
  const q = new URLSearchParams();
  for (const k of ORDER) {
    const v = params[k];
    if (v !== undefined && v !== "") q.set(k, String(v));
  }
  return q.toString();
}

/** The params with some changed (null removes one); a change to any filter returns to page 1. */
export function withBoardPatch(params: BoardParams, patch: { [K in keyof BoardParams]?: BoardParams[K] | null }): BoardParams {
  const next: Record<string, unknown> = { ...params };
  for (const [k, v] of Object.entries(patch)) {
    if (v === null || v === undefined) delete next[k];
    else next[k] = v;
  }
  if (!("page" in patch)) delete next.page;
  return next as BoardParams;
}

/**
 * Is this a filtered view? The unfiltered board and its country switch
 * (?country=) are the indexable pages; any filter, the awarded and GC tabs, a
 * non-default sort and page 2 onward are the same listings re-cut, so they are
 * noindex,follow and canonical to /rfps (links still pass).
 */
export function isFilteredBoard(params: BoardParams): boolean {
  const { country: _country, ...rest } = params;
  void _country;
  return Object.keys(rest).length > 0;
}

/** Next.js robots metadata for a board URL: undefined (indexable) for the base board. */
export function boardRobots(params: BoardParams): { index: false; follow: true } | undefined {
  return isFilteredBoard(params) ? { index: false, follow: true } : undefined;
}
