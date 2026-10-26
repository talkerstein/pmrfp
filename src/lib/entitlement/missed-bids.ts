import { freeDigestMatches } from "@/lib/alerts/country";
import type { CountryCode } from "@/lib/visitor-geo";

/**
 * "Bids you missed" for free members: how many bids in THEIR trades and
 * region were posted in the last 7 days, how many are still open, how many
 * already closed. It is the Monday free roundup's own match
 * (freeDigestMatches: trades, region roll-up, one country, Canada and the
 * U.S. never mixed), so the dashboard card, the email and the daily Pro
 * alerts all agree. Pure and unit-tested (test/unit/trial-first.test.ts).
 *
 * No invented numbers: nothing matched = null, and the card is not drawn.
 */

export const MISSED_WINDOW_DAYS = 7;
export const MISSED_TITLES_SHOWN = 3;

export interface MissedRfp {
  id: string;
  title: string;
  slug: string;
  deadline: string | null;
  region_id: string | null;
  province?: string | null;
  rfp_categories: { category_id: string }[];
}

export interface MissedOrg {
  categories: ReadonlySet<string>;
  /** Already rolled up to include sub-regions (expandRegionIds). */
  regions: ReadonlySet<string>;
  countries: ReadonlySet<CountryCode>;
}

export interface MissedBids {
  /** Posted this week and still open. */
  openCount: number;
  /** Posted this week and already past their closing date. */
  closedCount: number;
  /** The first few open ones, soonest closing first (no closing date last). */
  shown: { title: string; slug: string; deadline: string | null }[];
}

/** Is the bid still open on `today` (YYYY-MM-DD)? No closing date counts as open, as in the digest. */
export function isStillOpen(deadline: string | null | undefined, today: string): boolean {
  return !deadline || deadline >= today;
}

/**
 * `rfps` are the published, non-demo bids posted in the last 7 days (the
 * caller reads them). Returns null when no OPEN bid matched.
 */
export function computeMissedBids(
  rfps: readonly MissedRfp[],
  org: MissedOrg,
  nationalIds: ReadonlySet<string>,
  byRegion: ReadonlyMap<string, CountryCode>,
  today: string,
): MissedBids | null {
  if (!org.categories.size) return null;
  const matched = freeDigestMatches(rfps, org, nationalIds, byRegion);
  const open = matched.filter((r) => isStillOpen(r.deadline, today));
  if (open.length === 0) return null;
  const shown = [...open]
    .sort((a, b) => (a.deadline ?? "9999-12-31").localeCompare(b.deadline ?? "9999-12-31") || a.title.localeCompare(b.title))
    .slice(0, MISSED_TITLES_SHOWN)
    .map((r) => ({ title: r.title, slug: r.slug, deadline: r.deadline }));
  return { openCount: open.length, closedCount: matched.length - open.length, shown };
}
