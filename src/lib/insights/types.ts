import type { CountryCode } from "@/lib/visitor-geo";
import type { Persona } from "@/lib/lifecycle/persona";

/**
 * INSIGHTS: plain-language facts computed from PMRFP's own data (the board
 * snapshot, award notices, price benchmarks, major projects, the renewal
 * radar). Every fact is a typed record with its numbers, the names it
 * mentions, the dates it covers, its sample size and links to the rows
 * behind it. Sentences are written FROM these records (./copy.ts), and an
 * optional AI polish is only kept when it adds nothing that isn't in the
 * record (./validator.ts). Nothing here forecasts or advises.
 */

export type { Persona };

export const INSIGHT_KINDS = [
  "volume",
  "seasonality",
  "price_band",
  "price_move",
  "buyer_surge",
  "incumbent_streak",
  "new_projects",
  "gc_named",
  "renewals",
  "competitor_wins",
] as const;
export type InsightKind = (typeof INSIGHT_KINDS)[number];

/**
 * Who sees a fact in full: free = everyone (public counts), pro = Trade Pro
 * and trial, intel = Award Intelligence. Lower tiers get a teaser built
 * from a whitelist of fields (./gating.ts), never the full record.
 */
export type InsightTier = "free" | "pro" | "intel";

export type Confidence = "high" | "medium" | "low";

export interface InsightLink {
  /** Shown text: a project, buyer or company name, or a fixed label key. */
  label: string;
  /** Internal path ("/rfps/…", "/intel/…") or an official source URL. */
  href: string;
  external?: boolean;
}

export interface TradeRef {
  slug: string;
  /** Display name as the board stores it (English); copy translates it. */
  name: string;
}

interface FactBase<K extends InsightKind, D> {
  /** Stable id: kind|country|region|trade|period. Same data, same id. */
  id: string;
  kind: K;
  tier: InsightTier;
  /** Personas this fact matters to (ranking, ./engine.ts). */
  personas: readonly Persona[];
  country: CountryCode;
  /** Province / state name, or null when the fact is country-wide. */
  region: string | null;
  trade: TradeRef | null;
  /** Data window behind the fact, YYYY-MM-DD. */
  from: string;
  to: string;
  /** Rows behind the fact and the minimum the detector requires. */
  sample: { n: number; min: number };
  confidence: Confidence;
  /** 0–100 before persona weighting: bigger moves and bigger samples rank higher. */
  score: number;
  links: InsightLink[];
  data: D;
}

/** New listings posted in the last complete week vs the week before (and vs the same week last year when history reaches that far). */
export type VolumeFact = FactBase<
  "volume",
  {
    current: number;
    previous: number;
    /** Percent change vs the previous week (rounded), null without a base. */
    changePct: number | null;
    direction: "up" | "down" | "steady";
    prevFrom: string;
    prevTo: string;
    /** Same ISO week a year earlier. */
    lastYear: { status: "ok"; count: number; changePct: number | null } | { status: "no-history"; historyFrom: string | null };
    /** Feeds left out because PMRFP started reading them inside the comparison window. */
    excludedSources: number;
  }
>;

/** When in the year this trade's public contracts get awarded (award dates on record). */
export type SeasonalityFact = FactBase<
  "seasonality",
  {
    /** Awards per calendar month 1–12. */
    months: { month: number; n: number }[];
    /** The busiest run of `span` consecutive months. */
    peak: { fromMonth: number; toMonth: number; n: number; sharePct: number };
    span: number;
    historyFrom: string;
    /** Awards in scope left out because their source holds less than a year of records. */
    excluded: number;
  }
>;

/** The trade × province price band (24-month price benchmark, 5+ valued awards). */
export type PriceBandFact = FactBase<
  "price_band",
  { n: number; p25: number; median: number; p75: number; currency: "CAD" | "USD" }
>;

/** Median of the latest awards vs the earlier ones in the same benchmark window. */
export type PriceMoveFact = FactBase<
  "price_move",
  {
    recentMedian: number;
    earlierMedian: number;
    recentN: number;
    earlierN: number;
    changePct: number;
    direction: "up" | "down" | "steady";
    splitDate: string;
    currency: "CAD" | "USD";
  }
>;

/** A buyer posting more tenders in the trade than its own usual monthly pace. */
export type BuyerSurgeFact = FactBase<
  "buyer_surge",
  { buyer: string; recent: number; recentDays: number; usualPerMonth: number; months: number }
>;

/** The same company won a buyer's last N awards in the trade. */
export type IncumbentStreakFact = FactBase<
  "incumbent_streak",
  { buyer: string; buyerSlug: string | null; winner: string; winnerSlug: string | null; streak: number; buyerAwards: number; lastDate: string }
>;

export interface ProjectItem {
  name: string;
  href: string;
  kind: "project" | "permit" | "application";
  city: string | null;
  valueCad: number | null;
  date: string | null;
}

/** Major projects, permits and development applications new in the area last week. */
export type NewProjectsFact = FactBase<
  "new_projects",
  { count: number; projects: number; permits: number; applications: number; withGc: number; items: ProjectItem[] }
>;

/** General contractors who just won public building work in the area (they hire subs next). */
export type GcNamedFact = FactBase<
  "gc_named",
  { count: number; items: { winner: string; title: string; href: string; amount: number | null; date: string }[]; currency: "CAD" | "USD"; days: number }
>;

/** Recurring-service contracts likely up for rebid (Award Intelligence renewal radar). */
export type RenewalsFact = FactBase<
  "renewals",
  {
    count: number;
    horizonMonths: number;
    /** Earliest window start, YYYY-MM-DD. */
    soonest: string;
    /** Items whose term was stated in the notice (the rest use the typical-term estimate). */
    stated: number;
    /** The typical term used when a notice states none. */
    typicalTermYears: number;
    items: { title: string; href: string; buyer: string | null; incumbent: string | null; windowStart: string; expectedRebid: string; stated: boolean }[];
  }
>;

/** Who won the trade's public contracts in the area lately. */
export type CompetitorWinsFact = FactBase<
  "competitor_wins",
  {
    count: number;
    valued: number;
    total: number;
    days: number;
    currency: "CAD" | "USD";
    winners: { name: string; slug: string | null; wins: number; value: number }[];
  }
>;

export type InsightFact =
  | VolumeFact
  | SeasonalityFact
  | PriceBandFact
  | PriceMoveFact
  | BuyerSurgeFact
  | IncumbentStreakFact
  | NewProjectsFact
  | GcNamedFact
  | RenewalsFact
  | CompetitorWinsFact;

export type FactOf<K extends InsightKind> = Extract<InsightFact, { kind: K }>;

/**
 * A detector that couldn't say anything honest: the reason is shown where a
 * reader would otherwise expect the fact ("not enough history yet").
 */
export interface InsightGap {
  kind: InsightKind;
  country: CountryCode;
  region: string | null;
  trade: TradeRef | null;
  reason: "no-data" | "too-few" | "short-history";
  sample: { n: number; min: number };
}

export interface DetectorResult {
  facts: InsightFact[];
  gaps: InsightGap[];
}
