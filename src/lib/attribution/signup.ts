/**
 * The signup_attribution row for a new account, built from the first-touch
 * cookie (lib/attribution/cookie). Pure and unit-tested. A browser without
 * the cookie (cleared, blocked, a different device) is recorded as
 * channel "unknown" with no landing data, rather than guessed; the
 * request's language and the host's country estimate still fill in what
 * they can. A browser that sends Do-Not-Track / Global Privacy Control is
 * recorded with the method and role only (opted_out = true).
 */

import { hasUtm, sameUtm, type FirstTouch } from "./cookie";
import { classifyChannel, type Channel } from "./channel";

/**
 * How the account was created. "email" is the old name for "password"
 * (rows written before 2026-10-21, and databases without migration
 * 20261021000200, which only allow 'email' and 'google').
 */
export type SignupMethod = "password" | "magic_link" | "google" | "email";

export interface SignupAttributionRow {
  user_id: string;
  org_id: string | null;
  channel: Channel;
  landing_path: string | null;
  referrer_host: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  last_utm_source: string | null;
  last_utm_medium: string | null;
  last_utm_campaign: string | null;
  last_utm_content: string | null;
  last_touch_at: string | null;
  first_seen: string | null;
  signed_up_at: string;
  lang: string | null;
  country: string | null;
  method: SignupMethod | null;
  role: string | null;
  opted_out: boolean;
}

const orNull = (v: string | undefined | null) => (v ? v : null);
const LANGS = new Set(["en", "fr", "es"]);
const ROLE = /^[a-z_]{1,40}$/;

export function signupAttributionRow(i: {
  userId: string;
  orgId?: string | null;
  ft: FirstTouch | null;
  method?: SignupMethod | null;
  role?: string | null;
  /** DNT / GPC on the request: keep nothing about how they arrived. */
  optedOut?: boolean;
  /** Known without the cookie: the form's language, the host's country estimate. */
  fallback?: { lang?: string | null; country?: string | null };
  ownHosts?: readonly string[];
  /** When the account was created (defaults to now). */
  signedUpAt?: string | null;
  now?: Date;
}): SignupAttributionRow {
  const ft = i.optedOut ? null : i.ft;
  // Last touch only when it says something the first touch doesn't.
  const last = ft?.last && hasUtm(ft.last) && !sameUtm(ft.last, ft.utm) ? ft.last : null;
  const fbLang = i.fallback?.lang && LANGS.has(i.fallback.lang) ? i.fallback.lang : null;
  const fbCountry = !i.optedOut && i.fallback?.country && /^[A-Z]{2}$/.test(i.fallback.country) ? i.fallback.country : null;
  const signedUp = i.signedUpAt && !Number.isNaN(Date.parse(i.signedUpAt)) ? new Date(i.signedUpAt) : (i.now ?? new Date());
  return {
    user_id: i.userId,
    org_id: i.orgId ?? null,
    channel: ft ? classifyChannel(ft, i.ownHosts) : "unknown",
    landing_path: orNull(ft?.path),
    referrer_host: orNull(ft?.ref),
    utm_source: orNull(ft?.utm.source),
    utm_medium: orNull(ft?.utm.medium),
    utm_campaign: orNull(ft?.utm.campaign),
    utm_content: orNull(ft?.utm.content),
    last_utm_source: orNull(last?.source),
    last_utm_medium: orNull(last?.medium),
    last_utm_campaign: orNull(last?.campaign),
    last_utm_content: orNull(last?.content),
    last_touch_at: orNull(last?.at),
    first_seen: orNull(ft?.first),
    signed_up_at: signedUp.toISOString(),
    lang: orNull(ft?.lang) ?? fbLang,
    country: orNull(ft?.country) ?? fbCountry,
    method: i.method ?? null,
    role: i.role && ROLE.test(i.role) ? i.role : null,
    opted_out: !!i.optedOut,
  };
}

/**
 * The same row for a database that hasn't run migration 20261021000200
 * yet: no role / opted_out columns, and only 'email' or 'google' methods.
 * Written only when the full row is refused, so a sign-up is never left
 * without a row because of the rollout order.
 */
export function legacyAttributionRow(row: SignupAttributionRow): Omit<SignupAttributionRow, "role" | "opted_out"> {
  const { role: _role, opted_out: _opted, ...rest } = row;
  void _role;
  void _opted;
  return { ...rest, method: row.method === "google" ? "google" : row.method ? "email" : null };
}
