/**
 * What /auth/callback was handed, and whether a sign-in just confirmed an
 * address. Pure and unit-tested; the route is app/auth/callback/route.ts.
 *
 * Two kinds of link land on the callback:
 *  - `?code=` (PKCE): the default. The code only works in the browser that
 *    asked for the link, because the matching secret is a cookie there. A
 *    link opened on a phone's mail app after signing up on a laptop, or in an
 *    email app's built-in browser, fails with "That link didn't work".
 *  - `?token_hash=…&type=…`: works in ANY browser or device. It needs the
 *    Supabase email templates to link to
 *      {{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=email
 *    instead of {{ .ConfirmationURL }} (a dashboard change, the owner's).
 *    The callback accepts it already, so the change is a no-risk switch.
 */

export type EmailOtpType = "signup" | "magiclink" | "email" | "recovery" | "invite" | "email_change";
const OTP_TYPES: readonly string[] = ["signup", "magiclink", "email", "recovery", "invite", "email_change"];

export type CallbackCredential =
  | { kind: "code"; code: string }
  | { kind: "token_hash"; tokenHash: string; type: EmailOtpType }
  | null;

const TOKEN_HASH = /^[A-Za-z0-9_-]{8,200}$/;

export function callbackCredential(params: URLSearchParams): CallbackCredential {
  const tokenHash = params.get("token_hash");
  const type = params.get("type");
  if (tokenHash && TOKEN_HASH.test(tokenHash) && type && OTP_TYPES.includes(type)) {
    return { kind: "token_hash", tokenHash, type: type as EmailOtpType };
  }
  const code = params.get("code");
  return code ? { kind: "code", code } : null;
}

/** An address confirmed this recently counts as "just confirmed": the first time the link was used, not a later sign-in. */
export const FRESH_CONFIRMATION_MS = 15 * 60_000;

export function isFreshConfirmation(confirmedAt: string | null | undefined, now: number = Date.now()): boolean {
  if (!confirmedAt) return false;
  const t = Date.parse(confirmedAt);
  return Number.isFinite(t) && t <= now + 60_000 && now - t <= FRESH_CONFIRMATION_MS;
}
