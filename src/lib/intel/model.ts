/**
 * AWARD INTELLIGENCE: competitor profiles, buyer profiles, market share and
 * the renewal radar, computed from the REAL public award notices already on
 * the board (the rows behind /contract-winners, /benchmarks and the monthly
 * reports). Pure: the loader (./load.ts) feeds it the shared board snapshot,
 * so these pages add no database queries of their own.
 *
 * Rules (same as the rest of the award pages):
 *  - Country-first, never mixed: every profile, table and CSV is one country
 *    and one currency (CAD for Canada, USD for the U.S.). An award whose
 *    disclosed currency doesn't match its country is dropped.
 *  - Values are as disclosed by the buyer; awards without a usable value
 *    (under MIN_USABLE_AMOUNT) count as awards but add nothing to dollars.
 *  - Companies only: individuals (a person's name in the "awarded to" field)
 *    are counted as "individual (not named)", never named or profiled.
 *  - Honest history: the board keeps a rolling window of award notices, so
 *    trends and "new entrant" flags say when the records start instead of
 *    pretending the company is new.
 */
import { isPastContract } from "@/lib/data/fomo";
import { buyerFromSummary } from "@/lib/data/monthly-winners";
import { isPublishableWinner, winnerKey, winnersFromRfps } from "@/lib/data/winners";
import { MIN_USABLE_AMOUNT, canonicalProvince, currencyOf, parseAwardValue, percentile, provinceCountry, type Currency } from "@/lib/data/price-benchmarks";
import { officialNoticeFromSlug } from "@/lib/gc/official";
import { publicTenderSource } from "@/lib/tenders/sources";
import { slugify } from "@/lib/tenders/shared";
import { rfpMarket, type CountryCode } from "@/lib/visitor-geo";
import type { RfpListItem } from "@/lib/data/types";

export type { Currency };

/** CAD for Canada, USD for the U.S. */
export const currencyOfCountry = (country: CountryCode): Currency => currencyOf(country);

/* ------------------------------------------------------------------ awards */

export interface IntelAward {
  slug: string;
  title: string;
  buyer: string | null;
  /** Grouping key for the buyer (lower-case, no accents), or null. */
  buyerKey: string | null;
  /** Publishable company name, or null for an individual (counted, not named). */
  winner: string | null;
  winnerKey: string | null;
  /** The company's slug (its /contract-winners and /intel/companies page). */
  winnerSlug: string | null;
  /** The company also has a public /contract-winners/<slug> page. */
  winnerPublic: boolean;
  /** Usable disclosed value (≥ MIN_USABLE_AMOUNT), else null. */
  amount: number | null;
  /** Award date, YYYY-MM-DD. */
  date: string;
  country: CountryCode;
  currency: Currency;
  /** Province/state of the work, or null (e.g. a federal award with no place of work). */
  province: string | null;
  city: string | null;
  /** Trade display names (the board's categories). */
  trades: string[];
  /** Trade slugs, same order as `trades`. */
  tradeSlugs: string[];
  sourceKey: string;
  attribution: string;
  noticeUrl: string | null;
  noticeExact: boolean;
}

export interface IntelContext {
  /** Region display name → its province/state (regions table); fills a missing rfp.province. */
  regionProvince?: Map<string, string | null>;
  /** Trade display name → slug (taxonomy). Falls back to slugify(name). */
  tradeSlug?: Map<string, string>;
}

/** "Ville de Montréal" ≡ "VILLE DE MONTREAL". */
export function buyerKeyOf(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9&]+/g, " ")
    .trim();
}

/** Every past public contract on the board with a winner and a dated award, in its own country's currency. */
export function intelAwards(rfps: RfpListItem[], ctx: IntelContext = {}): IntelAward[] {
  // Same slugs as the public /contract-winners pages, so a profile links both ways.
  const profiles = new Map(winnersFromRfps(rfps, 1).map((w) => [winnerKey(w.name), w.slug]));
  const publicKeys = new Set(profiles.keys());
  const used = new Set(profiles.values());
  const out: IntelAward[] = [];
  for (const r of rfps) {
    if (!isPastContract(r)) continue;
    const date = r.deadline?.slice(0, 10) ?? "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const { winner, amount, currency } = parseAwardValue(r.summary);
    if (!winner) continue;
    const regionProv = r.regionName ? ctx.regionProvince?.get(r.regionName) ?? null : null;
    const province = canonicalProvince(r.province) ?? canonicalProvince(regionProv) ?? canonicalProvince(r.regionName);
    const country: CountryCode = province ? provinceCountry(province) : rfpMarket(r);
    if (currency && currency !== currencyOf(country)) continue;
    const city = (r.city?.trim() || null) ?? (r.regionName && province && canonicalProvince(regionProv) === province && r.regionName !== province ? r.regionName : null);
    const publishable = isPublishableWinner(winner) ? winner : null;
    const wKey = publishable ? winnerKey(publishable) || null : null;
    // Winners the public pages don't cover (their parser reads CAD notices only,
    // e.g. U.S. awards in USD) still get an intel profile slug of their own.
    if (wKey && !profiles.has(wKey)) {
      const base = slugify(publishable!).slice(0, 80) || "company";
      let s = base;
      for (let i = 2; used.has(s); i++) s = `${base}-${i}`;
      used.add(s);
      profiles.set(wKey, s);
    }
    const buyer = buyerFromSummary(r.summary);
    const src = publicTenderSource(r.slug);
    const notice = officialNoticeFromSlug(r.slug);
    out.push({
      slug: r.slug,
      title: r.title,
      buyer,
      buyerKey: buyer ? buyerKeyOf(buyer) || null : null,
      winner: publishable,
      winnerKey: wKey,
      winnerSlug: wKey ? profiles.get(wKey) ?? null : null,
      winnerPublic: wKey ? publicKeys.has(wKey) : false,
      amount: amount !== null && amount >= MIN_USABLE_AMOUNT ? amount : null,
      date,
      country,
      currency: currencyOf(country),
      province,
      city,
      trades: r.categories,
      tradeSlugs: r.categories.map((n) => ctx.tradeSlug?.get(n) ?? slugify(n)),
      sourceKey: src.key,
      attribution: src.attribution,
      noticeUrl: notice?.url ?? null,
      noticeExact: notice?.exact ?? false,
    });
  }
  return out.sort((a, b) => b.date.localeCompare(a.date) || a.slug.localeCompare(b.slug));
}

/* ------------------------------------------------------------------ dates */

/** YYYY-MM-DD shifted by whole months (day clamped to the month's length). */
export function addMonths(date: string, months: number): string {
  const [y, m, d] = date.slice(0, 10).split("-").map(Number);
  const total = y * 12 + (m - 1) + months;
  const yy = Math.floor(total / 12);
  const mm = (total % 12) + 1;
  const last = new Date(Date.UTC(yy, mm, 0)).getUTCDate();
  return `${yy}-${String(mm).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}`;
}

/** Earliest award date on record in a country: where PMRFP's history starts. */
export function historyStart(all: readonly IntelAward[], country: CountryCode): string | null {
  let min: string | null = null;
  for (const a of all) if (a.country === country && (min === null || a.date < min)) min = a.date;
  return min;
}

/* ------------------------------------------------------------------ tallies */

export interface Tally {
  key: string;
  name: string;
  /** Company slug (winners) or buyer slug (buyers), when it has a page. */
  slug: string | null;
  awards: number;
  /** Awards with a disclosed value. */
  valued: number;
  /** Disclosed value only. */
  value: number;
}

function tally(rows: readonly IntelAward[], pick: (a: IntelAward) => { key: string; name: string; slug?: string | null }[]): Tally[] {
  const m = new Map<string, Tally>();
  for (const a of rows) {
    for (const p of pick(a)) {
      const e = m.get(p.key) ?? { key: p.key, name: p.name, slug: p.slug ?? null, awards: 0, valued: 0, value: 0 };
      e.awards++;
      if (a.amount !== null) {
        e.valued++;
        e.value += a.amount;
      }
      m.set(p.key, e);
    }
  }
  return [...m.values()].sort((a, b) => b.awards - a.awards || b.value - a.value || a.name.localeCompare(b.name));
}

const byWinner = (a: IntelAward) => (a.winnerKey && a.winner ? [{ key: a.winnerKey, name: a.winner, slug: a.winnerSlug }] : []);
const byTrade = (a: IntelAward) => a.trades.map((t, i) => ({ key: a.tradeSlugs[i] ?? slugify(t), name: t, slug: a.tradeSlugs[i] ?? null }));
const byProvince = (a: IntelAward) => (a.province ? [{ key: a.province, name: a.province }] : []);
const byCity = (a: IntelAward) => (a.city ? [{ key: a.city.toLowerCase(), name: a.city }] : []);

export interface YearRow {
  year: string;
  awards: number;
  valued: number;
  value: number;
}

function byYear(rows: readonly IntelAward[]): YearRow[] {
  const m = new Map<string, YearRow>();
  for (const a of rows) {
    const year = a.date.slice(0, 4);
    const e = m.get(year) ?? { year, awards: 0, valued: 0, value: 0 };
    e.awards++;
    if (a.amount !== null) {
      e.valued++;
      e.value += a.amount;
    }
    m.set(year, e);
  }
  return [...m.values()].sort((a, b) => a.year.localeCompare(b.year));
}

export interface ValueStats {
  awards: number;
  valued: number;
  total: number;
  average: number | null;
  median: number | null;
}

/** Totals over disclosed values; average/median need at least one valued award. */
export function valueStats(rows: readonly IntelAward[]): ValueStats {
  const values = rows.map((a) => a.amount).filter((v): v is number => v !== null).sort((a, b) => a - b);
  const total = values.reduce((s, v) => s + v, 0);
  return {
    awards: rows.length,
    valued: values.length,
    total,
    average: values.length ? Math.round(total / values.length) : null,
    median: values.length ? Math.round(percentile(values, 0.5)) : null,
  };
}

/* ------------------------------------------------------------------ trend */

export type TrendDirection = "up" | "down" | "flat" | "new" | "quiet" | "short-history";

export interface Trend {
  last12: { awards: number; value: number };
  prev12: { awards: number; value: number };
  /** Start of the previous-12-month window, YYYY-MM-DD. */
  prevFrom: string;
  direction: TrendDirection;
  /** Change in award count, percent (null without a base). */
  changePct: number | null;
}

/**
 * Last 12 months vs the 12 before, by award count. "short-history" when
 * PMRFP's records don't reach back to the start of the previous window (an
 * empty previous year then means "not on record yet", not "new company").
 */
export function trendOf(rows: readonly IntelAward[], today: string, historyFrom: string | null): Trend {
  const lastFrom = addMonths(today, -12);
  const prevFrom = addMonths(today, -24);
  const last = rows.filter((a) => a.date > lastFrom && a.date <= today);
  const prev = rows.filter((a) => a.date > prevFrom && a.date <= lastFrom);
  const sum = (xs: IntelAward[]) => ({ awards: xs.length, value: xs.reduce((s, a) => s + (a.amount ?? 0), 0) });
  const l = sum(last);
  const p = sum(prev);
  let direction: TrendDirection;
  let changePct: number | null = null;
  if (!historyFrom || historyFrom > addMonths(prevFrom, 1)) direction = "short-history";
  else if (p.awards === 0 && l.awards === 0) direction = "quiet";
  else if (p.awards === 0) direction = "new";
  else {
    changePct = Math.round(((l.awards - p.awards) / p.awards) * 100);
    direction = changePct >= 15 ? "up" : changePct <= -15 ? "down" : "flat";
  }
  return { last12: l, prev12: p, prevFrom, direction, changePct };
}

/* ------------------------------------------------------------------ companies */

/** A company or buyer needs this many awards in a country to appear in the intel indexes. */
export const MIN_INDEX_AWARDS = 3;

export interface CompanyProfile {
  slug: string;
  name: string;
  country: CountryCode;
  currency: Currency;
  stats: ValueStats;
  firstDate: string | null;
  lastDate: string | null;
  historyFrom: string | null;
  byYear: YearRow[];
  buyers: Tally[];
  trades: Tally[];
  provinces: Tally[];
  cities: Tally[];
  trend: Trend;
  /** Every award in this country, newest first. */
  awards: IntelAward[];
  /** Has a public /contract-winners page too. */
  publicPage: boolean;
  /** Awards on record in the other country (shown as a link, never mixed in). */
  otherCountryAwards: number;
}

/** The company's profile in one country; null when the slug isn't a company on record. */
export function companyProfile(all: readonly IntelAward[], slug: string, country: CountryCode, today: string): CompanyProfile | null {
  const mine = all.filter((a) => a.winnerSlug === slug);
  if (!mine.length) return null;
  const here = mine.filter((a) => a.country === country);
  const names = new Map<string, number>();
  for (const a of mine) if (a.winner) names.set(a.winner, (names.get(a.winner) ?? 0) + 1);
  const name = [...names.entries()].sort((a, b) => Number(/[a-z]/.test(b[0])) - Number(/[a-z]/.test(a[0])) || b[1] - a[1])[0]?.[0] ?? slug;
  const historyFrom = historyStart(all, country);
  return {
    slug,
    name,
    country,
    currency: currencyOf(country),
    stats: valueStats(here),
    firstDate: here.length ? here[here.length - 1].date : null,
    lastDate: here[0]?.date ?? null,
    historyFrom,
    byYear: byYear(here),
    buyers: tally(here, (a) => (a.buyerKey && a.buyer ? [{ key: a.buyerKey, name: a.buyer, slug: null }] : [])),
    trades: tally(here, byTrade),
    provinces: tally(here, byProvince),
    cities: tally(here, byCity),
    trend: trendOf(here, today, historyFrom),
    awards: [...here].sort((a, b) => b.date.localeCompare(a.date) || a.slug.localeCompare(b.slug)),
    otherCountryAwards: mine.length - here.length,
    publicPage: mine.some((a) => a.winnerPublic),
  };
}

export interface CompanyIndexRow extends Tally {
  buyers: number;
  lastDate: string;
}

/** Companies with MIN_INDEX_AWARDS+ awards in a country, most awards first. */
export function companyIndex(all: readonly IntelAward[], country: CountryCode, min = MIN_INDEX_AWARDS): CompanyIndexRow[] {
  const rows = all.filter((a) => a.country === country);
  return tally(rows, byWinner)
    .filter((t) => t.awards >= min && t.slug)
    .map((t) => {
      const mine = rows.filter((a) => a.winnerKey === t.key);
      return { ...t, buyers: new Set(mine.map((a) => a.buyerKey).filter(Boolean)).size, lastDate: mine[0]?.date ?? "" };
    });
}

/* ------------------------------------------------------------------ buyers */

export interface BuyerRef {
  key: string;
  name: string;
  slug: string;
  country: CountryCode;
}

/**
 * Stable buyer slugs per country: slugify(name), a collision gets "-2", "-3"
 * in order of award count (so the busiest buyer keeps the plain slug).
 */
export function buyerRefs(all: readonly IntelAward[]): BuyerRef[] {
  const groups = new Map<string, { key: string; country: CountryCode; names: Map<string, number>; n: number }>();
  for (const a of all) {
    if (!a.buyerKey || !a.buyer) continue;
    const k = `${a.country}|${a.buyerKey}`;
    const g = groups.get(k) ?? { key: a.buyerKey, country: a.country, names: new Map<string, number>(), n: 0 };
    g.names.set(a.buyer, (g.names.get(a.buyer) ?? 0) + 1);
    g.n++;
    groups.set(k, g);
  }
  const used = new Set<string>();
  const out: BuyerRef[] = [];
  const ordered = [...groups.values()].sort((a, b) => b.n - a.n || a.key.localeCompare(b.key));
  for (const g of ordered) {
    const name = [...g.names.entries()].sort((a, b) => Number(/[a-z]/.test(b[0])) - Number(/[a-z]/.test(a[0])) || b[1] - a[1])[0][0];
    const base = (slugify(name).slice(0, 80) || "buyer") + (g.country === "US" ? "-us" : "");
    let slug = base;
    for (let i = 2; used.has(slug); i++) slug = `${base}-${i}`;
    used.add(slug);
    out.push({ key: g.key, name, slug, country: g.country });
  }
  return out;
}

export interface TradeYearRow {
  trade: string;
  tradeSlug: string;
  years: Record<string, { awards: number; value: number }>;
  awards: number;
  value: number;
}

export interface BuyerProfile {
  slug: string;
  name: string;
  country: CountryCode;
  currency: Currency;
  stats: ValueStats;
  firstDate: string | null;
  lastDate: string | null;
  historyFrom: string | null;
  byYear: YearRow[];
  byTrade: Tally[];
  /** Spend by trade and year (years ascending in `years`). */
  tradeYear: TradeYearRow[];
  years: string[];
  /** Companies that won this buyer's work more than once. */
  incumbents: Tally[];
  /** Every named company that won this buyer's work. */
  suppliers: Tally[];
  /** Awards that went to individuals (counted, never named). */
  individuals: number;
  provinces: Tally[];
  awards: IntelAward[];
}

export function buyerProfile(all: readonly IntelAward[], ref: BuyerRef): BuyerProfile {
  const rows = all.filter((a) => a.country === ref.country && a.buyerKey === ref.key);
  const years = [...new Set(rows.map((a) => a.date.slice(0, 4)))].sort();
  const ty = new Map<string, TradeYearRow>();
  for (const a of rows) {
    a.trades.forEach((t, i) => {
      const slug = a.tradeSlugs[i] ?? slugify(t);
      const e = ty.get(slug) ?? { trade: t, tradeSlug: slug, years: {}, awards: 0, value: 0 };
      const y = a.date.slice(0, 4);
      const cell = e.years[y] ?? { awards: 0, value: 0 };
      cell.awards++;
      cell.value += a.amount ?? 0;
      e.years[y] = cell;
      e.awards++;
      e.value += a.amount ?? 0;
      ty.set(slug, e);
    });
  }
  const suppliers = tally(rows, byWinner);
  return {
    slug: ref.slug,
    name: ref.name,
    country: ref.country,
    currency: currencyOf(ref.country),
    stats: valueStats(rows),
    firstDate: rows.length ? rows[rows.length - 1].date : null,
    lastDate: rows[0]?.date ?? null,
    historyFrom: historyStart(all, ref.country),
    byYear: byYear(rows),
    byTrade: tally(rows, byTrade),
    tradeYear: [...ty.values()].sort((a, b) => b.value - a.value || b.awards - a.awards || a.trade.localeCompare(b.trade)),
    years,
    incumbents: suppliers.filter((s) => s.awards >= 2),
    suppliers,
    individuals: rows.filter((a) => !a.winner).length,
    provinces: tally(rows, byProvince),
    awards: [...rows].sort((a, b) => b.date.localeCompare(a.date) || a.slug.localeCompare(b.slug)),
  };
}

export interface BuyerIndexRow extends Tally {
  suppliers: number;
  lastDate: string;
}

export function buyerIndex(all: readonly IntelAward[], refs: readonly BuyerRef[], country: CountryCode, min = MIN_INDEX_AWARDS): BuyerIndexRow[] {
  const slugOf = new Map(refs.filter((r) => r.country === country).map((r) => [r.key, r.slug]));
  const rows = all.filter((a) => a.country === country);
  return tally(rows, (a) => (a.buyerKey && a.buyer ? [{ key: a.buyerKey, name: a.buyer, slug: slugOf.get(a.buyerKey) ?? null }] : []))
    .filter((t) => t.awards >= min && t.slug)
    .map((t) => {
      const mine = rows.filter((a) => a.buyerKey === t.key);
      return { ...t, name: refs.find((r) => r.country === country && r.key === t.key)?.name ?? t.name, suppliers: new Set(mine.map((a) => a.winnerKey ?? `individual:${a.slug}`)).size, lastDate: mine[0]?.date ?? "" };
    });
}

/* ------------------------------------------------------------------ market share */

export type Concentration = "thin" | "low" | "moderate" | "high";

/** Fewer awards than this in a trade × province: no concentration verdict. */
export const MIN_MARKET_AWARDS = 5;

export interface MarketWinner extends Tally {
  /** Share of the market's awards (0–100, one decimal). */
  shareCount: number;
  /** Share of the market's disclosed value (0–100), null without values. */
  shareValue: number | null;
  firstDate: string;
}

export interface MarketShare {
  trade: string;
  tradeSlug: string;
  province: string;
  country: CountryCode;
  currency: Currency;
  from: string | null;
  to: string | null;
  historyFrom: string | null;
  stats: ValueStats;
  /** Named companies, by award count. */
  winners: MarketWinner[];
  individuals: number;
  top3ShareCount: number;
  top3ShareValue: number | null;
  /** Herfindahl–Hirschman index (0–10,000) on value when 5+ awards have one, else on count. */
  hhi: number | null;
  hhiBasis: "value" | "count";
  concentration: Concentration;
  /** Calendar year judged for new entrants. */
  year: string;
  /** First award on record in this market is this calendar year. */
  newEntrants: MarketWinner[];
  /** True when PMRFP's records start after Jan 1 of the previous year (so "new" = first on record). */
  shortHistory: boolean;
}

const pct1 = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0);

export function marketShare(all: readonly IntelAward[], tradeSlug: string, province: string, today: string): MarketShare | null {
  const country = provinceCountry(province);
  const rows = all.filter((a) => a.country === country && a.province === province && a.tradeSlugs.includes(tradeSlug));
  const tradeName = rows[0]?.trades[rows[0].tradeSlugs.indexOf(tradeSlug)] ?? null;
  if (!tradeName) return null;
  const stats = valueStats(rows);
  const first = new Map<string, string>();
  for (const a of rows) if (a.winnerKey && (!first.has(a.winnerKey) || a.date < first.get(a.winnerKey)!)) first.set(a.winnerKey, a.date);
  const winners: MarketWinner[] = tally(rows, byWinner).map((t) => ({
    ...t,
    shareCount: pct1(t.awards, rows.length),
    shareValue: stats.total > 0 ? pct1(t.value, stats.total) : null,
    firstDate: first.get(t.key) ?? "",
  }));
  const useValue = stats.valued >= MIN_MARKET_AWARDS && stats.total > 0;
  // Individuals are many separate sellers: each counts as its own 1-award share.
  const individuals = rows.filter((a) => !a.winner);
  const shares = useValue
    ? [...winners.map((w) => (w.value / stats.total) * 100), ...individuals.map((a) => ((a.amount ?? 0) / stats.total) * 100)]
    : [...winners.map((w) => (w.awards / rows.length) * 100), ...individuals.map(() => (1 / rows.length) * 100)];
  const hhi = rows.length ? Math.round(shares.reduce((s, x) => s + x * x, 0)) : null;
  const concentration: Concentration =
    rows.length < MIN_MARKET_AWARDS || hhi === null ? "thin" : hhi > 1800 ? "high" : hhi >= 1000 ? "moderate" : "low";
  const year = today.slice(0, 4);
  const historyFrom = historyStart(all, country);
  const byValue = [...winners].sort((a, b) => b.value - a.value);
  return {
    trade: tradeName,
    tradeSlug,
    province,
    country,
    currency: currencyOf(country),
    from: rows.length ? rows[rows.length - 1].date : null,
    to: rows[0]?.date ?? null,
    historyFrom,
    stats,
    winners,
    individuals: individuals.length,
    top3ShareCount: pct1(winners.slice(0, 3).reduce((s, w) => s + w.awards, 0), rows.length),
    top3ShareValue: stats.total > 0 ? pct1(byValue.slice(0, 3).reduce((s, w) => s + w.value, 0), stats.total) : null,
    hhi,
    hhiBasis: useValue ? "value" : "count",
    concentration,
    year,
    newEntrants: winners.filter((w) => w.firstDate.startsWith(year)),
    shortHistory: !historyFrom || historyFrom > `${Number(year) - 1}-01-31`,
  };
}

export interface MarketIndexRow {
  trade: string;
  tradeSlug: string;
  province: string;
  awards: number;
  winners: number;
}

/** Trade × province markets in a country with at least `min` awards, busiest first. */
export function marketIndex(all: readonly IntelAward[], country: CountryCode, min = MIN_INDEX_AWARDS): MarketIndexRow[] {
  const m = new Map<string, { trade: string; tradeSlug: string; province: string; awards: number; winners: Set<string> }>();
  for (const a of all) {
    if (a.country !== country || !a.province) continue;
    a.trades.forEach((t, i) => {
      const slug = a.tradeSlugs[i] ?? slugify(t);
      const k = `${slug}|${a.province}`;
      const e = m.get(k) ?? { trade: t, tradeSlug: slug, province: a.province!, awards: 0, winners: new Set<string>() };
      e.awards++;
      if (a.winnerKey) e.winners.add(a.winnerKey);
      m.set(k, e);
    });
  }
  return [...m.values()]
    .filter((e) => e.awards >= min)
    .map((e) => ({ trade: e.trade, tradeSlug: e.tradeSlug, province: e.province, awards: e.awards, winners: e.winners.size }))
    .sort((a, b) => b.awards - a.awards || a.trade.localeCompare(b.trade) || a.province.localeCompare(b.province));
}

/* ------------------------------------------------------------------ renewal radar */

/**
 * Recurring service trades: work a buyer re-tenders on a cycle. HVAC and fire
 * safety only count when the title says it's maintenance/inspection work (a
 * boiler replacement is a one-off project, not a renewal).
 */
export const RENEWAL_TRADES: readonly { slug: string; titleMust?: RegExp }[] = [
  { slug: "snow-removal" },
  { slug: "cleaning-janitorial" },
  { slug: "landscaping" },
  { slug: "waste-removal" },
  { slug: "security-systems" },
  { slug: "elevator-services", titleMust: /mainten|entretien|servic|inspect/i },
  { slug: "hvac", titleMust: /mainten|entretien|servic|preventi|préventi|inspect|o\s*&\s*m/i },
  { slug: "pest-control" },
  { slug: "fire-safety", titleMust: /inspect|test|mainten|entretien|servic|monitor|vérification|annual/i },
];

/** Assumed contract term when the notice doesn't state one. */
export const TYPICAL_TERM_YEARS = 3;
/** The rebid is usually published this many months before the next award date. */
export const RETENDER_LEAD_MONTHS = 4;
/** Renewal-radar candidates: awards up to this old. */
export const RADAR_MAX_AGE_YEARS = 5;
export const RADAR_HORIZONS = [12, 24, 36] as const;
export type RadarHorizon = (typeof RADAR_HORIZONS)[number] | "all";

export type TermSource = "stated-years" | "stated-seasons" | "stated-duration" | "typical";

export interface TermEstimate {
  source: TermSource;
  /** Base term in months: stated, or TYPICAL_TERM_YEARS × 12. */
  months: number;
  /** Option years stated on top of the base term ("plus 2 option years", "3+2"), in months. */
  optionMonths: number | null;
  /** First/last year of a stated period ("2026-2029", "hivers 2026-2027 à 2029-2030"). */
  startYear: number | null;
  endYear: number | null;
  /** Stated number of seasons ("six winter seasons", "3 saisons"). */
  seasons: number | null;
}

const NUM = "(\\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|un|une|deux|trois|quatre|cinq|sept|huit|neuf|dix)";
const WORD_NUM: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, sept: 7, huit: 8, neuf: 9, dix: 10,
};
const toNum = (s: string) => (/^\d+$/.test(s) ? Number(s) : WORD_NUM[s.toLowerCase()] ?? NaN);
/** "two (2)" → one number: skip the bracketed repeat. */
const BRACKET = "\\s*(?:\\(\\d{1,2}\\)\\s*)?";

const OPTION_RES = [
  // "plus two (2) option years", "with 2 one-year options", "2 additional option years", "two renewal options"
  new RegExp(`\\b${NUM}${BRACKET}(?:additional\\s+)?(?:(?:one|1)[- ]year\\s+)?(?:renewal\\s+)?(?:option(?:al)?\\s*(?:years?|periods?|renewals?)|options?)\\b`, "i"),
  // "deux (2) années d'option", "2 années optionnelles", "2 ans d'option"
  new RegExp(`\\b${NUM}${BRACKET}(?:années?|ans)\\s*(?:d['’]options?|optionnelles?)`, "i"),
];

/**
 * What the notice text says about the contract term (and option years), or
 * the "typical" 3-year estimate. Today that text is the notice title (the
 * board snapshot keeps no full notice text); pass more text when there is any.
 * Year periods win, then "N+M", then seasons, then durations. A "2026-03"
 * style reference number is not a period: the second year must come after
 * the first, within ten years, and the period must start within a year of
 * the award.
 */
export function parseTerm(text: string, awardDate: string): TermEstimate {
  const awardYear = Number(awardDate.slice(0, 4));
  const base = { optionMonths: null as number | null, startYear: null as number | null, endYear: null as number | null, seasons: null as number | null };

  let options: number | null = null;
  let rest = text;
  for (const re of OPTION_RES) {
    const m = rest.match(re);
    if (m) {
      const k = toNum(m[1]);
      if (k >= 1 && k <= 5) options = k * 12;
      rest = rest.replace(m[0], " ");
      break;
    }
  }
  // "3+2" / "3 + 2 years" / "3+1+1": base years plus option years.
  const plus = rest.match(/\b([1-9])\s*\+\s*([1-5])(?:\s*\+\s*([1-5]))?(?:\s*(?:years?|ans|yrs?)\b)?(?!\s*(?:%|\$|m\b|\d))/i);
  if (plus) {
    const opt = Number(plus[2]) + (plus[3] ? Number(plus[3]) : 0);
    return { ...base, source: "stated-duration", months: Number(plus[1]) * 12, optionMonths: opt * 12 };
  }

  const ranges: [number, number][] = [];
  // "2026-2029", "2025/2026", "2026-27", "hivers 2026-2027 à 2029-2030", "2026/2027-2027/2028".
  for (const m of rest.matchAll(/\b(20\d\d)\s*[-–/]\s*(20\d\d|\d\d)\b/g)) {
    const y1 = Number(m[1]);
    const y2 = m[2].length === 2 ? Math.floor(y1 / 100) * 100 + Number(m[2]) : Number(m[2]);
    if (y2 > y1 && y2 - y1 <= 10) ranges.push([y1, y2]);
  }
  // "26-27,27-28,28-29": two-digit seasons.
  if (!ranges.length) {
    for (const m of rest.matchAll(/\b(\d\d)-(\d\d)\b/g)) {
      const y1 = 2000 + Number(m[1]);
      const y2 = 2000 + Number(m[2]);
      if (y2 === y1 + 1) ranges.push([y1, y2]);
    }
  }
  if (ranges.length) {
    const start = Math.min(...ranges.map((r) => r[0]));
    const end = Math.max(...ranges.map((r) => r[1]));
    if (Math.abs(start - awardYear) <= 1 && end - start <= 10) {
      return { ...base, source: "stated-years", months: (end - start) * 12, optionMonths: options, startYear: start, endYear: end };
    }
  }

  const seasons = rest.match(new RegExp(`\\b${NUM}${BRACKET}(?:winter\\s+|snow\\s+)?(?:seasons?|saisons?)\\b`, "i"));
  if (seasons) {
    const k = toNum(seasons[1]);
    if (k >= 1 && k <= 10) return { ...base, source: "stated-seasons", months: k * 12, optionMonths: options, seasons: k };
  }
  const years = rest.match(new RegExp(`\\b${NUM}${BRACKET}[- ]?(?:years?|yrs?|ans|années)\\b`, "i"));
  if (years) {
    const k = toNum(years[1]);
    if (k >= 1 && k <= 10) return { ...base, source: "stated-duration", months: k * 12, optionMonths: options };
  }
  const months = rest.match(/\b(\d{1,3})\s*[- ]?\s*(?:months?|mois)\b/i);
  if (months) {
    const mo = Number(months[1]);
    if (mo >= 6 && mo <= 120) return { ...base, source: "stated-duration", months: mo, optionMonths: options };
  }
  return { ...base, source: "typical", months: TYPICAL_TERM_YEARS * 12, optionMonths: options };
}

export type RenewalStatus = "past" | "due" | "upcoming" | "later";

export interface RenewalItem {
  award: IntelAward;
  /** The recurring trade that put it on the radar. */
  trade: string;
  tradeSlug: string;
  term: TermEstimate;
  /** Expected next award: same time of year as this award, one base term later (YYYY-MM-DD). */
  expectedRebid: string;
  /**
   * Likely rebid window, YYYY-MM-DD: opens RETENDER_LEAD_MONTHS before the
   * expected rebid; with stated option years it stays open until the options
   * would run out.
   */
  windowStart: string;
  windowEnd: string;
  status: RenewalStatus;
  /** Months from today to the window start (negative once it has opened). */
  monthsAway: number;
}

const monthsBetween = (from: string, to: string) => {
  const [y1, m1] = from.split("-").map(Number);
  const [y2, m2] = to.split("-").map(Number);
  return (y2 - y1) * 12 + (m2 - m1);
};

/**
 * The radar entry for one award, or null when it isn't recurring service
 * work. The rebid is expected in the same month as this award, one term
 * later: buyers re-tender seasonal work at the same time of year (snow
 * clearing is awarded May–August), so the window lands in the right months.
 */
export function renewalFor(a: IntelAward, today: string): RenewalItem | null {
  const hit = RENEWAL_TRADES.find((t) => a.tradeSlugs.includes(t.slug) && (!t.titleMust || t.titleMust.test(a.title)));
  if (!hit) return null;
  if (a.date < addMonths(today, -RADAR_MAX_AGE_YEARS * 12) || a.date > today) return null;
  const term = parseTerm(a.title, a.date);
  const expectedRebid = addMonths(a.date, term.months);
  const windowStart = addMonths(expectedRebid, -RETENDER_LEAD_MONTHS);
  const windowEnd = term.optionMonths ? addMonths(expectedRebid, term.optionMonths) : expectedRebid;
  const status: RenewalStatus = windowEnd < today ? "past" : windowStart <= today ? "due" : windowStart <= addMonths(today, 12) ? "upcoming" : "later";
  const i = a.tradeSlugs.indexOf(hit.slug);
  return { award: a, trade: a.trades[i] ?? hit.slug, tradeSlug: hit.slug, term, expectedRebid, windowStart, windowEnd, status, monthsAway: monthsBetween(today, windowStart) };
}

/** Months of the year (1–12) the expected rebids fall in, with counts ("snow rebids cluster May–Aug"). */
export function rebidMonths(items: readonly RenewalItem[]): { month: number; items: number }[] {
  const m = new Map<number, number>();
  for (const it of items) {
    const k = Number(it.expectedRebid.slice(5, 7));
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return [...m.entries()].map(([month, n]) => ({ month, items: n })).sort((a, b) => a.month - b.month);
}

/** How many awards state their term in the notice (any non-typical source), for the coverage report. */
export function termStatedShare(all: readonly IntelAward[], country: CountryCode, onlyRecurring = false): { awards: number; stated: number; withOptions: number } {
  let stated = 0;
  let withOptions = 0;
  let n = 0;
  for (const a of all) {
    if (a.country !== country) continue;
    if (onlyRecurring && !RENEWAL_TRADES.some((t) => a.tradeSlugs.includes(t.slug) && (!t.titleMust || t.titleMust.test(a.title)))) continue;
    n++;
    const t = parseTerm(a.title, a.date);
    if (t.source !== "typical") stated++;
    if (t.optionMonths) withOptions++;
  }
  return { awards: n, stated, withOptions };
}

export interface RadarFilters {
  country: CountryCode;
  today: string;
  trade?: string | null;
  province?: string | null;
  /** Buyer key (buyerKeyOf). */
  buyer?: string | null;
  horizon?: RadarHorizon;
}

/**
 * Recurring-service contracts likely coming up for re-tender in one country,
 * soonest window first. A horizon of N months keeps windows that are open now
 * or open within N months; "all" also keeps windows that have passed.
 */
export function renewalRadar(all: readonly IntelAward[], f: RadarFilters): RenewalItem[] {
  const horizon = f.horizon ?? 12;
  const until = horizon === "all" ? null : addMonths(f.today, horizon);
  const out: RenewalItem[] = [];
  for (const a of all) {
    if (a.country !== f.country) continue;
    if (f.province && a.province !== f.province) continue;
    if (f.buyer && a.buyerKey !== f.buyer) continue;
    const item = renewalFor(a, f.today);
    if (!item) continue;
    if (f.trade && item.tradeSlug !== f.trade) continue;
    if (horizon !== "all" && (item.status === "past" || (until && item.windowStart > until))) continue;
    out.push(item);
  }
  return out.sort((a, b) => a.windowStart.localeCompare(b.windowStart) || (b.award.amount ?? 0) - (a.award.amount ?? 0) || a.award.slug.localeCompare(b.award.slug));
}

export function parseHorizon(v: string | null | undefined): RadarHorizon {
  if (v === "all") return "all";
  const n = Number(v);
  return (RADAR_HORIZONS as readonly number[]).includes(n) ? (n as RadarHorizon) : 12;
}

/** Radar items per recurring trade (counts only). */
export function renewalCounts(items: readonly RenewalItem[]): { tradeSlug: string; trade: string; items: number }[] {
  const m = new Map<string, { tradeSlug: string; trade: string; items: number }>();
  for (const it of items) {
    const e = m.get(it.tradeSlug) ?? { tradeSlug: it.tradeSlug, trade: it.trade, items: 0 };
    e.items++;
    m.set(it.tradeSlug, e);
  }
  return [...m.values()].sort((a, b) => b.items - a.items || a.trade.localeCompare(b.trade));
}

/* ------------------------------------------------------------------ coverage */

export interface IntelCoverage {
  country: CountryCode;
  awards: number;
  companies: number;
  /** Companies with MIN_INDEX_AWARDS+ awards. */
  companies3: number;
  buyers: number;
  buyers3: number;
  markets: number;
  /** Radar items with a window open now or within 12 months. */
  renewals12: number;
  /** … within 24 months. */
  renewals24: number;
  renewalsByTrade: { tradeSlug: string; trade: string; items: number }[];
  historyFrom: string | null;
}

/** The real numbers behind the /intel landing page and the coverage report. */
export function intelCoverage(all: readonly IntelAward[], refs: readonly BuyerRef[], country: CountryCode, today: string): IntelCoverage {
  const rows = all.filter((a) => a.country === country);
  const radar = renewalRadar(all, { country, today, horizon: 12 });
  return {
    country,
    awards: rows.length,
    companies: new Set(rows.map((a) => a.winnerKey).filter(Boolean)).size,
    companies3: companyIndex(all, country).length,
    buyers: new Set(rows.map((a) => a.buyerKey).filter(Boolean)).size,
    buyers3: buyerIndex(all, refs, country).length,
    markets: marketIndex(all, country).length,
    renewals12: radar.length,
    renewals24: renewalRadar(all, { country, today, horizon: 24 }).length,
    renewalsByTrade: renewalCounts(radar),
    historyFrom: historyStart(all, country),
  };
}

/** Point buyer tallies (company profiles) at their /intel/buyers pages. */
export function linkBuyers(rows: readonly Tally[], refs: readonly BuyerRef[], country: CountryCode): Tally[] {
  const slug = new Map(refs.filter((r) => r.country === country).map((r) => [r.key, r.slug]));
  return rows.map((r) => ({ ...r, slug: slug.get(r.key) ?? null }));
}
