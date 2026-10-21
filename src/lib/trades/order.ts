/**
 * Trade pickers: the trades property managers hire most, first, then every
 * other trade A–Z by its name in the page's language. Same order in English,
 * French and Spanish.
 *
 * Why (persona QA, 2026-10-21): the French RFP writer listed trades in
 * alphabetical order of their French names, so "Toiture" (roofing) sat near
 * the bottom of a long list, while English followed the database order.
 */
export const COMMON_TRADE_SLUGS = [
  "roofing",
  "hvac",
  "electrical",
  "plumbing",
  "cleaning-janitorial",
  "snow-removal",
  "landscaping",
  "general-contracting",
  "property-maintenance",
  "handyman-maintenance",
  "painting",
  "fire-safety",
  "elevator-services",
  "pest-control",
  "concrete-and-asphalt",
  "parking-lot-maintenance",
] as const;

const RANK = new Map<string, number>(COMMON_TRADE_SLUGS.map((s, i) => [s, i]));

/**
 * Common trades first (in COMMON_TRADE_SLUGS order), then the rest sorted by
 * `label` (the trade's name in the page language) with the page's collation.
 */
export function orderTrades<T extends { slug: string }>(trades: readonly T[], label: (t: T) => string, locale: string): T[] {
  return [...trades].sort((a, b) => {
    const ra = RANK.get(a.slug) ?? Number.POSITIVE_INFINITY;
    const rb = RANK.get(b.slug) ?? Number.POSITIVE_INFINITY;
    if (ra !== rb) return ra - rb;
    return label(a).localeCompare(label(b), locale, { sensitivity: "base" });
  });
}
