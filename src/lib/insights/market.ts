/**
 * The public monthly market page (/insights/[trade]/[province]): one trade ×
 * one province/state (so one country, one currency), the latest complete
 * calendar month. Pure, over the same snapshots as the detectors.
 *
 * Counts follow the detectors' trust rules: tender counts only use feeds
 * PMRFP was already reading before the earlier month opened, and "same
 * month last year" says "not enough history" until a feed reaches back
 * that far. Pages are indexable only with MIN_INDEX_RECORDS records behind
 * them; thinner ones render (shareable) but stay out of the index.
 */
import { isPastContract } from "@/lib/data/fomo";
import { canonicalProvince, provinceCountry, windowStart } from "@/lib/data/price-benchmarks";
import { addMonths } from "@/lib/intel/model";
import { rfpMarket, type CountryCode } from "@/lib/visitor-geo";
import { personaOf } from "@/lib/lifecycle/persona";
import { FEED_WARMUP_DAYS, dayAdd, feedStarts, sourceKeyOf, type InsightData } from "./detectors";
import { insightsFor } from "./engine";
import type { InsightFact, InsightGap, TradeRef } from "./types";

/** Awards (24 months) + listings (12 months) before a market page is indexable. */
export const MIN_INDEX_RECORDS = 15;

export interface MonthCount {
  /** Listings from feeds PMRFP was reading before the earlier month began; null = no feed qualifies yet. */
  month: number | null;
  prev: number | null;
  /** Same month a year earlier; null = not enough history. */
  lastYear: number | null;
  /** Feeds with listings in these months that are left out (read too recently). */
  excludedSources: number;
}

export interface MarketMonth {
  trade: TradeRef;
  province: string;
  country: CountryCode;
  currency: "CAD" | "USD";
  /** YYYY-MM of the month shown, and its first / last day. */
  month: string;
  monthFrom: string;
  monthTo: string;
  tenders: MonthCount;
  awards: { month: number; prev: number; valued: number };
  /** Records behind the page: awards in 24 months + listings in 12 months. */
  records: number;
  indexable: boolean;
  facts: InsightFact[];
  gaps: InsightGap[];
}

/** The latest complete calendar month before `today`: "2026-09" on 2026-10-16. */
export function lastCompleteMonth(today: string): string {
  return addMonths(`${today.slice(0, 7)}-01`, -1).slice(0, 7);
}

const monthEnd = (month: string) => dayAdd(`${addMonths(`${month}-01`, 1).slice(0, 7)}-01`, -1);

function listingsIn(data: InsightData, trade: TradeRef, province: string) {
  const country = provinceCountry(province);
  return data.rfps.filter(
    (r) => !r.isDemo && !isPastContract(r) && rfpMarket(r) === country && (canonicalProvince(r.province) ?? canonicalProvince(r.regionName)) === province && r.categories.includes(trade.name),
  );
}

function countPosted(rows: ReturnType<typeof listingsIn>, starts: ReadonlyMap<string, string>, from: string, to: string, readBy: string, excluded?: Set<string>): number {
  let n = 0;
  for (const r of rows) {
    const d = r.publishedAt?.slice(0, 10);
    if (!d || d < from || d > to) continue;
    const k = sourceKeyOf(r);
    const s = starts.get(k);
    if (s && s <= readBy) n++;
    else excluded?.add(k);
  }
  return n;
}

/** Cheap record count for the index and the sitemap (no detectors). */
export function marketRecords(data: InsightData, trade: TradeRef, province: string): number {
  const country = provinceCountry(province);
  const from24 = windowStart(data.today, 24);
  const from12 = addMonths(data.today, -12);
  const awards = data.awards.filter((a) => a.country === country && a.province === province && a.tradeSlugs.includes(trade.slug) && a.date >= from24 && a.date <= data.today).length;
  const listings = listingsIn(data, trade, province).filter((r) => (r.publishedAt?.slice(0, 10) ?? "") >= from12).length;
  return awards + listings;
}

export function marketMonth(data: InsightData, trade: TradeRef, province: string, month = lastCompleteMonth(data.today)): MarketMonth {
  const country = provinceCountry(province);
  const monthFrom = `${month}-01`;
  const monthTo = monthEnd(month);
  const prevMonth = addMonths(monthFrom, -1).slice(0, 7);
  const lyMonth = addMonths(monthFrom, -12).slice(0, 7);
  const starts = feedStarts(data.rfps, country);
  const rows = listingsIn(data, trade, province);
  const readBy = dayAdd(`${prevMonth}-01`, -FEED_WARMUP_DAYS);
  const lyReadBy = dayAdd(`${lyMonth}-01`, -FEED_WARMUP_DAYS);
  // Only the feeds that carry this trade here count: one old feed elsewhere must not make the others look complete.
  const relevant = [...new Set(rows.map(sourceKeyOf))].map((k) => starts.get(k)).filter((s): s is string => Boolean(s));
  const eligible = relevant.some((s) => s <= readBy);
  const lyEligible = relevant.some((s) => s <= lyReadBy);
  const excluded = new Set<string>();
  const monthN = countPosted(rows, starts, monthFrom, monthTo, readBy, excluded);
  const prevN = countPosted(rows, starts, `${prevMonth}-01`, monthEnd(prevMonth), readBy, excluded);
  const tenders: MonthCount = {
    month: eligible ? monthN : null,
    prev: eligible ? prevN : null,
    lastYear: lyEligible ? countPosted(rows, starts, `${lyMonth}-01`, monthEnd(lyMonth), lyReadBy) : null,
    excludedSources: excluded.size,
  };
  const inTrade = data.awards.filter((a) => a.country === country && a.province === province && a.tradeSlugs.includes(trade.slug));
  const am = inTrade.filter((a) => a.date >= monthFrom && a.date <= monthTo);
  const awards = { month: am.length, prev: inTrade.filter((a) => a.date.startsWith(prevMonth)).length, valued: am.filter((a) => a.amount !== null).length };

  const records = marketRecords(data, trade, province);
  const run = insightsFor({ ...data, leads: null }, { country, provinces: [province], trades: [trade] }, personaOf([trade.slug]));
  // A public page is about this province only: drop the country-wide fallbacks.
  const facts = run.ranked.filter((f) => f.region === province);
  const gaps = run.gaps.filter((g) => g.region === province || g.region === null);
  return {
    trade,
    province,
    country,
    currency: country === "US" ? "USD" : "CAD",
    month,
    monthFrom,
    monthTo,
    tenders,
    awards,
    records,
    indexable: records >= MIN_INDEX_RECORDS,
    facts,
    gaps,
  };
}

export interface MarketIndexEntry {
  trade: TradeRef;
  province: string;
  records: number;
}

/** Every trade × province in a country with enough records to index, busiest first. */
export function indexableMarkets(data: InsightData, country: CountryCode, trades: readonly TradeRef[]): MarketIndexEntry[] {
  const from24 = windowStart(data.today, 24);
  const from12 = addMonths(data.today, -12);
  const bySlug = new Map(trades.map((t) => [t.slug, t]));
  const byName = new Map(trades.map((t) => [t.name, t]));
  const counts = new Map<string, MarketIndexEntry>();
  const bump = (t: TradeRef | undefined, province: string | null) => {
    if (!t || !province || provinceCountry(province) !== country) return;
    const k = `${t.slug}|${province}`;
    const e = counts.get(k) ?? { trade: t, province, records: 0 };
    e.records++;
    counts.set(k, e);
  };
  for (const a of data.awards) {
    if (a.country !== country || a.date < from24 || a.date > data.today) continue;
    for (const s of a.tradeSlugs) bump(bySlug.get(s), a.province);
  }
  for (const r of data.rfps) {
    if (r.isDemo || isPastContract(r) || rfpMarket(r) !== country || (r.publishedAt?.slice(0, 10) ?? "") < from12) continue;
    const p = canonicalProvince(r.province) ?? canonicalProvince(r.regionName);
    for (const c of r.categories) bump(byName.get(c), p);
  }
  return [...counts.values()]
    .filter((e) => e.records >= MIN_INDEX_RECORDS)
    .sort((a, b) => b.records - a.records || a.trade.name.localeCompare(b.trade.name) || a.province.localeCompare(b.province));
}
