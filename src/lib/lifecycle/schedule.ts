/**
 * Who gets which lifecycle email, and when. Pure: the cron loads a
 * MemberState per member and asks decide(); tests do the same with fixtures
 * (test/unit/lifecycle.test.ts, test/unit/lifecycle-badge.test.ts).
 *
 * Order of checks:
 *   1. Stop: inactive, upgraded (paid), unsubscribed, bounced / complained.
 *   2. Cohort (LIFECYCLE_START_AT, unset = everyone is "normal"): a company
 *      that joined, or was approved, at or after the go-live cutoff is on the
 *      normal sequence. Anyone older is "catch_up": no welcome / market /
 *      get_found / … and no pending-review note, only one welcome_back (once
 *      approved), the badge thanks, and trial emails for a trial that started
 *      after go-live.
 *   3. badge_thanks: the badge was just detected on the company's own site.
 *   4. Track: a company that ever started a trial is on the trial track;
 *      everyone else on the free track. The free track only ever starts with
 *      the welcome (a member who joined before the sequence existed, or whose
 *      welcome window passed, never gets the later steps out of nowhere).
 *   5. The first step not yet recorded whose window is open. Behaviour-based
 *      skips (already did the thing, no data to show honestly) are recorded
 *      as "skipped" so the next step can go. The badge lane sits beside the
 *      track: welcome first, then badge (after approval) before the rest of
 *      the free track, trial steps before badge, and badge_reminder only when
 *      the track has nothing due.
 *   6. Gates for an actual send: one lifecycle email per local day, not on a
 *      day the weekly email went to them, 9:00–17:00 Mon–Fri in their time
 *      zone (province/state, else Eastern).
 * A new company waiting in pending_review gets review_pending once, first
 * (within REVIEW_WINDOW_MS of joining, relaxed hours); the welcome then goes
 * on a later day under the one-a-day rule. The onboarding rescue track (no
 * company yet) is lib/lifecycle/rescue.
 */
import {
  BADGE_WINDOWS,
  FREE_STEPS,
  FREE_WINDOWS,
  RELAXED_HOURS,
  RELAXED_WEEKDAYS,
  REVIEW_STEP,
  REVIEW_WINDOW_MS,
  SEND_HOURS,
  SEND_WEEKDAYS,
  STEPS,
  TRIAL_STEPS,
  TRIAL_WINDOWS,
  isTrialStep,
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
  /** The company's PMRFP badge is loading on its OWN website, on 2+ different days (lib/badge/install). */
  badgeInstalled: boolean;
  /** The profile lists a website, so an install can be detected on it. Unset = unknown (treated as yes). */
  hasWebsite?: boolean;
  /** The day (YYYY-MM-DD, Toronto) the install became "detected", or null. */
  badgeDetectedOn?: string | null;
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
  /** The profile is approved (the badge only resolves for an approved listing). Unset = not approved. */
  profileApproved?: boolean;
  /** organizations.approved_at: when it last became approved (null before that column existed). */
  approvedAt?: string | null;
  /** When each step was actually sent (status "sent"), ISO. The reminder counts from the badge email's date. */
  sentAt?: Partial<Record<StepId, string>>;
  /** Staff, test or throwaway address (lib/lifecycle/rescue isInternalEmail). Only the catch-up cohort honours it. */
  internal?: boolean;
  facts: MemberFacts;
}

export type StopReason = "inactive" | "upgraded" | "unsubscribed" | "bounced" | "not_in_sequence" | "finished" | "internal";
export type WaitReason = "not_due" | "one_per_day" | "digest_today" | "quiet_hours";
export type SkipReason =
  | "profile_done"
  | "no_trial_possible"
  | "thin_market"
  | "no_benchmark"
  | "cannot_post"
  | "already_posted"
  | "sold_out"
  | "badge_installed"
  | "no_website";

export type Decision =
  | { action: "send"; step: StepId }
  | { action: "skip"; step: StepId; reason: SkipReason }
  | { action: "wait"; step: StepId | null; reason: WaitReason }
  | { action: "stop"; reason: StopReason };

export interface DecideOptions {
  /** LIFECYCLE_START_AT. Unset / null = everyone is on the normal sequence, exactly as before it existed. */
  startAt?: Date | null;
}

export interface StepWindow {
  from: number;
  until: number;
}

/* ------------------------------------------------------------------ cohorts (go-live cutoff) */

export type Cohort = { mode: "normal"; startMs: number } | { mode: "catch_up" };

/**
 * Where a member sits relative to the go-live cutoff. No cutoff: normal, the
 * free-track clock starts when they joined (as always). With one: joined at or
 * after it = normal; approved at or after it (a pending company that joined
 * earlier) = normal, with the clock starting at the approval; anyone older =
 * catch_up.
 */
export function cohortOf(m: Pick<MemberState, "joinedAt" | "approvedAt">, startAt?: Date | null): Cohort {
  const joined = Date.parse(m.joinedAt);
  if (!startAt) return { mode: "normal", startMs: joined };
  const cut = startAt.getTime();
  if (joined >= cut) return { mode: "normal", startMs: joined };
  const approved = m.approvedAt ? Date.parse(m.approvedAt) : NaN;
  if (Number.isFinite(approved) && approved >= cut) return { mode: "normal", startMs: approved };
  return { mode: "catch_up" };
}

/** Start of the Toronto day `YYYY-MM-DD` plus a day: when "the day the badge was detected" is surely over. */
const dayEndMs = (day: string): number => Date.parse(`${day}T00:00:00Z`) + 29 * 3_600_000;

/* ------------------------------------------------------------------ windows */

/** The [from, until] window of a step for this member (ms since epoch), or null when it doesn't apply. */
export function stepWindow(
  step: StepId,
  m: Pick<MemberState, "joinedAt" | "trial"> & Partial<Pick<MemberState, "approvedAt" | "profileApproved" | "sentAt" | "facts">>,
  ctx: { startMs?: number; startAt?: Date | null } = {},
): StepWindow | null {
  if ((FREE_STEPS as readonly string[]).includes(step)) {
    const w = FREE_WINDOWS[step as FreeStep];
    const base = ctx.startMs ?? Date.parse(m.joinedAt);
    if (!Number.isFinite(base)) return null;
    return { from: base + w.dueMs, until: base + w.dueMs + w.graceMs };
  }
  switch (step) {
    case "badge": {
      if (m.profileApproved !== true) return null;
      const approved = m.approvedAt ? Date.parse(m.approvedAt) : NaN;
      const anchor = Number.isFinite(approved) ? approved : Date.parse(m.joinedAt);
      if (!Number.isFinite(anchor)) return null;
      const w = BADGE_WINDOWS.badge;
      return { from: anchor + w.dueMs, until: anchor + w.dueMs + w.graceMs };
    }
    case "badge_reminder": {
      const sent = m.sentAt?.badge ? Date.parse(m.sentAt.badge) : NaN;
      if (!Number.isFinite(sent)) return null;
      const w = BADGE_WINDOWS.badge_reminder;
      return { from: sent + w.dueMs, until: sent + w.dueMs + w.graceMs };
    }
    case "badge_thanks": {
      const day = m.facts?.badgeDetectedOn;
      if (!m.facts?.badgeInstalled || !day) return null;
      const end = dayEndMs(day);
      if (!Number.isFinite(end)) return null;
      // Detected before go-live is old news: no thanks out of nowhere.
      if (ctx.startAt && end < ctx.startAt.getTime()) return null;
      return { from: end - 29 * 3_600_000, until: end + BADGE_WINDOWS.badge_thanks.graceMs };
    }
    case "welcome_back": {
      if (!ctx.startAt || m.profileApproved !== true) return null;
      const approved = m.approvedAt ? Date.parse(m.approvedAt) : NaN;
      const from = Math.max(ctx.startAt.getTime(), Number.isFinite(approved) ? approved : 0);
      const w = BADGE_WINDOWS.welcome_back;
      return { from: from + w.dueMs, until: from + w.dueMs + w.graceMs };
    }
    default:
      break;
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

const inWindow = (w: StepWindow | null, t: number) => Boolean(w && t >= w.from && t <= w.until);

/**
 * Steps of the member's track that are unrecorded and inside their window
 * right now (in order). A catch-up member has no free track and only the
 * trial track for a trial that started after go-live.
 */
export function openSteps(m: MemberState, now: Date, opts: DecideOptions = {}): StepId[] {
  const t = now.getTime();
  const cohort = cohortOf(m, opts.startAt);
  const steps = stepsFor(m, cohort, opts);
  const startMs = cohort.mode === "normal" ? cohort.startMs : undefined;
  return steps.filter((s) => !m.recorded.has(s) && inWindow(stepWindow(s, m, { startMs, startAt: opts.startAt }), t));
}

/** The track's steps this member may get: none for a catch-up member without a post-go-live trial. */
function stepsFor(m: Pick<MemberState, "trial">, cohort: Cohort, opts: DecideOptions): readonly StepId[] {
  if (cohort.mode === "catch_up") {
    return m.trial && opts.startAt && Date.parse(m.trial.startedAt) >= opts.startAt.getTime() ? TRIAL_STEPS : [];
  }
  return trackOf(m) === "trial" ? TRIAL_STEPS : FREE_STEPS;
}

/** Behaviour-based skip for a step, or null to send it. */
export function skipReason(step: StepId, m: MemberState): SkipReason | null {
  const f = m.facts;
  switch (step) {
    case "get_found":
      // The badge has its own email now: this one is about adding a project.
      return f.projects > 0 ? "profile_done" : null;
    case "badge":
    case "welcome_back":
      return f.badgeInstalled ? "badge_installed" : null;
    case "badge_reminder":
      if (f.badgeInstalled) return "badge_installed";
      return f.hasWebsite === false ? "no_website" : null;
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

/* ------------------------------------------------------------------ the decision */

/** A badge-lane step is unrecorded and inside its window now. */
function badgeStepOpen(step: StepId, m: MemberState, t: number, ctx: { startAt?: Date | null }): boolean {
  if (m.recorded.has(step)) return false;
  if (step === "badge_reminder" && !m.recorded.has("badge")) return false;
  return inWindow(stepWindow(step, m, ctx), t);
}

/** The one thing to do for this member now. */
export function decide(m: MemberState, now: Date, opts: DecideOptions = {}): Decision {
  const stop = stopReason(m);
  if (stop) return { action: "stop", reason: stop };

  const t = now.getTime();
  const cohort = cohortOf(m, opts.startAt);
  const ctx = { startAt: opts.startAt };

  /** Skip rule, else the send gates. */
  const finalize = (step: StepId, relaxed = false): Decision => {
    const skip = skipReason(step, m);
    if (skip) return { action: "skip", step, reason: skip };
    const gate = sendGate(m, now, relaxed);
    return gate ? { action: "wait", step, reason: gate } : { action: "send", step };
  };

  // The badge was just detected on the company's own site: thank them first.
  if (badgeStepOpen("badge_thanks", m, t, ctx)) return finalize("badge_thanks");

  // Joined before go-live: one welcome-back (once approved), then only the
  // trial emails of a trial that started after go-live.
  if (cohort.mode === "catch_up") {
    if (m.internal) return { action: "stop", reason: "internal" };
    if (badgeStepOpen("welcome_back", m, t, ctx)) return finalize("welcome_back");
    const trialSteps = stepsFor(m, cohort, opts);
    if (trialSteps.length) {
      const next = nextOpenStep(m, t, trialSteps, undefined);
      if (next.candidate) return finalize(next.candidate);
      if (next.pending) return { action: "wait", step: null, reason: "not_due" };
    }
    const waitingForApproval = !m.recorded.has("welcome_back") && m.profileApproved !== true;
    return waitingForApproval ? { action: "wait", step: null, reason: "not_due" } : { action: "stop", reason: "finished" };
  }

  if (reviewPendingOpen(m, now)) {
    const gate = sendGate(m, now, true);
    return gate ? { action: "wait", step: REVIEW_STEP, reason: gate } : { action: "send", step: REVIEW_STEP };
  }

  const track = trackOf(m);
  let notInSequence = false;
  if (track === "free" && !m.recorded.has("welcome")) {
    const w = stepWindow("welcome", m, { startMs: cohort.startMs });
    if (!w || t > w.until) notInSequence = true;
  }
  const steps: readonly StepId[] = track === "trial" ? TRIAL_STEPS : FREE_STEPS;
  const main = notInSequence ? { candidate: null, pending: false } : nextOpenStep(m, t, steps, cohort.startMs);

  // Welcome first. Then the badge email (after approval) ahead of the rest of
  // the free track, but never ahead of a time-critical trial email.
  if (main.candidate === "welcome") return finalize("welcome");
  if (badgeStepOpen("badge", m, t, ctx) && !(main.candidate && isTrialStep(main.candidate))) return finalize("badge");
  if (main.candidate) return finalize(main.candidate);
  // Nothing on the track is due: the reminder may go.
  if (badgeStepOpen("badge_reminder", m, t, ctx)) return finalize("badge_reminder");

  if (notInSequence) return { action: "stop", reason: "not_in_sequence" };
  return main.pending ? { action: "wait", step: null, reason: "not_due" } : { action: "stop", reason: "finished" };
}

/** The first unrecorded step whose window is open (missed windows are skipped, never sent late); `pending` = the next one just isn't due yet. */
function nextOpenStep(
  m: MemberState,
  t: number,
  steps: readonly StepId[],
  startMs: number | undefined,
): { candidate: StepId | null; pending: boolean } {
  for (const s of steps) {
    if (m.recorded.has(s)) continue;
    const w = stepWindow(s, m, { startMs });
    if (!w || t > w.until) continue; // missed: never late
    if (t < w.from) return { candidate: null, pending: true };
    return { candidate: s, pending: false };
  }
  return { candidate: null, pending: false };
}

/**
 * decide() until something other than a skip: the skips to record, then the
 * final decision. Never loops more than the number of steps.
 */
export function plan(
  m: MemberState,
  now: Date,
  opts: DecideOptions = {},
): { skips: { step: StepId; reason: SkipReason }[]; decision: Decision } {
  const recorded = new Set(m.recorded);
  const skips: { step: StepId; reason: SkipReason }[] = [];
  for (let i = 0; i <= STEPS.length; i++) {
    const d = decide({ ...m, recorded }, now, opts);
    if (d.action !== "skip") return { skips, decision: d };
    skips.push({ step: d.step, reason: d.reason });
    recorded.add(d.step);
  }
  return { skips, decision: { action: "stop", reason: "finished" } };
}

/** "send welcome" · "wait (quiet_hours)" · "stop (upgraded)": for the admin list and the dry-run report. */
export function describeDecision(d: Decision): string {
  switch (d.action) {
    case "send":
      return `send ${d.step}`;
    case "skip":
      return `skip ${d.step} (${d.reason})`;
    case "wait":
      return d.step ? `wait for ${d.step} (${d.reason})` : `wait (${d.reason})`;
    case "stop":
      return `nothing (${d.reason})`;
  }
}
