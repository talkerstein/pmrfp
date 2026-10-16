/**
 * Award history → Award Intelligence. Pure. The importers
 * (src/lib/contract-history) keep years of awards with contract end dates
 * and bid counts in award_history; this turns those rows into IntelAwards
 * and merges them with the board's own award notices, for Intel
 * subscribers only (the loader decides who; see src/lib/intel/load.ts).
 *
 *  - The same award on the board and in history is ONE award: the board
 *    listing stays (it has a public page) and gains the history row's end
 *    date, bid count and bid list. Matched by the board slug suffix when the
 *    importer knows it (SEAO "qca-…", CanadaBuys "cba-…"), else by same
 *    winner, value within 2% and award date within 31 days.
 *  - History-only awards link to /intel/awards/<id> (no public page).
 *  - Country-first: a row's currency must be its country's (the table
 *    enforces it too); nothing is converted.
 *  - Companies keep one slug: a history winner reuses the board's slug for
 *    the same company.
 */
import { MIN_USABLE_AMOUNT } from "@/lib/data/price-benchmarks";
import { winnerKey } from "@/lib/data/winners";
import { slugify } from "@/lib/tenders/shared";
import type { CountryCode } from "@/lib/visitor-geo";
import { buyerKeyOf, currencyOfCountry, type IntelAward } from "./model";

/** The award_history columns Intel reads (the slice RPC returns these). */
export interface HistoryAwardRow {
  id: string;
  source: string;
  board_ref: string | null;
  title: string;
  buyer: string | null;
  winner_business_name: string | null;
  winner_is_individual: boolean;
  value: number | null;
  currency: string;
  country: string;
  province: string | null;
  city: string | null;
  award_date: string;
  end_date: string | null;
  end_date_source: "stated" | "derived_from_title" | "estimated" | null;
  potential_end_date: string | null;
  number_of_bids: number | null;
  trade_slugs: string[];
  notice_url: string | null;
  attribution: string;
  has_bids?: boolean;
}

/** Sources whose notice_url is the award's own record (the others link the dataset). */
export const EXACT_NOTICE_SOURCES = new Set(["ca-federal-contracts", "ca-canadabuys-awards", "ca-seao", "us-usaspending"]);

export const intelAwardPath = (historyId: string) => `/intel/awards/${historyId}`;

/** Where an award's row links: its board listing, or its /intel/awards page for history-only awards. */
export function awardHref(a: Pick<IntelAward, "slug" | "historyId" | "historyOnly">): string {
  return a.historyOnly && a.historyId ? intelAwardPath(a.historyId) : `/rfps/${a.slug}`;
}

export interface HistoryContext {
  /** Trade slug → display name (taxonomy). Falls back to the slug. */
  tradeName?: Map<string, string>;
}

const DAY = 86_400_000;
const daysApart = (a: string, b: string) => Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / DAY;
const closeValue = (a: number | null, b: number | null) => (a === null || b === null ? a === b : Math.abs(a - b) <= Math.max(a, b) * 0.02);

/** One history row as an IntelAward (winnerSlug filled by mergeHistory). */
export function historyAward(r: HistoryAwardRow, ctx: HistoryContext = {}): IntelAward | null {
  const country = r.country === "US" ? "US" : r.country === "CA" ? "CA" : null;
  if (!country) return null;
  const currency = currencyOfCountry(country as CountryCode);
  if (r.currency !== currency) return null;
  const date = String(r.award_date).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const winner = r.winner_is_individual ? null : r.winner_business_name;
  const wKey = winner ? winnerKey(winner) || null : null;
  const amount = r.value === null || r.value === undefined ? null : Number(r.value);
  return {
    slug: `h-${r.id}`,
    title: r.title,
    buyer: r.buyer,
    buyerKey: r.buyer ? buyerKeyOf(r.buyer) || null : null,
    winner,
    winnerKey: wKey,
    winnerSlug: null,
    winnerPublic: false,
    amount: amount !== null && Number.isFinite(amount) && amount >= MIN_USABLE_AMOUNT ? amount : null,
    date,
    country: country as CountryCode,
    currency,
    province: r.province,
    city: r.city,
    trades: r.trade_slugs.map((s) => ctx.tradeName?.get(s) ?? s),
    tradeSlugs: [...r.trade_slugs],
    sourceKey: r.source,
    attribution: r.attribution,
    noticeUrl: r.notice_url,
    noticeExact: Boolean(r.notice_url) && EXACT_NOTICE_SOURCES.has(r.source),
    historyId: r.id,
    historyOnly: true,
    endDate: r.end_date ? String(r.end_date).slice(0, 10) : null,
    endDateSource: r.end_date_source,
    potentialEndDate: r.potential_end_date ? String(r.potential_end_date).slice(0, 10) : null,
    bids: r.number_of_bids,
    hasBidList: Boolean(r.has_bids),
  };
}

/** The board award's slug suffix that history rows store as board_ref ("…-qca-1234" → "qca-1234"). */
function boardRef(slug: string): string | null {
  const i = Math.max(slug.lastIndexOf("-qca-"), slug.lastIndexOf("-cba-"));
  return i < 0 ? null : slug.slice(i + 1);
}

/**
 * Board awards plus history, as one list (newest first). Board awards that
 * match a history row gain its end date, bid count and bid list; matched
 * history rows are not added twice.
 */
export function mergeHistory(board: readonly IntelAward[], rows: readonly HistoryAwardRow[], ctx: HistoryContext = {}): IntelAward[] {
  const out = board.map((a) => ({ ...a }));
  const byRef = new Map<string, IntelAward>();
  const byWinner = new Map<string, IntelAward[]>();
  const slugOf = new Map<string, string>();
  const used = new Set<string>();
  for (const a of out) {
    const ref = boardRef(a.slug);
    if (ref) byRef.set(ref, a);
    if (a.winnerKey) {
      const k = `${a.country}|${a.winnerKey}`;
      byWinner.set(k, [...(byWinner.get(k) ?? []), a]);
      if (a.winnerSlug) slugOf.set(a.winnerKey, a.winnerSlug);
    }
    if (a.winnerSlug) used.add(a.winnerSlug);
  }
  const attach = (target: IntelAward, h: IntelAward) => {
    target.historyId = h.historyId;
    target.historyOnly = false;
    if (h.endDate && (!target.endDate || rank(h.endDateSource) > rank(target.endDateSource))) {
      target.endDate = h.endDate;
      target.endDateSource = h.endDateSource;
      target.potentialEndDate = h.potentialEndDate;
    }
    target.bids = target.bids ?? h.bids;
    target.hasBidList = Boolean(target.hasBidList || h.hasBidList);
  };
  const extra: IntelAward[] = [];
  // Stable slug assignment: oldest history first, then id.
  const sorted = [...rows].sort((a, b) => String(a.award_date).localeCompare(String(b.award_date)) || a.id.localeCompare(b.id));
  for (const r of sorted) {
    const h = historyAward(r, ctx);
    if (!h) continue;
    const ref = r.board_ref ? byRef.get(r.board_ref) : undefined;
    if (ref && ref.country === h.country) {
      attach(ref, h);
      continue;
    }
    const twin = h.winnerKey ? (byWinner.get(`${h.country}|${h.winnerKey}`) ?? []).find((b) => !b.historyId && daysApart(b.date, h.date) <= 31 && closeValue(b.amount, h.amount)) : undefined;
    if (twin) {
      attach(twin, h);
      continue;
    }
    if (h.winnerKey) {
      let s = slugOf.get(h.winnerKey);
      if (!s) {
        const base = slugify(h.winner!).slice(0, 80) || "company";
        s = base;
        for (let i = 2; used.has(s); i++) s = `${base}-${i}`;
        used.add(s);
        slugOf.set(h.winnerKey, s);
      }
      h.winnerSlug = s;
    }
    extra.push(h);
  }
  return [...out, ...extra].sort((a, b) => b.date.localeCompare(a.date) || a.slug.localeCompare(b.slug));
}

const rank = (s: IntelAward["endDateSource"]) => (s === "stated" ? 3 : s === "derived_from_title" ? 2 : s === "estimated" ? 1 : 0);
