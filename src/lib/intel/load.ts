import { cache } from "react";
import { listAllRfpsCached } from "@/lib/data/trade-city";
import { getCategories, getRegions, type CategoryOption } from "@/lib/data/taxonomy";
import { torontoToday } from "@/lib/data/monthly-winners-load";
import { loadHistoryForIntel } from "@/lib/contract-history/load";
import { buyerRefs, intelAwards, type BuyerRef, type IntelAward } from "./model";
import { mergeHistory } from "./history";

/**
 * Award Intelligence over the shared board snapshot (lib/data/board-snapshot):
 * no queries of its own, built once per request with React cache() (never
 * inside unstable_cache, which would bypass the snapshot's own cache).
 *
 * Intel subscribers (and admins) also get award history merged in
 * (lib/contract-history: years of awards with contract end dates and bid
 * counts). Everyone else gets the board awards only, so a teaser's counts
 * and example row never come from raw history.
 */

export const INTEL_PATH = "/intel";
export const intelCompanyPath = (slug: string) => `${INTEL_PATH}/companies/${slug}`;
export const intelBuyerPath = (slug: string) => `${INTEL_PATH}/buyers/${slug}`;
export const intelMarketPath = (tradeSlug: string, provinceSlug: string) => `${INTEL_PATH}/markets/${tradeSlug}/${provinceSlug}`;
export const INTEL_RENEWALS_PATH = `${INTEL_PATH}/renewals`;

export interface IntelData {
  awards: IntelAward[];
  refs: BuyerRef[];
  categories: CategoryOption[];
  today: string;
}

export const loadIntel = cache(async (): Promise<IntelData> => {
  const [rfps, regions, categories, history] = await Promise.all([
    listAllRfpsCached().catch(() => []),
    getRegions().catch(() => []),
    getCategories().catch(() => [] as CategoryOption[]),
    loadHistoryForIntel().catch(() => []),
  ]);
  const board = intelAwards(rfps, {
    regionProvince: new Map(regions.map((r) => [r.name, r.province] as const)),
    tradeSlug: new Map(categories.map((c) => [c.name, c.slug] as const)),
  });
  const awards = history.length ? mergeHistory(board, history, { tradeName: new Map(categories.map((c) => [c.slug, c.name] as const)) }) : board;
  return { awards, refs: buyerRefs(awards), categories, today: torontoToday() };
});
