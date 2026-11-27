import { createServiceClient } from "@/lib/supabase/service";
import { isServiceConfigured } from "@/lib/supabase/config";
import { vpsAppDatabase } from "@/lib/d1/http-binding";
import { bidCheckSchema, type BidCheck } from "./schema";

/**
 * The stored checklist for one RFP, read with the service role. The page
 * decides what to show: the full checklist to members, only which checks the
 * notice covers (values hidden) to everyone else.
 */
export async function getBidCheckBySlug(slug: string): Promise<BidCheck | null> {
  if (process.env.PMRFP_VPS_CUSTOMER_ENGINE === "d1") {
    try {
      const row = await vpsAppDatabase().prepare(`SELECT c.result FROM rfp_bid_checks c JOIN rfp_posts p ON p.id=c.rfp_id
        WHERE p.slug=? AND p.is_demo=0 AND c.result IS NOT NULL`).bind(slug).first<{ result: string }>();
      const parsed = bidCheckSchema.safeParse(row ? JSON.parse(row.result) : null);
      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  }
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
