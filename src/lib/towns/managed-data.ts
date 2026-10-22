import { cache } from "react";
import { unstable_cache } from "next/cache";
import { createReadClient } from "@/lib/supabase/read";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { BUYER_PAGES_TAG } from "@/lib/supabase/public-cache";
import { createSingleFlight } from "@/lib/concurrency";
import { fromPublicRow, type ManagedPage, type PublicPageRow } from "./managed";

/**
 * Managed buyer pages for public pages: ONE shared, server-cached copy of
 * the buyer_pages_public view (every managed page, a few dozen rows), same
 * rule as the permission and sponsor snapshots (PR #136): no per-page
 * queries. Tag "buyer-pages", 10 minutes; a verification or an edit expires
 * it at once (lib/supabase/write-fetch). Empty without Supabase or before
 * migration 20261021000040 runs.
 */

export const BUYER_PAGES_REVALIDATE = 21600;
const READ_TIMEOUT_MS = 8_000;
const singleFlight = createSingleFlight();

const COLUMNS =
  "buyer_key,province_code,buyer_name,organization_name,verified_at,logo_url,contact_email,contact_phone,bids_url,platform_url,vendor_registration_url,intro,upcoming,updated_at";

async function fetchManaged(): Promise<PublicPageRow[]> {
  const { data, error } = await createReadClient()
    .from("buyer_pages_public")
    .select(COLUMNS)
    .limit(5000)
    .abortSignal(AbortSignal.timeout(READ_TIMEOUT_MS));
  if (error) throw new Error(`buyer_pages_public: ${error.message}`);
  return (data ?? []) as PublicPageRow[];
}

const cachedManaged = unstable_cache(
  async (_projectUrl: string): Promise<PublicPageRow[]> => singleFlight("buyer-pages", fetchManaged),
  ["buyer-pages-public-v1"],
  { tags: [BUYER_PAGES_TAG], revalidate: BUYER_PAGES_REVALIDATE },
);

/** Managed pages by buyer key ("ontario/town-of-cobourg"), once per request. */
export const getManagedPagesSnapshot = cache(async (): Promise<ReadonlyMap<string, ManagedPage>> => {
  if (!isSupabaseConfigured()) return new Map();
  try {
    const rows = await cachedManaged(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
    return new Map(rows.map(fromPublicRow).filter((p): p is ManagedPage => !!p).map((p) => [p.buyerKey, p] as const));
  } catch (e) {
    console.warn("[buyer-pages] snapshot unavailable", e instanceof Error ? e.message : e);
    return new Map();
  }
});
