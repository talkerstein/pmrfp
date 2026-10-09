/**
 * Facts for an automatic tender thread, from real board data only (pure;
 * tested in test/forum-quiet.test.ts). The server loader is tender-context.ts.
 */
import { countryOf } from "@/lib/visitor-geo";

export interface PastAward {
  slug: string;
  title: string;
  categories: string[];
  province: string | null;
  regionName: string | null;
  /** Award date (award notices keep it in `deadline`). */
  date: string | null;
  winner: string | null;
  amount: number | null;
  winnerSlug: string | null;
}

/**
 * Up to `n` past awards in the listing's trade and COUNTRY (never across the
 * border): same province first, then the rest of that country, newest first.
 * Only awards with a publishable winner are used. Never the listing itself.
 */
export function similarAwards(
  target: { slug: string; categories: string[]; province: string | null },
  awards: readonly PastAward[],
  n = 5,
): PastAward[] {
  const trade = target.categories[0];
  if (!trade) return [];
  const country = countryOf(target);
  const pool = awards.filter((a) => a.slug !== target.slug && a.winner && a.categories.includes(trade) && countryOf(a) === country);
  const local = (a: PastAward) => (target.province && a.province === target.province ? 0 : 1);
  return [...pool].sort((a, b) => local(a) - local(b) || (b.date ?? "").localeCompare(a.date ?? "")).slice(0, n);
}

/** "closes in N days" bucket for a YYYY-MM-DD deadline vs today (YYYY-MM-DD). */
export function closingState(deadline: string | null, today: string): { state: "open" | "closed" | "unknown"; days: number | null } {
  if (!deadline) return { state: "unknown", days: null };
  const days = Math.round((Date.parse(`${deadline}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
  if (Number.isNaN(days)) return { state: "unknown", days: null };
  return days < 0 ? { state: "closed", days } : { state: "open", days };
}
