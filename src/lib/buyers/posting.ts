import type { BuyerPage, PlatformKey } from "./model";
import { publicTenderSource } from "@/lib/tenders/sources";

/**
 * "Where does this buyer post its bids?" for the pages that used to say
 * "Not known yet" although PMRFP already knows.
 *
 * Why (depth study, 2026-10-22): /buyers/ontario/city-of-toronto said "Not
 * known yet" while the City of Toronto's bids come from its own portal. The
 * page for a municipality the research directory doesn't cover (a "town"
 * page, built from the census) only looked at what the buyer typed in after
 * claiming the page, and ignored two things PMRFP holds:
 *   1. a bids page we read for that buyer (KNOWN_BIDS_PAGES), and
 *   2. where its notices on the board were posted (postedOn): a Quebec
 *      municipality whose open bid came from SEAO posts on SEAO.
 * Both are facts from the data, never a guess; a buyer neither covers stays
 * "not known yet".
 */

export interface KnownBidsPage {
  /** The buyer's own official bids page. */
  url: string;
  platforms: PlatformKey[];
}

/**
 * Buyers PMRFP reads that the research directory does not list, by
 * "<provinceCode>/<page slug>". Each URL is the same constant the importer
 * links as the official source (test/unit/list-depth.test.ts keeps them in step).
 */
export const KNOWN_BIDS_PAGES: Readonly<Record<string, KnownBidsPage>> = {
  "ON/city-of-toronto": {
    url: "https://www.toronto.ca/business-economy/doing-business-with-the-city/searching-bidding-on-city-contracts/toronto-bids-portal/",
    platforms: ["own-site"],
  },
};

export function knownBidsPage(provinceCode: string, slug: string): KnownBidsPage | null {
  return KNOWN_BIDS_PAGES[`${provinceCode}/${slug}`] ?? null;
}

/**
 * The portals the buyer's own notices on the board were posted on, most
 * notices first ("SEAO", "the City of Toronto bid portal"). Only sources that
 * name a portal count; CanadaBuys is skipped because a federal portal is not
 * where a municipality posts.
 */
export function postedOn(p: Pick<BuyerPage, "openBids" | "awards">): string[] {
  const counts = new Map<string, number>();
  const slugs = [...p.openBids.map((o) => o.slug), ...p.awards.recent.map((a) => a.slug)];
  for (const slug of slugs) {
    const src = publicTenderSource(slug);
    if (!src.portal || src.key === "canadabuys" || src.key === "canadabuys-closed" || src.key === "awards") continue;
    counts.set(src.portal, (counts.get(src.portal) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([portal]) => portal);
}
