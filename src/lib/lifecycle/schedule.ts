/**
 * Who gets which lifecycle email, and when. Pure: the cron loads a
 * MemberState per member and asks decide(); tests do the same with fixtures
 * (test/unit/lifecycle.test.ts).
 *
 * Order of checks:
 *   1. Stop: inactive, upgraded (paid), unsubscribed, bounced / complained.
 *   2. Track: a company that ever started a trial is on the trial track;
 *      everyone else on the free track. The free track only ever starts with
 *      the welcome (a member who joined before the sequence existed, or whose
 *      welcome window passed, never gets the later steps out of nowhere).
 *   3. The first step not yet recorded whose window is open. Behaviour-based
 *      skips (already did the thing, no data to show honestly) are recorded
 *      as "skipped" so the next step can go.
 *   4. Gates for an actual send: one lifecycle email per local day, not on a
 *      day the weekly email went to them, 9:00–17:00 Mon–Fri in their time
 *      zone (province/state, else Eastern).
 * A new company waiting in pending_review gets review_pending once, first
 * (within REVIEW_WINDOW_MS of joining, relaxed hours); the welcome then goes
 * on a later day under the one-a-day rule. The onboarding rescue track (no
 * company yet) is lib/lifecycle/rescue.
 */
import {
  FREE_STEPS,
  FREE_WINDOWS,
  RELAXED_HOURS,
  RELAXED_WEEKDAYS,
  REVIEW_STEP,
  REVIEW_WINDOW_MS,
  SEND_HOURS,
  SEND_WEEKDAYS,
  TRIAL_STEPS,
  TRIAL_WINDOWS,
  type FreeStep,
  type StepId,
  type TrialStep,
} from "./config";
import { DEFAULT_TIME_ZONE, localClock, provinceTimeZone } from "./timezone";

/** What the member has done / what we could honestly show them. Null = not loaded (not needed for this member right now). */
export interface MemberFacts {
  hasTrades: boolean;
  hasAreas: boolean;
  /** Published or draft projects (case studies) on the company profile. */
  projects: number;
  /** A PMRFP badge loading on some website for this company. */
  badgeInstalled: boolean;
  /** Matched leads right now (lib/leads/match). */
  leadTotal: number | null;
  /** Their trades with a priced benchmark (≥ BENCHMARK_MIN_AWARDS) in their province. */
  benchmarkReady: boolean | null;
  /** Approved company profile = may post in the forum. */
  canPost: boolean;
  forumPosts: number;
  foundingSoldOut: boolean;
}

export interface MemberState {
  userId: string;
  /** organization_members.created_at (or the org's), ISO. */
  joinedAt: string;
  province: string | null;
  /** Active user, active non-demo trade company, not an admin. */
  active: boolean;
  /** Pays for Trade Pro / Featured, or lifetime. */
  paid: boolean;
  trial: { startedAt: string; endsAt: string } | null;
  /** Lifecycle unsubscribe, email off, or opportunity emails off. */
  optedOut: boolean;
  /** On email_suppressions (bounce, complaint, manual) or the weekly email marked bounced. */
  suppressed: boolean;
  /** Steps already recorded (sent, skipped or failed): never again. */
  recorded: ReadonlySet<StepId>;
  /** Last lifecycle email actually sent, ISO. */
  lastSentAt: string | null;
  /** Last weekly email (digest_subscribers.last_sent_at), ISO. */
  digestSentAt: string | null;
  /** The company profile is waiting in pending_review (not yet in the directory). */
  pendingReview?: boolean;
  facts: MemberFacts;
}

export type StopReason = "inactive" | "upgraded" | "unsubscribed" | "bounced" | "not_in_sequence" | "finished";
export type WaitReason = "not_due" | "one_per_day" | "digest_today" | "quiet_hours";
export type SkipReason =
  | "profile_done"
  | "no_trial_possible"
  | "thin_market"
  | "no_benchmark"
  | "cannot_post"
  | "already_posted"
  | "sold_out";

export type Decision =
  | { action: "send"; step: StepId }
  | { action: "skip"; step: StepId; reason: SkipReason }
  | { action: "wait"; step: StepId | null; reason: WaitReason }
  | { action: "stop"; reason: StopReason };

export interface StepWindow {
  from: number;
  until: number;
}

/** The [from, until] window of a step for this member (ms since epoch), or null when it doesn't apply. */
export function stepWindow(step: StepId, m: Pick<MemberState, "joinedAt" | "trial">): StepWindow | null {
  if ((FREE_STEPS as readonly string[]).includes(step)) {
    const w = FREE_WINDOWS[step as FreeStep];
    const joined = Date.parse(m.joinedAt);
    if (!Number.isFinite(joined)) return null;
    return { from: joined + w.dueMs, until: joined + w.dueMs + w.graceMs };
  }
  if (!m.trial || !(TRIAL_STEPS as readonly string[]).includes(step)) return null;
  const w = TRIAL_WINDOWS[step as TrialStep];
  const anchor = Date.parse(w.from === "start" ? m.trial.startedAt : m.trial.endsAt);
  if (!Number.isFinite(anchor)) return null;
  return { from: anchor + w.dueMs, until: anchor + w.untilMs };
}

export function trackOf(m: Pick<MemberState, "trial">): "free" | "trial" {
  return m.trial ? "trial" : "free";
}

/** Steps of the member's track that are unrecorded and inside their window right now (in order). */
export function openSteps(m: MemberState, now: Date): StepId[] {
  const t = now.getTime();
  const steps: readonly StepId[] = trackOf(m) === "trial" ? TRIAL_STEPS : FREE_STEPS;
  return steps.filter((s) => {
    if (m.recorded.has(s)) return false;
    const w = stepWindow(s, m);
    return Boolean(w && t >= w.from && t <= w.until);
  });
}

/** Behaviour-based skip for a step, or null to send it. */
export function skipReason(step: StepId, m: MemberState): SkipReason | null {
  const f = m.facts;
  switch (step) {
    case "get_found":
      return f.projects > 0 && f.badgeInstalled ? "profile_done" : null;
    case "trial_offer":
      if (m.trial || m.paid) return "no_trial_possible";
      // Nothing to unlock: don't sell a trial into an empty market.
      return f.leadTotal !== null && f.leadTotal === 0 && f.benchmarkReady !== true ? "thin_market" : null;
    case "benchmark":
      return f.benchmarkReady === true ? null : "no_benchmark";
    case "community":
      if (!f.canPost) return "cannot_post";
      return f.forumPosts > 0 ? "already_posted" : null;
    case "founding":
      return f.foundingSoldOut ? "sold_out" : null;
    default:
      return null;
  }
}

export function memberTimeZone(province: string | null | undefined): string {
  return provinceTimeZone(province) ?? DEFAULT_TIME_ZONE;
}

/**
 * 9:00–17:00, Monday to Friday, member local time. relaxed (rescue_2h,
 * review_pending): also 8:00–20:00 Monday to Thursday; Friday stays 9–17.
 */
export function inSendingHours(now: Date, timeZone: string, relaxed = false): boolean {
  const c = localClock(now, timeZone);
  if (relaxed && RELAXED_WEEKDAYS.has(c.weekday)) return c.hour >= RELAXED_HOURS.start && c.hour < RELAXED_HOURS.end;
  return SEND_WEEKDAYS.has(c.weekday) && c.hour >= SEND_HOURS.start && c.hour < SEND_HOURS.end;
}

/** The send gates every lifecycle email shares: one a day, not on a weekly-email day, sending hours. */
export function sendGate(
  m: Pick<MemberState, "province" | "lastSentAt" | "digestSentAt">,
  now: Date,
  relaxed = false,
): WaitReason | null {
  const tz = memberTimeZone(m.province);
  if (sameLocalDay(m.lastSentAt, now, tz)) return "one_per_day";
  if (sameLocalDay(m.digestSentAt, now, tz)) return "digest_today";
  if (!inSendingHours(now, tz, relaxed)) return "quiet_hours";
  return null;
}

/** review_pending is open: free track, profile pending, not yet sent, within REVIEW_WINDOW_MS of joining. */
export function reviewPendingOpen(m: Pick<MemberState, "pendingReview" | "recorded" | "joinedAt" | "trial">, now: Date): boolean {
  if (!m.pendingReview || m.trial || m.recorded.has(REVIEW_STEP)) return false;
  const joined = Date.parse(m.joinedAt);
  const t = now.getTime();
  return Number.isFinite(joined) && t >= joined && t <= joined + REVIEW_WINDOW_MS;
}

/** Same calendar day in the member's zone. */
export function sameLocalDay(a: string | null | undefined, now: Date, timeZone: string): boolean {
  if (!a) return false;
  const t = Date.parse(a);
  if (!Number.isFinite(t)) return false;
  return localClock(new Date(t), timeZone).date === localClock(now, timeZone).date;
}

/** Stop conditions first, most permanent first. */
export function stopReason(m: MemberState): StopReason | null {
  if (!m.active) return "inactive";
  if (m.paid) return "upgraded";
  if (m.suppressed) return "bounced";
  if (m.optedOut) return "unsubscribed";
  return null;
}

/** The one thing to do for this member now. */
export function decide(m: MemberState, now: Date): Decision {
  const stop = stopReason(m);
  if (stop) return { action: "stop", reason: stop };

  const track = trackOf(m);
  const t = now.getTime();
  if (reviewPendingOpen(m, now)) {
    const gate = sendGate(m, now, true);
    return gate ? { action: "wait", step: REVIEW_STEP, reason: gate } : { action: "send", step: REVIEW_STEP };
  }
  if (track === "free" && !m.recorded.has("welcome")) {
    const w = stepWindow("welcome", m);
    if (!w || t > w.until) return { action: "stop", reason: "not_in_sequence" };
  }

  const steps: readonly StepId[] = track === "trial" ? TRIAL_STEPS : FREE_STEPS;
  let candidate: StepId | null = null;
  let pending = false;
  for (const s of steps) {
    if (m.recorded.has(s)) continue;
    const w = stepWindow(s, m);
    if (!w || t > w.until) continue; // missed: never late
    if (t < w.from) {
      pending = true;
      break;
    }
    candidate = s;
    break;
  }
  if (!candidate) return pending ? { action: "wait", step: null, reason: "not_due" } : { action: "stop", reason: "finished" };

  const skip = skipReason(candidate, m);
  if (skip) return { action: "skip", step: candidate, reason: skip };

  const gate = sendGate(m, now);
  return gate ? { action: "wait", step: candidate, reason: gate } : { action: "send", step: candidate };
}

/**
 * decide() until something other than a skip: the skips to record, then the
 * final decision. Never loops more than the number of steps.
 */
export function plan(m: MemberState, now: Date): { skips: { step: StepId; reason: SkipReason }[]; decision: Decision } {
  const recorded = new Set(m.recorded);
  const skips: { step: StepId; reason: SkipReason }[] = [];
  for (let i = 0; i <= FREE_STEPS.length + TRIAL_STEPS.length; i++) {
    const d = decide({ ...m, recorded }, now);
    if (d.action !== "skip") return { skips, decision: d };
    skips.push({ step: d.step, reason: d.reason });
    recorded.add(d.step);
  }
  return { skips, decision: { action: "stop", reason: "finished" } };
}
