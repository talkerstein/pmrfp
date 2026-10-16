import { getBidResults, getHistoryIdForBoardRef } from "@/lib/contract-history/load";
import { boardRefOf, whoElseBid, type WhoElseBid } from "./model";

/**
 * The "Who else bid" panel for a board award listing, read with the
 * VIEWER's session (row level security: Intel subscribers and admins only;
 * everyone else gets null). Callers also check session.hasIntelAccess first.
 */
export async function whoElseBidForBoardSlug(slug: string): Promise<WhoElseBid | null> {
  const ref = boardRefOf(slug);
  if (!ref) return null;
  const id = await getHistoryIdForBoardRef(ref);
  return id ? whoElseBid(await getBidResults(id)) : null;
}
