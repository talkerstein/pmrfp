import { FREE_PROJECT_LIMIT } from "@/lib/projects/limits";

/**
 * What each trade plan really includes, as code grants it today. The /pricing
 * compare table is rendered from this, so a tick can only appear where the
 * product actually delivers it. Pure data, unit tested (test/unit/pricing-plans.test.ts):
 * each higher tier must include everything a lower tier does.
 *
 * Where each value comes from (keep in lockstep when entitlements change):
 *  - listing / search / cityPages: listVendors() (src/lib/data/directory.ts)
 *    lists every approved company, whatever its plan, and the trade + city
 *    pages call it with no plan filter.
 *  - badge: /badge and /api/badge/[slug] work for any listed company.
 *  - photos: the company-profile gallery allows 1 photo, 12 on any active
 *    paid tier (hasAnyPaidTier, src/app/[lang]/dashboard/company/page.tsx).
 *  - projects: canAddProject(session.hasTradeAccess) (src/lib/projects/limits.ts):
 *    1 project unless the org has Trade Pro access (Pro, Featured or a trial).
 *    SEO Listing (retired, grandfathered) does not get Trade Pro access
 *    (computeTradeAccess, src/lib/access/access.ts).
 *  - rfp / alerts / interest: session.hasTradeAccess (Pro, Featured, trial).
 *  - save: canSaveRfps() (src/lib/access/free-actions.ts): any signed-in
 *    trade or supplier account, paid or not.
 *  - featured*: organizations.featured, set only by the Featured price
 *    (syncSubscriptionFromStripe, src/lib/stripe/server.ts), ranked by
 *    tierRank() in src/lib/data/directory.ts.
 */

/**
 * Every tier the entitlement code knows. "seo" (SEO Listing, $120/yr) is
 * RETIRED: it is no longer sold anywhere, but existing subscribers keep what
 * it granted (the 12-photo gallery, directory-only, no RFP access), so it
 * stays here and in the access code. Only SOLD_TIERS appear on /pricing.
 */
export const TIERS = ["free", "seo", "pro", "featured"] as const;
export type Tier = (typeof TIERS)[number];

/** Tiers a new buyer can choose, in the order /pricing shows them. */
export const SOLD_TIERS = ["free", "pro", "featured"] as const satisfies readonly Tier[];
export type SoldTier = (typeof SOLD_TIERS)[number];

/** Retired tiers: still honoured for existing subscribers, never offered at checkout. */
export const RETIRED_TIERS: readonly Tier[] = ["seo"];

export type MatrixGroup = "found" | "win" | "stand";

/** check: 0 or 1. photos / projects: how many (Infinity = no limit). */
export type MatrixKind = "check" | "photos" | "projects";

export type MatrixRowId =
  | "listing"
  | "search"
  | "cityPages"
  | "badge"
  | "photos"
  | "projects"
  | "rfp"
  | "alerts"
  | "save"
  | "interest"
  | "featuredTop"
  | "featuredRegions"
  | "featuredBadge"
  | "rankedAhead";

export interface MatrixRow {
  id: MatrixRowId;
  group: MatrixGroup;
  kind: MatrixKind;
  value: Record<Tier, number>;
}

/** Company-profile gallery: 1 photo free, 12 on any paid tier. */
export const PROFILE_PHOTOS = { free: 1, paid: 12 } as const;

const all = { free: 1, seo: 1, pro: 1, featured: 1 };
const proUp = { free: 0, seo: 0, pro: 1, featured: 1 };
const featuredOnly = { free: 0, seo: 0, pro: 0, featured: 1 };

export const PLAN_MATRIX: readonly MatrixRow[] = [
  { id: "listing", group: "found", kind: "check", value: all },
  { id: "search", group: "found", kind: "check", value: all },
  { id: "cityPages", group: "found", kind: "check", value: all },
  { id: "badge", group: "found", kind: "check", value: all },
  {
    id: "photos",
    group: "found",
    kind: "photos",
    value: { free: PROFILE_PHOTOS.free, seo: PROFILE_PHOTOS.paid, pro: PROFILE_PHOTOS.paid, featured: PROFILE_PHOTOS.paid },
  },
  {
    id: "projects",
    group: "found",
    kind: "projects",
    value: { free: FREE_PROJECT_LIMIT, seo: FREE_PROJECT_LIMIT, pro: Infinity, featured: Infinity },
  },
  { id: "rfp", group: "win", kind: "check", value: proUp },
  { id: "alerts", group: "win", kind: "check", value: proUp },
  { id: "save", group: "win", kind: "check", value: all },
  { id: "interest", group: "win", kind: "check", value: proUp },
  { id: "featuredTop", group: "stand", kind: "check", value: featuredOnly },
  { id: "featuredRegions", group: "stand", kind: "check", value: featuredOnly },
  { id: "featuredBadge", group: "stand", kind: "check", value: featuredOnly },
  { id: "rankedAhead", group: "stand", kind: "check", value: featuredOnly },
];

export const MATRIX_GROUPS: readonly MatrixGroup[] = ["found", "win", "stand"];

/**
 * Documented places where a higher tier really gets LESS than a lower one.
 * None today: if one is ever added, the compare table must say so in a note
 * instead of drawing a tick it doesn't deliver.
 */
export const MATRIX_EXCEPTIONS: readonly { row: MatrixRowId; lower: Tier; higher: Tier; why: string }[] = [];

/** Every (row, lower tier, higher tier) where the higher tier gets less, minus documented exceptions. */
export function cumulativeViolations(
  matrix: readonly MatrixRow[] = PLAN_MATRIX,
  exceptions: typeof MATRIX_EXCEPTIONS = MATRIX_EXCEPTIONS,
): { row: MatrixRowId; lower: Tier; higher: Tier }[] {
  const out: { row: MatrixRowId; lower: Tier; higher: Tier }[] = [];
  for (const r of matrix) {
    for (let i = 0; i < TIERS.length; i++) {
      for (let j = i + 1; j < TIERS.length; j++) {
        const lower = TIERS[i];
        const higher = TIERS[j];
        if (r.value[higher] >= r.value[lower]) continue;
        if (exceptions.some((e) => e.row === r.id && e.lower === lower && e.higher === higher)) continue;
        out.push({ row: r.id, lower, higher });
      }
    }
  }
  return out;
}

/** Rows a tier includes (value above zero). */
export function tierIncludes(tier: Tier, matrix: readonly MatrixRow[] = PLAN_MATRIX): MatrixRowId[] {
  return matrix.filter((r) => r.value[tier] > 0).map((r) => r.id);
}

export interface MatrixCountCopy {
  photoOne: string;
  photosUpTo: string;
  projectOne: string;
  unlimited: string;
}

/** A count cell's text ("1 photo", "Up to 12", "Unlimited"); null for a check cell. */
export function countCell(row: MatrixRow, tier: Tier, t: MatrixCountCopy, num: (n: number) => string): string | null {
  if (row.kind === "check") return null;
  const n = row.value[tier];
  if (!Number.isFinite(n)) return t.unlimited;
  if (n === 1) return row.kind === "photos" ? t.photoOne : t.projectOne;
  return t.photosUpTo.replace("{n}", num(n));
}
