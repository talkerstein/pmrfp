/**
 * "What similar work sold for" on a tender page (depth plan, Step 2, block 3).
 *
 * Built on the same compact award rows as the Award Intelligence card
 * (lib/data/award-intel), so it adds no query: past public contracts in the
 * listing's trade from the last 24 months (the window the price benchmarks
 * use, so the two never disagree about what "recent" means), narrowest place
 * first (its region, its province/state, then the whole country; Canada and
 * the U.S. are never mixed and each has one currency).
 *
 * Gating (the rule is in the data, not in CSS):
 *  - EVERYONE gets the median, once at least MIN_AWARDS awards in that place
 *    have a disclosed value, and how many awards it rests on. Below that the
 *    page shows only the count.
 *  - Trade Pro also gets the middle-half price band (25th to 75th
 *    percentile; lowest to highest under 6 awards) and the most frequent
 *    winners. The free object has no band and no winners: they are not in
 *    the page for anyone else.
 */
import { MIN_AWARDS, type AwardRow } from "@/lib/data/award-intel";
import { WINDOW_MONTHS, currencyOf, percentile, windowStart } from "@/lib/data/price-benchmarks";
import { winnerKey } from "@/lib/data/winners";
import { rfpMarket } from "@/lib/visitor-geo";
import type { RfpListItem } from "@/lib/data/types";

/** Awards with a value needed before the middle-half band replaces lowest-to-highest. */
export const BAND_MIN_AWARDS = 6;

export interface SimilarWork {
  /** "Ontario", "Toronto", "Canada", "the U.S." */
  scope: string;
  trade: string;
  currency: "CAD" | "USD";
  /** Awards on record in this scope, with or without a disclosed value. */
  awards: number;
  /** Awards with a disclosed value (the ones a number can rest on). */
  valued: number;
  /** Null under MIN_AWARDS valued awards. */
  median: number | null;
  low: number | null;
  high: number | null;
  /** The band is the middle half (25th to 75th percentile), not lowest to highest. */
  middleHalf: boolean;
  winners: { name: string; wins: number; slug: string | null }[];
  /** Licence credits for open-data rows behind the numbers (present only when there are some). */
  credits?: string[];
}

/** What a viewer without Trade Pro gets: the median and how many awards it rests on. Nothing else. */
export interface SimilarWorkFree {
  scope: string;
  trade: string;
  currency: "CAD" | "USD";
  awards: number;
  valued: number;
  median: number | null;
  credits?: string[];
}

export type SimilarWorkView = { pro: true; data: SimilarWork } | { pro: false; data: SimilarWorkFree };

/**
 * The narrowest scope with at least MIN_AWARDS valued awards in the
 * listing's main trade. When no scope has that many, the count for the
 * narrowest scope that has any award at all (so the page can say "2 past
 * awards on record, 1 with a price"). Null when the trade has no award on
 * record in this country, or the listing has no trade.
 */
export function similarWorkFor(
  rfp: Pick<RfpListItem, "categories" | "regionName" | "province">,
  index: readonly AwardRow[],
  /** Today, YYYY-MM-DD: only awards of the last WINDOW_MONTHS count, like the price benchmarks. */
  today: string,
): SimilarWork | null {
  const trade = rfp.categories[0];
  if (!trade) return null;
  const market = rfpMarket(rfp);
  const from = windowStart(today, WINDOW_MONTHS);
  // An award with no date can't be placed in the window, so it isn't used for a price.
  const sameTrade = index.filter((a) => a.market === market && a.categories.includes(trade) && Boolean(a.date) && (a.date as string) >= from);
  const scopes: [string, AwardRow[]][] = [];
  if (rfp.regionName) scopes.push([rfp.regionName, sameTrade.filter((a) => a.regionName === rfp.regionName)]);
  if (rfp.province && rfp.province !== rfp.regionName) scopes.push([rfp.province, sameTrade.filter((a) => a.province === rfp.province)]);
  scopes.push([market === "US" ? "the U.S." : "Canada", sameTrade]);
  const currency = currencyOf(market);

  const valuedOf = (rows: AwardRow[]) => rows.map((r) => r.amount).filter((n): n is number => n !== null).sort((a, b) => a - b);

  for (const [scope, rows] of scopes) {
    const amounts = valuedOf(rows);
    if (amounts.length < MIN_AWARDS) continue;
    const wide = amounts.length >= BAND_MIN_AWARDS;
    const wins = new Map<string, { name: string; wins: number; slug: string | null }>();
    for (const r of rows) {
      if (!r.winner) continue;
      const key = winnerKey(r.winner);
      const w = wins.get(key) ?? { name: r.winner, wins: 0, slug: r.winnerSlug };
      w.wins++;
      wins.set(key, w);
    }
    const credits = [...new Set(rows.map((r) => r.credit).filter((c): c is string => Boolean(c)))];
    return {
      ...(credits.length ? { credits } : {}),
      scope,
      trade,
      currency,
      awards: rows.length,
      valued: amounts.length,
      median: Math.round(percentile(amounts, 0.5)),
      low: Math.round(wide ? percentile(amounts, 0.25) : amounts[0]),
      high: Math.round(wide ? percentile(amounts, 0.75) : amounts[amounts.length - 1]),
      middleHalf: wide,
      winners: [...wins.values()].sort((a, b) => b.wins - a.wins || a.name.localeCompare(b.name)).slice(0, 3),
    };
  }
  // Not enough priced awards anywhere: the count only, for the narrowest place that has any award.
  const first = scopes.find(([, rows]) => rows.length > 0);
  if (!first) return null;
  return {
    scope: first[0],
    trade,
    currency,
    awards: first[1].length,
    valued: valuedOf(first[1]).length,
    median: null,
    low: null,
    high: null,
    middleHalf: false,
    winners: [],
  };
}

/** The viewer's version. The free one is a new object, so a band or a name can't leak into the page. */
export function similarWorkView(sw: SimilarWork, pro: boolean): SimilarWorkView {
  if (pro) return { pro: true, data: sw };
  const { scope, trade, currency, awards, valued, median, credits } = sw;
  return { pro: false, data: { scope, trade, currency, awards, valued, median, ...(credits ? { credits } : {}) } };
}
