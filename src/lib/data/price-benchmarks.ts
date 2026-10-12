/**
 * Price benchmarks — "what did similar contracts sell for?" — from the REAL
 * public award notices already on the board (the same rows behind
 * /contract-winners, the GC Hub and the monthly reports). Pure: the loader
 * (price-benchmarks-load.ts) feeds it the shared board snapshot.
 *
 * Rules:
 *  - Scope is one trade × one province/state (and a city inside it when that
 *    city alone has MIN_RANGE_AWARDS awards with a value), last WINDOW_MONTHS
 *    months, by award date.
 *  - Country-first and never mixed: a benchmark is in one country and one
 *    currency (CAD for Canada, USD for the U.S.). An award whose disclosed
 *    currency doesn't match its country is left out entirely.
 *  - Only awards with a disclosed value of at least MIN_USABLE_AMOUNT feed the
 *    numbers; the rest are counted ("value not disclosed") and listed.
 *  - A range (25th–75th percentile, median, min/max) is only quoted with
 *    MIN_RANGE_AWARDS or more valued awards. Below that: the count, no range.
 *  - Outliers are flagged (outside 1.5× the interquartile range on a log
 *    scale, so one $9M job doesn't make every $40K job look small), never
 *    removed: the median and the middle half barely move because of them.
 *  - Individuals are never named (same rule as the winner pages).
 */
import { isPastContract } from "@/lib/data/fomo";
import { buyerFromSummary } from "@/lib/data/monthly-winners";
import { isPublishableWinner, winnerKey, winnersFromRfps } from "@/lib/data/winners";
import { officialNoticeFromSlug } from "@/lib/gc/official";
import { publicTenderSource } from "@/lib/tenders/sources";
import { CA_PROVINCES, US_STATES, US_STATE_NAMES, isUsState } from "@/lib/geo";
import { CA_PROVINCE_CODES, type CountryCode } from "@/lib/visitor-geo";
import type { RfpListItem } from "@/lib/data/types";

export type Currency = "CAD" | "USD";

/** Valued awards needed before any range, median or percentile is shown. */
export const MIN_RANGE_AWARDS = 5;
/** Look-back window, in months, by award date. */
export const WINDOW_MONTHS = 24;
/** Below this a "value" is a unit rate or a typo, not a contract price. */
export const MIN_USABLE_AMOUNT = 1000;
/** Tukey fence multiplier for the outlier flag (on log10 values). */
export const OUTLIER_K = 1.5;
/** Free viewers see at most this many example awards (public notices anyway). */
export const FREE_EXAMPLES = 2;

export const currencyOf = (country: CountryCode): Currency => (country === "US" ? "USD" : "CAD");

/* ------------------------------------------------------------------ places */

const kebab = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

/** "ON" / "ontario" / "Ontario" → "Ontario"; "TX" / "texas" → "Texas"; anything else → null. */
export function canonicalProvince(p: string | null | undefined): string | null {
  const v = (p ?? "").trim();
  if (!v) return null;
  const upper = v.toUpperCase();
  if (CA_PROVINCE_CODES[upper]) return CA_PROVINCE_CODES[upper];
  const ca = CA_PROVINCES.find((n) => n.toLowerCase() === v.toLowerCase() || kebab(n) === kebab(v));
  if (ca) return ca;
  // Quebec is often written with its accent.
  if (kebab(v) === "quebec") return "Quebec";
  if (US_STATES[upper]) return US_STATES[upper];
  return US_STATE_NAMES.find((n) => n.toLowerCase() === v.toLowerCase()) ?? null;
}

export const provinceCountry = (province: string): CountryCode => (isUsState(province) ? "US" : "CA");

/** URL segment, matching the regions table: "ontario", "british-columbia", "us-texas". */
export function provinceSlug(province: string): string {
  return provinceCountry(province) === "US" ? `us-${kebab(province)}` : kebab(province);
}

export function provinceFromSlug(slug: string): string | null {
  const s = slug.toLowerCase();
  if (s.startsWith("us-")) return US_STATE_NAMES.find((n) => kebab(n) === s.slice(3)) ?? null;
  return CA_PROVINCES.find((n) => kebab(n) === s) ?? null;
}

/* ------------------------------------------------------------------ awards */

export interface BenchmarkAward {
  slug: string;
  title: string;
  buyer: string | null;
  /** Publishable company name, or null for an individual (counted, not named). */
  winner: string | null;
  /** /contract-winners/<slug> when the winner has a profile. */
  winnerSlug: string | null;
  /** Usable disclosed value (≥ MIN_USABLE_AMOUNT), else null. */
  amount: number | null;
  /** Award date, YYYY-MM-DD. */
  date: string;
  country: CountryCode;
  currency: Currency;
  province: string;
  city: string | null;
  trades: string[];
  sourceKey: string;
  attribution: string;
  /** The official notice (exact) or the portal it was published on. */
  noticeUrl: string | null;
  noticeExact: boolean;
}

/**
 * Winner, value and currency from an award summary
 * ("Awarded May 12, 2026 to X (City) — $97,625 CAD. …").
 */
export function parseAwardValue(summary: string | null): { winner: string | null; amount: number | null; currency: Currency | null } {
  const m = summary?.match(/^Awarded [^.]*? to (.+?) — (?:\$([\d,]+) (CAD|USD)|value not disclosed)\./);
  if (!m) return { winner: null, amount: null, currency: null };
  const winner = m[1].replace(/\s*\([^)]*\)\s*$/, "").trim() || null;
  const amount = m[2] ? Number(m[2].replace(/[^\d]/g, "")) : null;
  return { winner, amount: amount && Number.isFinite(amount) ? amount : null, currency: (m[3] as Currency | undefined) ?? null };
}

export interface AwardContext {
  /** Region display name → its province/state (regions table); fills a missing rfp.province. */
  regionProvince?: Map<string, string | null>;
}

/**
 * Every past public contract on the board that can feed a benchmark: a known
 * province/state, a trade, a dated award and a value in its own country's
 * currency (or no value at all — counted as undisclosed).
 */
export function benchmarkAwards(rfps: RfpListItem[], ctx: AwardContext = {}): BenchmarkAward[] {
  const profiles = new Map(winnersFromRfps(rfps, 1).map((w) => [winnerKey(w.name), w.slug]));
  const out: BenchmarkAward[] = [];
  for (const r of rfps) {
    if (!isPastContract(r) || !r.categories.length) continue;
    const date = r.deadline?.slice(0, 10) ?? "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const { winner, amount, currency } = parseAwardValue(r.summary);
    if (!winner) continue;
    const regionProv = r.regionName ? ctx.regionProvince?.get(r.regionName) ?? null : null;
    const province = canonicalProvince(r.province) ?? canonicalProvince(regionProv) ?? canonicalProvince(r.regionName);
    if (!province) continue; // federal awards with no place of work: no province to benchmark
    const country = provinceCountry(province);
    // Never mix currencies: a value in the other country's currency drops the row.
    if (currency && currency !== currencyOf(country)) continue;
    // A city when the listing's region is a place inside the province (Montreal, Ottawa).
    const city = (r.city?.trim() || null) ?? (r.regionName && canonicalProvince(regionProv) === province && r.regionName !== province ? r.regionName : null);
    const publishable = isPublishableWinner(winner) ? winner : null;
    const src = publicTenderSource(r.slug);
    const notice = officialNoticeFromSlug(r.slug);
    out.push({
      slug: r.slug,
      title: r.title,
      buyer: buyerFromSummary(r.summary),
      winner: publishable,
      winnerSlug: publishable ? profiles.get(winnerKey(publishable)) ?? null : null,
      amount: amount !== null && amount >= MIN_USABLE_AMOUNT ? amount : null,
      date,
      country,
      currency: currencyOf(country),
      province,
      city,
      trades: r.categories,
      sourceKey: src.key,
      attribution: src.attribution,
      noticeUrl: notice?.url ?? null,
      noticeExact: notice?.exact ?? false,
    });
  }
  return out;
}

/* ------------------------------------------------------------------ math */

/** YYYY-MM-DD `months` before `today` (same day of month, clamped). */
export function windowStart(today: string, months = WINDOW_MONTHS): string {
  const [y, m, d] = today.slice(0, 10).split("-").map(Number);
  const total = y * 12 + (m - 1) - months;
  const yy = Math.floor(total / 12);
  const mm = (total % 12) + 1;
  const last = new Date(Date.UTC(yy, mm, 0)).getUTCDate();
  return `${yy}-${String(mm).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}`;
}

/** Linear-interpolation percentile (Excel PERCENTILE.INC / numpy default) of an ascending array. */
export function percentile(sorted: readonly number[], q: number): number {
  if (!sorted.length) throw new Error("percentile of an empty list");
  if (q <= 0) return sorted[0];
  if (q >= 1) return sorted[sorted.length - 1];
  const i = (sorted.length - 1) * q;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
}

export interface PriceStats {
  n: number;
  min: number;
  p25: number;
  median: number;
  p75: number;
  max: number;
}

/** Whole-dollar summary of the values; null below MIN_RANGE_AWARDS (no range from 1–4 awards). */
export function priceStats(values: readonly number[], min = MIN_RANGE_AWARDS): PriceStats | null {
  const sorted = values.filter((v) => Number.isFinite(v) && v > 0).sort((a, b) => a - b);
  if (sorted.length < min || sorted.length === 0) return null;
  return {
    n: sorted.length,
    min: sorted[0],
    p25: Math.round(percentile(sorted, 0.25)),
    median: Math.round(percentile(sorted, 0.5)),
    p75: Math.round(percentile(sorted, 0.75)),
    max: sorted[sorted.length - 1],
  };
}

/** Values outside OUTLIER_K × IQR on a log10 scale; empty below MIN_RANGE_AWARDS. */
export function outlierBounds(values: readonly number[]): { low: number; high: number } | null {
  const logs = values.filter((v) => v > 0).map(Math.log10).sort((a, b) => a - b);
  if (logs.length < MIN_RANGE_AWARDS) return null;
  const q1 = percentile(logs, 0.25);
  const q3 = percentile(logs, 0.75);
  const iqr = q3 - q1;
  return { low: 10 ** (q1 - OUTLIER_K * iqr), high: 10 ** (q3 + OUTLIER_K * iqr) };
}

/* ------------------------------------------------------------------ benchmarks */

export interface BenchmarkScope {
  trade: string;
  province: string;
  city?: string | null;
}

export interface BenchmarkRow extends BenchmarkAward {
  outlier: boolean;
}

export interface NamedTally {
  name: string;
  awards: number;
  /** Disclosed value only. */
  value: number;
  slug?: string | null;
}

export interface CityCount {
  city: string;
  total: number;
  valued: number;
  enough: boolean;
}

export interface Benchmark {
  trade: string;
  province: string;
  city: string | null;
  country: CountryCode;
  currency: Currency;
  /** Window, YYYY-MM-DD. */
  from: string;
  to: string;
  /** Awards in scope (with or without a value). */
  total: number;
  /** Awards with a usable disclosed value. */
  valued: number;
  undisclosed: number;
  /** valued ≥ MIN_RANGE_AWARDS: a range may be shown. */
  enough: boolean;
  stats: PriceStats | null;
  outliers: number;
  /** Newest first. */
  awards: BenchmarkRow[];
  topBuyers: NamedTally[];
  topWinners: NamedTally[];
  /** Cities inside the province with awards in this trade (province scope only). */
  cities: CityCount[];
  sourceKeys: string[];
  attributions: string[];
}

function tally(rows: BenchmarkRow[], keyOf: (a: BenchmarkRow) => string | null, slugOf?: (a: BenchmarkRow) => string | null): NamedTally[] {
  const m = new Map<string, NamedTally>();
  for (const a of rows) {
    const name = keyOf(a);
    if (!name) continue;
    const k = slugOf ? winnerKey(name) : name;
    const e = m.get(k) ?? { name, awards: 0, value: 0, ...(slugOf ? { slug: slugOf(a) } : {}) };
    e.awards++;
    e.value += a.amount ?? 0;
    m.set(k, e);
  }
  return [...m.values()].sort((a, b) => b.awards - a.awards || b.value - a.value || a.name.localeCompare(b.name));
}

/** In scope: same trade, same province (so same country and currency), in the window. */
export function inScope(a: BenchmarkAward, scope: BenchmarkScope, from: string, to: string): boolean {
  return (
    a.province === scope.province &&
    a.country === provinceCountry(scope.province) &&
    a.currency === currencyOf(provinceCountry(scope.province)) &&
    a.trades.includes(scope.trade) &&
    (!scope.city || a.city === scope.city) &&
    a.date >= from &&
    a.date <= to
  );
}

export function computeBenchmark(all: readonly BenchmarkAward[], scope: BenchmarkScope, today: string): Benchmark {
  const country = provinceCountry(scope.province);
  const from = windowStart(today);
  const to = today.slice(0, 10);
  const rows = all.filter((a) => inScope(a, scope, from, to));
  const values = rows.map((a) => a.amount).filter((v): v is number => v !== null);
  const stats = priceStats(values);
  const bounds = stats ? outlierBounds(values) : null;
  const flagged: BenchmarkRow[] = rows
    .map((a) => ({ ...a, outlier: Boolean(bounds && a.amount !== null && (a.amount < bounds.low || a.amount > bounds.high)) }))
    .sort((a, b) => b.date.localeCompare(a.date) || (b.amount ?? 0) - (a.amount ?? 0) || a.slug.localeCompare(b.slug));

  const cities: CityCount[] = [];
  if (!scope.city) {
    const byCity = new Map<string, { total: number; valued: number }>();
    for (const a of rows) {
      if (!a.city) continue;
      const e = byCity.get(a.city) ?? { total: 0, valued: 0 };
      e.total++;
      if (a.amount !== null) e.valued++;
      byCity.set(a.city, e);
    }
    for (const [city, e] of byCity) cities.push({ city, ...e, enough: e.valued >= MIN_RANGE_AWARDS });
    cities.sort((a, b) => b.valued - a.valued || a.city.localeCompare(b.city));
  }

  return {
    trade: scope.trade,
    province: scope.province,
    city: scope.city ?? null,
    country,
    currency: currencyOf(country),
    from,
    to,
    total: rows.length,
    valued: values.length,
    undisclosed: rows.length - values.length,
    enough: stats !== null,
    stats,
    outliers: flagged.filter((a) => a.outlier).length,
    awards: flagged,
    topBuyers: tally(flagged, (a) => a.buyer).slice(0, 5),
    topWinners: tally(flagged, (a) => a.winner, (a) => a.winnerSlug).slice(0, 5),
    cities,
    sourceKeys: [...new Set(flagged.map((a) => a.sourceKey))],
    attributions: [...new Set(flagged.map((a) => a.attribution))],
  };
}

export interface ComboCount {
  trade: string;
  province: string;
  country: CountryCode;
  currency: Currency;
  total: number;
  valued: number;
  enough: boolean;
  /** Only filled for Pro views and the coverage report — never rendered for free viewers. */
  median: number | null;
}

/** Every trade × province with at least one award in the window. Sorted by valued awards. */
export function benchmarkCombos(all: readonly BenchmarkAward[], today: string): ComboCount[] {
  const from = windowStart(today);
  const to = today.slice(0, 10);
  const m = new Map<string, { trade: string; province: string; total: number; values: number[] }>();
  for (const a of all) {
    if (a.date < from || a.date > to) continue;
    for (const trade of a.trades) {
      const k = `${trade}|${a.province}`;
      const e = m.get(k) ?? { trade, province: a.province, total: 0, values: [] as number[] };
      e.total++;
      if (a.amount !== null) e.values.push(a.amount);
      m.set(k, e);
    }
  }
  return [...m.values()]
    .map((e) => {
      const country = provinceCountry(e.province);
      const stats = priceStats(e.values);
      return { trade: e.trade, province: e.province, country, currency: currencyOf(country), total: e.total, valued: e.values.length, enough: stats !== null, median: stats?.median ?? null };
    })
    .sort((a, b) => b.valued - a.valued || b.total - a.total || a.trade.localeCompare(b.trade) || a.province.localeCompare(b.province));
}

/* ------------------------------------------------------------------ gating */

/**
 * What a free viewer gets: counts, whether a range exists, the window, top
 * buyers by count, and FREE_EXAMPLES example awards (public notices anyway).
 * No percentiles, median, min/max, winners list or full award list — they are
 * not in the object, so they can't leak into the page.
 */
export interface BenchmarkTeaser {
  trade: string;
  province: string;
  city: string | null;
  country: CountryCode;
  currency: Currency;
  from: string;
  to: string;
  total: number;
  valued: number;
  undisclosed: number;
  enough: boolean;
  examples: BenchmarkAward[];
  topBuyers: { name: string; awards: number }[];
  cities: CityCount[];
  sourceKeys: string[];
  attributions: string[];
}

export type BenchmarkView = { pro: true; data: Benchmark } | { pro: false; data: BenchmarkTeaser };

export function teaserOf(b: Benchmark): BenchmarkTeaser {
  return {
    trade: b.trade,
    province: b.province,
    city: b.city,
    country: b.country,
    currency: b.currency,
    from: b.from,
    to: b.to,
    total: b.total,
    valued: b.valued,
    undisclosed: b.undisclosed,
    enough: b.enough,
    // Most recent valued, non-outlier awards: what a typical job looks like.
    examples: b.awards
      .filter((a) => a.amount !== null && !a.outlier)
      .slice(0, FREE_EXAMPLES)
      .map((row): BenchmarkAward => {
        const { outlier, ...a } = row;
        void outlier; // the flag is Pro data
        return a;
      }),
    topBuyers: b.topBuyers.map((x) => ({ name: x.name, awards: x.awards })),
    cities: b.cities,
    sourceKeys: b.sourceKeys,
    attributions: b.attributions,
  };
}

export function benchmarkView(b: Benchmark, pro: boolean): BenchmarkView {
  return pro ? { pro: true, data: b } : { pro: false, data: teaserOf(b) };
}

/* ------------------------------------------------------------------ CSV */

const cell = (v: string | number | null | boolean) => {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Every award behind a benchmark (Trade Pro). BOM so Excel keeps Quebec accents. */
export function benchmarkCsv(b: Benchmark, siteUrl: string): string {
  const header = ["award_date", "contract", "buyer", "winner", `value_${b.currency.toLowerCase()}`, "currency", "outlier", "province_or_state", "city", "country", "trades", "pmrfp_url", "official_notice", "source_licence"];
  const lines = b.awards.map((a) =>
    [a.date, a.title, a.buyer, a.winner ?? "Individual (not named)", a.amount, a.currency, a.outlier ? "yes" : "", a.province, a.city, a.country, a.trades.join("; "), `${siteUrl}/rfps/${a.slug}`, a.noticeUrl, a.attribution]
      .map(cell)
      .join(","),
  );
  return "﻿" + [header.join(","), ...lines].join("\n") + "\n";
}
