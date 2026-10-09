import type { RfpListItem } from "@/lib/data/types";
import { isPastContract, parseAward } from "@/lib/data/fomo";
import { isPublishableWinner, winnerKey, type Winner } from "@/lib/data/winners";
import { JURISDICTION } from "@/lib/data/contracts-report";
import { publicTenderSource } from "@/lib/tenders/sources";
import { isGcPackage } from "@/lib/gc/packages";
import { isPublicBody, parseAwardBuyer } from "@/lib/gc/leads";

/**
 * The GC Hub (/gc-hub): the two sides of sub-trade work on one page.
 *   • Subs: companies that just won public property work, by trade and
 *     province — the contractors most likely to be hiring subcontractors.
 *   • GCs: real sub-trade packages that are open right now.
 * Built only from the board's award notices and real posts. Pure, so it's
 * testable without a database.
 */

/** How far back "just won" goes. */
export const HUB_DAYS = 90;
export const HUB_PAGE_SIZE = 40;

export interface HubWin {
  slug: string;
  title: string;
  winner: string;
  /** /contract-winners/<slug>, when the company has a profile. */
  winnerSlug: string | null;
  amount: number | null;
  buyer: string | null;
  /** Award date, YYYY-MM-DD. */
  date: string;
  regionName: string | null;
  province: string | null;
  categories: string[];
  /** lib/tenders/sources key ("awards", "seao", "toronto-awards", "ns-awards"). */
  sourceKey: string;
  /** "Quebec (SEAO)" — English label, translated by the page. */
  jurisdiction: string;
  attribution: string;
}

const dayBefore = (today: string, days: number) =>
  new Date(Date.parse(`${today}T00:00:00Z`) - days * 86_400_000).toISOString().slice(0, 10);

/**
 * Award notices from the last `days` days with a named company as the winner,
 * newest first (largest first within a day). Individuals and public bodies
 * named as "winners" are left out.
 */
export function hubWins(
  rfps: RfpListItem[],
  winners: Pick<Winner, "name" | "slug">[],
  opts: { today: string; days?: number },
): HubWin[] {
  const cutoff = dayBefore(opts.today, opts.days ?? HUB_DAYS);
  const profiles = new Map(winners.map((w) => [winnerKey(w.name), w.slug]));
  const out: HubWin[] = [];
  for (const r of rfps) {
    if (!isPastContract(r)) continue;
    const date = r.deadline?.slice(0, 10);
    if (!date || date < cutoff || date > opts.today) continue;
    const { winner, amount } = parseAward(r.summary);
    if (!winner || !isPublishableWinner(winner) || isPublicBody(winner)) continue;
    const src = publicTenderSource(r.slug);
    out.push({
      slug: r.slug,
      title: r.title,
      winner,
      winnerSlug: profiles.get(winnerKey(winner)) ?? null,
      amount: amount && amount > 0 ? amount : null,
      buyer: parseAwardBuyer(r.summary),
      date,
      regionName: r.regionName,
      province: r.province,
      categories: r.categories,
      sourceKey: src.key,
      jurisdiction: JURISDICTION[src.key] ?? src.issuer,
      attribution: src.attribution,
    });
  }
  return out.sort((a, b) => b.date.localeCompare(a.date) || (b.amount ?? 0) - (a.amount ?? 0) || a.slug.localeCompare(b.slug));
}

export interface HubFilter {
  /** Trade category name ("Roofing"). */
  trade?: string | null;
  /** Province / state name ("Quebec"). */
  province?: string | null;
}

export function filterWins(wins: HubWin[], f: HubFilter): HubWin[] {
  return wins.filter((w) => (!f.trade || w.categories.includes(f.trade)) && (!f.province || w.province === f.province));
}

const counted = (values: string[]) => {
  const m = new Map<string, number>();
  for (const v of values) m.set(v, (m.get(v) ?? 0) + 1);
  return [...m].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
};

/** Trades and provinces that have wins, busiest first — the filter options. */
export function hubFilterOptions(wins: HubWin[]): { trades: [string, number][]; provinces: [string, number][] } {
  return {
    trades: counted(wins.flatMap((w) => w.categories)),
    provinces: counted(wins.map((w) => w.province).filter((p): p is string => Boolean(p))),
  };
}

export function hubTotals(wins: HubWin[]): { awards: number; companies: number; value: number } {
  return {
    awards: wins.length,
    companies: new Set(wins.map((w) => winnerKey(w.winner))).size,
    value: wins.reduce((s, w) => s + (w.amount ?? 0), 0),
  };
}

/** Sub-trade packages open right now, soonest quotes-due first. */
export function openPackages(rfps: RfpListItem[]): RfpListItem[] {
  return rfps
    .filter((r) => isGcPackage(r) && r.status === "open" && !r.isDemo)
    .sort((a, b) => (a.deadline ?? "9999").localeCompare(b.deadline ?? "9999"));
}

/** Feed keys present in a set of wins, in a stable order — for the sources list. */
export function sourceKeys(wins: Pick<HubWin, "sourceKey">[]): string[] {
  const order = ["awards", "seao", "toronto-awards", "ns-awards"];
  const keys = new Set(wins.map((w) => w.sourceKey));
  return [...order.filter((k) => keys.has(k)), ...[...keys].filter((k) => !order.includes(k))];
}
