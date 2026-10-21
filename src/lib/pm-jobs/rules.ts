/**
 * The PM job flow's rules (pure, unit-tested in test/unit/pm-job-flow.test.ts).
 *
 * A "PM job" is a listing a member posted on PMRFP: a property manager,
 * landlord or owner RFP (source_type 'property_manager_direct') or a GC
 * sub-trade package ('gc_package'), with a poster on file. Imported public
 * tenders are never PM jobs: they're answered on the buyer's own portal.
 *
 *   Responding   any approved trade company (or supplier) can respond to a
 *                PM job. Free accounts get FREE_MONTHLY_RESPONSES a calendar
 *                month (Toronto time); Trade Pro and trials are unlimited.
 *                Trade Pro also keeps responding to other private listings,
 *                as before. The database enforces the same limit (trigger in
 *                migration 20261021000020).
 *   Contacts     "anonymous until you choose": the PM's contact reaches a
 *                trade only when the PM picks it or presses "Share my
 *                contact". The PM sees a trade's email and phone once they
 *                pick it, or when the trade shows them publicly anyway
 *                (public_contact_visibility 'show_contact'). A picked pair
 *                always sees each other.
 */

export const PM_JOB_SOURCES = ["property_manager_direct", "gc_package"] as const;

/** Free trade accounts: responses to PM jobs per calendar month. Keep in step with the SQL trigger. */
export const FREE_MONTHLY_RESPONSES = 3;

/** The calendar month the allowance resets on. */
export const ALLOWANCE_TIME_ZONE = "America/Toronto";

/** Company types that respond to jobs (the listable ones). */
export const RESPONDER_ORG_TYPES = ["trade_company", "supplier"] as const;

export function isPmJob(rfp: { source_type?: string | null; posted_by_user_id?: string | null } | null | undefined): boolean {
  if (!rfp) return false;
  return (PM_JOB_SOURCES as readonly string[]).includes(rfp.source_type ?? "") && Boolean(rfp.posted_by_user_id);
}

/** Same test from the public side, where the poster isn't visible (the server re-checks with the poster). */
export function isPmJobSource(sourceType: string | null | undefined): boolean {
  return (PM_JOB_SOURCES as readonly string[]).includes(sourceType ?? "");
}

/** Minutes `tz` is ahead of UTC at `at` (Toronto: -240 in summer, -300 in winter). */
function tzOffsetMinutes(at: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(at);
  const n = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const asUtc = Date.UTC(n("year"), n("month") - 1, n("day"), n("hour") % 24, n("minute"), n("second"));
  return Math.round((asUtc - Math.floor(at.getTime() / 1000) * 1000) / 60_000);
}

/** The instant the current calendar month began in `tz` (default Toronto), as an ISO string. */
export function monthStart(now: Date = new Date(), tz: string = ALLOWANCE_TIME_ZONE): string {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, year: "numeric", month: "2-digit" }).formatToParts(now);
  const year = Number(parts.find((p) => p.type === "year")?.value);
  const month = Number(parts.find((p) => p.type === "month")?.value);
  // Midnight local on the 1st: start from midnight UTC and correct by the offset at that moment (twice, across a DST change).
  let t = Date.UTC(year, month - 1, 1);
  for (let i = 0; i < 2; i++) t = Date.UTC(year, month - 1, 1) - tzOffsetMinutes(new Date(t), tz) * 60_000;
  return new Date(t).toISOString();
}

export interface Allowance {
  /** Trade Pro or a trial: no monthly limit. */
  unlimited: boolean;
  limit: number;
  used: number;
  /** Responses left this month (Infinity when unlimited). */
  left: number;
}

export function responseAllowance(p: { pro: boolean; usedThisMonth: number }): Allowance {
  if (p.pro) return { unlimited: true, limit: Infinity, used: p.usedThisMonth, left: Infinity };
  const used = Math.max(0, p.usedThisMonth);
  return { unlimited: false, limit: FREE_MONTHLY_RESPONSES, used, left: Math.max(0, FREE_MONTHLY_RESPONSES - used) };
}

export type RespondRefusal =
  | "signin"
  | "org"
  | "role"
  | "suspended"
  | "public_tender"
  | "not_open"
  | "own_job"
  | "pro_required"
  | "not_approved"
  | "limit"
  | null;

export interface RespondInput {
  signedIn: boolean;
  org: { id: string; organization_type: string; status: string; profile_status: string } | null;
  /** Trade Pro right now (paying or trial). */
  pro: boolean;
  rfp: {
    status: string;
    source_type: string | null;
    posted_by_user_id: string | null;
    posted_by_organization_id: string | null;
  };
  userId?: string | null;
  usedThisMonth: number;
}

/**
 * Can this company respond to this listing now? The most actionable reason
 * first. null = yes; `free` says whether it uses the monthly allowance.
 */
export function respondDecision(p: RespondInput): { refusal: RespondRefusal; free: boolean } {
  const no = (refusal: Exclude<RespondRefusal, null>) => ({ refusal, free: false });
  if (!p.signedIn) return no("signin");
  if (!p.org) return no("org");
  if (!(RESPONDER_ORG_TYPES as readonly string[]).includes(p.org.organization_type)) return no("role");
  if (p.org.status === "suspended") return no("suspended");
  if (p.rfp.source_type === "public_source") return no("public_tender");
  if (p.rfp.status !== "published") return no("not_open");
  if (
    (p.rfp.posted_by_organization_id && p.rfp.posted_by_organization_id === p.org.id) ||
    (p.userId && p.rfp.posted_by_user_id === p.userId)
  ) {
    return no("own_job");
  }
  // Trade Pro: any private listing, no limit (as before).
  if (p.pro) return { refusal: null, free: false };
  if (!isPmJob(p.rfp)) return no("pro_required");
  if (p.org.profile_status !== "approved") return no("not_approved");
  if (responseAllowance({ pro: false, usedThisMonth: p.usedThisMonth }).left <= 0) return no("limit");
  return { refusal: null, free: true };
}

/** HTTP status for each refusal (the dialog reads `reason`). */
export const REFUSAL_STATUS: Record<Exclude<RespondRefusal, null>, number> = {
  signin: 401,
  org: 400,
  role: 403,
  suspended: 403,
  public_tender: 403,
  not_open: 404,
  own_job: 403,
  pro_required: 403,
  not_approved: 403,
  limit: 429,
};

/** The SQL trigger's refusal (P0001 'free response limit reached'). */
export function isFreeLimitError(e: { code?: string | null; message?: string | null; hint?: string | null } | null | undefined): boolean {
  if (!e) return false;
  return e.hint === "pmrfp_free_limit" || /free response limit/i.test(e.message ?? "");
}

// ── Bid handling ─────────────────────────────────────────────────────

/** Responses the PM can still act on. */
export const OPEN_RESPONSE_STATUSES = ["submitted", "viewed", "contact_revealed", "shortlisted"] as const;

export function isOpenResponse(status: string): boolean {
  return (OPEN_RESPONSE_STATUSES as readonly string[]).includes(status);
}

/** Listing statuses a PM can still pick a trade on. */
export function canPickOn(rfpStatus: string): boolean {
  return rfpStatus === "published" || rfpStatus === "closed" || rfpStatus === "expired";
}

export interface ResponseRow {
  id: string;
  status: string;
  outcome_notified_at?: string | null;
}

/**
 * Picking one response: it becomes 'picked'; every other response the PM
 * hadn't already declined becomes 'not_selected'. `notify` = the responses
 * whose trade still has to be told ("thanks, it went to another company"):
 * the newly not-selected ones that weren't told anything yet.
 */
export function pickPlan(responses: readonly ResponseRow[], pickedId: string): { picked: string | null; notSelected: string[]; notify: string[] } {
  const picked = responses.find((r) => r.id === pickedId && r.status !== "declined" && r.status !== "picked") ? pickedId : null;
  if (!picked) return { picked: null, notSelected: [], notify: [] };
  const notSelected = responses.filter((r) => r.id !== pickedId && isOpenResponse(r.status)).map((r) => r.id);
  const notify = responses.filter((r) => notSelected.includes(r.id) && !r.outcome_notified_at).map((r) => r.id);
  return { picked, notSelected, notify };
}

// ── Contact reveal ───────────────────────────────────────────────────

export type ContactVisibility = "show_contact" | "request_intro" | "hide_contact" | string | null | undefined;

/** May the PM see this trade's email and phone? */
export function pmSeesTradeContact(p: { status: string; contactRevealed?: boolean | null; tradeVisibility: ContactVisibility }): boolean {
  if (p.status === "picked" || p.contactRevealed) return true;
  // Shown to everyone on their public profile anyway.
  return p.tradeVisibility === "show_contact";
}

/** May the trade see the PM's contact? Only once the PM chose them. */
export function tradeSeesPmContact(p: { status: string; pmContactShared?: boolean | null }): boolean {
  return p.status === "picked" || Boolean(p.pmContactShared);
}

export interface ContactCard {
  name: string | null;
  company: string | null;
  email: string | null;
  phone: string | null;
}

/** The PM's contact for a trade: the listing's contact first, then the poster's account and company. */
export function pmContactCard(p: {
  rfp: { contact_name?: string | null; contact_email?: string | null; contact_phone?: string | null };
  poster?: { full_name?: string | null; email?: string | null; phone?: string | null } | null;
  posterOrg?: { name?: string | null; phone?: string | null; email?: string | null } | null;
}): ContactCard {
  const clean = (v: string | null | undefined) => (v && v.trim() ? v.trim() : null);
  return {
    name: clean(p.rfp.contact_name) ?? clean(p.poster?.full_name),
    company: clean(p.posterOrg?.name),
    email: clean(p.rfp.contact_email) ?? clean(p.poster?.email) ?? clean(p.posterOrg?.email),
    phone: clean(p.rfp.contact_phone) ?? clean(p.poster?.phone) ?? clean(p.posterOrg?.phone),
  };
}

/** The trade's contact for the PM: the company's own details, then the person who responded. */
export function tradeContactCard(p: {
  org: { name?: string | null; email?: string | null; phone?: string | null };
  submitter?: { full_name?: string | null; email?: string | null; phone?: string | null } | null;
}): ContactCard {
  const clean = (v: string | null | undefined) => (v && v.trim() ? v.trim() : null);
  return {
    name: clean(p.submitter?.full_name),
    company: clean(p.org.name),
    email: clean(p.org.email) ?? clean(p.submitter?.email),
    phone: clean(p.org.phone) ?? clean(p.submitter?.phone),
  };
}

// ── Quotes ───────────────────────────────────────────────────────────

export type QuoteKind = "estimate" | "firm";

export function parseQuoteKind(v: unknown): QuoteKind | null {
  return v === "estimate" || v === "firm" ? v : null;
}

/**
 * A typed price → a number, or null. Accepts "12500", "12,500", "$12,500.50"
 * and the French "12 500,50 $": a comma followed by one or two digits at the
 * end is a decimal comma; other commas, spaces and dots between groups of
 * three are thousands separators.
 */
export function parseQuoteAmount(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) && v >= 0 && v <= 1_000_000_000 ? Math.round(v * 100) / 100 : null;
  if (typeof v !== "string") return null;
  let s = v.replace(/CAD|USD|\$/gi, "").replace(/[\s  ]/g, "").trim();
  if (!s) return null;
  const decimalComma = /,\d{1,2}$/.test(s) && !s.includes(".");
  if (decimalComma) s = s.replace(/\.(?=\d{3})/g, "").replace(/,(?=\d{3}(\D|$))/g, "").replace(/,(\d{1,2})$/, ".$1");
  else s = s.replace(/,/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const n = Number(s);
  return n <= 1_000_000_000 ? n : null;
}

// ── Admin ────────────────────────────────────────────────────────────

/** Where new-post and other admin notices go: ADMIN_NOTIFICATION_EMAIL, else info@pmrfp.com. */
export function adminNotificationEmail(env: string | undefined = process.env.ADMIN_NOTIFICATION_EMAIL): string {
  const v = (env ?? "").trim();
  return v || "info@pmrfp.com";
}
