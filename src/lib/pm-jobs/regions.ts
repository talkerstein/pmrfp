/**
 * Where a PM job is, and which trades cover it (pure; tested in
 * test/unit/pm-job-flow.test.ts). Built on the regions table:
 *
 *   canada → ontario → greater-toronto-area → toronto
 *   canada → montreal (province 'Quebec')     united-states → us-texas
 *
 * Matching works both ways:
 *   down  a trade serving Ontario (or the GTA, or Canada) gets a job in Toronto;
 *   up    a job filed under Ontario reaches a trade that only listed Toronto.
 * "Within" follows the tree, and also each region's province: a city filed
 * straight under the country (Montreal, province 'Quebec') is still inside
 * the Quebec region. The job's city counts: a job filed under "Ontario" with
 * city "Ottawa" sits in Ottawa, so it reaches Ontario-wide and Ottawa trades,
 * not Toronto-only ones. A job filed only under a whole country never goes
 * "up" to every trade in it (that would email everyone); trades who serve
 * the whole country still get it.
 *
 * A trade that never picked service regions is placed by its own city (or
 * province). Countries never mix: every match also needs the same country.
 */
import { regionCountry, type CountryCode } from "@/lib/visitor-geo";

export interface RegionRow {
  id: string;
  name: string;
  slug?: string | null;
  parent_id: string | null;
  province?: string | null;
  country?: string | null;
}

const norm = (s: string | null | undefined) =>
  (s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/^(city|town|ville|municipality) of /, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

export class RegionIndex {
  readonly byId = new Map<string, RegionRow>();
  private parents = new Map<string, string[]>();

  constructor(readonly rows: readonly RegionRow[]) {
    for (const r of rows) this.byId.set(r.id, r);
  }

  country(id: string): CountryCode {
    return regionCountry(this.byId.get(id) ?? {});
  }

  /** Root (country) regions have no parent. */
  isRoot(id: string): boolean {
    const r = this.byId.get(id);
    return Boolean(r && !r.parent_id);
  }

  /** The id and every ancestor, nearest first. */
  lineage(id: string): string[] {
    const cached = this.parents.get(id);
    if (cached) return cached;
    const out: string[] = [];
    let cur: string | null | undefined = id;
    const seen = new Set<string>();
    while (cur && !seen.has(cur) && this.byId.has(cur)) {
      seen.add(cur);
      out.push(cur);
      cur = this.byId.get(cur)!.parent_id;
    }
    this.parents.set(id, out);
    return out;
  }

  /** The province or state a region is in ("Ontario", "Texas"); U.S. state rows carry no province, so their own name. */
  provinceOf(id: string): string | null {
    const r = this.byId.get(id);
    if (!r) return null;
    if (r.province) return r.province;
    if (this.country(id) === "US" && r.parent_id && this.isRoot(r.parent_id)) return r.name;
    return null;
  }

  /** A province/state-level region: its name is its province (Ontario/Ontario, Texas). */
  isProvinceLevel(id: string): boolean {
    const r = this.byId.get(id);
    const p = this.provinceOf(id);
    return Boolean(r && p && norm(r.name) === norm(p));
  }

  /** Is `inner` inside `outer` (or the same region)? */
  within(inner: string, outer: string): boolean {
    if (inner === outer) return true;
    if (!this.byId.has(inner) || !this.byId.has(outer)) return false;
    if (this.country(inner) !== this.country(outer)) return false;
    if (this.lineage(inner).includes(outer)) return true;
    // Same province, filed elsewhere in the tree (Montreal under Canada, inside Quebec).
    if (this.isProvinceLevel(outer)) {
      const p = this.provinceOf(inner);
      return Boolean(p && norm(p) === norm(this.provinceOf(outer)));
    }
    return false;
  }

  /** A region named `city` in `country`, preferring one inside `scope` or the given province. */
  findCity(city: string | null | undefined, opts: { country: CountryCode; scope?: string | null; province?: string | null }): string | null {
    const want = norm(city);
    if (!want) return null;
    const hits = this.rows.filter((r) => (norm(r.name) === want || norm(r.slug?.replace(/^us-/, "")) === want) && this.country(r.id) === opts.country);
    if (!hits.length) return null;
    const scoped = hits.filter((r) => {
      if (opts.scope && this.within(r.id, opts.scope)) return true;
      if (opts.province && norm(this.provinceOf(r.id)) === norm(opts.province)) return true;
      return false;
    });
    const pool = scoped.length ? scoped : opts.scope || opts.province ? [] : hits;
    // Deepest first (the most specific place).
    pool.sort((a, b) => this.lineage(b.id).length - this.lineage(a.id).length);
    return pool[0]?.id ?? null;
  }

  /** The province/state region named `province` in `country`. */
  findProvince(province: string | null | undefined, country: CountryCode): string | null {
    const want = norm(province);
    if (!want) return null;
    const hit = this.rows.find((r) => this.country(r.id) === country && this.isProvinceLevel(r.id) && norm(r.name) === want);
    return hit?.id ?? null;
  }
}

/**
 * The most specific known place for a job: its city's region when the city
 * matches one (inside the job's region, or in its province), else the
 * province region when the job was filed under a whole country, else the
 * job's region. Null when nothing is known.
 */
export function jobPlace(
  job: { region_id: string | null; city?: string | null; province?: string | null },
  idx: RegionIndex,
  country: CountryCode,
): string | null {
  const base = job.region_id && idx.byId.has(job.region_id) ? job.region_id : null;
  const city = idx.findCity(job.city, { country, scope: base && !idx.isRoot(base) ? base : null, province: job.province });
  if (city) return city;
  if (!base || idx.isRoot(base)) {
    const prov = idx.findProvince(job.province, country);
    if (prov) return prov;
  }
  return base;
}

/** The regions a trade covers: its picked service regions, else where it is (city, then province). */
export function tradeArea(
  org: { city?: string | null; province?: string | null },
  serviceRegionIds: readonly string[],
  idx: RegionIndex,
  country: CountryCode,
): string[] {
  const picked = serviceRegionIds.filter((id) => idx.byId.has(id));
  if (picked.length) return picked;
  const city = idx.findCity(org.city, { country, province: org.province });
  if (city) return [city];
  const prov = idx.findProvince(org.province, country);
  return prov ? [prov] : [];
}

/** Does a trade covering `area` get a job at `place`? Both directions; never across countries. */
export function regionMatches(place: string | null, area: readonly string[], idx: RegionIndex): boolean {
  if (!place || !area.length) return false;
  for (const s of area) {
    if (idx.country(s) !== idx.country(place)) continue;
    // down: the trade serves an area the job is in.
    if (idx.within(place, s)) return true;
    // up: the job was filed under an area the trade is in (not a whole country).
    if (!idx.isRoot(place) && idx.within(s, place)) return true;
  }
  return false;
}
