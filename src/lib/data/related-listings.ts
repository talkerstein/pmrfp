import { CA_PROVINCE_CODES, rfpMarket } from "@/lib/visitor-geo";
import { US_STATES } from "@/lib/geo";

/**
 * "Similar open RFPs" under a listing. Pure (unit-tested).
 *
 * Scoped like the label says: listings in the same province/state first
 * (same trade first, then soonest deadline), and the count is of open
 * listings in that province/state. Only when the province/state has no other
 * open listing does it fall back to the same trade elsewhere in the SAME
 * country, labelled by trade, never by the province. Canada and the U.S. are
 * never mixed.
 *
 * Fixes the Ontario page that said "4 open in Ontario" and listed Québec
 * tenders: the count was by region and the list by trade.
 */

export interface RelatedRow {
  slug: string;
  status: string;
  categories: string[];
  regionName: string | null;
  province: string | null;
  deadline: string | null;
}

export interface RelatedPick<T extends RelatedRow> {
  items: T[];
  /** "area": items and count are the listing's province/state. "country": same trade, same country. */
  scope: "area" | "country" | "none";
  /** The province/state (full English name) the area scope means, or null. */
  area: string | null;
  /** Open listings in the area, this one included when it's open. */
  areaCount: number;
  /** Open listings in the same trade and country, this one included when it's open. */
  tradeCount: number;
}

/** "Québec", "Quebec", "QC" → "quebec"; "TX", "Texas" → "texas". */
function fold(s: string): string {
  const t = s.trim();
  const named = CA_PROVINCE_CODES[t.toUpperCase()] ?? (t.length === 2 ? US_STATES[t.toUpperCase()] : undefined) ?? t;
  return named.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/**
 * A listing's province/state: its own column, else its region's province.
 * A known region with no province (a national one like "Canada") has no area;
 * an unknown region name is taken as the place itself.
 */
export function areaOf(r: { province: string | null; regionName: string | null }, provinceOfRegion: ReadonlyMap<string, string | null>): string | null {
  const own = r.province?.trim();
  if (own) return own;
  if (!r.regionName) return null;
  return provinceOfRegion.has(r.regionName) ? provinceOfRegion.get(r.regionName) ?? null : r.regionName;
}

export function relatedOpenListings<T extends RelatedRow>(
  board: readonly T[],
  listing: RelatedRow,
  provinceOfRegion: ReadonlyMap<string, string | null>,
  limit = 4,
): RelatedPick<T> {
  const country = rfpMarket(listing);
  const open = board.filter((r) => r.status === "open" && rfpMarket(r) === country);
  const others = open.filter((r) => r.slug !== listing.slug);
  const area = areaOf(listing, provinceOfRegion);
  const key = area ? fold(area) : null;
  const inArea = (r: T) => key !== null && fold(areaOf(r, provinceOfRegion) ?? "") === key;
  const sameTrade = (r: RelatedRow) => listing.categories.some((c) => r.categories.includes(c));
  const self = listing.status === "open" ? 1 : 0;
  const byDeadline = (a: T, b: T) => (a.deadline ?? "9999").localeCompare(b.deadline ?? "9999");

  const areaOthers = others.filter(inArea);
  const areaCount = areaOthers.length + (key ? self : 0);
  const tradeCount = others.filter(sameTrade).length + self;

  if (areaOthers.length) {
    const items = [...areaOthers].sort((a, b) => Number(sameTrade(b)) - Number(sameTrade(a)) || byDeadline(a, b)).slice(0, limit);
    return { items, scope: "area", area, areaCount, tradeCount };
  }
  const items = others.filter(sameTrade).sort(byDeadline).slice(0, limit);
  return { items, scope: items.length ? "country" : "none", area, areaCount, tradeCount };
}

/** The province/state most of these rows are in (ties: first seen), or null. For a winner's awards. */
export function mostCommonArea(rows: readonly { province?: string | null; regionName: string | null }[], provinceOfRegion: ReadonlyMap<string, string | null>): string | null {
  const counts = new Map<string, number>();
  for (const r of rows) {
    const a = areaOf({ province: r.province ?? null, regionName: r.regionName }, provinceOfRegion);
    if (a) counts.set(a, (counts.get(a) ?? 0) + 1);
  }
  let best: string | null = null;
  let n = 0;
  for (const [a, c] of counts) if (c > n) [best, n] = [a, c];
  return best;
}
