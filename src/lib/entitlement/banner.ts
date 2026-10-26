import { TRIAL_DAYS, type TrialState } from "./trial";

/**
 * The trial banner in the app shell. Pure day math and the "what you've
 * used" counts; the wording lives in i18n/messages/trialFirst.ts. Unit tested
 * (test/unit/trial-first.test.ts).
 *
 * Every number is real: days come from trade_trials, counts from what the
 * member actually received or did (usage-server.ts).
 */

const DAY_MS = 86_400_000;

/** How long after a trial ends the calm "your trial ended" note stays up. */
export const EXPIRED_NOTE_DAYS = 30;

export type BannerTone = "normal" | "three" | "one";

export type BannerView =
  | { kind: "active"; day: number; total: number; daysLeft: number; tone: BannerTone; endsAt: string }
  | { kind: "expired"; endedAt: string };

/** What a banner reports as used, all real counts over the trial so far. */
export interface TrialUsage {
  /** Bid, lead and major-project alert emails recorded for this member. */
  alerts: number;
  /** Bids saved since the trial began. */
  saved: number;
  /** Bids the company responded to since the trial began. */
  responses: number;
}

export const NO_USAGE: TrialUsage = { alerts: 0, saved: 0, responses: 0 };

/** "Trial day 3 of 14": the day counted from when it started, 1..14. */
export function trialDayNumber(trial: TrialState, now: Date = new Date()): number {
  if (!trial.startedAt) return 1;
  const started = Date.parse(trial.startedAt);
  if (!Number.isFinite(started)) return 1;
  const day = Math.floor((now.getTime() - started) / DAY_MS) + 1;
  return Math.min(TRIAL_DAYS, Math.max(1, day));
}

/** Which banner (if any) the member sees. Paying members and companies with no trial see none. */
export function trialBannerView(p: { paid?: boolean; trial?: TrialState }, now: Date = new Date()): BannerView | null {
  const trial = p.trial;
  if (p.paid || !trial || trial.status === "none") return null;
  if (trial.status === "active") {
    const tone: BannerTone = trial.daysLeft <= 1 ? "one" : trial.daysLeft === 3 ? "three" : "normal";
    return { kind: "active", day: trialDayNumber(trial, now), total: TRIAL_DAYS, daysLeft: trial.daysLeft, tone, endsAt: trial.endsAt ?? "" };
  }
  const ended = trial.endsAt ? Date.parse(trial.endsAt) : NaN;
  if (!Number.isFinite(ended) || now.getTime() - ended > EXPIRED_NOTE_DAYS * DAY_MS) return null;
  return { kind: "expired", endedAt: trial.endsAt! };
}

/** The usage rows worth showing: only those above zero. */
export function usedParts(u: TrialUsage): { key: keyof TrialUsage; n: number }[] {
  return (Object.keys(NO_USAGE) as (keyof TrialUsage)[]).map((key) => ({ key, n: u[key] })).filter((x) => x.n > 0);
}

/**
 * What an ended trial took away, counting only things the member actually
 * used. Saved bids and responses stay available on the free plan, so the only
 * thing tracked per member that really goes away is the alert email.
 */
export function lostParts(u: TrialUsage): { key: "alerts"; n: number }[] {
  return u.alerts > 0 ? [{ key: "alerts", n: u.alerts }] : [];
}
