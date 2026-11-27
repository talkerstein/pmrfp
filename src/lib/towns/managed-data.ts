import { cache } from "react";
import { unstable_cache } from "next/cache";
import { createReadClient } from "@/lib/supabase/read";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { BUYER_PAGES_TAG } from "@/lib/supabase/public-cache";
import { createSingleFlight } from "@/lib/concurrency";
import { fromPublicRow, type ManagedPage, type PublicPageRow } from "./managed";
import { isVpsLiveCustomerAuth } from "@/lib/d1/staging-config";
import { vpsAppDatabase } from "@/lib/d1/http-binding";
import { publicAssetId, publicImageSource } from "@/lib/d1/public-asset-preview";

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

const cachedNativeManaged = unstable_cache(
  async (): Promise<PublicPageRow[]> => singleFlight("native-buyer-pages", async () => {
    const rows = await vpsAppDatabase().prepare(`SELECT p.buyer_key,p.province_code,p.buyer_name,o.name AS organization_name,
      p.verified_at,p.logo_url,CASE WHEN p.show_contact=1 THEN p.contact_email END AS contact_email,
      CASE WHEN p.show_contact=1 THEN p.contact_phone END AS contact_phone,p.bids_url,p.platform_url,p.vendor_registration_url,
      p.intro,p.upcoming,p.updated_at FROM buyer_pages p JOIN organizations o ON o.id=p.organization_id
      WHERE o.status='active' AND o.organization_type='public_buyer' AND o.is_demo=0 ORDER BY p.buyer_key LIMIT 5000`)
      .all<PublicPageRow>();
    if (!rows.success) throw new Error("Buyer pages unavailable");
    return rows.results.map((row) => {
      const logo = row.logo_url && publicImageSource(row.logo_url).src;
      return { ...row, upcoming: typeof row.upcoming === "string" ? JSON.parse(row.upcoming) : row.upcoming,
        logo_url: logo && publicAssetId(logo) ? null : logo };
    });
  }),
  ["native-buyer-pages-public-v1"],
  { tags: [BUYER_PAGES_TAG], revalidate: BUYER_PAGES_REVALIDATE },
);

/** Managed pages by buyer key ("ontario/town-of-cobourg"), once per request. */
export const getManagedPagesSnapshot = cache(async (): Promise<ReadonlyMap<string, ManagedPage>> => {
  const native = isVpsLiveCustomerAuth();
  if (!native && !isSupabaseConfigured()) return new Map();
  try {
    const rows = native ? await cachedNativeManaged() : await cachedManaged(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
    return new Map(rows.map(fromPublicRow).filter((p): p is ManagedPage => !!p).map((p) => [p.buyerKey, p] as const));
  } catch (e) {
    console.warn("[buyer-pages] snapshot unavailable", e instanceof Error ? e.message : e);
    return new Map();
  }
});
