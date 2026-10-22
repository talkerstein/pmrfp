/**
 * "Looks like a re-tender" (depth plan, Step 2, block 4).
 *
 * A past award from the SAME buyer, in the SAME trade and place, whose title
 * says the SAME work. Conservative on purpose: a wrong "this is the renewal
 * of X" is worse than saying nothing, and the wording is always "looks
 * similar to", never fact.
 *
 * What counts as the same work: after dropping years, reference numbers,
 * the buyer's own name, the trade's own words ("roofing" also drops "roof"),
 * what is done to a thing ("replacement", "repair") and filler ("services",
 * "supply of"), the two titles must still share at least two distinctive
 * words (a site, a building, a street, a station) and overlap by at least
 * RETENDER_MIN_SCORE. When either title carries site or unit numbers they
 * must be the same ones: Station 3 is not Station 5. So "Snow removal
 * services" never matches another "Snow removal services" (nothing there
 * says WHICH snow removal), while "Fire Station 3 roof replacement" matches
 * "Roof replacement, Fire Station 3".
 */
import { buyerKeyOf } from "@/lib/intel/model";
import { coreKey } from "@/lib/buyers/model";
import type { BenchmarkAward } from "@/lib/data/price-benchmarks";

export const RETENDER_MIN_SCORE = 0.6;
export const RETENDER_MIN_SHARED = 2;
/** Older awards are a different contract cycle. */
export const RETENDER_MAX_YEARS = 8;

const FILLER = new Set(
  (
    "a an and or the of for to in on at by with from as per into" +
    " de du des la le les et pour au aux en sur par avec dans un une" +
    " el los las y para del" +
    " service services servicio servicios supply supplies provision provide providing fourniture fournitures suministro" +
    " contract contrat tender tenders rft rfp rfq rfi request requests proposal proposals quotation quotations quote quotes bid bids call" +
    " appel offres offre soumission soumissions demande licitacion" +
    " annual annuel multi year years option options renewal renouvellement various misc miscellaneous general" +
    " work works travaux obra obras project projet proyecto program programme" +
    " no nos number num nb" +
    // What is done to a thing says nothing about WHICH thing.
    " replacement replacements repair repairs maintenance installation upgrade upgrades renovation renovations rehabilitation" +
    " reconstruction construction restoration improvement improvements removal new remplacement reparation entretien" +
    " amelioration remise reemplazo mantenimiento" +
    " location locations facilities facility installations building buildings" +
    " municipal city town township county region district village ville municipalite" +
    " ontario quebec alberta british columbia manitoba saskatchewan nova scotia canada"
  ).split(" "),
);

function fold(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "");
}

const isNumber = (w: string) => /^\d{1,3}$/.test(w);

/**
 * The words of a title that identify the work: no years or reference
 * numbers, no filler, no words of the buyer's name, and none of the trade's
 * ("roofing" also drops "roof"), so "Roof replacement" has no identifying
 * word at all.
 */
export function distinctiveWords(title: string, buyer: string | null, trades: readonly string[]): Set<string> {
  const skip = new Set<string>();
  for (const s of [buyer ?? "", ...trades]) for (const w of fold(s).split(/[^a-z0-9]+/)) if (w) skip.add(w);
  // "roofing" → "roof…": a title word starting like a trade word is the trade.
  const prefixes = new Set<string>();
  for (const s of trades) for (const w of fold(s).split(/[^a-z0-9]+/)) if (w.length >= 4) prefixes.add(w.slice(0, 4));
  const text = fold(title)
    .replace(/\([^)]*\)/g, " ")
    // "2026-045", "2025/2026", "2026": years and year-number references.
    .replace(/\b(19|20)\d{2}\s*[-/–]\s*\d{1,4}\b/g, " ")
    .replace(/\b(19|20)\d{2}\b/g, " ")
    .replace(/\b[a-z]{0,6}[-#]?\d{4,}[a-z0-9-]*\b/g, " ");
  const out = new Set<string>();
  for (const w of text.split(/[^a-z0-9]+/)) {
    if (!w || FILLER.has(w) || skip.has(w)) continue;
    // Singular/plural: "stations" and "station" are one word.
    const base = w.length > 4 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w;
    if (base.length < 2 && !/^\d$/.test(base)) continue;
    if (skip.has(base) || FILLER.has(base)) continue;
    if (base.length >= 4 && prefixes.has(base.slice(0, 4))) continue;
    out.add(base);
  }
  return out;
}

export interface TitleMatch {
  shared: number;
  score: number;
}

/** Overlap of two titles' distinctive words (Jaccard), and how many words they share. */
export function titleMatch(a: string, b: string, buyer: string | null, trades: readonly string[]): TitleMatch {
  const wa = distinctiveWords(a, buyer, trades);
  const wb = distinctiveWords(b, buyer, trades);
  // Station 3 is not Station 5, and Phase 1 is not Phase 2: when the titles carry numbers they must agree.
  const na = [...wa].filter(isNumber).sort().join(",");
  const nb = [...wb].filter(isNumber).sort().join(",");
  if (na !== nb) return { shared: 0, score: 0 };
  let shared = 0;
  for (const w of wa) if (wb.has(w)) shared++;
  const union = wa.size + wb.size - shared;
  return { shared, score: union === 0 ? 0 : shared / union };
}

export interface RetenderListing {
  slug: string;
  title: string;
  categories: readonly string[];
  /** Province/state, full English name, or null. */
  province: string | null;
  /** Closing date, YYYY-MM-DD, or null. */
  deadline: string | null;
  /** The listing's buyer as named on the page, or null (no buyer, no re-tender). */
  buyer: string | null;
  country: "CA" | "US";
}

export interface RetenderMatch {
  slug: string;
  title: string;
  date: string;
  winner: string | null;
  winnerSlug: string | null;
  amount: number | null;
  currency: "CAD" | "USD";
  score: number;
  /** Whole months from that award to this tender's closing date (or today). */
  monthsBefore: number;
}

export interface RetenderResult {
  /** The best match: the most similar, newest on a tie. */
  best: RetenderMatch;
  /** How many earlier awards look like this work (best included). */
  count: number;
  /** Typical months between those awards when there are two or more; else null. */
  cycleMonths: number | null;
}

function monthsBetween(from: string, to: string): number {
  const [fy, fm, fd] = from.slice(0, 10).split("-").map(Number);
  const [ty, tm, td] = to.slice(0, 10).split("-").map(Number);
  const raw = (ty - fy) * 12 + (tm - fm);
  return Math.max(0, td < fd ? raw - 1 : raw);
}

/** Same buyer? Compared on the name without "City of" / "Town of" / divisions in brackets. */
export function sameBuyer(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const ka = buyerKeyOf(a);
  const kb = buyerKeyOf(b);
  if (!ka || !kb) return false;
  if (ka === kb) return true;
  const ca = coreKey(a);
  const cb = coreKey(b);
  // Very short keys are too loose to equate two names.
  return ca.length >= 4 && ca === cb;
}

/**
 * The earlier award this tender looks like a re-tender of, or null. Needs a
 * named buyer, a shared trade, the same province/state and country, and a
 * strong title match (see the file header). Awards dated after the closing
 * date, older than RETENDER_MAX_YEARS, or the listing itself never count.
 */
export function findRetender(listing: RetenderListing, awards: readonly BenchmarkAward[], today: string): RetenderResult | null {
  if (!listing.buyer || !listing.categories.length) return null;
  const upTo = (listing.deadline ?? today).slice(0, 10);
  const oldest = `${Number(today.slice(0, 4)) - RETENDER_MAX_YEARS}${today.slice(4, 10)}`;
  const matches: RetenderMatch[] = [];
  for (const a of awards) {
    if (a.slug === listing.slug) continue;
    if (a.country !== listing.country) continue;
    if (listing.province && a.province !== listing.province) continue;
    if (a.date > upTo || a.date < oldest) continue;
    if (!a.trades.some((t) => listing.categories.includes(t))) continue;
    if (!sameBuyer(listing.buyer, a.buyer)) continue;
    const m = titleMatch(listing.title, a.title, listing.buyer, listing.categories);
    if (m.shared < RETENDER_MIN_SHARED || m.score < RETENDER_MIN_SCORE) continue;
    matches.push({
      slug: a.slug,
      title: a.title,
      date: a.date,
      winner: a.winner,
      winnerSlug: a.winnerSlug,
      amount: a.amount,
      currency: a.currency,
      score: m.score,
      monthsBefore: monthsBetween(a.date, upTo),
    });
  }
  if (!matches.length) return null;
  matches.sort((x, y) => y.score - x.score || y.date.localeCompare(x.date));
  const best = matches[0];
  const dates = [...new Set(matches.map((m) => m.date))].sort();
  const gaps: number[] = [];
  for (let i = 1; i < dates.length; i++) gaps.push(monthsBetween(dates[i - 1], dates[i]));
  gaps.sort((a, b) => a - b);
  const cycleMonths = gaps.length ? gaps[Math.floor((gaps.length - 1) / 2)] : null;
  return { best, count: matches.length, cycleMonths: cycleMonths && cycleMonths >= 3 ? cycleMonths : null };
}

/** The free viewer's version: that a similar earlier contract exists, nothing about who or how much. */
export interface RetenderFree {
  count: number;
}

export type RetenderView = { pro: true; data: RetenderResult } | { pro: false; data: RetenderFree };

export function retenderView(r: RetenderResult, pro: boolean): RetenderView {
  return pro ? { pro: true, data: r } : { pro: false, data: { count: r.count } };
}
