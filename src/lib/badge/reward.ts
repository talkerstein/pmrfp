/**
 * The badge reward: a one-time +14 days of Trade Pro for a company whose badge
 * is detected on its own website (lib/badge/install). Pure rules, unit-tested
 * (test/unit/badge-reward.test.ts); the writes are in lib/badge/server.
 *
 * Off unless BADGE_REWARD_ENABLED is "1" or "true". Even then:
 *  - once per company, ever: badge_rewards.organization_id is its primary key,
 *    so a racing second run can't grant twice;
 *  - never for a company that already pays (an active / comped Pro or
 *    Featured plan, or lifetime);
 *  - only for a real, live company: trade company, active, not a demo,
 *    profile approved, not run by staff or a test address;
 *  - the evidence is the install rule itself (the badge loading from the
 *    company's OWN website domain on two different days), and the company's
 *    website must not be one of ours or a test / preview host. No admin
 *    screen grants it: only the cron does, from the hit counters.
 *
 * How it lands on the trial (trade_trials, migration 20261016000001): the
 * table already is the one place that makes a company Trade Pro without
 * paying (has_active_trade_access in SQL and computeTradeAccess in the app
 * both read ends_at), so the reward reuses it instead of adding a second way
 * to be Pro:
 *   no trial yet        a new row, 14 days from now (source "badge")
 *   trial running       ends_at moves 14 days later
 *   trial already ended the same row is opened again for 14 days from now
 *                       (one trial per company stays true: it is still the
 *                       one row; the old dates are kept in badge_rewards)
 * The table's check (ends_at <= started_at + 31 days) is never exceeded.
 */
import { isLifetimeSubscriptionId } from "@/lib/founding/config";
import { isOwnOrTestDomain, type BadgeInstall } from "./install";

export const REWARD_DAYS = 14;

/** A subscription row that makes the company Trade Pro without a trial: active / comped Pro or Featured, or lifetime. Same rule as the lifecycle's "paid". */
export function isPayingSubscription(s: { status: string; tier: string | null; stripe_subscription_id: string | null }): boolean {
  return (s.status === "active" || s.status === "comped") && (s.tier === "pro" || s.tier === "featured" || isLifetimeSubscriptionId(s.stripe_subscription_id));
}
export const REWARD_SOURCE = "badge";
const DAY_MS = 86_400_000;
/** trade_trials_window: ends_at <= started_at + 31 days. */
const MAX_TRIAL_MS = 31 * DAY_MS;

export function badgeRewardEnabled(env: string | undefined = process.env.BADGE_REWARD_ENABLED): boolean {
  return env === "1" || env === "true";
}

export interface RewardCompany {
  organizationType: string;
  status: string;
  isDemo: boolean;
  profileApproved: boolean;
  /** Pays for Trade Pro / Featured, or lifetime. */
  paid: boolean;
  /** Already has a badge_rewards row. */
  alreadyRewarded: boolean;
  /** Owner / member is staff or a test address (isInternalEmail or an admin role). */
  internal: boolean;
}

export type RewardRefusal =
  | "disabled"
  | "not_installed"
  | "own_domain"
  | "already_rewarded"
  | "paying"
  | "not_a_live_company"
  | "internal";

/** Why this company does NOT get the reward right now, most permanent first; null = it does. */
export function rewardRefusal(p: { enabled: boolean; install: BadgeInstall; company: RewardCompany }): RewardRefusal | null {
  const { install, company: c } = p;
  if (!p.enabled) return "disabled";
  if (c.alreadyRewarded) return "already_rewarded";
  if (c.paid) return "paying";
  if (c.organizationType !== "trade_company" || c.status !== "active" || c.isDemo || !c.profileApproved) return "not_a_live_company";
  if (c.internal) return "internal";
  if (!install.domain || install.ownDomain || isOwnOrTestDomain(install.domain)) return "own_domain";
  if (!install.detected) return "not_installed";
  return null;
}

export interface TrialRowLite {
  startedAt: string;
  endsAt: string;
}

export type TrialChange =
  | { kind: "start"; startedAt: string; endsAt: string }
  | { kind: "extend"; endsAt: string; previousEndsAt: string }
  | { kind: "reopen"; startedAt: string; endsAt: string; previousStartedAt: string; previousEndsAt: string };

/**
 * What the reward does to the company's trial, or null when it can't be done
 * without breaking the table's 31-day check (a hand-made long trial with
 * almost no room left): then nothing is granted and nothing is used up.
 */
export function planTrialChange(existing: TrialRowLite | null, now: Date, days: number = REWARD_DAYS): TrialChange | null {
  const add = days * DAY_MS;
  if (!existing) {
    return { kind: "start", startedAt: now.toISOString(), endsAt: new Date(now.getTime() + add).toISOString() };
  }
  const start = Date.parse(existing.startedAt);
  const end = Date.parse(existing.endsAt);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  if (end > now.getTime()) {
    const cap = start + MAX_TRIAL_MS;
    const next = Math.min(end + add, cap);
    if (next - end < DAY_MS) return null; // under a day of room: not a real extension
    return { kind: "extend", endsAt: new Date(next).toISOString(), previousEndsAt: existing.endsAt };
  }
  return {
    kind: "reopen",
    startedAt: now.toISOString(),
    endsAt: new Date(now.getTime() + add).toISOString(),
    previousStartedAt: existing.startedAt,
    previousEndsAt: existing.endsAt,
  };
}

/** The trade_trials row after the change. */
export function trialAfter(change: TrialChange, existing: TrialRowLite | null): TrialRowLite {
  if (change.kind === "extend") return { startedAt: existing!.startedAt, endsAt: change.endsAt };
  return { startedAt: change.startedAt, endsAt: change.endsAt };
}
