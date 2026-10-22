/**
 * The buyer-profile block on a tender page (depth plan, Step 2, block 2):
 * who the buyer is and what PMRFP holds about them. Pure.
 *
 * Office details (address, phone, website, procurement inbox) are free for
 * everyone and are shown when held: Step 1 of the depth plan is making
 * address, phone and website free on buyer pages. Until its fields exist on
 * the buyer directory this reads what is held today (a verified town's own
 * page, the procurement contact of a "listed with permission" city, the
 * directory's procurement inbox) and any `address` / `phone` / `website` a
 * directory row carries. Adding those fields later needs no change here.
 */
import type { BuyerPage } from "@/lib/buyers/model";
import type { ManagedPage } from "@/lib/towns/managed";

export interface BuyerOffice {
  address: string | null;
  phone: string | null;
  website: string | null;
  email: string | null;
  /** The buyer's own bids page (a link to the official posting, never gated). */
  bidsUrl: string | null;
}

/** Fields a directory row may carry once the buyer-page data fix lands. */
type OfficeFields = { address?: string | null; phone?: string | null; website?: string | null };

const httpUrl = (u: string | null | undefined) => (u && /^https?:\/\/[^\s]+$/i.test(u.trim()) ? u.trim() : null);
const text = (s: string | null | undefined, max = 200) => {
  const v = s?.replace(/\s+/g, " ").trim();
  return v ? v.slice(0, max) : null;
};

/** What the page can state about the buyer's office, or null when it holds none of it. */
export function buyerOffice(
  page: Pick<BuyerPage, "buyer"> | null,
  managed?: Pick<ManagedPage, "contactEmail" | "contactPhone" | "bidsUrl"> | null,
  permission?: { contactEmail?: string | null; contactPhone?: string | null } | null,
): BuyerOffice | null {
  if (!page) return null;
  const extra = page.buyer as BuyerPage["buyer"] & OfficeFields;
  const office: BuyerOffice = {
    address: text(extra.address),
    phone: text(managed?.contactPhone ?? permission?.contactPhone ?? extra.phone, 40),
    website: httpUrl(extra.website),
    email: text(managed?.contactEmail ?? permission?.contactEmail ?? page.buyer.email, 120),
    bidsUrl: httpUrl(managed?.bidsUrl) ?? httpUrl(page.buyer.tendersUrl),
  };
  return Object.values(office).some(Boolean) ? office : null;
}

export interface BuyerProfileData {
  /** Open bids on the board that name this buyer. */
  openCount: number;
  /** Past awards on record. */
  awardCount: number;
  /** Trade slugs, most-awarded first (at most `limit`). */
  tradeSlugs: string[];
}

export function buyerProfileData(page: Pick<BuyerPage, "openBids" | "awards">, limit = 4): BuyerProfileData {
  return { openCount: page.openBids.length, awardCount: page.awards.count, tradeSlugs: page.awards.tradeSlugs.slice(0, limit) };
}
