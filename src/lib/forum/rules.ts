import { NOINDEX_FORUMS } from "./categories";

/**
 * Forum rules, kept pure so they can be unit tested: badges, thread rating
 * labels, the indexing gate and spam limits. Values follow the spec
 * (briefs/strategy/2026-10-06-forum-spec.md 2.3, 2.7, 2.8).
 *
 * Reputation points and the Apprentice→Master member ranks were folded into
 * company reputation (src/lib/karma/rules.ts) on 2026-10-10: one system, per
 * company, counting only what other companies confirm.
 */

// ── Badges (spec 2.3, v1: 6) ────────────────────────────────────────
export type BadgeSlug = "first-answer" | "accepted-10" | "verified-business" | "sharp-thread" | "year-one" | "moderator";

export interface BadgeInput {
  answers: number;
  accepted: number;
  verifiedBusiness: boolean;
  /** Best average rating among the member's threads with 3+ ratings. */
  bestThreadAverage: number | null;
  joinedAt: string | Date;
  isModerator: boolean;
  now?: Date;
}

export function badgesFor(b: BadgeInput): BadgeSlug[] {
  const out: BadgeSlug[] = [];
  const now = b.now ?? new Date();
  if (b.answers >= 1) out.push("first-answer");
  if (b.accepted >= 10) out.push("accepted-10");
  if (b.verifiedBusiness) out.push("verified-business");
  if (b.bestThreadAverage != null && b.bestThreadAverage >= 4) out.push("sharp-thread");
  if (now.getTime() - new Date(b.joinedAt).getTime() >= 365 * 86_400_000) out.push("year-one");
  if (b.isModerator) out.push("moderator");
  return out;
}

// ── Thread rating (Dud / Fair / Solid / Sharp / Gold) ───────────────
export const RATING_LABELS = ["dud", "fair", "solid", "sharp", "gold"] as const;
export type RatingLabel = (typeof RATING_LABELS)[number];

export function ratingAverage(sum: number, count: number): number | null {
  return count > 0 ? sum / count : null;
}

/** Label for an average 1-5 (rounded to the nearest whole score). */
export function ratingLabel(avg: number | null): RatingLabel | null {
  if (avg == null || !Number.isFinite(avg)) return null;
  const i = Math.min(5, Math.max(1, Math.round(avg))) - 1;
  return RATING_LABELS[i];
}

// ── Indexing gate (spec 2.8) ────────────────────────────────────────
export const MIN_INDEX_WORDS = 150;

export interface IndexableInput {
  status: "held" | "approved" | "hidden";
  type: "question" | "discussion";
  replyCount: number;
  wordsTotal: number;
  flagged?: boolean;
  /** Category slug: banter forums (Off the Clock) are never indexed. */
  category?: string;
  /** An automatic PMRFP Board post (auto-threads). */
  auto?: boolean;
}

/**
 * Indexable only when approved AND (a question with 1+ answer, or any
 * thread with 2+ replies) AND 150+ words across the thread. Everything else
 * renders noindex,follow until it earns it.
 */
export function isIndexableThread(t: IndexableInput): boolean {
  if (t.status !== "approved" || t.flagged) return false;
  if (t.category && (NOINDEX_FORUMS as readonly string[]).includes(t.category)) return false;
  // Automatic PMRFP Board posts stay noindex until a member replies.
  if (t.auto && t.replyCount < 1) return false;
  const engaged = (t.type === "question" && t.replyCount >= 1) || t.replyCount >= 2;
  return engaged && t.wordsTotal >= MIN_INDEX_WORDS;
}

/** Profiles with fewer than 5 posts stay out of the index. */
export function isIndexableProfile(postCount: number): boolean {
  return postCount >= 5;
}

/** Category list pages beyond page 5 are noindex,follow. */
export function isIndexableListPage(page: number): boolean {
  return page >= 1 && page <= 5;
}

export const PAGE_SIZE = 25;

export function pageCount(total: number, size = PAGE_SIZE): number {
  return Math.max(1, Math.ceil(Math.max(0, total) / size));
}

/** Parse a /page/N segment: integer >= 2, else null (page 1 has no segment). */
export function parsePage(v: string | undefined): number | null {
  if (!v || !/^\d{1,5}$/.test(v)) return null;
  const n = Number(v);
  return n >= 2 ? n : null;
}

// ── Anti-spam (spec 2.7) ────────────────────────────────────────────
export const NEW_MEMBER_POSTS = 5;
export const NEW_MEMBER_HOURS = 48;
export const COOLDOWN_SECONDS = 60;
export const LIMITS = {
  newMember: { threadsPerDay: 3, postsPerDay: 20 },
  member: { threadsPerDay: 10, postsPerDay: 100 },
} as const;
export const AUTO_HIDE_REPORTS = 3;

export function isNewMember(postCount: number, joinedAt: string | Date, now = new Date()): boolean {
  const ageH = (now.getTime() - new Date(joinedAt).getTime()) / 3_600_000;
  return postCount < NEW_MEMBER_POSTS || ageH < NEW_MEMBER_HOURS;
}

export type PostCheck =
  | { ok: true; hold: boolean }
  | { ok: false; reason: "cooldown" | "daily-threads" | "daily-posts" | "shortener" | "duplicate" | "banned" | "honeypot" };

export interface PostCheckInput {
  kind: "thread" | "post";
  body: string;
  honeypot?: string | null;
  banned?: boolean;
  postCount: number;
  joinedAt: string | Date;
  /** Seconds since this member's last thread or post (null if none). */
  secondsSinceLast: number | null;
  threadsToday: number;
  postsToday: number;
  /** Same text already posted by this member in the last 24h. */
  duplicate: boolean;
  /** Staff/mods skip the new-member link hold and daily caps. */
  trusted?: boolean;
  now?: Date;
}

/** Decide whether a post goes up, waits for review (hold) or is refused. */
export function checkPost(i: PostCheckInput): PostCheck {
  if (i.honeypot && i.honeypot.trim()) return { ok: false, reason: "honeypot" };
  if (i.banned) return { ok: false, reason: "banned" };
  if (hasShortener(i.body)) return { ok: false, reason: "shortener" };
  if (i.duplicate) return { ok: false, reason: "duplicate" };
  if (i.trusted) return { ok: true, hold: false };
  if (i.secondsSinceLast != null && i.secondsSinceLast < COOLDOWN_SECONDS) return { ok: false, reason: "cooldown" };
  const fresh = isNewMember(i.postCount, i.joinedAt, i.now);
  const lim = fresh ? LIMITS.newMember : LIMITS.member;
  if (i.kind === "thread" && i.threadsToday >= lim.threadsPerDay) return { ok: false, reason: "daily-threads" };
  if (i.postsToday + i.threadsToday >= lim.postsPerDay) return { ok: false, reason: "daily-posts" };
  return { ok: true, hold: fresh && hasLink(i.body) };
}

// ── Who may post (threads, replies, votes, ratings, reports) ────────
export interface PostingInput {
  isAdmin: boolean;
  isMod: boolean;
  /** organizations.profile_status for the member's company, if any. */
  orgProfileStatus: string | null | undefined;
  /** Signed in with Google (auth provider or a linked google identity). */
  google: boolean;
  emailVerified: boolean;
  onboarded: boolean;
}

/**
 * Verified members only: an approved company profile, OR a Google sign-in
 * with a verified email and a finished onboarding. Admins and mods always.
 */
export function canPost(i: PostingInput): boolean {
  if (i.isAdmin || i.isMod) return true;
  if (i.orgProfileStatus === "approved") return true;
  return i.google && i.emailVerified && i.onboarded;
}

/** Auto-hide once enough distinct members have reported the same item. */
export function shouldAutoHide(distinctReporters: number): boolean {
  return distinctReporters >= AUTO_HIDE_REPORTS;
}

const URL_RE = /\bhttps?:\/\/[^\s<>"')\]]+|\bwww\.[a-z0-9-]+\.[a-z]{2,}[^\s<>"')\]]*/gi;
const BARE_DOMAIN_RE = /\b[a-z0-9-]+\.(?:com|net|org|io|co|ca|us|info|biz|xyz|ly|gl|gd|me|link|site|online|shop)\b(?:\/\S*)?/i;

export function hasLink(text: string): boolean {
  URL_RE.lastIndex = 0;
  return URL_RE.test(text) || BARE_DOMAIN_RE.test(text);
}

export const SHORTENERS = [
  "bit.ly", "tinyurl.com", "t.co", "goo.gl", "ow.ly", "is.gd", "buff.ly", "rebrand.ly", "cutt.ly",
  "shorturl.at", "tiny.cc", "rb.gy", "bl.ink", "t.ly", "s.id", "lnkd.in", "shorte.st", "adf.ly",
];

export function hasShortener(text: string): boolean {
  const lower = text.toLowerCase();
  // The domain must stand alone: not part of a longer host (bit.ly.example, xt.co).
  return SHORTENERS.some((d) => new RegExp(`(^|[^a-z0-9.-])${d.replace(/\./g, "\\.")}(?![a-z0-9-]|\\.[a-z0-9])`).test(lower));
}
