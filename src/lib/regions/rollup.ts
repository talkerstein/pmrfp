/**
 * Region rollup for browsing: which regions a listing counts under.
 *
 * A listing counts under its own region, under the region its city names,
 * under its province / state, and under every region above those in the
 * regions tree (canada → ontario → greater-toronto-area → toronto). So a
 * Toronto tender shows under "Toronto", "Greater Toronto Area", "Ontario" and
 * "Canada"; a Vaughan one under "Vaughan", "GTA", "Ontario" and "Canada".
 *
 * Why (persona QA, 2026-10-21): /rfps matched the region filter on the
 * listing's exact region name, so Toronto showed 6 open, Ontario 3 and GTA /
 * Vaughan 0, and "HVAC + GTA" was empty while a Toronto HVAC job was open.
 *
 * Pure (no I/O): callers pass the hour-cached taxonomy rows
 * (getTaxonomyRows("regions")) and the shared board snapshot. Canada and the
 * U.S. never mix: a city only maps to a region in the listing's own province
 * or state, and U.S. states roll up to "United States", never "Canada".
 *
 * Browse / filter code only (the /rfps board, region pages, embeds). Alert
 * recipient matching has its own code (lib/leads/match, alert crons); this
 * file is a candidate for it to adopt later.
 */
import { US_STATES } from "@/lib/geo";

export interface RollupRegion {
  id: string;
  slug: string;
  name: string;
  province?: string | null;
  country?: string | null;
  parent_id?: string | null;
}

export interface RegionIndex {
  bySlug: ReadonlyMap<string, RollupRegion>;
  byId: ReadonlyMap<string, RollupRegion>;
  /** Folded name → every region with that name (e.g. two "London"s). */
  byName: ReadonlyMap<string, RollupRegion[]>;
  /** Memo: listing → slugs it counts under (same listing objects within a request). */
  memo: WeakMap<object, ReadonlySet<string>>;
}

export interface RollupListing {
  regionName?: string | null;
  city?: string | null;
  province?: string | null;
}

/** "Montréal" / "MONTREAL " / "montreal" → "montreal". */
export function foldPlace(s: string | null | undefined): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/^(?:city|town|ville|municipality|township) of /, "")
    .replace(/[.'’]/g, "")
    .replace(/[\s-]+/g, " ")
    .trim();
}

const CA_CODES: Record<string, string> = {
  on: "ontario", qc: "quebec", bc: "british columbia", ab: "alberta", mb: "manitoba", sk: "saskatchewan",
  ns: "nova scotia", nb: "new brunswick", nl: "newfoundland and labrador", pe: "prince edward island",
  yt: "yukon", nt: "northwest territories", nu: "nunavut",
};

/** A province / state in one comparable form: "ON", "Ontario" → "ontario"; "TX", "Texas" → "texas". */
function provinceKey(s: string | null | undefined): string {
  const f = foldPlace(s);
  if (f.length === 2) {
    const us = US_STATES[f.toUpperCase()];
    return CA_CODES[f] ?? (us ? foldPlace(us) : f);
  }
  return f;
}

/**
 * Greater Toronto Area municipalities that aren't regions of their own:
 * Toronto's former boroughs and the Durham, York, Peel and Halton towns.
 * Cities that ARE regions (Toronto, Vaughan, Markham, Mississauga…) roll up
 * through the tree.
 */
export const GTA_MUNICIPALITIES: readonly string[] = [
  "Scarborough", "Etobicoke", "East York", "York", "North York", "Downsview", "Willowdale", "Don Mills",
  "Pickering", "Ajax", "Whitby", "Oshawa", "Clarington", "Courtice", "Bowmanville", "Uxbridge", "Scugog", "Port Perry", "Brock",
  "Aurora", "Newmarket", "King", "King City", "East Gwillimbury", "Georgina", "Whitchurch-Stouffville", "Stouffville", "Thornhill", "Woodbridge", "Maple", "Concord", "Unionville",
  "Caledon", "Bolton",
  "Milton", "Halton Hills", "Georgetown", "Acton",
];
const GTA_SET = new Set(GTA_MUNICIPALITIES.map(foldPlace));
const GTA_SLUG = "greater-toronto-area";

export function buildRegionIndex(rows: readonly RollupRegion[]): RegionIndex {
  const bySlug = new Map<string, RollupRegion>();
  const byId = new Map<string, RollupRegion>();
  const byName = new Map<string, RollupRegion[]>();
  for (const r of rows) {
    bySlug.set(r.slug, r);
    byId.set(r.id, r);
    const k = foldPlace(r.name);
    const list = byName.get(k);
    if (list) list.push(r);
    else byName.set(k, [r]);
  }
  return { bySlug, byId, byName, memo: new WeakMap() };
}

/** The region and every region above it (guards against cycles in bad data). */
function withAncestors(r: RollupRegion, idx: RegionIndex, out: Set<string>): void {
  let cur: RollupRegion | undefined = r;
  const seen = new Set<string>();
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    out.add(cur.slug);
    cur = cur.parent_id ? idx.byId.get(cur.parent_id) : undefined;
  }
}

/** Is region `r` in province / state `province`? (A national region with nothing above it: yes.) */
function inProvince(r: RollupRegion, province: string, idx: RegionIndex): boolean {
  const p = provinceKey(province);
  if (!p) return true;
  // Walk up: a city row may carry its province, or sit under the province's row.
  let cur: RollupRegion | undefined = r;
  const seen = new Set<string>();
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    if (cur.province && provinceKey(cur.province) === p) return true;
    if (foldPlace(cur.name) === p) return true;
    cur = cur.parent_id ? idx.byId.get(cur.parent_id) : undefined;
  }
  // A row with no province anywhere above it (and that isn't the province itself).
  return !r.province && !r.parent_id;
}

/**
 * The rows for a place name, in the listing's province when it has one.
 * List items carry region names, not ids, so same-named rows count together.
 */
function regionsNamed(name: string | null | undefined, province: string | null | undefined, idx: RegionIndex): RollupRegion[] {
  const rows = idx.byName.get(foldPlace(name));
  if (!rows?.length) return [];
  return province ? rows.filter((r) => inProvince(r, province, idx)) : rows;
}

/** The province / state row: "Ontario" → ontario, "Texas" → us-texas. */
function provinceRegion(province: string | null | undefined, idx: RegionIndex): RollupRegion | undefined {
  const p = provinceKey(province);
  if (!p) return undefined;
  const slug = p.replace(/\s+/g, "-");
  return idx.bySlug.get(slug) ?? idx.bySlug.get(`us-${slug}`) ?? idx.byName.get(p)?.find((r) => !r.province || provinceKey(r.province) === p);
}

/** Every region slug a listing counts under (its region, its city's, its province's, and all their ancestors). */
export function listingRegionSlugs(item: RollupListing, idx: RegionIndex): ReadonlySet<string> {
  const cached = idx.memo.get(item);
  if (cached) return cached;
  const out = new Set<string>();
  const own = regionsNamed(item.regionName, item.province, idx);
  for (const r of own.length ? own : regionsNamed(item.regionName, null, idx).slice(0, 1)) withAncestors(r, idx, out);
  const city = regionsNamed(item.city, item.province, idx);
  for (const r of city) withAncestors(r, idx, out);
  if (!city.length && item.city && GTA_SET.has(foldPlace(item.city)) && provinceKey(item.province ?? "ontario") === "ontario") {
    const gta = idx.bySlug.get(GTA_SLUG);
    if (gta) withAncestors(gta, idx, out);
  }
  const prov = provinceRegion(item.province, idx);
  if (prov) withAncestors(prov, idx, out);
  idx.memo.set(item, out);
  return out;
}

/** Does the listing count under region `slug` (the region itself, or anything inside it)? */
export function matchesRegion(item: RollupListing, slug: string, idx: RegionIndex): boolean {
  if (!idx.bySlug.has(slug)) return false;
  return listingRegionSlugs(item, idx).has(slug);
}
