/**
 * Insight detectors: deterministic, pure functions over the shared cached
 * snapshots (board rows, award notices, benchmark awards, the member's lead
 * list). No queries, no randomness, no forecasting. Each returns a typed
 * fact with its numbers, sample size and links, or a gap that says why
 * nothing honest can be said ("too few", "short history").
 *
 * Trust rules built in:
 *  - Country first: every detector filters to one country (and one
 *    currency) before anything else; nothing mixes Canada and the U.S.
 *  - Feed onboarding is not a trend: a week-over-week or year-over-year
 *    count only uses feeds PMRFP was already reading for the whole
 *    comparison (rfp_posts.created_at per source), so a new feed never
 *    shows up as "volume up 300%".
 *  - Award history differs by feed (SEAO keeps 180 days, the others 365):
 *    seasonality and price movement only use feeds whose records cover the
 *    whole period being compared.
 *  - Minimum samples: MIN_* below. Under them: a gap, never a guess.
 */
import { isPastContract } from "@/lib/data/fomo";
import { buyerFromSummary as tenderBuyer } from "@/lib/seo/rfp-meta";
import { canonicalProvince, computeBenchmark, MIN_RANGE_AWARDS, provinceCountry, provinceSlug, type BenchmarkAward } from "@/lib/data/price-benchmarks";
import { publicTenderSource } from "@/lib/tenders/sources";
import { addMonths, buyerKeyOf, renewalRadar, TYPICAL_TERM_YEARS, type BuyerRef, type IntelAward } from "@/lib/intel/model";
import { benchmarkPath, intelBuyerPath, intelCompanyPath, intelMarketPath, INTEL_RENEWALS_PATH } from "./paths";
import { rfpMarket, type CountryCode } from "@/lib/visitor-geo";
import type { RfpListItem } from "@/lib/data/types";
import type {
  CompetitorWinsFact,
  Confidence,
  DetectorResult,
  GcNamedFact,
  IncumbentStreakFact,
  InsightGap,
  InsightKind,
  NewProjectsFact,
  PriceBandFact,
  PriceMoveFact,
  BuyerSurgeFact,
  RenewalsFact,
  SeasonalityFact,
  TradeRef,
  VolumeFact,
} from "./types";
import { PERSONAS_FOR } from "./weights";

/* ------------------------------------------------------------------ thresholds */

/** Listings across both weeks before a week-over-week comparison. */
export const MIN_VOLUME = 6;
/** The earlier week needs this many before a percent change is quoted. */
export const MIN_VOLUME_BASE = 3;
/** A move smaller than this (percent or listings) is "about the same". */
export const VOLUME_MOVE_PCT = 25;
export const VOLUME_MOVE_ABS = 3;
/** A feed must have been read for this many days before a comparison window opens. */
export const FEED_WARMUP_DAYS = 7;
/** Awards in the last 12 months before talking about seasonality. */
export const MIN_SEASON_AWARDS = 15;
/** Months in the "busy season" window. */
export const SEASON_SPAN = 3;
/** Share of a year's awards in the busiest 3 months before it's called a season (an even spread is 25%). */
export const SEASON_MIN_SHARE = 40;
/** Price movement: valued awards needed on EACH side of the split. */
export const MIN_PRICE_SIDE = MIN_RANGE_AWARDS;
export const PRICE_RECENT_MONTHS = 6;
export const PRICE_MOVE_PCT = 15;
/** Buyer surge. */
export const SURGE_DAYS = 30;
export const SURGE_MIN_RECENT = 3;
export const SURGE_MIN_MONTHS = 3;
export const SURGE_RATIO = 2;
/** Incumbent streak: same winner on this many of the buyer's latest awards in the trade. */
export const MIN_STREAK = 2;
/** Recent-award windows. */
export const GC_DAYS = 30;
export const WINS_DAYS = 30;
export const MIN_WINS = 2;
export const RENEWAL_HORIZON = 12;

/* ------------------------------------------------------------------ dates */

const DAY = 86_400_000;
export const dayAdd = (d: string, days: number) => new Date(Date.parse(`${d.slice(0, 10)}T12:00:00Z`) + days * DAY).toISOString().slice(0, 10);
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b.slice(0, 10)}T12:00:00Z`) - Date.parse(`${a.slice(0, 10)}T12:00:00Z`)) / DAY);

/** The last complete Monday–Sunday week before `today` (YYYY-MM-DD). Stable for the whole current week. */
export function lastCompleteWeek(today: string): { from: string; to: string } {
  const wd = (new Date(`${today}T12:00:00Z`).getUTCDay() + 6) % 7; // Monday = 0
  const thisMonday = dayAdd(today, -wd);
  return { from: dayAdd(thisMonday, -7), to: dayAdd(thisMonday, -1) };
}

/** ISO week key of a date ("2026-W42"). */
export function isoWeekKey(date: string): string {
  const d = new Date(`${date.slice(0, 10)}T12:00:00Z`);
  const wd = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - wd + 3); // Thursday of this week
  // The ISO year and week are those of that Thursday.
  const year = d.getUTCFullYear();
  const dayOfYear = Math.round((d.getTime() - Date.UTC(year, 0, 1, 12)) / DAY);
  return `${year}-W${String(1 + Math.floor(dayOfYear / 7)).padStart(2, "0")}`;
}

/* ------------------------------------------------------------------ inputs */

/** What a member (or a public page) is about: one country, its provinces, its trades. */
export interface InsightScope {
  country: CountryCode;
  /** Province / state names in that country, primary first. Empty = country-wide only. */
  provinces: string[];
  trades: TradeRef[];
}

/** Just what the project detector reads from a lead (works for Lead and LeadView). */
export interface LeadLike {
  key: string;
  kind: string;
  title: string;
  city: string | null;
  province: string | null;
  seen: string | null;
  valueCad: number | null;
  href: string;
  hasContractor: boolean;
  score: number;
}

export interface InsightData {
  /** YYYY-MM-DD (Toronto). */
  today: string;
  /** The whole board (board snapshot), open and closed, both countries. */
  rfps: readonly RfpListItem[];
  /** Award notices (lib/intel/model intelAwards over the same snapshot). */
  awards: readonly IntelAward[];
  refs: readonly BuyerRef[];
  /** Benchmark rows (lib/data/price-benchmarks benchmarkAwards). */
  benchmarkAwards: readonly BenchmarkAward[];
  /** The member's lead list (lib/leads), already in its trades and area. Null on public pages. */
  leads?: readonly LeadLike[] | null;
}

/* ------------------------------------------------------------------ helpers */

const confidenceOf = (n: number, high: number, medium: number): Confidence => (n >= high ? "high" : n >= medium ? "medium" : "low");
const pctChange = (cur: number, base: number) => (base > 0 ? Math.round(((cur - base) / base) * 100) : null);
const idOf = (kind: InsightKind, country: CountryCode, region: string | null, trade: TradeRef | null, period: string, extra = "") =>
  [kind, country, region ?? "*", trade?.slug ?? "*", period, extra].filter(Boolean).join("|");
const gap = (kind: InsightKind, country: CountryCode, region: string | null, trade: TradeRef | null, reason: InsightGap["reason"], n: number, min: number): InsightGap => ({
  kind,
  country,
  region,
  trade,
  reason,
  sample: { n, min },
});
const tradeLink = (t: TradeRef) => `/rfps?category=${encodeURIComponent(t.slug)}`;

/** Province of a board row, in canonical form. */
const provinceOfRfp = (r: Pick<RfpListItem, "province" | "regionName">) => canonicalProvince(r.province) ?? canonicalProvince(r.regionName);

/** One key per feed: the public tender source, or PMRFP's own listings. */
export function sourceKeyOf(r: Pick<RfpListItem, "slug" | "sourceType">): string {
  return r.sourceType === "public_source" ? publicTenderSource(r.slug).key : "pmrfp";
}

/** When PMRFP started reading each feed in a country: earliest created_at (else posting date) per source. */
export function feedStarts(rfps: readonly RfpListItem[], country: CountryCode): Map<string, string> {
  const out = new Map<string, string>();
  for (const r of rfps) {
    if (r.isDemo || rfpMarket(r) !== country) continue;
    const seen = (r.createdAt ?? r.publishedAt)?.slice(0, 10);
    if (!seen) continue;
    const k = sourceKeyOf(r);
    const cur = out.get(k);
    if (!cur || seen < cur) out.set(k, seen);
  }
  return out;
}

/** Earliest award date per award feed in a country (award history differs by feed). */
export function awardFeedStarts(awards: readonly { country: CountryCode; sourceKey: string; date: string }[], country: CountryCode): Map<string, string> {
  const out = new Map<string, string>();
  for (const a of awards) {
    if (a.country !== country) continue;
    const cur = out.get(a.sourceKey);
    if (!cur || a.date < cur) out.set(a.sourceKey, a.date);
  }
  return out;
}

const inRegion = (province: string | null, region: string | null) => !region || province === region;

/* ------------------------------------------------------------------ volume */

/** Open listings (not award notices) in a trade, posted in [from, to], from feeds eligible since `readBy`. */
function postedIn(
  rows: readonly RfpListItem[],
  starts: ReadonlyMap<string, string>,
  from: string,
  to: string,
  readBy: string,
): { n: number; excluded: Set<string> } {
  let n = 0;
  const excluded = new Set<string>();
  for (const r of rows) {
    const d = r.publishedAt?.slice(0, 10);
    if (!d || d < from || d > to) continue;
    const src = sourceKeyOf(r);
    const start = starts.get(src);
    if (!start || start > readBy) {
      excluded.add(src);
      continue;
    }
    n++;
  }
  return { n, excluded };
}

export function detectVolume(data: InsightData, country: CountryCode, region: string | null, trade: TradeRef): VolumeFact | InsightGap {
  const week = lastCompleteWeek(data.today);
  const prevFrom = dayAdd(week.from, -7);
  const prevTo = dayAdd(week.from, -1);
  const starts = feedStarts(data.rfps, country);
  const rows = data.rfps.filter(
    (r) => !r.isDemo && !isPastContract(r) && rfpMarket(r) === country && inRegion(provinceOfRfp(r), region) && r.categories.includes(trade.name),
  );
  // Feeds must have been read since a week before the earlier week opened.
  const readBy = dayAdd(prevFrom, -FEED_WARMUP_DAYS);
  const cur = postedIn(rows, starts, week.from, week.to, readBy);
  const prev = postedIn(rows, starts, prevFrom, prevTo, readBy);
  const n = cur.n + prev.n;
  if (n < MIN_VOLUME || prev.n < MIN_VOLUME_BASE) {
    const recentFeeds = cur.excluded.size + prev.excluded.size > 0;
    return gap("volume", country, region, trade, recentFeeds ? "short-history" : n === 0 ? "no-data" : "too-few", n, MIN_VOLUME);
  }

  const changePct = pctChange(cur.n, prev.n);
  const moved = changePct !== null && Math.abs(changePct) >= VOLUME_MOVE_PCT && Math.abs(cur.n - prev.n) >= VOLUME_MOVE_ABS;
  const direction = !moved ? "steady" : cur.n > prev.n ? "up" : "down";

  // Same week last year, only from feeds read since a week before then.
  const lyFrom = dayAdd(week.from, -364);
  const lyTo = dayAdd(week.to, -364);
  const lyReadBy = dayAdd(lyFrom, -FEED_WARMUP_DAYS);
  const lyEligible = [...starts.entries()].filter(([, s]) => s <= lyReadBy).map(([k]) => k);
  let lastYear: VolumeFact["data"]["lastYear"];
  if (!lyEligible.length) {
    const first = [...starts.values()].sort()[0] ?? null;
    lastYear = { status: "no-history", historyFrom: first };
  } else {
    const lyStarts = new Map(lyEligible.map((k) => [k, starts.get(k)!]));
    const ly = postedIn(rows, lyStarts, lyFrom, lyTo, lyReadBy).n;
    const curSame = postedIn(rows, lyStarts, week.from, week.to, lyReadBy).n;
    lastYear = ly >= MIN_VOLUME_BASE ? { status: "ok", count: ly, changePct: pctChange(curSame, ly) } : { status: "no-history", historyFrom: [...starts.values()].sort()[0] ?? null };
  }

  return {
    id: idOf("volume", country, region, trade, week.from),
    kind: "volume",
    tier: "free",
    personas: PERSONAS_FOR.volume,
    country,
    region,
    trade,
    from: prevFrom,
    to: week.to,
    sample: { n, min: MIN_VOLUME },
    confidence: confidenceOf(n, 30, 12),
    score: Math.min(100, (direction === "steady" ? 20 : 40 + Math.min(40, Math.abs(changePct ?? 0) / 2)) + Math.min(20, n / 2)),
    links: [{ label: "board", href: tradeLink(trade) }],
    data: {
      current: cur.n,
      previous: prev.n,
      changePct,
      direction,
      prevFrom,
      prevTo,
      lastYear,
      excludedSources: new Set([...cur.excluded, ...prev.excluded]).size,
    },
  };
}

/* ------------------------------------------------------------------ seasonality */

export function detectSeasonality(data: InsightData, country: CountryCode, region: string | null, trade: TradeRef): SeasonalityFact | InsightGap {
  const yearAgo = addMonths(data.today, -12);
  // Only feeds whose award records reach back (almost) a full year.
  const starts = awardFeedStarts(data.awards, country);
  const fullYear = new Set([...starts.entries()].filter(([, s]) => s <= addMonths(data.today, -11)).map(([k]) => k));
  const all = data.awards.filter((a) => a.country === country && inRegion(a.province, region) && a.tradeSlugs.includes(trade.slug) && a.date > yearAgo && a.date <= data.today);
  const rows = all.filter((a) => fullYear.has(a.sourceKey));
  if (!rows.length) return gap("seasonality", country, region, trade, all.length ? "short-history" : "no-data", 0, MIN_SEASON_AWARDS);
  if (rows.length < MIN_SEASON_AWARDS) return gap("seasonality", country, region, trade, "too-few", rows.length, MIN_SEASON_AWARDS);
  const counts = Array.from({ length: 12 }, () => 0);
  for (const a of rows) counts[Number(a.date.slice(5, 7)) - 1]++;
  let best = { start: 0, n: -1 };
  for (let s = 0; s < 12; s++) {
    let n = 0;
    for (let k = 0; k < SEASON_SPAN; k++) n += counts[(s + k) % 12];
    if (n > best.n) best = { start: s, n };
  }
  const sharePct = Math.round((best.n / rows.length) * 100);
  if (sharePct < SEASON_MIN_SHARE) return gap("seasonality", country, region, trade, "too-few", rows.length, MIN_SEASON_AWARDS);
  const historyFrom = rows.reduce((m, a) => (a.date < m ? a.date : m), rows[0].date);
  return {
    id: idOf("seasonality", country, region, trade, data.today.slice(0, 7)),
    kind: "seasonality",
    tier: "free",
    personas: PERSONAS_FOR.seasonality,
    country,
    region,
    trade,
    from: historyFrom,
    to: data.today,
    sample: { n: rows.length, min: MIN_SEASON_AWARDS },
    confidence: confidenceOf(rows.length, 60, 30),
    score: Math.min(100, sharePct + Math.min(20, rows.length / 3)),
    links: region ? [{ label: "market", href: intelMarketPath(trade.slug, provinceSlug(region)) }] : [],
    data: {
      months: counts.map((n, i) => ({ month: i + 1, n })),
      peak: { fromMonth: best.start + 1, toMonth: ((best.start + SEASON_SPAN - 1) % 12) + 1, n: best.n, sharePct },
      span: SEASON_SPAN,
      historyFrom,
      excluded: all.length - rows.length,
    },
  };
}

/* ------------------------------------------------------------------ price */

export function detectPriceBand(data: InsightData, region: string, trade: TradeRef): PriceBandFact | InsightGap {
  const country = provinceCountry(region);
  const b = computeBenchmark(data.benchmarkAwards, { trade: trade.name, province: region }, data.today);
  if (!b.stats) return gap("price_band", country, region, trade, b.valued ? "too-few" : "no-data", b.valued, MIN_RANGE_AWARDS);
  return {
    id: idOf("price_band", country, region, trade, data.today.slice(0, 7)),
    kind: "price_band",
    tier: "pro",
    personas: PERSONAS_FOR.price_band,
    country,
    region,
    trade,
    from: b.from,
    to: b.to,
    sample: { n: b.stats.n, min: MIN_RANGE_AWARDS },
    confidence: confidenceOf(b.stats.n, 25, 10),
    score: Math.min(100, 45 + Math.min(35, b.stats.n * 2)),
    links: [{ label: "benchmark", href: benchmarkPath(trade.slug, region) }],
    data: { n: b.stats.n, p25: b.stats.p25, median: b.stats.median, p75: b.stats.p75, currency: b.currency },
  };
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = (s.length - 1) / 2;
  return Math.round((s[Math.floor(m)] + s[Math.ceil(m)]) / 2);
};

export function detectPriceMove(data: InsightData, region: string, trade: TradeRef): PriceMoveFact | InsightGap {
  const country = provinceCountry(region);
  const b = computeBenchmark(data.benchmarkAwards, { trade: trade.name, province: region }, data.today);
  const splitDate = addMonths(data.today, -PRICE_RECENT_MONTHS);
  // Feeds that cover at least PRICE_RECENT_MONTHS before the split, so the earlier side isn't missing a feed.
  const starts = awardFeedStarts(
    data.benchmarkAwards.map((a) => ({ country: a.country, sourceKey: a.sourceKey, date: a.date })),
    country,
  );
  const covered = new Set([...starts.entries()].filter(([, s]) => s <= addMonths(splitDate, -PRICE_RECENT_MONTHS)).map(([k]) => k));
  const valued = b.awards.filter((a) => a.amount !== null && covered.has(a.sourceKey));
  const recent = valued.filter((a) => a.date > splitDate).map((a) => a.amount!);
  const earlier = valued.filter((a) => a.date <= splitDate).map((a) => a.amount!);
  if (recent.length < MIN_PRICE_SIDE || earlier.length < MIN_PRICE_SIDE) {
    const reason = b.valued === 0 ? "no-data" : valued.length < b.valued && earlier.length < MIN_PRICE_SIDE ? "short-history" : "too-few";
    return gap("price_move", country, region, trade, reason, Math.min(recent.length, earlier.length), MIN_PRICE_SIDE);
  }
  const rm = median(recent);
  const em = median(earlier);
  const changePct = pctChange(rm, em) ?? 0;
  const direction = Math.abs(changePct) < PRICE_MOVE_PCT ? "steady" : changePct > 0 ? "up" : "down";
  const n = recent.length + earlier.length;
  return {
    id: idOf("price_move", country, region, trade, data.today.slice(0, 7)),
    kind: "price_move",
    tier: "intel",
    personas: PERSONAS_FOR.price_move,
    country,
    region,
    trade,
    from: b.from,
    to: b.to,
    sample: { n, min: MIN_PRICE_SIDE * 2 },
    confidence: confidenceOf(Math.min(recent.length, earlier.length), 15, 8),
    score: Math.min(100, (direction === "steady" ? 25 : 40 + Math.min(40, Math.abs(changePct) / 2)) + Math.min(15, n / 3)),
    links: [{ label: "benchmark", href: benchmarkPath(trade.slug, region) }],
    data: { recentMedian: rm, earlierMedian: em, recentN: recent.length, earlierN: earlier.length, changePct, direction, splitDate, currency: b.currency },
  };
}

/* ------------------------------------------------------------------ buyers */

export function detectBuyerSurge(data: InsightData, country: CountryCode, region: string | null, trade: TradeRef): BuyerSurgeFact | InsightGap {
  const to = dayAdd(data.today, -1);
  const recentFrom = dayAdd(to, -(SURGE_DAYS - 1));
  const starts = feedStarts(data.rfps, country);
  const byBuyer = new Map<string, { name: string; src: string; recent: number; before: number }>();
  for (const r of data.rfps) {
    if (r.isDemo || isPastContract(r) || rfpMarket(r) !== country || !inRegion(provinceOfRfp(r), region) || !r.categories.includes(trade.name)) continue;
    const d = r.publishedAt?.slice(0, 10);
    const name = tenderBuyer(r.summary);
    if (!d || !name) continue;
    const src = sourceKeyOf(r);
    const start = starts.get(src);
    if (!start || d < start || d > to) continue; // before PMRFP read the feed = backfill, not pace
    const key = `${src}|${buyerKeyOf(name)}`;
    const e = byBuyer.get(key) ?? { name, src, recent: 0, before: 0 };
    if (d >= recentFrom) e.recent++;
    else e.before++;
    byBuyer.set(key, e);
  }
  let best: (BuyerSurgeFact["data"] & { ratio: number }) | null = null;
  for (const e of byBuyer.values()) {
    const start = starts.get(e.src)!;
    const months = Math.floor(daysBetween(start, recentFrom) / 30.4);
    if (months < SURGE_MIN_MONTHS || e.recent < SURGE_MIN_RECENT) continue;
    const usual = Math.round((e.before / months) * 10) / 10;
    if (e.recent < SURGE_RATIO * Math.max(usual, 0.5) || e.recent < usual + 2) continue;
    const ratio = e.recent / Math.max(usual, 0.5);
    if (!best || ratio > best.ratio) best = { buyer: e.name, recent: e.recent, recentDays: SURGE_DAYS, usualPerMonth: usual, months, ratio };
  }
  if (!best) return gap("buyer_surge", country, region, trade, byBuyer.size ? "too-few" : "no-data", byBuyer.size, 1);
  const { ratio, ...d } = best;
  return {
    id: idOf("buyer_surge", country, region, trade, to.slice(0, 7), buyerKeyOf(d.buyer)),
    kind: "buyer_surge",
    tier: "intel",
    personas: PERSONAS_FOR.buyer_surge,
    country,
    region,
    trade,
    from: dayAdd(recentFrom, -Math.round(d.months * 30.4)),
    to,
    sample: { n: d.recent, min: SURGE_MIN_RECENT },
    confidence: confidenceOf(d.months, 9, 5),
    score: Math.min(100, 40 + ratio * 8),
    links: [{ label: d.buyer, href: tradeLink(trade) }],
    data: d,
  };
}

export function detectIncumbentStreaks(data: InsightData, country: CountryCode, region: string | null, trade: TradeRef, max = 2): IncumbentStreakFact[] {
  const rows = data.awards.filter((a) => a.country === country && inRegion(a.province, region) && a.tradeSlugs.includes(trade.slug) && a.buyerKey);
  const byBuyer = new Map<string, IntelAward[]>();
  for (const a of rows) byBuyer.set(a.buyerKey!, [...(byBuyer.get(a.buyerKey!) ?? []), a]);
  const slugOf = new Map(data.refs.filter((r) => r.country === country).map((r) => [r.key, r.slug]));
  const out: IncumbentStreakFact[] = [];
  for (const [key, list] of byBuyer) {
    const sorted = [...list].sort((a, b) => b.date.localeCompare(a.date) || a.slug.localeCompare(b.slug));
    const first = sorted[0];
    if (!first.winnerKey || !first.winner) continue;
    let streak = 0;
    for (const a of sorted) {
      if (a.winnerKey !== first.winnerKey) break;
      streak++;
    }
    if (streak < MIN_STREAK) continue;
    const from = sorted[sorted.length - 1].date;
    out.push({
      id: idOf("incumbent_streak", country, region, trade, first.date, key),
      kind: "incumbent_streak",
      tier: "intel",
      personas: PERSONAS_FOR.incumbent_streak,
      country,
      region,
      trade,
      from,
      to: first.date,
      sample: { n: sorted.length, min: MIN_STREAK },
      confidence: confidenceOf(streak, 4, 3),
      score: Math.min(100, 35 + streak * 12 + Math.min(15, sorted.length * 2)),
      links: [
        ...(slugOf.get(key) ? [{ label: first.buyer ?? "", href: intelBuyerPath(slugOf.get(key)!) }] : []),
        ...(first.winnerSlug ? [{ label: first.winner, href: intelCompanyPath(first.winnerSlug) }] : []),
      ],
      data: {
        buyer: first.buyer ?? "",
        buyerSlug: slugOf.get(key) ?? null,
        winner: first.winner,
        winnerSlug: first.winnerSlug,
        streak,
        buyerAwards: sorted.length,
        lastDate: first.date,
      },
    });
  }
  return out.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id)).slice(0, max);
}

/* ------------------------------------------------------------------ projects & GCs */

const PROJECT_KINDS = new Set(["project", "permit", "application"]);

export function detectNewProjects(data: InsightData, country: CountryCode, trades: TradeRef[]): NewProjectsFact | InsightGap {
  const week = lastCompleteWeek(data.today);
  const leads = (data.leads ?? []).filter((l) => PROJECT_KINDS.has(l.kind) && l.seen && l.seen.slice(0, 10) >= week.from && l.seen.slice(0, 10) <= week.to);
  if (!leads.length) return gap("new_projects", country, null, null, "no-data", 0, 1);
  const sorted = [...leads].sort((a, b) => b.score - a.score || (b.valueCad ?? 0) - (a.valueCad ?? 0) || a.key.localeCompare(b.key));
  const k = (kind: string) => leads.filter((l) => l.kind === kind).length;
  return {
    id: idOf("new_projects", country, null, trades[0] ?? null, week.from),
    kind: "new_projects",
    tier: "free",
    personas: PERSONAS_FOR.new_projects,
    country,
    region: null,
    trade: trades[0] ?? null,
    from: week.from,
    to: week.to,
    sample: { n: leads.length, min: 1 },
    confidence: "high",
    score: Math.min(100, 45 + leads.length * 8),
    links: [{ label: "leads", href: "/dashboard" }],
    data: {
      count: leads.length,
      projects: k("project"),
      permits: k("permit"),
      applications: k("application"),
      withGc: leads.filter((l) => l.hasContractor).length,
      items: sorted.slice(0, 3).map((l) => ({ name: l.title, href: l.href, kind: l.kind as "project" | "permit" | "application", city: l.city, valueCad: l.valueCad, date: l.seen?.slice(0, 10) ?? null })),
    },
  };
}

const GC_SLUG = "general-contracting";

export function detectGcNamed(data: InsightData, country: CountryCode, region: string | null): GcNamedFact | InsightGap {
  const from = dayAdd(data.today, -GC_DAYS);
  const rows = data.awards
    .filter((a) => a.country === country && inRegion(a.province, region) && a.tradeSlugs.includes(GC_SLUG) && a.winner && a.date > from && a.date <= data.today)
    .sort((a, b) => (b.amount ?? 0) - (a.amount ?? 0) || b.date.localeCompare(a.date) || a.slug.localeCompare(b.slug));
  if (!rows.length) return gap("gc_named", country, region, null, "no-data", 0, 1);
  return {
    id: idOf("gc_named", country, region, null, data.today.slice(0, 7)),
    kind: "gc_named",
    tier: "pro",
    personas: PERSONAS_FOR.gc_named,
    country,
    region,
    trade: null,
    from,
    to: data.today,
    sample: { n: rows.length, min: 1 },
    confidence: "high",
    score: Math.min(100, 40 + rows.length * 6),
    links: [{ label: "gc-hub", href: "/gc-hub" }],
    data: {
      count: rows.length,
      items: rows.slice(0, 3).map((a) => ({ winner: a.winner!, title: a.title, href: `/rfps/${a.slug}`, amount: a.amount, date: a.date })),
      currency: rows[0].currency,
      days: GC_DAYS,
    },
  };
}

/* ------------------------------------------------------------------ renewals & wins */

export function detectRenewals(data: InsightData, country: CountryCode, region: string | null, trade: TradeRef): RenewalsFact | InsightGap {
  const items = renewalRadar(data.awards, { country, today: data.today, province: region, trade: trade.slug, horizon: RENEWAL_HORIZON });
  if (!items.length) return gap("renewals", country, region, trade, "no-data", 0, 1);
  const stated = items.filter((i) => i.term.source !== "typical").length;
  return {
    id: idOf("renewals", country, region, trade, data.today.slice(0, 7)),
    kind: "renewals",
    tier: "pro",
    personas: PERSONAS_FOR.renewals,
    country,
    region,
    trade,
    from: items.reduce((m, i) => (i.award.date < m ? i.award.date : m), items[0].award.date),
    to: data.today,
    sample: { n: items.length, min: 1 },
    // Mostly estimated from a typical term: say so with the confidence too.
    confidence: stated * 2 >= items.length ? "medium" : "low",
    score: Math.min(100, 50 + items.length * 6),
    links: [{ label: "radar", href: `${INTEL_RENEWALS_PATH}?trade=${encodeURIComponent(trade.slug)}${region ? `&province=${encodeURIComponent(provinceSlug(region))}` : ""}` }],
    data: {
      count: items.length,
      horizonMonths: RENEWAL_HORIZON,
      soonest: items[0].windowStart,
      stated,
      typicalTermYears: TYPICAL_TERM_YEARS,
      items: items.slice(0, 3).map((i) => ({
        title: i.award.title,
        href: `/rfps/${i.award.slug}`,
        buyer: i.award.buyer,
        incumbent: i.award.winner,
        windowStart: i.windowStart,
        expectedRebid: i.expectedRebid,
        stated: i.term.source !== "typical",
      })),
    },
  };
}

export function detectCompetitorWins(data: InsightData, country: CountryCode, region: string | null, trade: TradeRef): CompetitorWinsFact | InsightGap {
  const from = dayAdd(data.today, -WINS_DAYS);
  const rows = data.awards.filter((a) => a.country === country && inRegion(a.province, region) && a.tradeSlugs.includes(trade.slug) && a.date > from && a.date <= data.today);
  if (rows.length < MIN_WINS) return gap("competitor_wins", country, region, trade, rows.length ? "too-few" : "no-data", rows.length, MIN_WINS);
  const m = new Map<string, { name: string; slug: string | null; wins: number; value: number }>();
  for (const a of rows) {
    if (!a.winnerKey || !a.winner) continue;
    const e = m.get(a.winnerKey) ?? { name: a.winner, slug: a.winnerSlug, wins: 0, value: 0 };
    e.wins++;
    e.value += a.amount ?? 0;
    m.set(a.winnerKey, e);
  }
  const valued = rows.filter((a) => a.amount !== null);
  return {
    id: idOf("competitor_wins", country, region, trade, data.today.slice(0, 7)),
    kind: "competitor_wins",
    tier: "pro",
    personas: PERSONAS_FOR.competitor_wins,
    country,
    region,
    trade,
    from,
    to: data.today,
    sample: { n: rows.length, min: MIN_WINS },
    confidence: confidenceOf(rows.length, 10, 4),
    score: Math.min(100, 40 + rows.length * 5),
    links: region ? [{ label: "market", href: intelMarketPath(trade.slug, provinceSlug(region)) }] : [],
    data: {
      count: rows.length,
      valued: valued.length,
      total: valued.reduce((s, a) => s + a.amount!, 0),
      days: WINS_DAYS,
      currency: rows[0].currency,
      winners: [...m.values()].sort((a, b) => b.wins - a.wins || b.value - a.value || a.name.localeCompare(b.name)).slice(0, 3),
    },
  };
}

/* ------------------------------------------------------------------ all detectors */

const isGap = (x: unknown): x is InsightGap => typeof x === "object" && x !== null && !("id" in x);

/**
 * Every detector for one scope. Province first; volume, seasonality and
 * recent wins fall back to the whole country (same country, never the other
 * one) when the province alone is too thin. At most 3 trades.
 */
export function runDetectors(data: InsightData, scope: InsightScope): DetectorResult {
  const facts: DetectorResult["facts"] = [];
  const gaps: InsightGap[] = [];
  const push = (r: DetectorResult["facts"][number] | InsightGap) => (isGap(r) ? gaps.push(r) : facts.push(r));
  const provinces = scope.provinces.filter((p) => provinceCountry(p) === scope.country).slice(0, 2);
  const primary = provinces[0] ?? null;

  for (const trade of scope.trades.slice(0, 3)) {
    const withFallback = (f: (region: string | null) => DetectorResult["facts"][number] | InsightGap) => {
      const local = primary ? f(primary) : null;
      if (local && !isGap(local)) return push(local);
      const wide = f(null);
      if (!isGap(wide)) return push(wide);
      push(local ?? wide);
    };
    withFallback((r) => detectVolume(data, scope.country, r, trade));
    withFallback((r) => detectSeasonality(data, scope.country, r, trade));
    withFallback((r) => detectCompetitorWins(data, scope.country, r, trade));
    if (primary) {
      push(detectPriceBand(data, primary, trade));
      push(detectPriceMove(data, primary, trade));
    }
    push(detectRenewals(data, scope.country, primary, trade));
    push(detectBuyerSurge(data, scope.country, primary, trade));
    for (const s of detectIncumbentStreaks(data, scope.country, primary, trade)) facts.push(s);
  }
  push(detectGcNamed(data, scope.country, primary));
  if (data.leads) push(detectNewProjects(data, scope.country, scope.trades));
  return { facts, gaps };
}
