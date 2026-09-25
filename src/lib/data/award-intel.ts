import { unstable_cache } from "next/cache";
import { listRfps } from "@/lib/data/rfps";
import { isPastContract, parseAward } from "@/lib/data/fomo";
import { isPublishableWinner, winnerKey, winnersFromRfps } from "@/lib/data/winners";
import { rfpMarket } from "@/lib/visitor-geo";
import type { RfpListItem } from "@/lib/data/types";

/**
 * "What this job is worth" and "who wins this work" for an open tender, from
 * the past public contracts already on the board (award notices). A Trade Pro
 * feature: callers show the numbers to members only.
 */

export interface AwardRow {
  categories: string[];
  regionName: string | null;
  province: string | null;
  market: "CA" | "US";
  amount: number | null;
  winner: string | null;
  /** /contract-winners/<slug> when the winner has 2+ awards on record. */
  winnerSlug: string | null;
}

export interface AwardIntel {
  /** Where the comparison came from: "Ontario", "Canada" … */
  scope: string;
  trade: string;
  /** Awards with a disclosed value in that scope. */
  count: number;
  low: number;
  high: number;
  median: number;
  winners: { name: string; wins: number; slug: string | null }[];
}

/** Past contracts, compacted and cached hourly (the tender page itself is dynamic). */
export const getAwardIndex = unstable_cache(
  async (): Promise<AwardRow[]> => buildAwardIndex(await listRfps()),
  ["award-index"],
  { revalidate: 3600 },
);

export function buildAwardIndex(rfps: RfpListItem[]): AwardRow[] {
  const pages = new Map(winnersFromRfps(rfps).map((w) => [winnerKey(w.name), w.slug]));
  return rfps.filter(isPastContract).map((r) => {
    const { winner, amount } = parseAward(r.summary);
    const publishable = winner && isPublishableWinner(winner) ? winner : null;
    return {
      categories: r.categories,
      regionName: r.regionName,
      province: r.province,
      market: rfpMarket(r),
      amount: amount && amount >= 1000 ? amount : null,
      winner: publishable,
      winnerSlug: publishable ? pages.get(winnerKey(publishable)) ?? null : null,
    };
  });
}

function quantile(sorted: number[], q: number): number {
  const i = (sorted.length - 1) * q;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return Math.round(sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo));
}

/** Minimum awards with a value before we quote a range. */
export const MIN_AWARDS = 3;

/**
 * Narrowest scope with enough awards in the tender's main trade: its region,
 * then its province, then its country. Range is the middle half (25th–75th
 * percentile) once there are 6+ awards, otherwise lowest to highest.
 */
export function intelFor(
  rfp: Pick<RfpListItem, "categories" | "regionName" | "province">,
  index: AwardRow[],
): AwardIntel | null {
  const trade = rfp.categories[0];
  if (!trade) return null;
  const market = rfpMarket(rfp);
  const sameTrade = index.filter((a) => a.market === market && a.categories.includes(trade));
  const scopes: [string, AwardRow[]][] = [];
  if (rfp.regionName) scopes.push([rfp.regionName, sameTrade.filter((a) => a.regionName === rfp.regionName)]);
  if (rfp.province) scopes.push([rfp.province, sameTrade.filter((a) => a.province === rfp.province)]);
  scopes.push([market === "US" ? "the U.S." : "Canada", sameTrade]);

  for (const [scope, rows] of scopes) {
    const amounts = rows.map((r) => r.amount).filter((n): n is number => n !== null).sort((a, b) => a - b);
    if (amounts.length < MIN_AWARDS) continue;
    const wide = amounts.length >= 6;
    const wins = new Map<string, { name: string; wins: number; slug: string | null }>();
    for (const r of rows) {
      if (!r.winner) continue;
      const key = winnerKey(r.winner);
      const w = wins.get(key) ?? { name: r.winner, wins: 0, slug: r.winnerSlug };
      w.wins++;
      wins.set(key, w);
    }
    return {
      scope,
      trade,
      count: amounts.length,
      low: wide ? quantile(amounts, 0.25) : amounts[0],
      high: wide ? quantile(amounts, 0.75) : amounts[amounts.length - 1],
      median: quantile(amounts, 0.5),
      winners: [...wins.values()].sort((a, b) => b.wins - a.wins || a.name.localeCompare(b.name)).slice(0, 3),
    };
  }
  return null;
}
