/**
 * The 14-day Trade Pro trial: no card, one per organization (table
 * trade_trials, migration 20261016000001). Pure rules only, so they are
 * unit tested (test/unit/lead-feed.test.ts) and safe in client components.
 *
 * Entitlement: an organization is Trade Pro when it PAYS (active/comped Pro
 * or Featured subscription) or its trial hasn't ended. The one place that
 * decides is computeTradeAccess() (src/lib/access/access.ts), mirrored by
 * the SQL has_active_trade_access(); both call into isProEntitled() logic.
 */

export const TRIAL_DAYS = 14;
const DAY_MS = 86_400_000;

export const TRIAL_SOURCES = ["dashboard", "pricing", "leads", "billing"] as const;
export type TrialSource = (typeof TRIAL_SOURCES)[number];

export function parseTrialSource(v: unknown): TrialSource {
  return TRIAL_SOURCES.includes(v as TrialSource) ? (v as TrialSource) : "dashboard";
}

/** A trade_trials row as the app reads it. */
export interface TrialRow {
  startedAt: string;
  endsAt: string;
}

export type TrialStatus = "none" | "active" | "expired";

export interface TrialState {
  status: TrialStatus;
  startedAt: string | null;
  endsAt: string | null;
  /** Whole days left, rounded up ("ends today" = 1). 0 when not active. */
  daysLeft: number;
}

export const NO_TRIAL: TrialState = { status: "none", startedAt: null, endsAt: null, daysLeft: 0 };

/** Where a trial stands at `now`. */
export function trialState(row: TrialRow | null | undefined, now: Date = new Date()): TrialState {
  if (!row) return NO_TRIAL;
  const end = Date.parse(row.endsAt);
  if (!Number.isFinite(end)) return NO_TRIAL;
  const left = end - now.getTime();
  if (left <= 0) return { status: "expired", startedAt: row.startedAt, endsAt: row.endsAt, daysLeft: 0 };
  return { status: "active", startedAt: row.startedAt, endsAt: row.endsAt, daysLeft: Math.max(1, Math.ceil(left / DAY_MS)) };
}

/** When a trial started at `start` ends. */
export function trialEndsAt(start: Date, days: number = TRIAL_DAYS): Date {
  return new Date(start.getTime() + days * DAY_MS);
}

/** Paid OR an active trial. The single rule computeTradeAccess applies. */
export function isProEntitled(p: { paid: boolean; trial: TrialState | null | undefined }): boolean {
  return p.paid || p.trial?.status === "active";
}

export type TrialRefusal = "signin" | "org" | "role" | "suspended" | "paid" | "used" | "unavailable" | null;

/**
 * Can this organization start a trial now? Most actionable reason first.
 * "used" covers both a running and an ended trial: one per organization, ever.
 */
export function trialRefusal(p: {
  signedIn: boolean;
  organizationType: string | null | undefined;
  organizationStatus?: string | null;
  paid: boolean;
  existing: TrialRow | null | undefined;
}): TrialRefusal {
  if (!p.signedIn) return "signin";
  if (!p.organizationType) return "org";
  if (p.organizationType !== "trade_company") return "role";
  if (p.organizationStatus === "suspended") return "suspended";
  if (p.paid) return "paid";
  if (p.existing) return "used";
  return null;
}

/** Postgres unique violation: the primary key caught a second trial (a double click). */
export function isDuplicateTrialError(e: { code?: string; message?: string } | null | undefined): boolean {
  return Boolean(e && (e.code === "23505" || /duplicate key|already exists/i.test(e.message ?? "")));
}

/** The table isn't there yet (migration not applied): trials are simply unavailable. */
export function isMissingTableError(e: { code?: string; message?: string } | null | undefined): boolean {
  return Boolean(e && (e.code === "42P01" || e.code === "PGRST205" || /does not exist|could not find the table|schema cache/i.test(e.message ?? "")));
}
