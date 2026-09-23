import { createServiceClient } from "@/lib/supabase/service";
import { isServiceConfigured } from "@/lib/supabase/config";
import { bidCheckSchema, type BidCheck } from "./schema";

/**
 * The stored checklist for one RFP, read with the service role. The page
 * decides what to show: the full checklist to members, only which checks the
 * notice covers (values hidden) to everyone else.
 */
export async function getBidCheckBySlug(slug: string): Promise<BidCheck | null> {
  if (!isServiceConfigured()) return null;
  const { data } = await createServiceClient()
    .from("rfp_bid_checks")
    .select("result, rfp_posts!inner(slug)")
    .eq("rfp_posts.slug", slug)
    .not("result", "is", null)
    .maybeSingle();
  const parsed = bidCheckSchema.safeParse((data as { result?: unknown } | null)?.result);
  return parsed.success ? parsed.data : null;
}
