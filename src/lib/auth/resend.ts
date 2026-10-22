/**
 * Cooldown for "Send the link again" on the check-your-email screen. Pure and
 * client-safe. Supabase will not send to the same address more than once a
 * minute anyway; this keeps the button honest instead of letting people tap
 * it into an error, and caps how many times one screen can ask.
 */

export const RESEND_COOLDOWN_S = 60;
/** Most re-sends from one screen before we ask them to start over or write to us. */
export const RESEND_MAX = 3;

export interface ResendState {
  /** ms since epoch the last link was sent (the sign-up counts as the first). */
  lastSentAt: number;
  /** Re-sends so far from this screen. */
  sent: number;
}

export type ResendStatus =
  | { can: true }
  | { can: false; reason: "wait"; secondsLeft: number }
  | { can: false; reason: "limit" };

export function resendStatus(s: ResendState, now: number = Date.now()): ResendStatus {
  if (s.sent >= RESEND_MAX) return { can: false, reason: "limit" };
  const left = Math.ceil((s.lastSentAt + RESEND_COOLDOWN_S * 1000 - now) / 1000);
  return left > 0 ? { can: false, reason: "wait", secondsLeft: Math.min(left, RESEND_COOLDOWN_S) } : { can: true };
}

/** The state after a re-send at `now`. */
export function afterResend(s: ResendState, now: number = Date.now()): ResendState {
  return { lastSentAt: now, sent: s.sent + 1 };
}

/** "0:42" for the button label. */
export function countdownLabel(secondsLeft: number): string {
  const n = Math.max(0, Math.floor(secondsLeft));
  return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, "0")}`;
}
