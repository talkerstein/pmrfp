import type { RfpListItem } from "@/lib/data/types";
import { publicTenderSource } from "@/lib/tenders/sources";

/**
 * Should Google index this RFP page?
 *
 * Search Console (Sep 2026) showed 121 "crawled, not indexed" and 46
 * "duplicate without canonical" pages — mostly closed public tenders: a title,
 * a past deadline and a link to the issuer's portal. Hundreds of those thin
 * pages drag down how Google rates the whole site. Keep indexing what has
 * value on its own:
 *   - open RFPs (biddable),
 *   - past public contracts (award notices: who won, for how much — they feed
 *     the contract-winner pages),
 *   - property-manager RFPs, open or not (rare, original content).
 * Closed public tenders stay reachable (noindex, follow) but leave the sitemap.
 */
export function isIndexableRfp(r: Pick<RfpListItem, "slug" | "status" | "sourceType" | "isDemo">): boolean {
  if (r.isDemo) return false;
  if (r.status === "open") return true;
  if (r.sourceType !== "public_source") return true;
  return publicTenderSource(r.slug).past;
}
