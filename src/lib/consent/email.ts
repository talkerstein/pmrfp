/**
 * Email consent (CASL). Pure and client-safe; the writes are in ./record.
 *
 * Two different things are recorded, because they are different under CASL:
 *
 *  - "service": the plain notice shown right under the sign-up button (and on
 *    the onboarding form, for people who skipped the form, like Google
 *    sign-ups): we will email about the account, the bids and buyers they
 *    follow, and tips for getting set up, and every email can be unsubscribed
 *    from. This is a NOTICE, not a tick box: it covers messages about the
 *    service they asked for.
 *  - "marketing": offers and news. This is only ever recorded when the
 *    person ticks an optional box that starts UNTICKED (onboarding only).
 *    A pre-ticked box, or consent bundled into "by signing up you agree",
 *    does not count as express consent for marketing.
 *
 * The exact words live in the `auth.emailConsent` dictionary (en/fr/es). The
 * version below names the wording they saw; test/unit/signup-dropoff.test.ts
 * pins the words to the version, so changing them without bumping it fails.
 */

/** Bump when `auth.emailConsent.notice` changes (any language). */
export const EMAIL_NOTICE_VERSION = "2026-10-22.1";
/** Bump when `auth.emailConsent.marketingLabel` changes (any language). */
export const MARKETING_OPT_IN_VERSION = "2026-10-22.1";

export type ConsentScope = "service" | "marketing";
export type ConsentSource = "signup_form" | "onboarding" | "google_signup" | "settings" | "other";

export interface ConsentRow {
  user_id: string;
  scope: ConsentScope;
  source: ConsentSource;
  wording_version: string;
  lang: "en" | "fr" | "es" | null;
}

export function wordingVersionFor(scope: ConsentScope): string {
  return scope === "marketing" ? MARKETING_OPT_IN_VERSION : EMAIL_NOTICE_VERSION;
}

/** One consent row, or null when there is no user to attach it to. */
export function consentRow(userId: string | null | undefined, scope: ConsentScope, source: ConsentSource, lang?: string | null): ConsentRow | null {
  if (!userId) return null;
  return {
    user_id: userId,
    scope,
    source,
    wording_version: wordingVersionFor(scope),
    lang: lang === "fr" || lang === "es" || lang === "en" ? lang : null,
  };
}

/**
 * The optional marketing box. Only an explicit positive value counts: a
 * missing field (a browser that skipped it, an old form) is a "no".
 */
export function marketingTicked(v: FormDataEntryValue | null | undefined): boolean {
  return typeof v === "string" && ["on", "1", "true", "yes"].includes(v.trim().toLowerCase());
}
