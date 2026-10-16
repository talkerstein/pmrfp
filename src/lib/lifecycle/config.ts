/**
 * The lifecycle email sequence: nurture new FREE trade companies to their
 * first useful action, then offer the 14-day Trade Pro trial and Trade Pro /
 * Founding 500. Pure settings only (unit-tested, safe anywhere).
 *
 * Nothing sends unless LIFECYCLE_EMAILS_ENABLED is "1" or "true". The cron
 * (/api/cron/lifecycle) dry-runs with ?dry=1 whatever the flag says.
 *
 * Two tracks, one email a day at most, never both:
 *   free   welcome → market → get_found → trial_offer → benchmark →
 *          community → founding (days 0, 1, 3, 5, 8, 12, 16 after joining)
 *   trial  replaces the free track the moment the company starts a trial:
 *          trial_day1 → trial_day7 → trial_day12 → trial_expired →
 *          trial_winback (7 days after it ended; then nothing more)
 * Everything stops on upgrade (paid Pro / Featured / lifetime),
 * unsubscribe, bounce or complaint.
 *
 * Before any of that, the ONBOARDING RESCUE track (lib/lifecycle/rescue) is
 * for trade accounts that never finished onboarding (no company yet), so
 * never reach the welcome:
 *   rescue  rescue_2h → rescue_1d → rescue_3d (2 hours, 1 day, 3 days after
 *           the account was confirmed; then nothing more). Stops the moment
 *           onboarding completes; the free track's Day 0 welcome then starts
 *           from the new membership, as for everyone else.
 * And once, for a new company whose profile is waiting in pending_review:
 *   review_pending  "we're reviewing your profile" (first 3 days only).
 */

export function lifecycleEnabled(env: string | undefined = process.env.LIFECYCLE_EMAILS_ENABLED): boolean {
  return env === "1" || env === "true";
}

/** Sender. A real reply-able mailbox; override with LIFECYCLE_FROM_EMAIL. */
export const LIFECYCLE_FROM_DEFAULT = '"R. Talkar · PMRFP" <info@pmrfp.com>';
export const LIFECYCLE_REPLY_TO = "info@pmrfp.com";

export function lifecycleFrom(env: string | undefined = process.env.LIFECYCLE_FROM_EMAIL): string {
  return env?.trim() || LIFECYCLE_FROM_DEFAULT;
}

/** utm_source on every link (utm_medium=email, utm_campaign=<step>). */
export const LIFECYCLE_UTM_SOURCE = "lifecycle";

export const FREE_STEPS = ["welcome", "market", "get_found", "trial_offer", "benchmark", "community", "founding"] as const;
export const TRIAL_STEPS = ["trial_day1", "trial_day7", "trial_day12", "trial_expired", "trial_winback"] as const;
export const RESCUE_STEPS = ["rescue_2h", "rescue_1d", "rescue_3d"] as const;
/** One-off: a new company whose profile waits in pending_review. */
export const REVIEW_STEP = "review_pending" as const;
export const STEPS = [...RESCUE_STEPS, REVIEW_STEP, ...FREE_STEPS, ...TRIAL_STEPS] as const;

export type FreeStep = (typeof FREE_STEPS)[number];
export type TrialStep = (typeof TRIAL_STEPS)[number];
export type RescueStep = (typeof RESCUE_STEPS)[number];
export type StepId = (typeof STEPS)[number];

export function isStepId(v: unknown): v is StepId {
  return typeof v === "string" && (STEPS as readonly string[]).includes(v);
}

export const isTrialStep = (s: StepId): s is TrialStep => (TRIAL_STEPS as readonly string[]).includes(s);
export const isRescueStep = (s: StepId): s is RescueStep => (RESCUE_STEPS as readonly string[]).includes(s);

/** Admin labels. */
export const STEP_LABEL: Record<StepId, string> = {
  rescue_2h: "Rescue +2h · Finish your profile (2 min)",
  rescue_1d: "Rescue +1 day · Real leads for your trade",
  rescue_3d: "Rescue +3 days · Want us to set it up? (last)",
  review_pending: "Pending review · We're reviewing your profile",
  welcome: "Day 0 · Welcome + finish profile",
  market: "Day 1 · Your market",
  get_found: "Day 3 · Get found (project + badge)",
  trial_offer: "Day 5 · Start the free trial",
  benchmark: "Day 8 · What similar jobs sold for",
  community: "Day 12 · Forum + reputation",
  founding: "Day 16 · Founding 500 offer",
  trial_day1: "Trial day 1 · How to use leads + alerts",
  trial_day7: "Trial day 7 · What you've seen so far",
  trial_day12: "Trial day 12 · 2 days left + offer",
  trial_expired: "Trial ended · Back on free + offer",
  trial_winback: "Trial +7 days · Win-back (last one)",
};

const H = 3_600_000;
const D = 24 * H;

/**
 * When each free step may go out, from the moment the member joined the
 * company (organization_members.created_at): [due, due + grace]. A step
 * that couldn't go out inside its window (quiet hours, weekends, the one-a-
 * day rule) is missed, never sent late, so turning the flag on can't blast
 * old members with a backlog.
 */
export const FREE_WINDOWS: Record<FreeStep, { dueMs: number; graceMs: number }> = {
  welcome: { dueMs: 0, graceMs: 3 * D },
  market: { dueMs: 1 * D, graceMs: 5 * D },
  get_found: { dueMs: 3 * D, graceMs: 5 * D },
  trial_offer: { dueMs: 5 * D, graceMs: 5 * D },
  benchmark: { dueMs: 8 * D, graceMs: 5 * D },
  community: { dueMs: 12 * D, graceMs: 5 * D },
  founding: { dueMs: 16 * D, graceMs: 5 * D },
};

/** Trial windows: from the trial's start (day 1, day 7) or its end (the rest). */
export const TRIAL_WINDOWS: Record<TrialStep, { from: "start" | "end"; dueMs: number; untilMs: number }> = {
  trial_day1: { from: "start", dueMs: 3 * H, untilMs: 3 * D },
  trial_day7: { from: "start", dueMs: 7 * D, untilMs: 10 * D },
  trial_day12: { from: "end", dueMs: -2 * D, untilMs: -4 * H },
  trial_expired: { from: "end", dueMs: 0, untilMs: 3 * D },
  trial_winback: { from: "end", dueMs: 7 * D, untilMs: 11 * D },
};

/**
 * Rescue windows, from the moment the account could first be used (email
 * confirmed, else created): [due, until]. Same never-late rule. The +2h
 * window is wide (to day 3) so a Friday-night sign-up still gets it on
 * Monday morning; the track only ever starts with it.
 */
export const RESCUE_WINDOWS: Record<RescueStep, { dueMs: number; untilMs: number }> = {
  rescue_2h: { dueMs: 2 * H, untilMs: 3 * D },
  rescue_1d: { dueMs: 1 * D, untilMs: 5 * D },
  rescue_3d: { dueMs: 3 * D, untilMs: 8 * D },
};
export const RESCUE_HORIZON_MS = 8 * D;

/** review_pending: once, within this long of joining the company (never for an old profile edit). */
export const REVIEW_WINDOW_MS = 3 * D;

/**
 * Relaxed hours for the two "you just did something" emails (rescue_2h and
 * review_pending): 8:00 to 20:00 local Monday to Thursday, so someone who
 * signs up at 4pm hears back the same evening. Friday keeps the normal
 * 9:00–17:00 (no Friday-evening sends), weekends nothing.
 */
export const RELAXED_HOURS = { start: 8, end: 20 } as const;
export const RELAXED_WEEKDAYS: ReadonlySet<number> = new Set([1, 2, 3, 4]);

/** Stalled sign-ups shown on /admin/lifecycle (for a personal note). */
export const STALLED_LIST_DAYS = 30;

/** The furthest any member can be into the sequence (cron candidate windows). */
export const FREE_HORIZON_MS = 21 * D;
export const TRIAL_HORIZON_MS = 14 * D + 12 * D;

/** Local sending hours [start, end): 9:00 to 17:00, Monday to Friday. */
export const SEND_HOURS = { start: 9, end: 17 } as const;
export const SEND_WEEKDAYS: ReadonlySet<number> = new Set([1, 2, 3, 4, 5]);

/** Per cron run. The cron runs hourly, so a day can send far more. */
export const MAX_SENDS_PER_RUN = 150;
export const MAX_MEMBERS_PER_RUN = 3000;

/** Benchmark teaser only with at least this many priced awards (lib/data/price-benchmarks MIN_RANGE_AWARDS). */
export const BENCHMARK_MIN_AWARDS = 5;

/** CASL / CAN-SPAM sender identification (same as the weekly email). */
export { DIGEST_SENDER as LIFECYCLE_SENDER, DIGEST_ADDRESS as LIFECYCLE_ADDRESS } from "@/lib/digest/config";
