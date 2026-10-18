import { cache } from "react";
import { listAllRfpsCached } from "@/lib/data/trade-city";
import { getCategories, getRegions, type CategoryOption } from "@/lib/data/taxonomy";
import { getMajorProjects } from "@/lib/major-projects/data";
import { buyerRefs, intelAwards } from "@/lib/intel/model";
import { buildBuyerPages, type BuyerPage } from "./model";

export interface BuyerData {
  pages: BuyerPage[];
  categories: CategoryOption[];
}

/**
 * Buyer directory pages over the shared snapshots: the board snapshot
 * (lib/data/board-snapshot via listAllRfpsCached) and the major-projects
 * snapshot (lib/major-projects/data). No queries of their own (DB-load
 * rules, PR #136); built once per request with React cache(). Board awards
 * only, never the Intel-only award history, so public counts come from
 * public notices. Every source failing alone degrades to an empty list
 * (a missing major_projects table means "no projects", not an error).
 */
export const loadBuyers = cache(async (): Promise<BuyerData> => {
  const [rfps, regions, categories, projects] = await Promise.all([
    listAllRfpsCached().catch(() => []),
    getRegions().catch(() => []),
    getCategories().catch(() => [] as CategoryOption[]),
    getMajorProjects().catch(() => []),
  ]);
  const all = intelAwards(rfps, {
    regionProvince: new Map(regions.map((r) => [r.name, r.province] as const)),
    tradeSlug: new Map(categories.map((c) => [c.name, c.slug] as const)),
  });
  const awards = all.filter((a) => a.country === "CA");
  // Same refs as the public /intel pages (board awards, both countries), so the slug matches.
  const intelSlugs = new Map(buyerRefs(all).filter((r) => r.country === "CA").map((r) => [r.key, r.slug] as const));
  return { pages: buildBuyerPages({ awards, rfps, projects, intelSlugs }), categories };
});
