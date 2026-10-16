import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * "Someone replied to your thread" emails (pure part, tested in
 * test/forum-notify.test.ts). Respects the member's email preferences:
 * notification_preferences.forum_replies ('instant' | 'off') and the global
 * channel_email switch, plus a one-click unsubscribe link in every email.
 * At most one email per thread per member every THROTTLE_HOURS, so a busy
 * thread doesn't flood an inbox.
 */
export const THROTTLE_HOURS = 6;

export interface NotifyInput {
  threadAuthorId: string;
  replierId: string;
  /** The thread's author is the PMRFP Board or PMRFP Team account (no inbox). */
  authorIsSystem: boolean;
  /** notification_preferences.forum_replies (null = no row yet = default 'instant'). */
  pref: string | null | undefined;
  /** notification_preferences.channel_email (null = default true). */
  channelEmail: boolean | null | undefined;
  /** Last email for this thread to this member. */
  lastSentAt: string | null | undefined;
  now?: Date;
}

export function shouldNotify(i: NotifyInput): boolean {
  if (i.threadAuthorId === i.replierId || i.authorIsSystem) return false;
  if (i.channelEmail === false) return false;
  if ((i.pref ?? "instant") === "off") return false;
  if (i.lastSentAt) {
    const age = (i.now ?? new Date()).getTime() - new Date(i.lastSentAt).getTime();
    if (age < THROTTLE_HOURS * 3_600_000) return false;
  }
  return true;
}

// ── One-click unsubscribe (its own prefix: can't be reused for other emails) ──
function secret(): string | null {
  return process.env.UNSUBSCRIBE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || null;
}

function sign(userId: string, key: string): string {
  return createHmac("sha256", key).update(`forum-replies-unsub:${userId}`).digest("base64url");
}

export function forumUnsubscribeUrl(base: string, userId: string): string | null {
  const key = secret();
  if (!key) return null;
  return `${base}/api/forum/unsubscribe?u=${encodeURIComponent(userId)}&t=${sign(userId, key)}`;
}

export function verifyForumUnsubscribe(userId: string | null, token: string | null): boolean {
  const key = secret();
  if (!key || !userId || !token) return false;
  const expected = Buffer.from(sign(userId, key));
  const given = Buffer.from(token);
  return expected.length === given.length && timingSafeEqual(expected, given);
}
