/**
 * "Who else bid": the ranked bid list for one award, as an Intel subscriber
 * sees it. Pure. Rules (legal notes, briefs/research/project-data-sources):
 *  - Always "unofficial / as published" with the as-of date and the source.
 *  - Gap to the winner (or the apparent low bid) in % and in dollars; never
 *    a reason anyone lost. Status labels are neutral.
 *  - Business names only; an individual is "Individual bidder (not named)".
 *  - One currency per list (the award's).
 */
import type { BidStatus, HistoryCurrency } from "@/lib/contract-history/model";

export interface BidResultRow {
  bidder_business_name: string | null;
  bidder_is_individual: boolean;
  bid_amount: number | null;
  currency: HistoryCurrency;
  rank: number | null;
  status_label: BidStatus;
  as_of: string;
  source: string;
}

export interface BidLine {
  rank: number | null;
  name: string | null;
  individual: boolean;
  amount: number | null;
  status: BidStatus;
  /** Above the reference bid, in percent (one decimal); 0 for the reference itself; null without amounts. */
  gapPct: number | null;
  gapAmount: number | null;
  reference: boolean;
}

export interface WhoElseBid {
  currency: HistoryCurrency;
  asOf: string;
  source: string;
  /** "awarded" when the source names the winner, else "apparent_low" (bid totals as read). */
  basis: "awarded" | "apparent_low";
  lines: BidLine[];
  bidders: number;
  /** Spread between the lowest and highest priced bids, percent of the lowest. */
  spreadPct: number | null;
}

const round1 = (x: number) => Math.round(x * 10) / 10;

/** The panel for one award's bid rows, or null with fewer than two bids. */
export function whoElseBid(rows: readonly BidResultRow[]): WhoElseBid | null {
  if (rows.length < 2) return null;
  const currency = rows[0].currency;
  const same = rows.filter((r) => r.currency === currency);
  const awarded = same.find((r) => r.status_label === "awarded");
  const priced = same.filter((r) => r.bid_amount !== null).sort((a, b) => a.bid_amount! - b.bid_amount!);
  const ref = awarded?.bid_amount != null ? awarded : priced[0] ?? null;
  const refAmount = ref?.bid_amount ?? null;
  const lines: BidLine[] = [...same]
    .sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity) || (a.bid_amount ?? Infinity) - (b.bid_amount ?? Infinity))
    .map((r) => {
      const gap = refAmount !== null && refAmount > 0 && r.bid_amount !== null ? r.bid_amount - refAmount : null;
      return {
        rank: r.rank,
        name: r.bidder_is_individual ? null : r.bidder_business_name,
        individual: r.bidder_is_individual || !r.bidder_business_name,
        amount: r.bid_amount,
        status: r.status_label,
        gapPct: gap !== null && refAmount ? round1((gap / refAmount) * 100) : null,
        gapAmount: gap !== null ? Math.round(gap * 100) / 100 : null,
        reference: r === ref,
      };
    });
  const lo = priced[0]?.bid_amount ?? null;
  const hi = priced[priced.length - 1]?.bid_amount ?? null;
  return {
    currency,
    asOf: same.map((r) => r.as_of).sort().pop() ?? rows[0].as_of,
    source: rows[0].source,
    basis: awarded ? "awarded" : "apparent_low",
    lines,
    bidders: same.length,
    spreadPct: lo && hi && priced.length >= 2 ? round1(((hi - lo) / lo) * 100) : null,
  };
}

/** The board listing's suffix ("…-qca-1234" → "qca-1234") that award_history.board_ref stores. */
export function boardRefOf(slug: string): string | null {
  const i = Math.max(slug.lastIndexOf("-qca-"), slug.lastIndexOf("-cba-"));
  if (i < 0) return null;
  const ref = slug.slice(i + 1);
  return /^(qca|cba)-[a-z0-9-]+$/.test(ref) ? ref : null;
}
