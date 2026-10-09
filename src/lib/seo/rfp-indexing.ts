import type { RfpListItem } from "@/lib/data/types";
import { isPastContract } from "@/lib/data/fomo";
import { publicTenderSource } from "@/lib/tenders/sources";
import { parseClosedAward } from "@/lib/tenders/canadabuys-closed";

/**
 * Should Google index this RFP page? Only while it's open — plus one kind of
 * closed page: a closed-archive tender that carries its real award.
 *
 * Search Console, 90 days to Sep 24 2026: the ~1,500 RFP pages (77% of the
 * sitemap) earned 116 impressions in total, while 12 comparison pages earned
 * 1,266. With almost no domain authority, Google crawls little, so every thin
 * page competes with the pages that actually rank. Award notices (~110 words:
 * who won, for how much) and closed tenders are summarized on the stronger
 * /contract-winners, trade and trade × city pages, so they stay reachable
 * (noindex, follow — links still pass) but leave the index and the sitemap.
 * Open RFPs, public or posted by a property manager, are biddable and timely.
 *
 * A closed-archive tender with its award joins the full notice (buyer, scope,
 * closing date) to the outcome (winner, value, official award notice): real,
 * whole content. Without an award it's just "this closed" and stays noindex.
 */
export function isIndexableRfp(r: Pick<RfpListItem, "slug" | "sourceType" | "status" | "isDemo"> & { summary?: string | null }): boolean {
  if (r.isDemo) return false;
  if (isClosedArchive(r)) return r.status !== "open" && parseClosedAward(r.summary) !== null;
  return r.status === "open" && !isPastContract(r);
}

/** A real closed tender from a buyer's historical open data (never biddable). */
export function isClosedArchive(r: Pick<RfpListItem, "slug" | "sourceType">): boolean {
  return r.sourceType === "public_source" && Boolean(publicTenderSource(r.slug).closedArchive);
}
