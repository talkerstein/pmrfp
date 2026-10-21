/**
 * What a town page and its website widget list, from the shared board
 * snapshot only (lib/data/board-snapshot via listAllRfpsCached): no queries
 * of their own, nothing loaded per request. Pure, so it's unit tested.
 */
import { coreKey, type BuyerOpenBid, type BuyerPage } from "@/lib/buyers/model";
import { isPastContract } from "@/lib/data/fomo";
import type { RfpListItem } from "@/lib/data/types";
import { cityByBuyer } from "@/lib/tenders/city-sources";
import { nameIn } from "./names";
import type { ManagedPage } from "./managed";

export const NEARBY_LIMIT = 8;

/**
 * Open bids near a town: in the town itself first, then the rest of its
 * province, soonest closing first. Never the town's own bids (listed above
 * them) and never award notices. Canada only: a province is Canadian.
 */
export function nearbyOpenBids(rfps: readonly RfpListItem[], at: { province: string; place: string | null; exclude?: ReadonlySet<string> }, limit = NEARBY_LIMIT): RfpListItem[] {
  const here = at.place ? coreKey(at.place) : null;
  return rfps
    .filter((r) => r.status === "open" && !r.isDemo && !isPastContract(r) && r.province === at.province && !at.exclude?.has(r.slug))
    .map((r) => ({ r, local: here != null && r.city != null && coreKey(r.city) === here }))
    .sort((a, b) => Number(b.local) - Number(a.local) || (a.r.deadline ?? "9999").localeCompare(b.r.deadline ?? "9999") || a.r.title.localeCompare(b.r.title))
    .slice(0, limit)
    .map((x) => x.r);
}

/** The town's place name for "near X" ("Cobourg", not "Town of Cobourg"). */
export function placeOf(p: Pick<BuyerPage, "town" | "municipality" | "buyer">, lang: "en" | "fr" | "es"): string {
  if (p.town) return nameIn(p.town.name, lang);
  return p.municipality ?? p.buyer.name;
}

/** The buyer's official bids page: what the managing buyer set, else the city source, else the research. */
export function officialBidsUrl(p: Pick<BuyerPage, "buyer">, managed: Pick<ManagedPage, "bidsUrl" | "platformUrl"> | null): string | null {
  const city = cityByBuyer(p.buyer.slug);
  const fromCity = city?.buyerSlug === p.buyer.slug && city.provinceCode === p.buyer.provinceCode ? city.officialUrl : null;
  return managed?.bidsUrl ?? managed?.platformUrl ?? fromCity ?? p.buyer.tendersUrl ?? p.buyer.portalUrl ?? null;
}

export interface TownWidgetData {
  bids: BuyerOpenBid[];
  /** Open bids in total (the list shows at most MAX_ITEMS). */
  total: number;
  official: string | null;
}

/**
 * The "town bids" widget: the buyer's current listings on PMRFP (imported
 * with permission today, posted by the town later), soonest closing first,
 * and the link back to its official bids page.
 */
export function townWidgetData(p: Pick<BuyerPage, "buyer" | "openBids">, managed: Pick<ManagedPage, "bidsUrl" | "platformUrl"> | null, max = 10): TownWidgetData {
  const bids = [...p.openBids].sort((a, b) => (a.deadline ?? "9999").localeCompare(b.deadline ?? "9999"));
  return { bids: bids.slice(0, max), total: bids.length, official: officialBidsUrl(p, managed) };
}
