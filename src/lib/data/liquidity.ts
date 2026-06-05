/**
 * Region liquidity reader — the guardrail primitive.
 *
 * A region is "active" when it has >= threshold paid+approved+active listable
 * orgs (trades/suppliers); below that it is "founding" (we capture demand to a
 * waitlist instead of dropping it into a void); zero supply = "empty".
 *
 * Backed by the `region_liquidity` / `region_category_liquidity` VIEWS and the
 * `regions.status` manual override + `platform_settings.region_liquidity_threshold`
 * (migration 20260604000001). Demo mode returns "active" so previews stay
 * browsable (mirrors the isSupabaseConfigured() guard used across data readers).
 *
 * NOTE: callers run only in P1 surfaces (founding-region notices, RFP guard).
 * This module reads `regions.status`, which exists only after the migration is
 * applied — keep it out of any path that executes before the migration lands.
 */
import { createReadClient } from "@/lib/supabase/read";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export type RegionTier = "active" | "founding" | "empty";
export const DEFAULT_LIQUIDITY_THRESHOLD = 3;

export interface RegionLiquidity {
  regionId: string;
  paidOrgCount: number;
  tier: RegionTier;
}

/** Map a region's status override + paid-supply count → tier. */
export function resolveTier(
  paidOrgCount: number,
  status: string | null | undefined,
  threshold: number,
): RegionTier {
  if (status === "active") return "active";
  if (status === "founding") return "founding";
  if (status === "hidden") return "empty";
  // 'auto' (or unset): compute from supply.
  if (paidOrgCount >= threshold) return "active";
  return paidOrgCount > 0 ? "founding" : "empty";
}

export async function getLiquidityThreshold(): Promise<number> {
  if (!isSupabaseConfigured()) return DEFAULT_LIQUIDITY_THRESHOLD;
  const supabase = createReadClient();
  const { data } = await supabase
    .from("platform_settings")
    .select("region_liquidity_threshold")
    .limit(1)
    .maybeSingle<{ region_liquidity_threshold: number }>();
  return data?.region_liquidity_threshold ?? DEFAULT_LIQUIDITY_THRESHOLD;
}

/** Overall supply tier for a region (any category), by slug. */
export async function getRegionLiquidityBySlug(
  slug: string,
): Promise<RegionLiquidity | null> {
  if (!isSupabaseConfigured()) {
    return { regionId: slug, paidOrgCount: DEFAULT_LIQUIDITY_THRESHOLD, tier: "active" };
  }
  const supabase = createReadClient();
  const { data: region } = await supabase
    .from("regions")
    .select("id,status")
    .eq("slug", slug)
    .maybeSingle<{ id: string; status: string | null }>();
  if (!region) return null;

  const [liqRes, threshold] = await Promise.all([
    supabase
      .from("region_liquidity")
      .select("paid_org_count")
      .eq("region_id", region.id)
      .maybeSingle<{ paid_org_count: number }>(),
    getLiquidityThreshold(),
  ]);
  const count = liqRes.data?.paid_org_count ?? 0;
  return { regionId: region.id, paidOrgCount: count, tier: resolveTier(count, region.status, threshold) };
}

/**
 * Category-specific tier for a region — the precise guard for "does this RFP's
 * category actually have supply here?". Pass the region's status if known to
 * honor a manual override.
 */
export async function getRegionCategoryTier(
  regionId: string,
  categoryId: string,
  status?: string | null,
): Promise<RegionTier> {
  if (!isSupabaseConfigured()) return "active";
  const supabase = createReadClient();
  const [liqRes, threshold] = await Promise.all([
    supabase
      .from("region_category_liquidity")
      .select("paid_org_count")
      .eq("region_id", regionId)
      .eq("category_id", categoryId)
      .maybeSingle<{ paid_org_count: number }>(),
    getLiquidityThreshold(),
  ]);
  const count = liqRes.data?.paid_org_count ?? 0;
  return resolveTier(count, status, threshold);
}
