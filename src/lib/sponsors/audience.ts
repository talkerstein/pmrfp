/**
 * The audience numbers on /advertise, computed from PMRFP's own data in ONE
 * country (never Canada + U.S. added together): open bids and award notices
 * on the board, major projects tracked, companies listed. Pure, so the page
 * and the tests agree. No traffic numbers: the repo has no analytics source
 * we can read back and publish honestly.
 */
import { normalizeRegion, regionCountryOf, tradeSlug, type SponsorCountry } from "./model";

export interface BoardItem {
  slug: string;
  categories: string[];
  province: string | null;
  status: string;
  /** True for a past public contract (award notice). */
  award: boolean;
}

export interface CompanyItem {
  categories: string[];
  province: string | null;
  countries?: ("CA" | "US")[];
}

export interface ProjectItem {
  province: string | null;
  tradesNeeded: string[];
  stale: boolean;
}

export interface SlotStats {
  trade: string;
  /** Display name of the trade. */
  tradeName: string;
  province: string;
  open: number;
  awards: number;
  companies: number | null;
  projects: number;
}

export interface Audience {
  country: SponsorCountry;
  open: number;
  awards: number;
  /** Null when not tracked for this country (major projects are Canada only). */
  projects: number | null;
  /** Companies listed in this country; null when unknown. `capped` = the read hit its limit, so it's a floor. */
  companies: { n: number; capped: boolean } | null;
  /** Trades with at least one open bid in this country. */
  tradesWithWork: number;
  /** Every trade × province with any activity, busiest first. */
  slots: SlotStats[];
}

const key = (trade: string, province: string) => `${trade}|${province}`;

export function buildAudience(input: {
  country: SponsorCountry;
  board: readonly BoardItem[];
  categories: readonly { slug: string; name: string }[];
  companies?: { rows: readonly CompanyItem[]; capped: boolean } | null;
  projects?: readonly ProjectItem[] | null;
}): Audience {
  const { country } = input;
  const slugByName = new Map(input.categories.map((c) => [c.name, c.slug]));
  const nameBySlug = new Map(input.categories.map((c) => [c.slug, c.name]));
  const toSlug = (c: string) => slugByName.get(c) ?? tradeSlug(c);
  const slots = new Map<string, SlotStats>();
  const slot = (trade: string, province: string) => {
    const k = key(trade, province);
    let s = slots.get(k);
    if (!s) slots.set(k, (s = { trade, tradeName: nameBySlug.get(trade) ?? trade, province, open: 0, awards: 0, companies: null, projects: 0 }));
    return s;
  };

  let open = 0;
  let awards = 0;
  const tradesWithWork = new Set<string>();
  for (const r of input.board) {
    const p = normalizeRegion(r.province);
    // Country-first: a row counts only in its own country.
    const rc = p ? regionCountryOf(p) : "CA";
    if (rc !== country) continue;
    const isOpen = r.status === "open" && !r.award;
    if (isOpen) open++;
    if (r.award) awards++;
    // Closed listings with no award say nothing about demand.
    if (!isOpen && !r.award) continue;
    for (const c of r.categories) {
      const t = toSlug(c);
      if (isOpen) tradesWithWork.add(t);
      if (!p) continue;
      const s = slot(t, p);
      if (isOpen) s.open++;
      if (r.award) s.awards++;
    }
  }

  let projects: number | null = null;
  if (country === "CA" && input.projects) {
    const live = input.projects.filter((x) => !x.stale);
    projects = live.length;
    for (const x of live) {
      const p = normalizeRegion(x.province);
      if (!p || regionCountryOf(p) !== "CA") continue;
      for (const t of x.tradesNeeded) slot(t, p).projects++;
    }
  }

  let companies: Audience["companies"] = null;
  if (input.companies) {
    const inCountry = input.companies.rows.filter((c) => (c.countries ?? [regionCountryOf(normalizeRegion(c.province) ?? "Ontario")]).includes(country));
    companies = { n: inCountry.length, capped: input.companies.capped };
    // Per-slot company counts only when the list is complete (otherwise they'd undercount).
    if (!input.companies.capped) {
      for (const s of slots.values()) s.companies = 0;
      for (const c of inCountry) {
        const p = normalizeRegion(c.province);
        if (!p) continue;
        for (const name of c.categories) {
          const s = slots.get(key(toSlug(name), p));
          if (s) s.companies = (s.companies ?? 0) + 1;
        }
      }
    }
  }

  return {
    country,
    open,
    awards,
    projects,
    companies,
    tradesWithWork: tradesWithWork.size,
    slots: [...slots.values()].sort(
      (a, b) => b.open - a.open || b.awards - a.awards || b.projects - a.projects || a.tradeName.localeCompare(b.tradeName) || a.province.localeCompare(b.province),
    ),
  };
}
