import { isLevel, type LevelNumber } from "./rules";

/**
 * What a reputation level unlocks. Every perk is free visibility for us to
 * give; none of them touches Trade Pro's paid value (RFP details, contacts,
 * documents, alerts). Pure, so other features can call them without
 * importing anything server-side.
 */

function lv(level: number | null | undefined): LevelNumber {
  return isLevel(level) ? level : 1;
}

/**
 * Extra public portfolio slots on top of a plan's base allowance.
 * NOT wired yet: the portfolio code (src/lib/projects/limits.ts) is being
 * reworked on feat/portfolio-upgrade. To turn it on there:
 *   const limit = portfolioSlotLimit(baseLimit, await orgLevel(orgId));
 */
export const EXTRA_PORTFOLIO_SLOTS: Record<LevelNumber, number> = { 1: 0, 2: 0, 3: 2, 4: 4, 5: 6 };

export function extraPortfolioSlots(level: number | null | undefined): number {
  return EXTRA_PORTFOLIO_SLOTS[lv(level)];
}

export function portfolioSlotLimit(base: number, level: number | null | undefined): number {
  return Math.max(0, Math.floor(base)) + extraPortfolioSlots(level);
}

/**
 * Directory ranking. Bounded on purpose: the level only breaks ties INSIDE
 * a paid tier (Platinum > Featured > Verified > the rest). It can never lift
 * a free listing above a paid one.
 */
export function directorySortKey(tierRank: number, level: number | null | undefined): number {
  return tierRank * 10 + lv(level);
}

/** Featured contributor slot (forum + GC Hub sidebars): levels 4 and 5. */
export const FEATURED_MIN_LEVEL: LevelNumber = 4;

export function isFeaturedContributor(level: number | null | undefined): boolean {
  return lv(level) >= FEATURED_MIN_LEVEL;
}

/**
 * Pick up to `n` featured companies, rotating daily so no company owns the
 * slot and the order reveals nothing about raw scores (which stay private).
 */
export function rotateFeatured<T extends { orgId: string; level: number }>(items: T[], n: number, day: string): T[] {
  const eligible = items.filter((i) => isFeaturedContributor(i.level));
  const hash = (s: string) => {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
    return h;
  };
  return [...eligible].sort((a, b) => hash(day + a.orgId) - hash(day + b.orgId) || a.orgId.localeCompare(b.orgId)).slice(0, Math.max(0, n));
}

/** Perks and whether they ship in this release (shown on /reputation). */
export const PERKS = [
  { key: "badge", minLevel: 2, live: true },
  { key: "directory", minLevel: 2, live: true },
  { key: "portfolio", minLevel: 3, live: false },
  { key: "featured", minLevel: 4, live: true },
  { key: "earlyLook", minLevel: 5, live: false },
] as const;

export type PerkKey = (typeof PERKS)[number]["key"];
