import { isPastContract, parseAward } from "@/lib/data/fomo";
import { isPublishableWinner } from "@/lib/data/winners";
import { tradeWords } from "@/lib/gc/packages";

/**
 * "Recently awarded near you" — a small section in the daily digest. When a
 * public contract near a member is awarded (and the notice lands on PMRFP),
 * the winning contractor may need subcontractors. We say exactly that and no
 * more: who won, what, for how much, and a link to the notice. Pure, so it's
 * testable without a database or a mail server.
 */

export const RECENT_AWARD_MAX = 3;
/** Awards older than this are backfill, not news, even if they just landed. */
export const RECENT_AWARD_MAX_AGE_DAYS = 30;
export const GC_CATEGORY_SLUG = "general-contracting";

export interface DigestAward {
  id: string;
  slug: string;
  title: string;
  winner: string;
  value: string | null;
  amount: number | null;
  /** Award date (YYYY-MM-DD). */
  date: string;
  regionId: string;
  categoryIds: string[];
  categorySlugs: string[];
}

export interface AwardRow {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  /** On award notices the deadline is the award date. */
  deadline: string | null;
  region_id: string | null;
  source_type: string | null;
  categories: { id: string; slug: string }[];
}

/** An award notice row → a digest award, or null if it isn't one worth sending. */
export function toDigestAward(row: AwardRow, today: string, maxAgeDays = RECENT_AWARD_MAX_AGE_DAYS): DigestAward | null {
  if (!isPastContract({ slug: row.slug, sourceType: row.source_type })) return null;
  if (!row.region_id) return null; // "near you" needs a place
  const date = row.deadline?.slice(0, 10);
  const cutoff = new Date(Date.parse(`${today}T00:00:00Z`) - maxAgeDays * 86_400_000).toISOString().slice(0, 10);
  if (!date || date > today || date < cutoff) return null;
  const { winner, amount, value } = parseAward(row.summary);
  if (!winner || !isPublishableWinner(winner)) return null;
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    winner,
    value,
    amount,
    date,
    regionId: row.region_id,
    categoryIds: row.categories.map((c) => c.id),
    categorySlugs: row.categories.map((c) => c.slug),
  };
}

/**
 * Up to `max` awards for one member: in one of their regions (already
 * expanded to sub-regions), and either general contracting or one of their
 * own trades. Biggest contract first, then the newest.
 */
export function recentAwardsFor(
  awards: DigestAward[],
  member: { cats: Set<string>; regions: Set<string> },
  max = RECENT_AWARD_MAX,
): DigestAward[] {
  return awards
    .filter(
      (a) =>
        member.regions.has(a.regionId) &&
        (a.categorySlugs.includes(GC_CATEGORY_SLUG) || a.categoryIds.some((c) => member.cats.has(c))),
    )
    .sort((a, b) => (b.amount ?? 0) - (a.amount ?? 0) || b.date.localeCompare(a.date))
    .slice(0, max);
}

/** userId → awards, across every paid org the person belongs to. */
export function recentAwardsByUser(
  input: {
    awards: DigestAward[];
    paidOrgIds: string[];
    catsByOrg: Map<string, Set<string>>;
    regionsByOrg: Map<string, Set<string>>;
    usersByOrg: Map<string, Set<string>>;
  },
  max = RECENT_AWARD_MAX,
): Map<string, DigestAward[]> {
  const byUser = new Map<string, { cats: Set<string>; regions: Set<string> }>();
  for (const orgId of input.paidOrgIds) {
    const cats = input.catsByOrg.get(orgId) ?? new Set<string>();
    const regions = input.regionsByOrg.get(orgId) ?? new Set<string>();
    for (const userId of input.usersByOrg.get(orgId) ?? []) {
      const m = byUser.get(userId) ?? { cats: new Set<string>(), regions: new Set<string>() };
      cats.forEach((c) => m.cats.add(c));
      regions.forEach((r) => m.regions.add(r));
      byUser.set(userId, m);
    }
  }
  const out = new Map<string, DigestAward[]>();
  if (!input.awards.length) return out;
  for (const [userId, member] of byUser) {
    const picked = recentAwardsFor(input.awards, member, max);
    if (picked.length) out.set(userId, picked);
  }
  return out;
}

/** "{Winner} won {title} ({value}). The winning contractor may need {trade} subcontractors." */
export function awardLine(a: Pick<DigestAward, "winner" | "title" | "value">, trade: string | null): string {
  const t = trade && trade !== "commercial" ? `${tradeWords(trade)} ` : "";
  return `${a.winner} won ${a.title}${a.value ? ` (${a.value})` : ""}. The winning contractor may need ${t}subcontractors.`;
}

const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** The email section; empty string when there's nothing to show. */
export function recentAwardsHtml(items: { slug: string; line: string }[], base: string): string {
  if (!items.length) return "";
  const list = items
    .map(
      (i) =>
        `<li style="margin:0 0 12px;font-size:14px;color:#3A3D4D">${esc(i.line)} ` +
        `<a href="${base}/rfps/${esc(i.slug)}" style="color:#282B59;font-weight:600">See the award</a></li>`,
    )
    .join("");
  return (
    `<h2 style="font-size:16px;margin:24px 0 8px">Recently awarded near you</h2>` +
    `<p style="margin:0 0 8px;font-size:13px;color:#64748b">Public contracts just awarded in your regions. These did not go through PMRFP.</p>` +
    `<ul style="padding-left:18px;margin:8px 0 16px">${list}</ul>`
  );
}
