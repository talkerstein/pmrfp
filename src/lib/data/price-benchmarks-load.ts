import { cache } from "react";
import { listAllRfpsCached } from "@/lib/data/trade-city";
import { getCategories, getRegions, type CategoryOption } from "@/lib/data/taxonomy";
import { torontoToday } from "@/lib/data/monthly-winners-load";
import { compactDollars } from "@/lib/data/fomo";
import {
  benchmarkAwards,
  benchmarkCombos,
  canonicalProvince,
  computeBenchmark,
  provinceFromSlug,
  provinceSlug,
  type Benchmark,
  type ComboCount,
  type Currency,
} from "@/lib/data/price-benchmarks";
import { countryOf, type CountryCode } from "@/lib/visitor-geo";
import { formatNumber } from "@/i18n/format";
import type { Locale } from "@/i18n/config";

/**
 * Price benchmarks over the shared board snapshot (lib/data/board-snapshot):
 * no queries of its own, memoised once per request with React cache().
 */

export const BENCHMARKS_PATH = "/benchmarks";

export const benchmarkPath = (tradeSlug: string, province: string) => `${BENCHMARKS_PATH}/${tradeSlug}/${provinceSlug(province)}`;

export const loadBenchmarkData = cache(async () => {
  const [rfps, regions, categories] = await Promise.all([
    listAllRfpsCached().catch(() => []),
    getRegions().catch(() => []),
    getCategories().catch(() => [] as CategoryOption[]),
  ]);
  const regionProvince = new Map(regions.map((r) => [r.name, r.province] as const));
  const today = torontoToday();
  const awards = benchmarkAwards(rfps, { regionProvince });
  return { awards, categories, today, combos: benchmarkCombos(awards, today) };
});

/** Trade × province combos in one country (never both), most data first. */
export async function loadCombos(country: CountryCode): Promise<ComboCount[]> {
  return (await loadBenchmarkData()).combos.filter((c) => c.country === country);
}

/** The benchmark for /benchmarks/<trade>/<province>, or null for an unknown trade or place. */
export const loadBenchmark = cache(async (tradeSlug: string, provSlug: string) => {
  const province = provinceFromSlug(provSlug);
  if (!province) return null;
  const { awards, categories, today } = await loadBenchmarkData();
  const category = categories.find((c) => c.slug === tradeSlug);
  if (!category) return null;
  return { category, province, benchmark: computeBenchmark(awards, { trade: category.name, province }, today), today };
});

export async function loadCityBenchmark(tradeName: string, province: string, city: string): Promise<Benchmark> {
  const { awards, today } = await loadBenchmarkData();
  return computeBenchmark(awards, { trade: tradeName, province, city }, today);
}

/**
 * The benchmark for a listing: its first trade with data in its province/state.
 * Null when the listing has no trade or no known province, or nothing was ever
 * awarded there in its trades.
 */
export async function benchmarkForListing(r: { categories: string[]; province: string | null; regionName?: string | null }): Promise<{ benchmark: Benchmark; tradeSlug: string } | null> {
  const province = canonicalProvince(r.province) ?? canonicalProvince(r.regionName ?? null);
  if (!province) return null;
  const { awards, categories, today } = await loadBenchmarkData();
  let best: { benchmark: Benchmark; tradeSlug: string } | null = null;
  for (const trade of r.categories.slice(0, 3)) {
    const slug = categories.find((c) => c.name === trade)?.slug;
    if (!slug) continue;
    const b = computeBenchmark(awards, { trade, province }, today);
    if (b.total === 0) continue;
    if (!best || (b.enough && !best.benchmark.enough)) best = { benchmark: b, tradeSlug: slug };
    if (best.benchmark.enough) break;
  }
  return best;
}

/** The benchmark for the trade × province a contract winner has won most in (winner pages). */
export async function benchmarkForWinner(winnerSlug: string): Promise<{ benchmark: Benchmark; tradeSlug: string } | null> {
  const { awards, categories, today } = await loadBenchmarkData();
  const counts = new Map<string, { trade: string; province: string; n: number }>();
  for (const a of awards) {
    if (a.winnerSlug !== winnerSlug) continue;
    for (const trade of a.trades) {
      const k = `${trade}|${a.province}`;
      const e = counts.get(k) ?? { trade, province: a.province, n: 0 };
      e.n++;
      counts.set(k, e);
    }
  }
  const top = [...counts.values()].sort((a, b) => b.n - a.n || a.trade.localeCompare(b.trade))[0];
  const slug = top ? categories.find((c) => c.name === top.trade)?.slug : undefined;
  if (!top || !slug) return null;
  return { benchmark: computeBenchmark(awards, { trade: top.trade, province: top.province }, today), tradeSlug: slug };
}

/**
 * Benchmarks for a company's trades in its province/state (dashboard): one per
 * trade, falling back to the trade's busiest province in the same country when
 * the company's own has nothing yet.
 */
export async function benchmarksForTrades(
  tradeSlugs: string[],
  country: CountryCode,
  province: string | null,
  max = 3,
): Promise<{ benchmark: Benchmark; tradeSlug: string }[]> {
  const { awards, categories, today, combos } = await loadBenchmarkData();
  const own = canonicalProvince(province);
  const out: { benchmark: Benchmark; tradeSlug: string }[] = [];
  for (const slug of tradeSlugs) {
    const cat = categories.find((c) => c.slug === slug);
    if (!cat) continue;
    const mine = own && countryOf({ province: own }) === country ? computeBenchmark(awards, { trade: cat.name, province: own }, today) : null;
    const fallback = combos.find((c) => c.trade === cat.name && c.country === country && c.total > 0);
    const b = mine && mine.total > 0 ? mine : fallback ? computeBenchmark(awards, { trade: cat.name, province: fallback.province }, today) : null;
    if (b) out.push({ benchmark: b, tradeSlug: slug });
  }
  return out.sort((a, b) => Number(b.benchmark.enough) - Number(a.benchmark.enough) || b.benchmark.valued - a.benchmark.valued).slice(0, max);
}

const NBSP = " ";

/** "$123,456 CAD" (en/es), "123 456 $ CAD" (fr). */
export function priceLabel(n: number, currency: Currency, lang: Locale): string {
  const v = formatNumber(Math.round(n), lang);
  return lang === "fr" ? `${v}${NBSP}$${NBSP}${currency}` : `$${v}${NBSP}${currency}`;
}

/** "$1.2M CAD" / "1,2 M$ CAD". */
export function shortPrice(n: number, currency: Currency, lang: Locale): string {
  return `${compactDollars(n, lang)}${NBSP}${currency}`;
}
