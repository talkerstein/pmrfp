/**
 * What an import (or a dry run) adds to Award Intelligence: rows, the share
 * with an end date (by provenance), the renewal radar 12 / 24 months out by
 * trade, and how many awards carry a bid list. Canada and the U.S. are
 * always reported separately. Pure.
 */
import { historyAward, type HistoryAwardRow } from "@/lib/intel/history";
import { renewalCounts, renewalRadar, type IntelAward } from "@/lib/intel/model";
import type { CountryCode } from "@/lib/visitor-geo";
import type { AwardHistoryInput, BidResultInput } from "./model";

export interface CountryCoverage {
  rows: number;
  withValue: number;
  endDates: { stated: number; derived_from_title: number; estimated: number; none: number };
  /** Share of rows with a stated or derived end date, percent (one decimal). */
  endShare: number;
  withBidCount: number;
  withBidList: number;
  bidRows: number;
  radar12: { total: number; byTrade: Record<string, number> };
  radar24: { total: number; byTrade: Record<string, number> };
  from: string | null;
  to: string | null;
}

/** The rows as Intel will see them (synthetic ids: a dry run has none). */
export function asIntelAwards(rows: readonly AwardHistoryInput[], bids: readonly BidResultInput[] = []): IntelAward[] {
  const withBids = new Set(bids.map((b) => `${b.award_source}|${b.award_source_key}`));
  const out: IntelAward[] = [];
  rows.forEach((r, i) => {
    const h: HistoryAwardRow = {
      id: `dry-${i}`,
      source: r.source,
      board_ref: r.board_ref,
      title: r.title,
      buyer: r.buyer,
      winner_business_name: r.winner_business_name,
      winner_is_individual: r.winner_is_individual,
      value: r.value,
      currency: r.currency,
      country: r.country,
      province: r.province,
      city: r.city,
      award_date: r.award_date,
      end_date: r.end_date,
      end_date_source: r.end_date_source,
      potential_end_date: r.potential_end_date,
      number_of_bids: r.number_of_bids,
      trade_slugs: r.trade_slugs,
      notice_url: r.notice_url,
      attribution: r.attribution,
      has_bids: withBids.has(`${r.source}|${r.source_key}`),
    };
    const a = historyAward(h);
    if (a) out.push(a);
  });
  return out;
}

function radar(awards: IntelAward[], country: CountryCode, today: string, horizon: 12 | 24) {
  const items = renewalRadar(awards, { country, today, horizon });
  return { total: items.length, byTrade: Object.fromEntries(renewalCounts(items).map((c) => [c.tradeSlug, c.items])) };
}

export function coverageOf(rows: readonly AwardHistoryInput[], bids: readonly BidResultInput[], today: string): Partial<Record<CountryCode, CountryCoverage>> {
  const out: Partial<Record<CountryCode, CountryCoverage>> = {};
  const bidAwards = new Map<string, number>();
  for (const b of bids) bidAwards.set(`${b.award_source}|${b.award_source_key}`, (bidAwards.get(`${b.award_source}|${b.award_source_key}`) ?? 0) + 1);
  for (const country of ["CA", "US"] as const) {
    const mine = rows.filter((r) => r.country === country);
    if (!mine.length) continue;
    const endDates = { stated: 0, derived_from_title: 0, estimated: 0, none: 0 };
    for (const r of mine) endDates[r.end_date_source ?? "none"]++;
    const keys = new Set(mine.map((r) => `${r.source}|${r.source_key}`));
    const awards = asIntelAwards(mine, bids);
    const dates = mine.map((r) => r.award_date).sort();
    out[country] = {
      rows: mine.length,
      withValue: mine.filter((r) => r.value !== null).length,
      endDates,
      endShare: Math.round(((endDates.stated + endDates.derived_from_title) / mine.length) * 1000) / 10,
      withBidCount: mine.filter((r) => r.number_of_bids !== null).length,
      withBidList: [...bidAwards.keys()].filter((k) => keys.has(k)).length,
      bidRows: [...bidAwards.entries()].filter(([k]) => keys.has(k)).reduce((s, [, n]) => s + n, 0),
      radar12: radar(awards, country, today, 12),
      radar24: radar(awards, country, today, 24),
      from: dates[0] ?? null,
      to: dates[dates.length - 1] ?? null,
    };
  }
  return out;
}
