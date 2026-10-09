/**
 * The public /projects gallery's pure rules: filtering, the filter menus
 * (only trades and regions that actually have public projects), paging, and
 * when a filtered view is too thin to be indexed.
 */

export interface GalleryItem {
  slug: string;
  title: string;
  summary: string | null;
  city: string | null;
  province: string | null;
  heroUrl: string | null;
  publishedAt: string | null;
  orgName: string;
  orgSlug: string;
  orgVerified: boolean;
  categoryName: string | null;
  categorySlug: string | null;
  regionName: string | null;
  regionSlug: string | null;
  clientType: string | null;
  isCaseStudy: boolean;
}

export interface GalleryFilters {
  trade?: string;
  region?: string;
  company?: string;
}

export const GALLERY_PER_PAGE = 24;

/** A filtered view needs at least this many projects to be worth indexing. */
export const GALLERY_MIN_INDEXED = 3;

export function filterGallery(items: GalleryItem[], f: GalleryFilters): GalleryItem[] {
  return items.filter(
    (i) =>
      (!f.trade || i.categorySlug === f.trade) &&
      (!f.region || i.regionSlug === f.region) &&
      (!f.company || i.orgSlug === f.company),
  );
}

export interface Facet {
  slug: string;
  name: string;
  count: number;
}

function facet(items: GalleryItem[], key: "category" | "region"): Facet[] {
  const map = new Map<string, Facet>();
  for (const i of items) {
    const slug = key === "category" ? i.categorySlug : i.regionSlug;
    const name = key === "category" ? i.categoryName : i.regionName;
    if (!slug || !name) continue;
    const f = map.get(slug) ?? { slug, name, count: 0 };
    f.count++;
    map.set(slug, f);
  }
  return [...map.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

/** Filter menus: each trade (or region) with how many public projects it has. */
export function galleryFacets(items: GalleryItem[]): { trades: Facet[]; regions: Facet[] } {
  return { trades: facet(items, "category"), regions: facet(items, "region") };
}

export function paginateGallery<T>(items: T[], rawPage: string | undefined, perPage = GALLERY_PER_PAGE) {
  const pages = Math.max(1, Math.ceil(items.length / perPage));
  const n = Number.parseInt(rawPage ?? "1", 10);
  const page = Number.isFinite(n) ? Math.min(Math.max(1, n), pages) : 1;
  return { page, pages, slice: items.slice((page - 1) * perPage, page * perPage) };
}

/**
 * Index the unfiltered gallery once it has anything in it, and a trade or
 * region view only when it has enough projects to be useful. Company views
 * and later pages are never indexed (the profile and page 1 cover them).
 */
export function galleryIndexable(p: { count: number; filters: GalleryFilters; page: number }): boolean {
  if (p.page > 1 || p.filters.company) return false;
  const filtered = Boolean(p.filters.trade || p.filters.region);
  return filtered ? p.count >= GALLERY_MIN_INDEXED : p.count > 0;
}

/**
 * Drop filter values that aren't a real trade / region / listed company, so
 * a typo'd ?trade= reads as "all". A real trade with no projects stays, and
 * the page says honestly that there are none yet.
 */
export function cleanFilters(
  raw: GalleryFilters,
  valid: { trades: Set<string>; regions: Set<string>; companies: Set<string> },
): GalleryFilters {
  return {
    trade: raw.trade && valid.trades.has(raw.trade) ? raw.trade : undefined,
    region: raw.region && valid.regions.has(raw.region) ? raw.region : undefined,
    company: raw.company && valid.companies.has(raw.company) ? raw.company : undefined,
  };
}
