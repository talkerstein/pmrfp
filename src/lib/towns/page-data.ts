import { getBuyerPermissionSnapshot } from "@/lib/buyers/permissions-data";
import type { BuyerPermission } from "@/lib/buyers/permissions";
import { isIndexablePage, type BuyerPage } from "@/lib/buyers/model";
import { getRegions } from "@/lib/data/taxonomy";
import { getManagedPagesSnapshot } from "./managed-data";
import { buyerKey, permissionFor, type ManagedPage } from "./managed";
import { nameIn } from "./names";

export interface PageExtras {
  key: string;
  managed: ManagedPage | null;
  permission: BuyerPermission | null;
  indexable: boolean;
}

/**
 * What a buyer page adds from the two shared snapshots (managed pages,
 * permissions): no per-page queries. The one indexing rule
 * (isIndexablePage) for the page, its metadata and the sitemap.
 */
export async function buyerPageExtras(p: BuyerPage): Promise<PageExtras> {
  const [registry, managedMap] = await Promise.all([getBuyerPermissionSnapshot(), getManagedPagesSnapshot()]);
  const key = buyerKey(p.provinceSlug, p.buyer.slug);
  const managed = managedMap.get(key) ?? null;
  const permission = permissionFor(registry, p.buyer.slug, p.buyer.provinceCode);
  return { key, managed, permission, indexable: isIndexablePage(p, { managed: !!managed, permissionYes: permission?.status === "yes" }) };
}

/** Every indexable buyer page (sitemap, /buyers index), from the same snapshots. */
export async function indexablePages(pages: readonly BuyerPage[]): Promise<BuyerPage[]> {
  const [registry, managedMap] = await Promise.all([getBuyerPermissionSnapshot(), getManagedPagesSnapshot()]);
  return pages.filter((p) =>
    isIndexablePage(p, {
      managed: managedMap.has(buyerKey(p.provinceSlug, p.buyer.slug)),
      permissionYes: permissionFor(registry, p.buyer.slug, p.buyer.provinceCode)?.status === "yes",
    }),
  );
}

/**
 * The region preference "Follow this town" saves at sign-up: the town's own
 * region when the taxonomy has one, else its province's, else none.
 */
export async function followRegionSlug(p: Pick<BuyerPage, "town" | "municipality" | "province" | "provinceSlug">): Promise<string | null> {
  const regions = await getRegions().catch(() => []);
  const place = (p.town ? nameIn(p.town.name, "en") : p.municipality)?.toLowerCase() ?? null;
  const own = place ? regions.find((r) => r.name.toLowerCase() === place && r.province === p.province) : null;
  return own?.slug ?? regions.find((r) => r.slug === p.provinceSlug)?.slug ?? null;
}
