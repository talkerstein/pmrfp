import { createServiceClient } from "@/lib/supabase/service";
import { isServiceConfigured } from "@/lib/supabase/config";
import { isMissingTableError } from "@/lib/entitlement/trial";
import { loadBuyers } from "@/lib/buyers/load";
import { findBuyerPage, type BuyerPage } from "@/lib/buyers/model";
import type { SessionContext } from "@/lib/access/access";
import { buyerPageExtras, type PageExtras } from "./page-data";
import { cleanUpcoming, parseBuyerKey, type UpcomingPurchase } from "./managed";

/** The managing organization's own row (everything it edits, contact included). */
export interface OwnPageRow {
  buyer_key: string;
  buyer_name: string;
  verified_at: string;
  logo_url: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  show_contact: boolean;
  bids_url: string | null;
  platform_url: string | null;
  vendor_registration_url: string | null;
  intro: string | null;
  upcoming: UpcomingPurchase[];
}

export interface BuyerDashboard {
  /** The organization's page, when it manages one. */
  own: OwnPageRow | null;
  /** The latest claim this person made. */
  claim: { buyer_key: string; buyer_name: string; status: string; reason: string | null; created_at: string } | null;
  /** The page (managed or claimed). */
  page: BuyerPage | null;
  extras: PageExtras | null;
  missingTable: boolean;
}

/**
 * Everything the public-buyer dashboard shows, read with the service role
 * after the session check: the organization's page row, the person's latest
 * claim, and the public page built from the shared snapshots.
 */
export async function loadBuyerDashboard(session: SessionContext): Promise<BuyerDashboard> {
  const empty: BuyerDashboard = { own: null, claim: null, page: null, extras: null, missingTable: false };
  if (!isServiceConfigured()) return empty;
  const db = createServiceClient();
  const orgId = session.organization?.id ?? null;
  const [own, claim] = await Promise.all([
    orgId
      ? db.from("buyer_pages").select("buyer_key,buyer_name,verified_at,logo_url,contact_email,contact_phone,show_contact,bids_url,platform_url,vendor_registration_url,intro,upcoming").eq("organization_id", orgId).maybeSingle<OwnPageRow>()
      : Promise.resolve({ data: null, error: null }),
    db
      .from("buyer_claims")
      .select("buyer_key,buyer_name,status,reason,created_at")
      .eq("user_id", session.userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<BuyerDashboard["claim"] & object>(),
  ]);
  const missingTable = isMissingTableError(own.error) || isMissingTableError(claim.error);
  const ownRow = own.data ? { ...own.data, upcoming: cleanUpcoming(own.data.upcoming) } : null;
  const key = parseBuyerKey(ownRow?.buyer_key ?? claim.data?.buyer_key ?? null);
  const page = key ? findBuyerPage((await loadBuyers()).pages, key.provinceSlug, key.slug) : null;
  return { own: ownRow, claim: claim.data ?? null, page, extras: page ? await buyerPageExtras(page) : null, missingTable };
}
