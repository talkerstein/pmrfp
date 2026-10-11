import "server-only";
import { cache } from "react";
import { getRfpTeaser, listRfps } from "@/lib/data/rfps";
import { isPastContract, parseAward } from "@/lib/data/fomo";
import { isPublishableWinner, winnerKey, winnersFromRfps } from "@/lib/data/winners";
import { buyerFromSummary } from "@/lib/seo/rfp-meta";
import { publicTenderSource } from "@/lib/tenders/sources";
import type { RfpListItem } from "@/lib/data/types";
import { autoThreadListingSlug } from "./data";
import { similarAwards, type PastAward } from "./tender-facts";

/**
 * What an automatic tender thread shows above the (possibly empty) replies:
 * the real listing's closing date, buyer, trade and place, a link to its
 * RFP page, and similar past contract awards (winners and values) from the
 * public award notices already on the board.
 */
export interface TenderContext {
  listing: RfpListItem;
  kind: "tender" | "award" | "rfp";
  buyer: string | null;
  portal: string | null;
  similar: PastAward[];
}

/** Past awards from the shared board snapshot, once per request. */
const pastAwards = cache(async (): Promise<PastAward[]> => {
  const rfps = await listRfps();
  const pages = new Map(winnersFromRfps(rfps).map((w) => [winnerKey(w.name), w.slug]));
  return rfps.filter(isPastContract).map((r) => {
    const { winner, amount } = parseAward(r.summary);
    const name = winner && isPublishableWinner(winner) ? winner : null;
    return {
      slug: r.slug,
      title: r.title,
      categories: r.categories,
      province: r.province,
      regionName: r.regionName,
      date: r.deadline,
      winner: name,
      amount: amount && amount >= 1000 ? amount : null,
      winnerSlug: name ? pages.get(winnerKey(name)) ?? null : null,
    };
  });
});

/**
 * Similar awards per trade + province, computed in memory from the snapshot.
 * (Was unstable_cache per trade+province: inside it the board read bypassed
 * every cache, so each new key re-read the whole board from the database.)
 */
async function similarFor(trade: string, province: string | null): Promise<PastAward[]> {
  return similarAwards({ slug: "", categories: [trade], province }, await pastAwards(), 6);
}

export async function getTenderContext(threadId: string): Promise<TenderContext | null> {
  try {
    const ref = await autoThreadListingSlug(threadId);
    if (!ref) return null;
    const listing = await getRfpTeaser(ref.slug);
    if (!listing) return null;
    const isPublic = listing.sourceType === "public_source";
    const src = isPublic ? publicTenderSource(listing.slug) : null;
    const kind = ref.kind === "award" || ref.kind === "rfp" ? ref.kind : "tender";
    const trade = listing.categories[0];
    const similar = kind === "award" || !trade ? [] : (await similarFor(trade, listing.province)).filter((a) => a.slug !== listing.slug).slice(0, 5);
    return {
      listing,
      kind,
      buyer: buyerFromSummary(listing.summary) ?? src?.issuer ?? null,
      portal: src?.portal ?? null,
      similar,
    };
  } catch (err) {
    console.error("[forum] tender context", err instanceof Error ? err.message : err);
    return null;
  }
}
