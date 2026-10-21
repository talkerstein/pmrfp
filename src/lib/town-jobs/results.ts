/**
 * PMRFP for Towns, Part C: results, the council summary and the award (pure,
 * unit-tested in test/unit/towns-part-c.test.ts). The database side is
 * ./results-server.ts; the table is town_job_results (migration
 * 20261021000120).
 *
 *   Results      After the sealed box is opened (or after closing, for a
 *                post that isn't sealed): every quote in one table, the
 *                lowest compliant price, the average, how many came in, and
 *                invitations sent against quotes received.
 *   Compliant    A quote with a price that the town hasn't declined.
 *                Declining a quote that misses a requirement (on the
 *                responses page) drops it out of "lowest compliant".
 *   Council      The town picks a recommendation and writes a short reason;
 *                the summary prints (or saves as PDF) and downloads as CSV.
 *   Award        Once the town picks the winner (the PM job flow's pick:
 *                contacts revealed both ways, the others thanked), it can
 *                publish the award: winner, amount (optional), date. The
 *                listing shows "Awarded to X", and the award joins award
 *                history in the importers' shape (source 'pmrfp-towns').
 */
import { buyerKey as historyBuyerKey, clip, provinceFor, validateAward, winnerFields, type AwardHistoryInput } from "@/lib/contract-history/model";

export const AWARD_SOURCE = "pmrfp-towns";
export const AWARD_LICENCE = "Published by the buyer on PMRFP";
export const RATIONALE_MAX = 2000;

export interface SummaryResponse {
  id: string;
  status: string;
  orgId: string;
  company: string;
  amount: number | null;
  kind: "estimate" | "firm" | null;
  startDate: string | null;
  notes: string | null;
  message?: string | null;
  createdAt: string;
  /** The company's PMRFP profile: approved, under review… */
  profileStatus: string | null;
  verified: boolean;
  insurance: string | null;
  wsib: string | null;
}

/** Has a price, and the town hasn't declined it. */
export function isCompliant(r: Pick<SummaryResponse, "status" | "amount">): boolean {
  return r.amount != null && Number.isFinite(r.amount) && r.status !== "declined";
}

const cents = (n: number) => Math.round(n * 100) / 100;

export interface ResultsSummary {
  /** Quotes received (every response). */
  received: number;
  /** Of those, with a price. */
  priced: number;
  compliant: number;
  lowestCompliant: { id: string; company: string; amount: number } | null;
  /** Average of the compliant prices (null without any). */
  average: number | null;
  /** Highest compliant price (the spread). */
  highestCompliant: number | null;
  invitesSent: number;
  /** Invited companies that sent a quote. */
  invitedResponded: number;
  /** Lowest price first (no price last), then by company. */
  rows: SummaryResponse[];
}

/**
 * The numbers a council report needs. `invitedOrgIds`: companies the town
 * invited on PMRFP (town_invites), to say how many invitations turned into quotes.
 */
export function summarize(responses: readonly SummaryResponse[], invites: { sent: number; invitedOrgIds?: ReadonlySet<string> }): ResultsSummary {
  const rows = [...responses].sort((a, b) => {
    if (a.amount == null && b.amount == null) return a.company.localeCompare(b.company);
    if (a.amount == null) return 1;
    if (b.amount == null) return -1;
    return a.amount - b.amount || a.company.localeCompare(b.company);
  });
  const compliant = rows.filter(isCompliant);
  const prices = compliant.map((r) => r.amount!);
  const low = compliant[0] ?? null;
  return {
    received: rows.length,
    priced: rows.filter((r) => r.amount != null).length,
    compliant: compliant.length,
    lowestCompliant: low ? { id: low.id, company: low.company, amount: low.amount! } : null,
    average: prices.length ? cents(prices.reduce((s, n) => s + n, 0) / prices.length) : null,
    highestCompliant: prices.length ? Math.max(...prices) : null,
    invitesSent: invites.sent,
    invitedResponded: invites.invitedOrgIds ? rows.filter((r) => invites.invitedOrgIds!.has(r.orgId)).length : 0,
    rows,
  };
}

/** Can the town see results yet? A sealed post once opened; any other after closing (or once a winner is picked). */
export function resultsReady(p: { sealed: boolean; opened: boolean; closed: boolean; status: string }): boolean {
  if (p.sealed) return p.opened;
  return p.closed || p.status === "awarded" || p.status === "closed" || p.status === "expired";
}

export function cleanRationale(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.replace(/\r\n/g, "\n").trim();
  return s.length >= 3 && s.length <= RATIONALE_MAX ? s : null;
}

// ── CSV ──────────────────────────────────────────────────────────────

/** One CSV cell: quoted when needed, and a leading = + - @ neutralised (spreadsheet formula injection). */
export function csvCell(v: unknown): string {
  if (v == null) return "";
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(header: readonly string[], rows: readonly (readonly unknown[])[]): string {
  // A BOM so Excel opens accents (French names) correctly.
  return "﻿" + [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

export interface SummaryCsvLabels {
  company: string;
  amount: string;
  kind: string;
  start: string;
  notes: string;
  status: string;
  profile: string;
  insurance: string;
  wsib: string;
  received: string;
  recommended: string;
  yes: string;
  firm: string;
  estimate: string;
  notOnFile: string;
  statuses: Record<string, string>;
  profiles: Record<string, string>;
}

/** The council summary's table as CSV (one row a quote, lowest price first). */
export function summaryCsv(s: ResultsSummary, labels: SummaryCsvLabels, recommendedId: string | null): string {
  return toCsv(
    [labels.company, labels.amount, labels.kind, labels.start, labels.notes, labels.status, labels.profile, labels.insurance, labels.wsib, labels.received, labels.recommended],
    s.rows.map((r) => [
      r.company,
      r.amount == null ? "" : r.amount.toFixed(2),
      r.kind === "firm" ? labels.firm : r.kind === "estimate" ? labels.estimate : "",
      r.startDate ?? "",
      r.notes ?? "",
      labels.statuses[r.status] ?? r.status,
      (r.profileStatus && labels.profiles[r.profileStatus]) || r.profileStatus || "",
      r.insurance || labels.notOnFile,
      r.wsib || labels.notOnFile,
      r.createdAt.slice(0, 10),
      r.id === recommendedId ? labels.yes : "",
    ]),
  );
}

// ── The award ────────────────────────────────────────────────────────

export interface AwardInput {
  winnerName: unknown;
  amount: unknown;
  amountPublic: unknown;
  awardDate: unknown;
}

export type AwardError = "winner" | "amount" | "date" | null;

/** Check the "Publish award" form: a winner name, an optional amount, a real date (not in the future). */
export function planAward(input: AwardInput, today: string): { ok: true; award: { winnerName: string; amount: number | null; amountPublic: boolean; awardDate: string } } | { ok: false; error: Exclude<AwardError, null> } {
  const winnerName = typeof input.winnerName === "string" ? input.winnerName.replace(/\s+/g, " ").trim() : "";
  if (winnerName.length < 2 || winnerName.length > 300) return { ok: false, error: "winner" };
  const rawAmount = typeof input.amount === "number" ? String(input.amount) : typeof input.amount === "string" ? input.amount.replace(/[$\s,]|CAD/gi, "").trim() : "";
  let amount: number | null = null;
  if (rawAmount) {
    const n = Number(rawAmount);
    if (!Number.isFinite(n) || n < 0 || n > 1_000_000_000 || !/^\d+(\.\d{1,2})?$/.test(rawAmount)) return { ok: false, error: "amount" };
    amount = n;
  }
  const awardDate = typeof input.awardDate === "string" ? input.awardDate.trim() : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(awardDate) || Number.isNaN(Date.parse(`${awardDate}T12:00:00Z`)) || awardDate > today || awardDate < "2000-01-01") return { ok: false, error: "date" };
  const pub = input.amountPublic === true || input.amountPublic === "on" || input.amountPublic === "true";
  return { ok: true, award: { winnerName, amount, amountPublic: amount != null && pub, awardDate } };
}

export interface AwardHistoryFacts {
  rfpId: string;
  slug: string;
  title: string;
  buyerName: string | null;
  province: string | null;
  city: string | null;
  winnerName: string;
  amount: number | null;
  amountPublic: boolean;
  awardDate: string;
  startDate: string | null;
  quotes: number;
  tradeSlugs: string[];
  today: string;
  base?: string;
}

/**
 * The award as an award_history row, in the same shape the public award
 * imports write (lib/contract-history/model): business names only (a
 * winner that looks like a person is counted, not named), CAD in Canada,
 * the amount only when the town published it. Null when it can't be stored.
 */
export function awardHistoryRow(f: AwardHistoryFacts): AwardHistoryInput | null {
  const winner = winnerFields(f.winnerName);
  if (!winner) return null;
  const base = (f.base || "https://pmrfp.com").replace(/\/$/, "").replace(/^http:\/\//, "https://");
  const buyer = clip(f.buyerName, 300);
  const row: AwardHistoryInput = {
    source: AWARD_SOURCE,
    source_key: f.rfpId,
    board_ref: null,
    title: clip(f.title, 500) ?? "Town quote request",
    description: null,
    buyer,
    buyer_key: historyBuyerKey(buyer),
    ...winner,
    value: f.amountPublic && f.amount != null ? cents(f.amount) : null,
    currency: "CAD",
    country: "CA",
    province: provinceFor("CA", f.province),
    city: clip(f.city, 120),
    award_date: f.awardDate,
    award_date_precision: "day",
    start_date: f.startDate && /^\d{4}-\d{2}-\d{2}$/.test(f.startDate) ? f.startDate : null,
    end_date: null,
    end_date_source: null,
    potential_end_date: null,
    number_of_bids: Math.max(0, Math.min(1000, Math.round(f.quotes))),
    trade_slugs: [...new Set(f.tradeSlugs.filter(Boolean))],
    notice_url: /^https:\/\//.test(base) ? `${base}/rfps/${f.slug}` : null,
    licence: AWARD_LICENCE,
    attribution: `${buyer ?? "The buyer"} via PMRFP`,
    as_of: f.today,
  };
  return validateAward(row) ? null : row;
}
