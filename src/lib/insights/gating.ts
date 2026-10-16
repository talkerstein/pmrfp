import type { CountryCode } from "@/lib/visitor-geo";
import type { InsightFact, InsightKind, InsightTier, TradeRef } from "./types";

/**
 * Who sees what. Two separate entitlements, from the central helpers only
 * (session.hasTradeAccess = Trade Pro or trial, session.hasIntelAccess =
 * Award Intelligence; lib/access/access → lib/entitlement/*):
 *
 *   free member / visitor  ONE headline insight a week (a free-tier fact),
 *                          everything else as a teaser
 *   Trade Pro / trial      free + pro facts in full; Intel parts redacted
 *   Award Intelligence     intel facts in full (and the Intel parts of pro
 *                          facts: renewal items, top winners)
 *
 * A teaser is a NEW object built from a whitelist (TEASER_NUMBERS), never
 * the fact with fields hidden by CSS, so gated numbers and names are not in
 * the HTML of a page the viewer isn't entitled to.
 */

export interface Entitlements {
  /** Trade Pro (paid or trial). */
  pro: boolean;
  /** Award Intelligence. */
  intel: boolean;
}

export const FREE_HEADLINES_PER_WEEK = 1;

export function entitlementsOf(s: { hasTradeAccess?: boolean | null; hasIntelAccess?: boolean | null } | null | undefined): Entitlements {
  return { pro: Boolean(s?.hasTradeAccess), intel: Boolean(s?.hasIntelAccess) };
}

export function canSee(tier: InsightTier, e: Entitlements): boolean {
  return tier === "free" || (tier === "pro" && e.pro) || (tier === "intel" && e.intel);
}

/** Numbers a teaser may carry, per kind (counts that are public elsewhere on the site). */
export const TEASER_NUMBERS: Record<InsightKind, readonly string[]> = {
  volume: [],
  seasonality: [],
  price_band: ["n"],
  price_move: [],
  buyer_surge: [],
  incumbent_streak: [],
  new_projects: ["count"],
  gc_named: ["count"],
  renewals: ["count"],
  competitor_wins: ["count"],
};

export interface LockedInsight {
  id: string;
  kind: InsightKind;
  /** What unlocks it: "pro" (Trade Pro), "intel" (Award Intelligence), or "pro" for a free-quota lock. */
  unlock: "pro" | "intel";
  country: CountryCode;
  region: string | null;
  trade: TradeRef | null;
  numbers: Record<string, number>;
}

export type InsightView = { locked: false; fact: InsightFact; intelRedacted: boolean } | { locked: true; stub: LockedInsight };

export function lockFact(f: InsightFact, unlock: "pro" | "intel"): LockedInsight {
  const numbers: Record<string, number> = {};
  const data = f.data as unknown as Record<string, unknown>;
  for (const k of TEASER_NUMBERS[f.kind]) if (typeof data[k] === "number") numbers[k] = data[k] as number;
  return { id: f.id, kind: f.kind, unlock, country: f.country, region: f.region, trade: f.trade ? { ...f.trade } : null, numbers };
}

/** The Intel-only parts of a pro fact removed (renewal items, top winners). */
export function redactIntel(f: InsightFact): InsightFact {
  if (f.kind === "renewals") return { ...f, data: { ...f.data, items: [] }, links: f.links };
  if (f.kind === "competitor_wins") return { ...f, data: { ...f.data, winners: [] } };
  return f;
}

const HAS_INTEL_PARTS: ReadonlySet<InsightKind> = new Set(["renewals", "competitor_wins"]);

/**
 * Ranked facts → what this viewer gets. Without Trade Pro only the first
 * free-tier fact (the week's headline) is open; the rest become teasers.
 */
export function viewFacts(ranked: readonly InsightFact[], e: Entitlements, opts: { freeLimit?: number } = {}): InsightView[] {
  const freeLimit = opts.freeLimit ?? FREE_HEADLINES_PER_WEEK;
  let freeOpen = 0;
  return ranked.map((f): InsightView => {
    if (!canSee(f.tier, e)) return { locked: true, stub: lockFact(f, f.tier === "intel" ? "intel" : "pro") };
    if (!e.pro && f.tier === "free") {
      if (freeOpen >= freeLimit) return { locked: true, stub: lockFact(f, "pro") };
      freeOpen++;
    }
    const redact = HAS_INTEL_PARTS.has(f.kind) && !e.intel;
    return { locked: false, fact: redact ? redactIntel(f) : f, intelRedacted: redact };
  });
}
