/**
 * "More from this buyer" and "Same trade nearby" under a tender (depth plan,
 * Step 2, block 9). Pure: both read the board snapshot the page already holds.
 *
 * Nearby means the listing's own province/state (Canada and the U.S. are
 * never mixed), the same city or region first. A listing in no known
 * province/state has nothing "nearby".
 */
import { areaOf, fold } from "@/lib/data/related-listings";
import { rfpMarket } from "@/lib/visitor-geo";
import type { BuyerOpenBid } from "@/lib/buyers/model";
import type { RfpListItem } from "@/lib/data/types";

type Row = Pick<RfpListItem, "slug" | "title" | "status" | "categories" | "regionName" | "province" | "city" | "deadline" | "sourceType">;

export const MORE_FROM_BUYER = 3;
export const NEARBY = 4;

/** The buyer's other open bids on the board, soonest closing first, never this one. */
export function moreFromBuyer(openBids: readonly BuyerOpenBid[], currentSlug: string, limit = MORE_FROM_BUYER): BuyerOpenBid[] {
  return openBids.filter((b) => b.slug !== currentSlug).slice(0, limit);
}

/**
 * Open listings in the same trade (any of its trades) and the same province/
 * state, closest first: same city, then same region, then soonest to close.
 * Award notices and closed tenders carry a past date, so they are not "open".
 */
export function sameTradeNearby<T extends Row>(
  board: readonly T[],
  listing: Row,
  provinceOfRegion: ReadonlyMap<string, string | null>,
  limit = NEARBY,
): T[] {
  const area = areaOf(listing, provinceOfRegion);
  if (!area || !listing.categories.length) return [];
  const market = rfpMarket(listing);
  const key = fold(area);
  const rank = (r: T) =>
    (listing.city && r.city && r.city.toLowerCase() === listing.city.toLowerCase() ? 2 : 0) +
    (listing.regionName && r.regionName === listing.regionName ? 1 : 0);
  return board
    .filter(
      (r) =>
        r.slug !== listing.slug &&
        r.status === "open" &&
        rfpMarket(r) === market &&
        fold(areaOf(r, provinceOfRegion) ?? "") === key &&
        r.categories.some((c) => listing.categories.includes(c)),
    )
    .sort((a, b) => rank(b) - rank(a) || (a.deadline ?? "9999").localeCompare(b.deadline ?? "9999"))
    .slice(0, limit);
}
