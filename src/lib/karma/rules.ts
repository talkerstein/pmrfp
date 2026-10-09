/**
 * Company reputation ("karma") rules. Pure functions only, so every rule is
 * unit tested (test/unit/karma-rules.test.ts) and the same code runs in the
 * nightly cron, the on-demand sync and the dry-run backfill.
 *
 * Principles (approved by Rishon, 2026-10-09):
 *  1. Points only for VERIFIABLE useful actions, never raw activity. No points
 *     for logins, post counts, self-votes or votes from the same company.
 *  2. One score per company. The public sees a level (1-5) and its name, never
 *     the number. The company sees its number and a ledger in its dashboard.
 *  3. Points decay slowly with inactivity and come off when the source goes
 *     away (deleted, review retracted, content removed, admin marks abuse).
 *  4. Rewards are free visibility perks, never Trade Pro's paid value.
 *  5. The forum's old member ranks are folded in here: one system, not two.
 */

export const KARMA_KINDS = [
  "profile_approved",
  "vendor_verified",
  "forum_accepted_answer",
  "forum_answer_upvote",
  "forum_thread_rated",
  "forum_content_removed",
  "project_verified_review",
  "gc_package_interest",
  "gc_award_package",
  "rfp_bids_received",
  "referral_verified",
  "admin_adjustment",
] as const;

export type KarmaKind = (typeof KARMA_KINDS)[number];

export function isKarmaKind(v: unknown): v is KarmaKind {
  return typeof v === "string" && (KARMA_KINDS as readonly string[]).includes(v);
}

/** Fixed points per kind. Ratings and admin adjustments carry their own. */
export const POINTS = {
  profile_approved: 20,
  vendor_verified: 20,
  forum_accepted_answer: 15,
  forum_answer_upvote: 5,
  forum_thread_rated_gold: 10,
  forum_thread_rated_sharp: 5,
  forum_content_removed: -20,
  project_verified_review: 40,
  gc_package_interest: 20,
  gc_award_package: 10,
  rfp_bids_received: 25,
  referral_verified: 30,
} as const;

/** Points a thread author's company earns for one member's 1-5 rating. */
export function ratingPoints(score: number): number {
  if (score === 5) return POINTS.forum_thread_rated_gold;
  if (score === 4) return POINTS.forum_thread_rated_sharp;
  return 0;
}

/**
 * Kinds that earn points today. referral_verified is reserved: referrals are
 * still email-only (no referrals table), so nothing can verify one yet.
 */
export const LIVE_KINDS: readonly KarmaKind[] = KARMA_KINDS.filter((k) => k !== "referral_verified");

/** Admin adjustments are bounded so a typo can't crown a company. */
export const ADMIN_ADJUST_MAX = 500;

// ── Caps (anti-gaming) ──────────────────────────────────────────────
const DAY = 86_400_000;
export const WINDOW_DAYS = 30;

/** Peer signals: one member's vote or rating for another company's work. */
export const PEER_KINDS: readonly KarmaKind[] = ["forum_answer_upvote", "forum_thread_rated", "forum_accepted_answer"];

/** Same member → same company: at most this many peer events count per 30 days. */
export const PAIR_CAP = 3;
/** Same asker → same company: accepted answers that count per 30 days. */
export const ACCEPTED_PAIR_CAP = 2;
/** Peer points a company can earn per UTC day, all peer kinds together. */
export const PEER_DAILY_CAP = 45;

/** Per company, per rolling 30 days: how many events of a kind count. */
export const WINDOW_CAPS: Partial<Record<KarmaKind, number>> = {
  gc_package_interest: 5,
  gc_award_package: 3,
  rfp_bids_received: 8,
  project_verified_review: 10,
};

// ── Decay ───────────────────────────────────────────────────────────
/** No decay while a company keeps earning; this long idle before it starts. */
export const DECAY_GRACE_DAYS = 180;
/** Then the score shrinks this much per full 30 idle days... */
export const DECAY_PER_MONTH = 0.05;
/** ...but never below this share of the points earned. */
export const DECAY_FLOOR = 0.5;

export function decayFactor(lastEarnedAt: string | Date | null | undefined, now: Date = new Date()): number {
  if (!lastEarnedAt) return 1;
  const idleDays = (now.getTime() - new Date(lastEarnedAt).getTime()) / DAY;
  if (!Number.isFinite(idleDays) || idleDays <= DECAY_GRACE_DAYS) return 1;
  const months = Math.floor((idleDays - DECAY_GRACE_DAYS) / 30);
  return Math.max(DECAY_FLOOR, Math.round((1 - DECAY_PER_MONTH * months) * 100) / 100);
}

// ── Levels ──────────────────────────────────────────────────────────
export const LEVELS = [
  { level: 1, slug: "member", min: 0 },
  { level: 2, slug: "contributor", min: 50 },
  { level: 3, slug: "established", min: 150 },
  { level: 4, slug: "proven", min: 400 },
  { level: 5, slug: "leader", min: 1000 },
] as const;

export type LevelNumber = 1 | 2 | 3 | 4 | 5;
export type LevelSlug = (typeof LEVELS)[number]["slug"];

/** Levels shown publicly. Level 1 is everyone's starting point, so no badge. */
export const PUBLIC_BADGE_MIN_LEVEL = 2;

export function levelFor(score: number): LevelNumber {
  const s = Math.max(0, Math.floor(Number.isFinite(score) ? score : 0));
  let lv: LevelNumber = 1;
  for (const l of LEVELS) if (s >= l.min) lv = l.level as LevelNumber;
  return lv;
}

export function levelSlug(level: number): LevelSlug {
  return (LEVELS.find((l) => l.level === level) ?? LEVELS[0]).slug;
}

export function isLevel(v: unknown): v is LevelNumber {
  return v === 1 || v === 2 || v === 3 || v === 4 || v === 5;
}

export interface LevelProgress {
  level: LevelNumber;
  next: LevelNumber | null;
  /** Points still needed for the next level (0 at the top). */
  toNext: number;
  /** 0-100 inside the current band (100 at the top). */
  percent: number;
}

export function levelProgress(score: number): LevelProgress {
  const s = Math.max(0, Math.floor(score || 0));
  const level = levelFor(s);
  const ladder: readonly { level: number; min: number }[] = LEVELS;
  const cur = ladder[level - 1];
  const nxt = ladder[level];
  if (!nxt) return { level, next: null, toNext: 0, percent: 100 };
  return {
    level,
    next: nxt.level as LevelNumber,
    toNext: nxt.min - s,
    percent: Math.min(100, Math.floor(((s - cur.min) / (nxt.min - cur.min)) * 100)),
  };
}

// ── Scoring ─────────────────────────────────────────────────────────
export interface LedgerEvent {
  id?: string;
  kind: KarmaKind;
  points: number;
  /** Who caused it (voter, asker). Used for pair caps; never shown publicly. */
  actorId?: string | null;
  createdAt: string;
  reversedAt?: string | null;
}

export type CapReason = "pair" | "daily" | "window";

export interface ScoredEvent<E extends LedgerEvent = LedgerEvent> {
  event: E;
  /** Points that counted toward the score (0 when capped or reversed). */
  counted: number;
  capped: CapReason | null;
  reversed: boolean;
}

export interface ScoreResult<E extends LedgerEvent = LedgerEvent> {
  /** Sum of counted points, floored at 0, before decay. */
  raw: number;
  /** After decay: what decides the level. */
  score: number;
  level: LevelNumber;
  decay: number;
  lastEarnedAt: string | null;
  events: ScoredEvent<E>[];
}

function utcDay(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10);
}

/**
 * Score one company's ledger. Reversed rows count 0. Caps apply in time
 * order, so the first qualifying events count and later ones over the cap
 * show "capped" in the company's ledger. Negative points always count.
 */
export function scoreLedger<E extends LedgerEvent>(ledger: E[], now: Date = new Date()): ScoreResult<E> {
  const order = ledger
    .map((e, i) => ({ e, i }))
    .sort((a, b) => a.e.createdAt.localeCompare(b.e.createdAt) || a.i - b.i);
  const counted: { e: E; t: number }[] = [];
  const peerByDay = new Map<string, number>();
  const out = new Array<ScoredEvent<E>>(ledger.length);
  let sum = 0;
  let lastEarned: string | null = null;

  for (const { e, i } of order) {
    if (e.reversedAt) {
      out[i] = { event: e, counted: 0, capped: null, reversed: true };
      continue;
    }
    const t = new Date(e.createdAt).getTime();
    const since = t - WINDOW_DAYS * DAY;
    let capped: CapReason | null = null;

    if (e.points > 0 && PEER_KINDS.includes(e.kind)) {
      if (e.actorId) {
        const limit = e.kind === "forum_accepted_answer" ? ACCEPTED_PAIR_CAP : PAIR_CAP;
        const sameKindGroup = (k: KarmaKind) => (e.kind === "forum_accepted_answer" ? k === "forum_accepted_answer" : k !== "forum_accepted_answer" && PEER_KINDS.includes(k));
        const n = counted.filter((c) => c.e.actorId === e.actorId && sameKindGroup(c.e.kind) && c.t > since && c.t <= t).length;
        if (n >= limit) capped = "pair";
      }
      const day = utcDay(e.createdAt);
      if (!capped && (peerByDay.get(day) ?? 0) + e.points > PEER_DAILY_CAP) capped = "daily";
      if (!capped) peerByDay.set(day, (peerByDay.get(day) ?? 0) + e.points);
    }

    const windowCap = WINDOW_CAPS[e.kind];
    if (!capped && e.points > 0 && windowCap != null) {
      const n = counted.filter((c) => c.e.kind === e.kind && c.t > since && c.t <= t).length;
      if (n >= windowCap) capped = "window";
    }

    if (capped) {
      out[i] = { event: e, counted: 0, capped, reversed: false };
      continue;
    }
    sum += e.points;
    counted.push({ e, t });
    if (e.points > 0 && e.kind !== "admin_adjustment" && (!lastEarned || e.createdAt > lastEarned)) lastEarned = e.createdAt;
    out[i] = { event: e, counted: e.points, capped: null, reversed: false };
  }

  const raw = Math.max(0, sum);
  const decay = decayFactor(lastEarned, now);
  const score = Math.floor(raw * decay);
  return { raw, score, level: levelFor(score), decay, lastEarnedAt: lastEarned, events: out };
}
