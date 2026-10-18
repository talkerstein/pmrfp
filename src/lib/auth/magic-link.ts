import { oauthCallbackPath } from "@/lib/auth/oauth";
import { safeNextPath } from "@/lib/auth/next";

/**
 * Passwordless sign-up and sign-in (Supabase email OTP / magic link). Pure
 * helpers, unit-tested; the actions are in lib/auth/actions.
 *
 * The link in the email lands on /auth/callback (the same PKCE code swap as
 * Google), then onboarding or `next`. `m=link` only changes the error
 * message if the swap fails (say, the link was opened in another browser).
 */

export type SignupMethod = "link" | "password";

/** The sign-up form's "method" field. Anything but "link" keeps the password flow (older forms send none). */
export function parseSignupMethod(v: unknown): SignupMethod {
  return v === "link" ? "link" : "password";
}

/** Where the emailed link sends someone: our callback, then `next` (default /onboarding). */
export function magicLinkRedirect(siteUrl: string, next: string | null | undefined): string {
  const base = siteUrl.replace(/\/$/, "");
  const path = oauthCallbackPath(safeNextPath(next) ?? "/onboarding");
  return `${base}${path}${path.includes("?") ? "&" : "?"}m=link`;
}

/** The callback's failure page: says "link" or "Google", whichever was used. */
export function callbackFailurePath(method: string | null | undefined): string {
  return method === "link" ? "/sign-in?error=link" : "/sign-in?error=google";
}
