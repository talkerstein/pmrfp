/**
 * PMRFP for Towns, Part C: the sealed quote box's rules (pure, unit-tested in
 * test/unit/towns-part-c.test.ts). The database enforces all of it
 * (migration 20261021000120_towns_part_c.sql: the private sealed_box schema
 * and its functions); this file mirrors what the pages need to show.
 *
 *   Sealed        A town's quote request can be "Sealed until closing"
 *                 (chosen when it's posted, fixed once live). Until the box
 *                 is opened the town and PMRFP staff see a count, nothing
 *                 else. Each trade sees, replaces and withdraws its own quote
 *                 until closing. A withdrawn quote is erased (returned
 *                 unopened).
 *   Closing       The end of the closing day in the town's own time zone
 *                 (townClosesAt, the same rule as SQL town_closes_at). A
 *                 quote after that is refused, and the refusal is logged.
 *   Opening       After closing, one town member asks to open; a second,
 *                 different member of the same town confirms within 7 days.
 *                 A one-person town names a witness, who confirms through a
 *                 one-time link. Only then do the quotes become responses.
 *   Break-glass   A PMRFP admin can look inside early only with a written
 *                 reason; it's logged in the town's own record and the town
 *                 is told in-app.
 */

export const OPENING_DAYS = 7;

/** The town's time zone, from its page key's province ("british-columbia/…" → Pacific). Same table as SQL town_time_zone. */
export function townTimeZone(buyerKey: string | null | undefined): string {
  switch ((buyerKey ?? "").split("/")[0]) {
    case "british-columbia":
      return "America/Vancouver";
    case "alberta":
      return "America/Edmonton";
    case "saskatchewan":
      return "America/Regina";
    case "manitoba":
      return "America/Winnipeg";
    case "new-brunswick":
      return "America/Moncton";
    case "nova-scotia":
    case "prince-edward-island":
      return "America/Halifax";
    case "newfoundland-and-labrador":
      return "America/St_Johns";
    case "yukon":
      return "America/Whitehorse";
    case "northwest-territories":
      return "America/Yellowknife";
    case "nunavut":
      return "America/Iqaluit";
    default:
      return "America/Toronto";
  }
}

/** Minutes `tz` is ahead of UTC at `at` (Toronto: -240 in summer). */
function offsetMinutes(at: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(at);
  const n = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const asUtc = Date.UTC(n("year"), n("month") - 1, n("day"), n("hour") % 24, n("minute"), n("second"));
  return Math.round((asUtc - Math.floor(at.getTime() / 1000) * 1000) / 60_000);
}

/**
 * The closing instant (ISO): midnight at the end of `deadline` in the town's
 * time zone. Null without a date.
 */
export function townClosesAt(deadline: string | null | undefined, buyerKey: string | null | undefined): string | null {
  if (!deadline || !/^\d{4}-\d{2}-\d{2}$/.test(deadline.slice(0, 10))) return null;
  const [y, m, d] = deadline.slice(0, 10).split("-").map(Number);
  const tz = townTimeZone(buyerKey);
  const midnightUtc = Date.UTC(y, m - 1, d + 1);
  let t = midnightUtc;
  // Local midnight: correct by the offset at that moment (twice, across a DST change).
  for (let i = 0; i < 2; i++) t = midnightUtc - offsetMinutes(new Date(t), tz) * 60_000;
  return new Date(t).toISOString();
}

/** Has the box closed at `now`? */
export function isClosed(closesAt: string | null | undefined, now: Date = new Date()): boolean {
  return Boolean(closesAt) && now.getTime() >= Date.parse(closesAt!);
}

/** Feature flag for the box's emails (witness link, "please confirm"): default off. */
export function townSealedEmailsEnabled(env: string | undefined = process.env.TOWN_SEALED_EMAILS_ENABLED): boolean {
  return env === "1" || env === "true";
}

// ── What the database answers ─────────────────────────────────────────

export type SealedError =
  | "signin"
  | "not_sealed"
  | "not_member"
  | "own_job"
  | "role"
  | "suspended"
  | "late"
  | "not_open"
  | "invalid"
  | "not_found"
  | "not_closed"
  | "already_open"
  | "pending"
  | "use_colleague"
  | "witness_name"
  | "witness_email"
  | "witness_self"
  | "needs_witness"
  | "no_request"
  | "expired"
  | "same_person"
  | "bad_link"
  | "not_admin"
  | "reason"
  | "failed";

const ERRORS = new Set<string>([
  "signin", "not_sealed", "not_member", "own_job", "role", "suspended", "late", "not_open", "invalid", "not_found", "not_closed", "already_open", "pending",
  "use_colleague", "witness_name", "witness_email", "witness_self", "needs_witness", "no_request", "expired", "same_person", "bad_link", "not_admin", "reason",
]);

/** A function's jsonb answer → ok, or the error code ('failed' for anything unexpected). */
export function sealedAnswer<T extends object>(data: unknown, error?: unknown): ({ ok: true } & T) | { ok: false; error: SealedError } {
  if (error || !data || typeof data !== "object") return { ok: false, error: "failed" };
  const d = data as { ok?: boolean; error?: string };
  if (d.ok === true) return d as { ok: true } & T;
  return { ok: false, error: d.error && ERRORS.has(d.error) ? (d.error as SealedError) : "failed" };
}

/** HTTP status for a trade's refused submission or withdrawal. */
export function sealedHttpStatus(e: SealedError): number {
  switch (e) {
    case "signin":
      return 401;
    case "late":
    case "not_open":
      return 409;
    case "invalid":
      return 422;
    case "not_found":
    case "not_sealed":
      return 404;
    case "failed":
      return 500;
    default:
      return 403;
  }
}

export interface OpeningState {
  status: "requested" | "cancelled" | "expired" | "opened";
  attempt: number;
  requested_by: string | null;
  requested_by_name: string | null;
  requested_at: string;
  expires_at: string;
  witness_name: string | null;
  witness_email: string | null;
  confirmed_by: string | null;
  confirmed_by_name: string | null;
  confirmed_method: "member" | "witness" | null;
  witness_confirmed_name: string | null;
  opened_at: string | null;
}

/** sealed_box_state(): counts and the opening, never a quote. */
export interface SealedState {
  sealed: true;
  closes_at: string | null;
  time_zone: string;
  closed: boolean;
  received: number;
  withdrawn: number;
  members: number;
  opening: OpeningState | null;
}

/** A trade's own quote (sealed_quote_own()). */
export interface OwnSealedQuote {
  id: string;
  status: "active" | "withdrawn" | "opened";
  version: number;
  message: string | null;
  relevant_experience: string | null;
  availability: string | null;
  quote_amount: number | null;
  quote_kind: "estimate" | "firm" | null;
  quote_notes: string | null;
  start_date: string | null;
  case_study_ids: string[];
  lang: string | null;
  created_at: string;
  updated_at: string;
  withdrawn_at: string | null;
  opened_at: string | null;
  interest_id: string | null;
  closes_at: string | null;
}

/** Is the box open (the two-person opening or the witness is done)? */
export function isOpened(state: Pick<SealedState, "opening"> | null | undefined): boolean {
  return state?.opening?.status === "opened";
}

/**
 * What the town's page offers right now:
 *   sealed      before closing: the count and the closing time;
 *   open        after closing, nothing asked yet (or it lapsed): "Open quotes";
 *   waiting     I asked: waiting for a colleague or the witness (cancel, resend);
 *   confirm     a colleague asked: I can confirm;
 *   opened      done: who asked, who confirmed, when.
 */
export type OpeningStep = "sealed" | "open" | "waiting" | "confirm" | "opened";

export function openingStep(state: SealedState, me: string, now: Date = new Date()): OpeningStep {
  const op = state.opening;
  if (op?.status === "opened") return "opened";
  if (!state.closed && !isClosed(state.closes_at, now)) return "sealed";
  // A live request: the person who asked waits; any other member of the town can confirm.
  if (op && op.status === "requested" && now.getTime() <= Date.parse(op.expires_at)) return op.requested_by === me ? "waiting" : "confirm";
  return "open";
}

/** Who can open: a town of two or more needs a colleague; a one-person town names a witness. */
export function openingMode(members: number): "colleague" | "witness" {
  return members >= 2 ? "colleague" : "witness";
}

/** The witness's one-time link (the token itself is never stored; the database keeps its SHA-256). */
export function witnessPath(rfpId: string, token: string): string {
  return `/witness/${rfpId}/${token}`;
}

const NAME = /^[^\n\r<>]{2,120}$/;
export function cleanWitnessName(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.replace(/\s+/g, " ").trim();
  return NAME.test(s) ? s : null;
}
