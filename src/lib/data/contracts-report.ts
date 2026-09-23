/**
 * "Who wins public building contracts" — the numbers behind
 * /reports/public-building-contracts and its CSV. Pure over the board's past
 * contracts (award notices), so the page, the CSV and the press pitches all
 * quote the same figures.
 *
 * Concentration stats count every winner (grouped with winnerKey, so
 * "DEXTER CONSTRUCTION CO. LTD." ≡ "Dexter Construction Company Limited").
 * Named lists only show companies isPublishableWinner accepts — individuals
 * are counted, never named.
 */
import { isPastContract, parseAward } from "@/lib/data/fomo";
import { isPublishableWinner, winnerKey } from "@/lib/data/winners";
import { publicTenderSource } from "@/lib/tenders/sources";
import type { RfpListItem } from "@/lib/data/types";

/** Award-feed key → jurisdiction label (lib/tenders/sources keys). */
export const JURISDICTION: Record<string, string> = {
  awards: "Federal (CanadaBuys)",
  seao: "Quebec (SEAO)",
  "toronto-awards": "City of Toronto",
  "ns-awards": "Nova Scotia",
};

export interface ReportContract {
  slug: string;
  title: string;
  winner: string;
  /** Winner name if it may be published, else null (individual). */
  publicWinner: string | null;
  key: string;
  amount: number | null;
  date: string | null;
  jurisdiction: string;
  categories: string[];
  attribution: string;
}

export interface WinnerRow {
  key: string;
  name: string | null;
  contracts: number;
  value: number;
  jurisdictions: string[];
}

export function reportContracts(rfps: RfpListItem[]): ReportContract[] {
  const out: ReportContract[] = [];
  for (const r of rfps) {
    if (!isPastContract(r)) continue;
    const { winner, amount } = parseAward(r.summary);
    if (!winner) continue;
    const key = winnerKey(winner);
    if (!key) continue;
    const src = publicTenderSource(r.slug);
    out.push({
      slug: r.slug,
      title: r.title,
      winner,
      publicWinner: isPublishableWinner(winner) ? winner : null,
      key,
      amount: amount ?? null,
      date: r.deadline,
      jurisdiction: JURISDICTION[src.key] ?? src.issuer,
      categories: r.categories,
      attribution: src.attribution,
    });
  }
  return out;
}

const share = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0);

export function buildContractsReport(rfps: RfpListItem[]) {
  const contracts = reportContracts(rfps);
  const valued = contracts.filter((c) => (c.amount ?? 0) > 0);
  const total = valued.reduce((s, c) => s + (c.amount ?? 0), 0);
  const dates = contracts.map((c) => c.date).filter((d): d is string => !!d).sort();

  const byWinner = new Map<string, WinnerRow & { names: Map<string, number> }>();
  for (const c of contracts) {
    const w = byWinner.get(c.key) ?? { key: c.key, name: null, contracts: 0, value: 0, jurisdictions: [] as string[], names: new Map<string, number>() };
    w.contracts++;
    w.value += c.amount ?? 0;
    if (!w.jurisdictions.includes(c.jurisdiction)) w.jurisdictions.push(c.jurisdiction);
    if (c.publicWinner) w.names.set(c.publicWinner, (w.names.get(c.publicWinner) ?? 0) + 1);
    byWinner.set(c.key, w);
  }
  const winners: WinnerRow[] = [...byWinner.values()].map(({ names, ...w }) => ({
    ...w,
    // Prefer a mixed-case spelling over SHOUTING, then the most common.
    name: [...names.entries()].sort((a, b) => Number(/[a-z]/.test(b[0])) - Number(/[a-z]/.test(a[0])) || b[1] - a[1])[0]?.[0] ?? null,
  }));
  const byValue = [...winners].sort((a, b) => b.value - a.value || b.contracts - a.contracts);
  const byCount = [...winners].sort((a, b) => b.contracts - a.contracts || b.value - a.value);

  const top5pctCount = Math.max(1, Math.ceil(winners.length * 0.05));
  const top5pctValue = byValue.slice(0, top5pctCount).reduce((s, w) => s + w.value, 0);
  const top10Value = byValue.slice(0, 10).reduce((s, w) => s + w.value, 0);
  const repeat = winners.filter((w) => w.contracts >= 2);
  const repeatValue = repeat.reduce((s, w) => s + w.value, 0);
  const jurisdictions = [...new Set(contracts.map((c) => c.jurisdiction))];
  const everywhere = winners.filter((w) => w.jurisdictions.length === jurisdictions.length && jurisdictions.length > 1);

  const bySource = jurisdictions
    .map((j) => {
      const cs = contracts.filter((c) => c.jurisdiction === j);
      return { jurisdiction: j, contracts: cs.length, value: cs.reduce((s, c) => s + (c.amount ?? 0), 0), winners: new Set(cs.map((c) => c.key)).size };
    })
    .sort((a, b) => b.value - a.value);

  const tradeMap = new Map<string, { contracts: number; value: number }>();
  for (const c of contracts)
    for (const t of c.categories) {
      const e = tradeMap.get(t) ?? { contracts: 0, value: 0 };
      e.contracts++;
      e.value += c.amount ?? 0;
      tradeMap.set(t, e);
    }
  const byTrade = [...tradeMap].map(([trade, e]) => ({ trade, ...e })).sort((a, b) => b.value - a.value);

  const amounts = valued.map((c) => c.amount!).sort((a, b) => a - b);

  return {
    period: { from: dates[0] ?? null, to: dates[dates.length - 1] ?? null },
    contracts: contracts.length,
    withValue: valued.length,
    totalValue: total,
    medianAward: amounts.length ? amounts[Math.floor(amounts.length / 2)] : null,
    winners: winners.length,
    singleWinners: winners.length - repeat.length,
    repeatWinners: repeat.length,
    repeatShare: share(repeatValue, total),
    top10Share: share(top10Value, total),
    top5pct: { count: top5pctCount, share: share(top5pctValue, total) },
    multiJurisdiction: winners.filter((w) => w.jurisdictions.length > 1).length,
    everywhere: everywhere.filter((w) => w.name).map((w) => ({ name: w.name!, contracts: w.contracts, value: w.value })),
    jurisdictions: bySource,
    byTrade,
    // Named lists: companies only (individuals are counted above, never named).
    topByValue: byValue.filter((w) => w.name).slice(0, 10),
    topByCount: byCount.filter((w) => w.name).slice(0, 10),
  };
}

export type ContractsReport = ReturnType<typeof buildContractsReport>;
