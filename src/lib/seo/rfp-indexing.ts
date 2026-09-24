import type { RfpListItem } from "@/lib/data/types";
import { isPastContract } from "@/lib/data/fomo";

/**
 * Should Google index this RFP page? Only while it's open.
 *
 * Search Console, 90 days to Sep 24 2026: the ~1,500 RFP pages (77% of the
 * sitemap) earned 116 impressions in total, while 12 comparison pages earned
 * 1,266. With almost no domain authority, Google crawls little, so every thin
 * page competes with the pages that actually rank. Award notices (~110 words:
 * who won, for how much) and closed tenders are summarized on the stronger
 * /contract-winners, trade and trade × city pages, so they stay reachable
 * (noindex, follow — links still pass) but leave the index and the sitemap.
 * Open RFPs, public or posted by a property manager, are biddable and timely.
 */
export function isIndexableRfp(r: Pick<RfpListItem, "slug" | "sourceType" | "status" | "isDemo">): boolean {
  return !r.isDemo && r.status === "open" && !isPastContract(r);
}
