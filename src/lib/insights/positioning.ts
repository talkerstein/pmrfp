/**
 * "Bid positioning" for an open listing: what similar jobs sold for (the
 * trade × province price benchmark), who this buyer usually awards to (the
 * award notices behind Award Intelligence), and how many bids such jobs
 * usually get (not in the public records PMRFP reads yet, so it says so).
 * Pure. Gated by positioningView(): free sees counts, Trade Pro sees the
 * price band, Award Intelligence sees the buyer's usual winners. Nothing
 * here tells anyone what to bid.
 */
import { canonicalProvince, computeBenchmark, MIN_RANGE_AWARDS, type BenchmarkAward } from "@/lib/data/price-benchmarks";
import { buyerFromSummary as tenderBuyer } from "@/lib/seo/rfp-meta";
import { buyerKeyOf, type BuyerRef, type IntelAward } from "@/lib/intel/model";
import { rfpMarket, type CountryCode } from "@/lib/visitor-geo";
import type { RfpListItem } from "@/lib/data/types";
import type { Entitlements } from "./gating";
import { benchmarkPath, intelBuyerPath, intelCompanyPath } from "./paths";

export interface PositioningBand {
  trade: string;
  tradeSlug: string;
  province: string;
  n: number;
  p25: number;
  median: number;
  p75: number;
  href: string;
}

export interface PositioningBuyer {
  name: string;
  href: string | null;
  /** The buyer's awards on record in this country (any trade). */
  awards: number;
  /** …in this listing's trades. */
  inTrade: number;
  /** Companies that won this buyer's work in these trades 2+ times, most first. */
  incumbents: { name: string; href: string | null; wins: number }[];
}

export interface Positioning {
  country: CountryCode;
  currency: "CAD" | "USD";
  band: PositioningBand | null;
  /** Valued awards in the best scope found (even below the range minimum). */
  bandCount: number;
  bandMin: number;
  buyer: PositioningBuyer | null;
}

export interface PositioningData {
  today: string;
  awards: readonly IntelAward[];
  refs: readonly BuyerRef[];
  benchmarkAwards: readonly BenchmarkAward[];
  /** Board trade name → slug. */
  tradeSlug: ReadonlyMap<string, string>;
}

export function positioningFor(r: Pick<RfpListItem, "categories" | "province" | "regionName" | "summary">, data: PositioningData): Positioning | null {
  const country = rfpMarket(r);
  const province = canonicalProvince(r.province) ?? canonicalProvince(r.regionName);
  const trades = r.categories.slice(0, 3);
  if (!trades.length) return null;

  let band: PositioningBand | null = null;
  let bandCount = 0;
  if (province) {
    for (const trade of trades) {
      const slug = data.tradeSlug.get(trade);
      if (!slug) continue;
      const b = computeBenchmark(data.benchmarkAwards, { trade, province }, data.today);
      bandCount = Math.max(bandCount, b.valued);
      if (b.stats) {
        band = { trade, tradeSlug: slug, province, n: b.stats.n, p25: b.stats.p25, median: b.stats.median, p75: b.stats.p75, href: benchmarkPath(slug, province) };
        break;
      }
    }
  }

  let buyer: PositioningBuyer | null = null;
  const name = tenderBuyer(r.summary);
  const key = name ? buyerKeyOf(name) : null;
  if (name && key) {
    const rows = data.awards.filter((a) => a.country === country && a.buyerKey === key);
    if (rows.length) {
      const slugs = new Set(trades.map((t) => data.tradeSlug.get(t)).filter(Boolean) as string[]);
      const inTrade = rows.filter((a) => a.tradeSlugs.some((s) => slugs.has(s)));
      const wins = new Map<string, { name: string; slug: string | null; wins: number }>();
      for (const a of inTrade) {
        if (!a.winnerKey || !a.winner) continue;
        const e = wins.get(a.winnerKey) ?? { name: a.winner, slug: a.winnerSlug, wins: 0 };
        e.wins++;
        wins.set(a.winnerKey, e);
      }
      const ref = data.refs.find((x) => x.country === country && x.key === key);
      buyer = {
        name: ref?.name ?? name,
        href: ref ? intelBuyerPath(ref.slug) : null,
        awards: rows.length,
        inTrade: inTrade.length,
        incumbents: [...wins.values()]
          .filter((w) => w.wins >= 2)
          .sort((a, b) => b.wins - a.wins || a.name.localeCompare(b.name))
          .slice(0, 3)
          .map((w) => ({ name: w.name, href: w.slug ? intelCompanyPath(w.slug) : null, wins: w.wins })),
      };
    }
  }
  if (!band && !bandCount && !buyer) return null;
  return { country, currency: country === "US" ? "USD" : "CAD", band, bandCount, bandMin: MIN_RANGE_AWARDS, buyer };
}

/**
 * What a viewer gets. Built fresh from a whitelist, so the free and Trade
 * Pro objects simply don't contain the gated values.
 */
export interface PositioningView {
  country: CountryCode;
  currency: "CAD" | "USD";
  /** Full band for Trade Pro; free gets only the count and whether a range exists. */
  band: PositioningBand | null;
  bandCount: number;
  bandMin: number;
  hasBand: boolean;
  buyerName: string | null;
  buyerAwards: number;
  buyerInTrade: number;
  /** Intel only. */
  incumbents: PositioningBuyer["incumbents"] | null;
  hasIncumbents: boolean;
  buyerHref: string | null;
  locks: { band: boolean; incumbents: boolean };
}

export function positioningView(p: Positioning, e: Entitlements): PositioningView {
  const hasIncumbents = Boolean(p.buyer?.incumbents.length);
  return {
    country: p.country,
    currency: p.currency,
    band: e.pro ? p.band : null,
    bandCount: p.band?.n ?? p.bandCount,
    bandMin: p.bandMin,
    hasBand: Boolean(p.band),
    buyerName: p.buyer?.name ?? null,
    buyerAwards: p.buyer?.awards ?? 0,
    buyerInTrade: p.buyer?.inTrade ?? 0,
    incumbents: e.intel && p.buyer ? p.buyer.incumbents : null,
    hasIncumbents,
    buyerHref: e.intel ? p.buyer?.href ?? null : null,
    locks: { band: Boolean(p.band) && !e.pro, incumbents: hasIncumbents && !e.intel },
  };
}
