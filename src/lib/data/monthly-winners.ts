/**
 * Monthly "Who won public property contracts" reports — the numbers behind
 * /reports/contract-winners/[yyyy-mm], its CSV and its share image.
 *
 * Pure over the board's past contracts (award notices from CanadaBuys, SEAO,
 * City of Toronto and Nova Scotia), the same rows as
 * /reports/public-building-contracts. A row counts when it has a winner and at
 * least one PMRFP trade (the importers' relevance mapping); its month is the
 * award date's calendar month. Amounts are as disclosed by the buyer; awards
 * without a disclosed value are counted but add nothing to dollar totals.
 * Individuals are counted, never named (same rule as the winner pages).
 */
import { reportContracts } from "@/lib/data/contracts-report";
import { winnerKey, winnersFromRfps } from "@/lib/data/winners";
import { rfpMarket } from "@/lib/visitor-geo";
import type { RfpListItem } from "@/lib/data/types";

/** A month gets a page only with at least this many relevant awards. */
export const MIN_MONTHLY_AWARDS = 10;
export const MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;

export interface MonthlyAward {
  slug: string;
  title: string;
  /** Publishable company name, or null for an individual (counted, not named). */
  winner: string | null;
  key: string;
  amount: number | null;
  /** Award date, YYYY-MM-DD. */
  date: string;
  month: string;
  jurisdiction: string;
  country: "CA" | "US";
  region: string | null;
  buyer: string | null;
  categories: string[];
  attribution: string;
  /** /contract-winners/<slug> when the winner has a page. */
  winnerSlug: string | null;
}

/** "… Past public contract issued by Public Works Canada." → "Public Works Canada". */
export function buyerFromSummary(summary: string | null): string | null {
  const m = summary?.match(/Past public contract (?:issued by|from) (.+?)\.?\s*$/);
  return m ? m[1].trim() : null;
}

export function monthlyAwards(rfps: RfpListItem[]): MonthlyAward[] {
  const bySlug = new Map(rfps.map((r) => [r.slug, r]));
  const pages = new Map(winnersFromRfps(rfps).map((w) => [winnerKey(w.name), w.slug]));
  const out: MonthlyAward[] = [];
  for (const c of reportContracts(rfps)) {
    const r = bySlug.get(c.slug);
    if (!r || !c.date || !/^\d{4}-\d{2}-\d{2}/.test(c.date)) continue;
    if (!c.categories.length) continue; // not mapped to a property trade
    out.push({
      slug: c.slug,
      title: c.title,
      winner: c.publicWinner,
      key: c.key,
      amount: c.amount && c.amount > 0 ? c.amount : null,
      date: c.date.slice(0, 10),
      month: c.date.slice(0, 7),
      jurisdiction: c.jurisdiction,
      country: rfpMarket(r),
      region: r.province,
      buyer: buyerFromSummary(r.summary),
      categories: c.categories,
      attribution: c.attribution,
      winnerSlug: c.publicWinner ? pages.get(winnerKey(c.publicWinner)) ?? null : null,
    });
  }
  return out;
}

export const prevMonth = (month: string) => {
  const [y, m] = month.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
};

/**
 * Months with a report, newest first: complete calendar months only (before
 * `today`'s month) with at least MIN_MONTHLY_AWARDS relevant awards.
 */
export function reportMonths(awards: MonthlyAward[], today: string, min = MIN_MONTHLY_AWARDS): { month: string; awards: number }[] {
  const current = today.slice(0, 7);
  const n = new Map<string, number>();
  for (const a of awards) if (a.month < current) n.set(a.month, (n.get(a.month) ?? 0) + 1);
  return [...n]
    .filter(([, c]) => c >= min)
    .map(([month, c]) => ({ month, awards: c }))
    .sort((a, b) => b.month.localeCompare(a.month));
}

export interface Tally {
  name: string;
  awards: number;
  value: number;
}

function tally(rows: MonthlyAward[], keyOf: (a: MonthlyAward) => string[]): Tally[] {
  const m = new Map<string, Tally>();
  for (const a of rows)
    for (const k of keyOf(a)) {
      const e = m.get(k) ?? { name: k, awards: 0, value: 0 };
      e.awards++;
      e.value += a.amount ?? 0;
      m.set(k, e);
    }
  return [...m.values()].sort((a, b) => b.value - a.value || b.awards - a.awards || a.name.localeCompare(b.name));
}

export interface WinnerTally extends Tally {
  slug: string | null;
}

export interface MonthTotals {
  awards: number;
  withValue: number;
  value: number;
  winners: number;
}

function totals(rows: MonthlyAward[]): MonthTotals {
  return {
    awards: rows.length,
    withValue: rows.filter((a) => a.amount).length,
    value: rows.reduce((s, a) => s + (a.amount ?? 0), 0),
    winners: new Set(rows.map((a) => a.key)).size,
  };
}

/** % change, one decimal; null when there's nothing to compare against. */
export const pctChange = (now: number, before: number) =>
  before > 0 ? Math.round(((now - before) / before) * 1000) / 10 : null;

export function buildMonthlyReport(all: MonthlyAward[], month: string) {
  const rows = all.filter((a) => a.month === month);
  const prev = all.filter((a) => a.month === prevMonth(month));
  const t = totals(rows);
  const p = totals(prev);

  // Winners grouped by winnerKey; individuals are tallied but dropped from the named lists.
  const w = new Map<string, WinnerTally & { named: boolean }>();
  for (const a of rows) {
    const e = w.get(a.key) ?? { name: a.winner ?? "", awards: 0, value: 0, slug: a.winnerSlug, named: Boolean(a.winner) };
    e.awards++;
    e.value += a.amount ?? 0;
    w.set(a.key, e);
  }
  const named = [...w.values()].filter((x) => x.named).map(({ named: _n, ...x }) => x);

  const dates = rows.map((a) => a.date).sort();
  return {
    month,
    period: { from: dates[0] ?? null, to: dates[dates.length - 1] ?? null },
    totals: t,
    previous: { month: prevMonth(month), ...p },
    change: { awards: pctChange(t.awards, p.awards), value: pctChange(t.value, p.value) },
    byCountry: tally(rows, (a) => [a.country]),
    byRegion: tally(rows, (a) => (a.region ? [a.region] : [])),
    bySource: tally(rows, (a) => [a.jurisdiction]),
    byTrade: tally(rows, (a) => a.categories),
    topBuyers: tally(rows, (a) => (a.buyer ? [a.buyer] : [])).slice(0, 10),
    topByValue: [...named].sort((a, b) => b.value - a.value || b.awards - a.awards || a.name.localeCompare(b.name)).slice(0, 10),
    topByCount: [...named].sort((a, b) => b.awards - a.awards || b.value - a.value || a.name.localeCompare(b.name)).slice(0, 10),
    largest: rows.filter((a) => a.amount).sort((a, b) => (b.amount ?? 0) - (a.amount ?? 0) || a.date.localeCompare(b.date)).slice(0, 10),
    attributions: [...new Set(rows.map((a) => a.attribution))],
    rows: [...rows].sort((a, b) => a.date.localeCompare(b.date) || (b.amount ?? 0) - (a.amount ?? 0)),
  };
}

export type MonthlyReport = ReturnType<typeof buildMonthlyReport>;

const cell = (v: string | number | null) => {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** One month's award table as CSV (BOM so Excel keeps Quebec accents). */
export function monthCsv(report: MonthlyReport, siteUrl: string): string {
  const header = ["award_date", "contract", "winner", "value_cad", "buyer", "jurisdiction", "province_or_state", "country", "trades", "pmrfp_url", "source_licence"];
  const lines = report.rows.map((a) =>
    [a.date, a.title, a.winner ?? "Individual (not named)", a.amount, a.buyer, a.jurisdiction, a.region, a.country, a.categories.join("; "), `${siteUrl}/rfps/${a.slug}`, a.attribution]
      .map(cell)
      .join(","),
  );
  return "﻿" + [header.join(","), ...lines].join("\n") + "\n";
}
