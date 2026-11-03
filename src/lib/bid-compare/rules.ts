/**
 * Bid Comparison Sheet: the pure rules (no I/O), so the board sees the same
 * numbers the tests check.
 *
 * Country-first: a Canadian comparison is in CAD with HST/GST/QST, a U.S.
 * one in USD with sales tax. The country is the PM company's, never mixed.
 * "Lowest" compares prices BEFORE tax (tax is a pass-through and bidders
 * don't always state it the same way); tax and the total with tax are
 * shown on their own lines.
 */

import { cleanEmail, parseAmount, parseDate, type CertStatus } from "@/lib/vendor-certs/rules";

export type BidCountry = "CA" | "US";

export const MIN_BIDS = 2;
export const MAX_BIDS = 6;
export const MAX_SCOPE_ITEMS = 30;

export function currencyOf(country: BidCountry): "CAD" | "USD" {
  return country === "US" ? "USD" : "CAD";
}

/** Money in cents, back to dollars, so 0.1 + 0.2 never shows up on a board sheet. */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ── The math ─────────────────────────────────────────────────────────

export interface SheetItem {
  id: string;
  label: string;
}

export interface SheetBid {
  id: string;
  /** Before tax. */
  price: number | null;
  taxAmount: number | null;
  taxPercent: number | null;
  /** Scope item id → price; missing or null = not quoted. */
  linePrices: Record<string, number | null | undefined>;
}

/** The tax on a bid: the amount when given, else the percent of the price, else unknown. */
export function bidTax(b: Pick<SheetBid, "price" | "taxAmount" | "taxPercent">): number | null {
  if (b.taxAmount != null) return round2(b.taxAmount);
  if (b.taxPercent != null && b.price != null) return round2((b.price * b.taxPercent) / 100);
  return null;
}

/** Price plus tax (no tax stated = the price alone). Null without a price. */
export function bidTotal(b: Pick<SheetBid, "price" | "taxAmount" | "taxPercent">): number | null {
  if (b.price == null) return null;
  return round2(b.price + (bidTax(b) ?? 0));
}

/** (highest − lowest) ÷ lowest, as a percent with one decimal. Null with fewer than two prices or a $0 low. */
export function spreadPct(prices: readonly number[]): number | null {
  if (prices.length < 2) return null;
  const lo = Math.min(...prices);
  const hi = Math.max(...prices);
  if (lo <= 0) return null;
  return Math.round(((hi - lo) / lo) * 1000) / 10;
}

function quoted(v: number | null | undefined): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

export interface BidComparison {
  /** Bids with a price. */
  priced: number;
  /** The lowest price before tax, and every bid at it (ties). */
  lowest: number | null;
  lowestIds: string[];
  highest: number | null;
  spreadPct: number | null;
  /** How far each priced bid is above the lowest. */
  aboveLowest: Record<string, { amount: number; pct: number | null } | null>;
  tax: Record<string, number | null>;
  total: Record<string, number | null>;
  /** Per scope item: the cheapest bid(s) and the bids that didn't quote it. */
  items: Record<string, { lowestIds: string[]; notQuoted: string[] }>;
  /** Per bid: the scope items it didn't quote. */
  notQuoted: Record<string, string[]>;
  /** Per bid: the sum of the items it did quote (null when it quoted none). */
  lineSum: Record<string, number | null>;
  /** Every item quoted, but they don't add up to the price (more than $1 off). */
  lineMismatch: Record<string, boolean>;
}

/** The side-by-side numbers for a sheet: lowest, spread, per-item lows, what's not quoted. */
export function compareBids(bids: readonly SheetBid[], items: readonly SheetItem[]): BidComparison {
  const pricedBids = bids.filter((b) => quoted(b.price));
  const prices = pricedBids.map((b) => b.price as number);
  const lowest = prices.length ? Math.min(...prices) : null;
  const highest = prices.length ? Math.max(...prices) : null;
  const out: BidComparison = {
    priced: pricedBids.length,
    lowest,
    lowestIds: lowest == null ? [] : pricedBids.filter((b) => b.price === lowest).map((b) => b.id),
    highest,
    spreadPct: spreadPct(prices),
    aboveLowest: {},
    tax: {},
    total: {},
    items: {},
    notQuoted: {},
    lineSum: {},
    lineMismatch: {},
  };
  for (const b of bids) {
    out.tax[b.id] = bidTax(b);
    out.total[b.id] = bidTotal(b);
    out.aboveLowest[b.id] =
      quoted(b.price) && lowest != null ? { amount: round2(b.price - lowest), pct: lowest > 0 ? Math.round(((b.price - lowest) / lowest) * 1000) / 10 : null } : null;
    const missing = items.filter((it) => !quoted(b.linePrices[it.id])).map((it) => it.id);
    out.notQuoted[b.id] = missing;
    const quotedItems = items.filter((it) => quoted(b.linePrices[it.id]));
    const sum = quotedItems.length ? round2(quotedItems.reduce((s, it) => s + (b.linePrices[it.id] as number), 0)) : null;
    out.lineSum[b.id] = sum;
    out.lineMismatch[b.id] = items.length > 0 && missing.length === 0 && sum != null && quoted(b.price) && Math.abs(sum - b.price) > 1;
  }
  for (const it of items) {
    const withPrice = bids.filter((b) => quoted(b.linePrices[it.id]));
    const lo = withPrice.length ? Math.min(...withPrice.map((b) => b.linePrices[it.id] as number)) : null;
    out.items[it.id] = {
      lowestIds: lo == null || withPrice.length < 2 ? [] : withPrice.filter((b) => b.linePrices[it.id] === lo).map((b) => b.id),
      notQuoted: bids.filter((b) => !quoted(b.linePrices[it.id])).map((b) => b.id),
    };
  }
  return out;
}

// ── Insurance and WSIB / workers' comp ───────────────────────────────

/**
 * What the sheet says about a bidder's cover, for one kind of certificate:
 *   on_file   a current certificate in the PM's vendor insurance tracker
 *   expiring  on file, expiring within 30 days
 *   expired   on file, past its expiry (flagged)
 *   profile   nothing current on file, but the bidder's PMRFP profile states it
 *   missing   neither (flagged)
 */
export type CoverageState = "on_file" | "expiring" | "expired" | "profile" | "missing";

const STATUS_RANK: Record<CertStatus, number> = { valid: 0, expiring: 1, missing: 2, expired: 3 };

/** The best status among a bidder's certificates of one kind (valid beats expiring beats undated beats expired). */
export function bestCertStatus(statuses: readonly CertStatus[]): CertStatus | null {
  if (!statuses.length) return null;
  return [...statuses].sort((a, b) => STATUS_RANK[a] - STATUS_RANK[b])[0];
}

export function coverageState(p: { tracker: CertStatus | null; profile: string | null | undefined }): CoverageState {
  if (p.tracker === "valid") return "on_file";
  if (p.tracker === "expiring") return "expiring";
  if (p.profile?.trim()) return p.tracker === "expired" ? "expired" : "profile";
  if (p.tracker === "expired") return "expired";
  return "missing";
}

export function coverageFlagged(s: CoverageState): boolean {
  return s === "expired" || s === "missing";
}

/** "Acme Roofing Inc." and "acme roofing" are the same vendor. */
export function normalizeCompany(name: string | null | undefined): string {
  return (name ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ")
    .replace(/\b(inc|incorporated|ltd|limited|llc|corp|corporation|co|company|ltee|ltée)\b\.?/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export interface TrackerCert {
  vendor_name: string;
  contact_email: string | null;
  vendor_organization_id: string | null;
  cert_type: string;
  status: CertStatus;
}

/** The PM's tracker rows that belong to this bidder: same PMRFP company, same email, or the same name. */
export function trackerCertsFor(bid: { companyName: string; contactEmail: string | null; bidderOrgId: string | null }, certs: readonly TrackerCert[]): TrackerCert[] {
  const email = cleanEmail(bid.contactEmail);
  const name = normalizeCompany(bid.companyName);
  return certs.filter(
    (c) =>
      (bid.bidderOrgId && c.vendor_organization_id === bid.bidderOrgId) ||
      (email && cleanEmail(c.contact_email) === email) ||
      (name && normalizeCompany(c.vendor_name) === name),
  );
}

/** Liability and WSIB / workers' comp for one bidder, from the tracker and its PMRFP profile. */
export function bidderCoverage(
  bid: { companyName: string; contactEmail: string | null; bidderOrgId: string | null },
  certs: readonly TrackerCert[],
  profile: { insurance_status: string | null; wsib_status: string | null } | null,
): { insurance: CoverageState; wsib: CoverageState } {
  const mine = trackerCertsFor(bid, certs);
  const of = (types: string[]) => bestCertStatus(mine.filter((c) => types.includes(c.cert_type)).map((c) => c.status));
  return {
    insurance: coverageState({ tracker: of(["general_liability"]), profile: profile?.insurance_status }),
    wsib: coverageState({ tracker: of(["wsib_clearance", "workers_comp"]), profile: profile?.wsib_status }),
  };
}

// ── Fields ───────────────────────────────────────────────────────────

function text(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const s = v.replace(/[ \t]+/g, " ").trim();
  return s ? s.slice(0, max) : null;
}

/** Multi-line text (exclusions, the recommendation): keep line breaks, trim each line. */
function longText(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const s = v
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((l) => l.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return s ? s.slice(0, max) : null;
}

/** "13", "13%", "14.975 %" → 13 / 13 / 14.975; outside 0–100 or junk → null. */
export function parsePercent(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) && v >= 0 && v <= 100 ? Math.round(v * 1000) / 1000 : null;
  if (typeof v !== "string") return null;
  const s = v.trim().replace(/\s|%/g, "").replace(/,/g, ".");
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  return n >= 0 && n <= 100 ? Math.round(n * 1000) / 1000 : null;
}

export interface ComparisonInput {
  title: string;
  building_name: string | null;
  building_address: string | null;
  trade: string | null;
}

/** A PM's typed comparison → clean columns, or "title" when it's empty. */
export function cleanComparisonInput(raw: Record<string, unknown>): { ok: true; value: ComparisonInput } | { ok: false; field: "title" } {
  const title = text(raw.title, 160);
  if (!title) return { ok: false, field: "title" };
  return { ok: true, value: { title, building_name: text(raw.building_name, 160), building_address: text(raw.building_address, 240), trade: text(raw.trade, 80) } };
}

export interface BidInput {
  company_name: string;
  contact_email: string | null;
  total_price: number | null;
  tax_amount: number | null;
  tax_percent: number | null;
  line_prices: Record<string, number>;
  start_date: string | null;
  duration: string | null;
  warranty: string | null;
  payment_terms: string | null;
  notes: string | null;
}

export type BidFieldError = "company" | "email" | "price" | "tax" | "date" | "line";

function amountField(v: unknown): { ok: boolean; value: number | null } {
  const raw = typeof v === "string" ? v.trim() : v;
  if (raw === "" || raw == null) return { ok: true, value: null };
  const n = parseAmount(raw);
  return n === null ? { ok: false, value: null } : { ok: true, value: n };
}

/**
 * A PM's typed bid → clean columns, or which field is wrong. Line items
 * come in as line_<item id> and only the comparison's own items are kept.
 */
export function cleanBidInput(raw: Record<string, unknown>, items: readonly SheetItem[]): { ok: true; value: BidInput } | { ok: false; field: BidFieldError } {
  const company = text(raw.company_name, 160);
  if (!company) return { ok: false, field: "company" };
  const emailRaw = typeof raw.contact_email === "string" ? raw.contact_email.trim() : "";
  const email = emailRaw ? cleanEmail(emailRaw) : null;
  if (emailRaw && !email) return { ok: false, field: "email" };
  const price = amountField(raw.total_price);
  if (!price.ok) return { ok: false, field: "price" };
  const taxAmount = amountField(raw.tax_amount);
  if (!taxAmount.ok) return { ok: false, field: "tax" };
  const pctRaw = typeof raw.tax_percent === "string" ? raw.tax_percent.trim() : raw.tax_percent;
  const taxPercent = pctRaw === "" || pctRaw == null ? null : parsePercent(pctRaw);
  if (pctRaw !== "" && pctRaw != null && taxPercent === null) return { ok: false, field: "tax" };
  const dateRaw = typeof raw.start_date === "string" ? raw.start_date.trim() : "";
  const start = dateRaw ? parseDate(dateRaw) : null;
  if (dateRaw && !start) return { ok: false, field: "date" };
  const line: Record<string, number> = {};
  for (const it of items) {
    const v = amountField(raw[`line_${it.id}`]);
    if (!v.ok) return { ok: false, field: "line" };
    if (v.value != null) line[it.id] = v.value;
  }
  return {
    ok: true,
    value: {
      company_name: company,
      contact_email: email,
      total_price: price.value,
      // An amount wins over a percent; keep only the one that's used.
      tax_amount: taxAmount.value,
      tax_percent: taxAmount.value != null ? null : taxPercent,
      line_prices: line,
      start_date: start,
      duration: text(raw.duration, 80),
      warranty: text(raw.warranty, 160),
      payment_terms: text(raw.payment_terms, 160),
      notes: longText(raw.notes, 2000),
    },
  };
}

export function cleanRecommendation(v: unknown): string | null {
  return longText(v, 2000);
}

/** A short random id for a new scope item (stable when the label is edited). */
export function newItemId(rand: () => number = Math.random): string {
  let s = "";
  for (let i = 0; i < 8; i++) s += "abcdefghijkmnpqrstuvwxyz23456789"[Math.floor(rand() * 32)];
  return s;
}

/**
 * The scope items a PM saved: existing ids kept, new rows get one, empty
 * labels dropped, at most 30. Ids are [a-z0-9]{1,16} so they're safe as
 * form field names (line_<id>).
 */
export function cleanScopeItems(rows: readonly { id?: unknown; label?: unknown }[], rand?: () => number): SheetItem[] {
  const out: SheetItem[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    const label = text(r.label, 120);
    if (!label) continue;
    let id = typeof r.id === "string" && /^[a-z0-9]{1,16}$/.test(r.id) ? r.id : "";
    while (!id || seen.has(id)) id = newItemId(rand);
    seen.add(id);
    out.push({ id, label });
    if (out.length >= MAX_SCOPE_ITEMS) break;
  }
  return out;
}

/** scope_items as stored (jsonb) → items, ignoring anything malformed. */
export function readScopeItems(v: unknown): SheetItem[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x): x is { id: string; label: string } => !!x && typeof x === "object" && typeof (x as SheetItem).id === "string" && typeof (x as SheetItem).label === "string")
    .slice(0, MAX_SCOPE_ITEMS)
    .map((x) => ({ id: x.id, label: x.label }));
}

/** line_prices as stored (jsonb) → numbers only. */
export function readLinePrices(v: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!v || typeof v !== "object" || Array.isArray(v)) return out;
  for (const [k, n] of Object.entries(v as Record<string, unknown>)) {
    const num = typeof n === "string" ? Number(n) : n;
    if (typeof num === "number" && Number.isFinite(num) && num >= 0) out[k] = num;
  }
  return out;
}

// ── The shared (board) view ──────────────────────────────────────────

/** What a shared (board) view may show of a bid: no contact emails, no files, no internal links. */
export interface SharedBid {
  id: string;
  company_name: string;
  total_price: number | null;
  tax_amount: number | null;
  tax_percent: number | null;
  line_prices: Record<string, number>;
  start_date: string | null;
  duration: string | null;
  warranty: string | null;
  payment_terms: string | null;
  notes: string | null;
  on_pmrfp: boolean;
}

export function toSharedBid(b: {
  id: string;
  company_name: string;
  total_price: number | string | null;
  tax_amount: number | string | null;
  tax_percent: number | string | null;
  line_prices: unknown;
  start_date: string | null;
  duration: string | null;
  warranty: string | null;
  payment_terms: string | null;
  notes: string | null;
  bidder_organization_id?: string | null;
}): SharedBid {
  const num = (v: number | string | null) => (v == null || v === "" ? null : Number(v));
  return {
    id: b.id,
    company_name: b.company_name,
    total_price: num(b.total_price),
    tax_amount: num(b.tax_amount),
    tax_percent: num(b.tax_percent),
    line_prices: readLinePrices(b.line_prices),
    start_date: b.start_date,
    duration: b.duration,
    warranty: b.warranty,
    payment_terms: b.payment_terms,
    notes: b.notes,
    on_pmrfp: Boolean(b.bidder_organization_id),
  };
}

// ── Invites ──────────────────────────────────────────────────────────

/** A PM company sends at most this many "join PMRFP" invites a day. */
export const DAILY_INVITE_LIMIT = 30;

export interface InviteCandidate {
  id: string;
  contact_email: string | null;
  bidder_organization_id: string | null;
  invited_at: string | null;
}

export interface InvitePlan {
  send: string[];
  skipped: { onPmrfp: string[]; noEmail: string[]; already: string[]; unsubscribed: string[]; overLimit: string[] };
}

/**
 * "Invite these bidders to PMRFP": only bidders that aren't on PMRFP, have
 * an email, were never invited from this bid, aren't on the do-not-contact
 * list, one email per address, within today's allowance.
 */
export function planInvites(bids: readonly InviteCandidate[], p: { suppressed: ReadonlySet<string>; members: ReadonlySet<string>; budget: number }): InvitePlan {
  const plan: InvitePlan = { send: [], skipped: { onPmrfp: [], noEmail: [], already: [], unsubscribed: [], overLimit: [] } };
  const emails = new Set<string>();
  for (const b of bids) {
    const email = cleanEmail(b.contact_email);
    if (b.bidder_organization_id || (email && p.members.has(email))) plan.skipped.onPmrfp.push(b.id);
    else if (!email) plan.skipped.noEmail.push(b.id);
    else if (b.invited_at || emails.has(email)) plan.skipped.already.push(b.id);
    else if (p.suppressed.has(email)) plan.skipped.unsubscribed.push(b.id);
    else if (plan.send.length >= Math.max(0, p.budget)) plan.skipped.overLimit.push(b.id);
    else {
      plan.send.push(b.id);
      emails.add(email);
    }
  }
  return plan;
}
