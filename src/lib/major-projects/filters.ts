/**
 * Pure list logic for /major-projects: filters (province, category, status,
 * value band, trade), sort (visitor's province first, then biggest), the
 * thin-page rule (noindex) and "related work" matching against the board.
 * Tested in test/unit/major-projects.test.ts.
 */
import { provinceFirst } from "@/lib/visitor-geo";
import {
  MAJOR_PROJECT_CATEGORIES,
  MAJOR_PROJECT_STATUSES,
  VALUE_BANDS,
  VALUE_BAND_RANGES,
  provinceName,
  type MajorProjectCategory,
  type MajorProjectStatus,
  type ValueBand,
} from "./model";
import type { MajorProject } from "./data";

export interface ProjectFilters {
  province: string | null;
  category: MajorProjectCategory | null;
  status: MajorProjectStatus | null;
  band: ValueBand | null;
  trade: string | null;
  q: string;
  /** Include projects the source no longer lists. */
  showStale: boolean;
}

/** Query string → filters; anything unknown is ignored. */
export function parseProjectFilters(sp: Record<string, string | undefined>): ProjectFilters {
  const cat = sp.category?.trim();
  const st = sp.status?.trim();
  const band = sp.value?.trim();
  return {
    province: provinceName(sp.province?.replace(/-/g, " ") ?? null),
    category: cat && (MAJOR_PROJECT_CATEGORIES as readonly string[]).includes(cat) ? (cat as MajorProjectCategory) : null,
    status: st && (MAJOR_PROJECT_STATUSES as readonly string[]).includes(st) ? (st as MajorProjectStatus) : null,
    band: band && (VALUE_BANDS as readonly string[]).includes(band) ? (band as ValueBand) : null,
    trade: sp.trade && /^[a-z0-9-]{2,60}$/.test(sp.trade) ? sp.trade : null,
    q: (sp.q ?? "").trim().toLowerCase().slice(0, 80),
    showStale: sp.stale === "1",
  };
}

export function filterProjects(rows: readonly MajorProject[], f: ProjectFilters): MajorProject[] {
  return rows.filter((p) => {
    if (!f.showStale && p.stale) return false;
    if (f.province && p.province !== f.province) return false;
    if (f.category && p.category !== f.category) return false;
    if (f.status && p.status !== f.status) return false;
    if (f.trade && !p.tradesNeeded.includes(f.trade)) return false;
    if (f.band) {
      const [lo, hi] = VALUE_BAND_RANGES[f.band];
      if (p.estValueCad == null || p.estValueCad < lo || p.estValueCad >= hi) return false;
    }
    if (f.q) {
      const hay = `${p.name} ${p.owner ?? ""} ${p.city ?? ""} ${p.description ?? ""}`.toLowerCase();
      if (!hay.includes(f.q)) return false;
    }
    return true;
  });
}

const STATUS_RANK: Record<MajorProjectStatus, number> = {
  under_construction: 0,
  approved: 1,
  proposed: 2,
  on_hold: 3,
  unknown: 4,
  completed: 5,
  cancelled: 6,
};

/**
 * Live work first (under construction, approved, proposed), biggest value
 * first within a status; then the visitor's province on top (stable).
 */
export function sortProjects(rows: readonly MajorProject[], province: string | null): MajorProject[] {
  const sorted = [...rows].sort(
    (a, b) =>
      STATUS_RANK[a.status] - STATUS_RANK[b.status] ||
      (b.estValueCad ?? -1) - (a.estValueCad ?? -1) ||
      a.name.localeCompare(b.name),
  );
  return provinceFirst(sorted, province, (p) => p.province);
}

/** Provinces with at least one listed project, most projects first. */
export function provinceCounts(rows: readonly MajorProject[]): { province: string; n: number }[] {
  const m = new Map<string, number>();
  for (const p of rows) if (p.province && !p.stale) m.set(p.province, (m.get(p.province) ?? 0) + 1);
  return [...m].map(([province, n]) => ({ province, n })).sort((a, b) => b.n - a.n || a.province.localeCompare(b.province));
}

/**
 * Thin pages are noindexed: a project the source dropped, one without a
 * value, or one with neither a real description nor an owner. Manual
 * research rows (approved by an admin, with sources) are always rich enough.
 */
export function isThinProject(p: Pick<MajorProject, "stale" | "estValueCad" | "description" | "owner" | "source">): boolean {
  if (p.stale) return true;
  if (p.source === "manual") return false;
  if (p.estValueCad == null) return true;
  const desc = (p.description ?? "").trim();
  return desc.length < 60 && !p.owner;
}

/** A board listing as seen by the related-work matcher. */
export interface RelatedCandidate {
  slug: string;
  title: string;
  city: string | null;
  province: string | null;
  categorySlugs: string[];
  deadline: string | null;
  isOpen: boolean;
  isAward: boolean;
}

/**
 * Open RFPs and recent awards near a project: same city first, then same
 * province, in one of the project's trades. Canada only (a project's
 * province is always Canadian, so U.S. listings never match).
 */
export function relatedWork(
  project: Pick<MajorProject, "city" | "province" | "tradesNeeded">,
  candidates: readonly RelatedCandidate[],
  max = 5,
): { open: RelatedCandidate[]; awards: RelatedCandidate[] } {
  if (!project.province) return { open: [], awards: [] };
  const trades = new Set(project.tradesNeeded);
  const city = (project.city ?? "").trim().toLowerCase();
  const near = candidates.filter(
    (c) => c.province === project.province && (trades.size === 0 || c.categorySlugs.some((s) => trades.has(s))),
  );
  const rank = (c: RelatedCandidate) => (city && (c.city ?? "").trim().toLowerCase() === city ? 0 : 1);
  const open = near
    .filter((c) => c.isOpen && !c.isAward)
    .sort((a, b) => rank(a) - rank(b) || (a.deadline ?? "9999").localeCompare(b.deadline ?? "9999"))
    .slice(0, max);
  const awards = near
    .filter((c) => c.isAward)
    .sort((a, b) => rank(a) - rank(b) || (b.deadline ?? "").localeCompare(a.deadline ?? ""))
    .slice(0, max);
  return { open, awards };
}
