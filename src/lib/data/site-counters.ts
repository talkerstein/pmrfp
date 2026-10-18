import type { RfpListItem } from "@/lib/data/types";
import { daysUntil, isPastContract, parseAward } from "@/lib/data/fomo";
import { awardTotals, winnerKey, winnersFromRfps } from "@/lib/data/winners";
import { hubWins } from "@/lib/gc/hub";
import { inCountry, type CountryCode } from "@/lib/visitor-geo";

/**
 * Every public headline counter on the site, in one place.
 *
 * Why (2026-10-18): /pricing said "240 RFPs posted, last 30 days" and "331
 * contractors who won public work, last 90 days", the homepage "305 open" and
 * /rfps "$374M awarded, 310 contracts on record". Each was counted in a
 * different file with a slightly different rule (one from database HEAD
 * counts, "open" with and without award notices, "on record" meaning only
 * repeat winners), so they read as if they disagreed.
 *
 * Rules:
 *  - Pure functions over the board's list items. Pages pass the rows they
 *    already have from the shared, cached board snapshot (listRfps() /
 *    listAllRfpsCached(), see board-snapshot.ts): no query of their own.
 *  - Country is always required. Canada and the U.S. are never added together;
 *    a row's country is countryOf(row) (a U.S. state = U.S., anything else = Canada).
 *  - Each function's doc says exactly what it counts. The label next to the
 *    number on a page must say the same thing.
 */

type Row = RfpListItem;

const DAY_MS = 86_400_000;

/** A listing someone can still bid on: status "open" (deadline today or later, or none) and not an award notice. */
export function isOpenListing(r: Pick<Row, "status" | "slug" | "sourceType">): boolean {
  return r.status === "open" && !isPastContract(r);
}

/**
 * Open listings in one country right now: public tenders and property-manager
 * RFPs whose deadline is today or later (or has none). Award notices never count.
 * Label: "open right now".
 */
export function countOpenListings(rows: readonly Row[], country: CountryCode): number {
  return inCountry(rows, country).filter(isOpenListing).length;
}

/**
 * Open listings in one country that close within `days` days (0 = today), Toronto time.
 * Label: "closing in 7 days".
 */
export function countClosingWithinDays(rows: readonly Row[], country: CountryCode, days = 7, now = new Date()): number {
  return inCountry(rows, country).filter((r) => {
    if (!isOpenListing(r)) return false;
    const d = daysUntil(r.deadline, now);
    return d !== null && d >= 0 && d <= days;
  }).length;
}

/**
 * Tenders and RFPs in one country first posted in the last `days` days, by the
 * buyer's own posting date (published_at, so a backlog import can't inflate it).
 * Open or since closed; award notices and demo listings don't count.
 * Label: "tenders and RFPs posted, last 30 days".
 */
export function countPostedLastNDays(rows: readonly Row[], country: CountryCode, days: number, now = new Date()): number {
  const since = now.getTime() - days * DAY_MS;
  return inCountry(rows, country).filter((r) => {
    if (r.isDemo || isPastContract(r) || !r.publishedAt) return false;
    const t = Date.parse(r.publishedAt);
    return Number.isFinite(t) && t >= since && t <= now.getTime();
  }).length;
}

/**
 * Distinct companies (merged by winnerKey) named as the winner on an award
 * notice in one country dated in the last `days` days up to `today`
 * (YYYY-MM-DD, Toronto). Individuals and public bodies are left out (hubWins).
 * Label: "companies that won public contracts, last 90 days".
 */
export function countWinnersLastNDays(rows: readonly Row[], country: CountryCode, days: number, today: string): number {
  const wins = hubWins(inCountry(rows, country).filter((r) => !r.isDemo), [], { today, days });
  return new Set(wins.map((w) => winnerKey(w.winner))).size;
}

/**
 * Every published award notice in one country, all time: how many, and the
 * sum of the disclosed contract values (notices with "value not disclosed" add 0).
 * Label: "awarded across {n} award notices on record".
 */
export function awardsOnRecord(rows: readonly Row[], country: CountryCode): { contracts: number; value: number } {
  let contracts = 0;
  let value = 0;
  for (const r of inCountry(rows, country)) {
    if (!isPastContract(r)) continue;
    contracts++;
    value += parseAward(r.summary).amount ?? 0;
  }
  return { contracts, value };
}

/**
 * Repeat winners only (companies with 2+ published awards, the ones listed on
 * /contract-winners) in one country: how many companies, how many contracts
 * they won and the disclosed value. A subset of awardsOnRecord.
 * Label: "repeat winners" / "contracts won by repeat winners".
 */
export function repeatWinnerTotals(rows: readonly Row[], country: CountryCode): { companies: number; contracts: number; value: number } {
  return awardTotals(winnersFromRfps(inCountry(rows, country)));
}

export interface BoardStats {
  /** countOpenListings */
  open: number;
  /** countClosingWithinDays(…, 7) */
  closingThisWeek: number;
  /** awardsOnRecord().contracts */
  pastContracts: number;
  /** awardsOnRecord().value */
  awardedValue: number;
}

/**
 * The four board numbers for rows that are ALREADY one country's (callers
 * filter with inCountry first). Same rules as the functions above.
 */
export function boardStats(rows: readonly Row[], now = new Date()): BoardStats {
  let open = 0, closingThisWeek = 0, pastContracts = 0, awardedValue = 0;
  for (const r of rows) {
    if (isPastContract(r)) {
      pastContracts++;
      awardedValue += parseAward(r.summary).amount ?? 0;
    } else if (r.status === "open") {
      open++;
      const d = daysUntil(r.deadline, now);
      if (d !== null && d >= 0 && d <= 7) closingThisWeek++;
    }
  }
  return { open, closingThisWeek, pastContracts, awardedValue };
}

/** boardStats for Canada and for the U.S. separately. Never add them together on a page; show the visitor's. */
export function boardStatsByCountry(rows: readonly Row[], now = new Date()): Record<CountryCode, BoardStats> {
  return { CA: boardStats(inCountry(rows, "CA"), now), US: boardStats(inCountry(rows, "US"), now) };
}
