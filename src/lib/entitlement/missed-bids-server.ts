import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import type { SessionContext } from "@/lib/access/access";
import { expandRegionIds, type RegionNode } from "@/lib/data/region-tree";
import { orgCountries, regionCountryMap } from "@/lib/alerts/country";
import { displayTitle } from "@/lib/tenders/title";
import { MISSED_WINDOW_DAYS, computeMissedBids, type MissedBids, type MissedRfp } from "./missed-bids";

interface Row {
  id: string;
  title: string;
  slug: string;
  deadline: string | null;
  region_id: string | null;
  province: string | null;
  source_type: string | null;
  rfp_categories: { category_id: string }[];
}

/**
 * The member's own "bids you missed" numbers, read as the member (row level
 * security) from the same tables the weekly roundup reads. Null when there
 * is nothing real to say or anything can't be read (the card is simply not
 * drawn).
 */
export async function loadMissedBids(session: SessionContext, now: Date = new Date(), db?: SupabaseClient): Promise<MissedBids | null> {
  const org = session.organization;
  if (!org || org.organization_type !== "trade_company" || session.hasTradeAccess) return null;
  if (!db && !isSupabaseConfigured()) return null;
  try {
    const supabase = db ?? (await createClient());
    const today = now.toISOString().slice(0, 10);
    const since = new Date(now.getTime() - MISSED_WINDOW_DAYS * 86_400_000).toISOString();
    const [cats, regs, regions, rfps] = await Promise.all([
      supabase.from("organization_categories").select("category_id").eq("organization_id", org.id),
      supabase.from("organization_regions").select("region_id").eq("organization_id", org.id),
      supabase.from("regions").select("id,slug,parent_id,country"),
      supabase
        .from("rfp_posts")
        .select("id,title,slug,deadline,region_id,province,source_type,rfp_categories(category_id)")
        .eq("status", "published")
        .eq("is_demo", false)
        .gte("published_at", since)
        .order("deadline", { ascending: true, nullsFirst: false })
        .limit(500),
    ]);
    if (cats.error || regs.error || regions.error || rfps.error) return null;
    const categories = new Set(((cats.data ?? []) as { category_id: string }[]).map((c) => c.category_id));
    const own = ((regs.data ?? []) as { region_id: string }[]).map((r) => r.region_id);
    const regionRows = (regions.data ?? []) as { id: string; slug: string; parent_id: string | null; country: string | null }[];
    const nationalIds = new Set(regionRows.filter((r) => r.slug === "canada" || r.slug === "united-states").map((r) => r.id));
    const byRegion = regionCountryMap(regionRows);
    const items: MissedRfp[] = ((rfps.data ?? []) as unknown as Row[]).map((r) => ({
      id: r.id,
      title: displayTitle(r.title, r.source_type).title,
      slug: r.slug,
      deadline: r.deadline,
      region_id: r.region_id,
      province: r.province,
      rfp_categories: r.rfp_categories ?? [],
    }));
    return computeMissedBids(
      items,
      { categories, regions: expandRegionIds(own, regionRows as RegionNode[]), countries: orgCountries(org, own, byRegion) },
      nationalIds,
      byRegion,
      today,
    );
  } catch (e) {
    console.warn("[missed-bids] unavailable", e instanceof Error ? e.message : e);
    return null;
  }
}
