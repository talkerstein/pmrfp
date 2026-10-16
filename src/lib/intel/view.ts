/**
 * What a viewer WITHOUT Intel gets (free accounts, Trade Pro, signed out):
 * counts, one example row and a blurred placeholder table. Totals, values,
 * shares, trends, buyer/supplier lists, renewal windows beyond the example —
 * none of it is in these objects, so none of it can reach their HTML.
 * Pages build the full object, then hand ONLY the teaser to the renderer.
 */
import type { CountryCode } from "@/lib/visitor-geo";
import type {
  BuyerIndexRow,
  BuyerProfile,
  CompanyIndexRow,
  CompanyProfile,
  Currency,
  IntelAward,
  MarketIndexRow,
  MarketShare,
  RenewalItem,
  RenewalStatus,
  TermEstimate,
} from "./model";

/** One public award notice, as shown in an example row. */
export interface ExampleAward {
  slug: string;
  title: string;
  buyer: string | null;
  winner: string | null;
  winnerSlug: string | null;
  amount: number | null;
  currency: Currency;
  date: string;
  province: string | null;
  city: string | null;
  noticeUrl: string | null;
  noticeExact: boolean;
}

export function toExample(a: IntelAward): ExampleAward {
  return {
    slug: a.slug,
    title: a.title,
    buyer: a.buyer,
    winner: a.winner,
    winnerSlug: a.winnerSlug,
    amount: a.amount,
    currency: a.currency,
    date: a.date,
    province: a.province,
    city: a.city,
    noticeUrl: a.noticeUrl,
    noticeExact: a.noticeExact,
  };
}

/** Rows hidden behind the blur, capped so a big number of fake rows never renders. */
export const BLUR_ROWS = 4;

export interface CompanyTeaser {
  slug: string;
  name: string;
  country: CountryCode;
  awards: number;
  buyers: number;
  trades: number;
  provinces: number;
  example: ExampleAward | null;
  otherCountryAwards: number;
  publicPage: boolean;
}

export function companyTeaser(p: CompanyProfile): CompanyTeaser {
  return {
    slug: p.slug,
    name: p.name,
    country: p.country,
    awards: p.stats.awards,
    buyers: p.buyers.length,
    trades: p.trades.length,
    provinces: p.provinces.length,
    example: p.awards[0] ? toExample(p.awards[0]) : null,
    otherCountryAwards: p.otherCountryAwards,
    publicPage: p.publicPage,
  };
}

export interface BuyerTeaser {
  slug: string;
  name: string;
  country: CountryCode;
  awards: number;
  suppliers: number;
  trades: number;
  example: ExampleAward | null;
}

export function buyerTeaser(p: BuyerProfile): BuyerTeaser {
  return {
    slug: p.slug,
    name: p.name,
    country: p.country,
    awards: p.stats.awards,
    suppliers: p.suppliers.length + p.individuals,
    trades: p.byTrade.length,
    example: p.awards[0] ? toExample(p.awards[0]) : null,
  };
}

export interface MarketTeaser {
  trade: string;
  tradeSlug: string;
  province: string;
  country: CountryCode;
  awards: number;
  winners: number;
  example: ExampleAward | null;
}

export function marketTeaser(m: MarketShare, newest: IntelAward | null): MarketTeaser {
  return {
    trade: m.trade,
    tradeSlug: m.tradeSlug,
    province: m.province,
    country: m.country,
    awards: m.stats.awards,
    winners: m.winners.length,
    example: newest ? toExample(newest) : null,
  };
}

export interface RenewalExample {
  award: ExampleAward;
  trade: string;
  term: TermEstimate;
  status: RenewalStatus;
  windowStart: string;
  windowEnd: string;
}

export interface RenewalTeaser {
  country: CountryCode;
  items: number;
  byTrade: { tradeSlug: string; trade: string; items: number }[];
  example: RenewalExample | null;
}

export function renewalTeaser(country: CountryCode, items: readonly RenewalItem[], byTrade: RenewalTeaser["byTrade"]): RenewalTeaser {
  const first = items[0];
  return {
    country,
    items: items.length,
    byTrade,
    example: first ? { award: toExample(first.award), trade: first.trade, term: first.term, status: first.status, windowStart: first.windowStart, windowEnd: first.windowEnd } : null,
  };
}

/** Index pages (companies, buyers, markets): the count and the first row's name. */
export interface IndexTeaser {
  country: CountryCode;
  total: number;
  example: { name: string; awards: number } | null;
}

export function indexTeaser(country: CountryCode, rows: readonly (CompanyIndexRow | BuyerIndexRow | MarketIndexRow)[], nameOf: (r: CompanyIndexRow | BuyerIndexRow | MarketIndexRow) => string): IndexTeaser {
  return { country, total: rows.length, example: rows[0] ? { name: nameOf(rows[0]), awards: rows[0].awards } : null };
}

export type IntelView<Full, Teaser> = { intel: true; data: Full } | { intel: false; data: Teaser };

export function intelView<Full, Teaser>(full: Full, intel: boolean, toTeaser: (f: Full) => Teaser): IntelView<Full, Teaser> {
  return intel ? { intel: true, data: full } : { intel: false, data: toTeaser(full) };
}
