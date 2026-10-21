/**
 * First-party funnel events (site_events, migration 20261021000200). Pure
 * and client-safe: the beacon, the server helper and the admin report all
 * read the same lists.
 *
 * Most events are recorded on the server, where the thing happened (a
 * sign-up, a checkout, a post). A browser may only report the handful in
 * CLIENT_EVENTS, so nobody can fake a sign-up or a sale through /api/t.
 */

export const SITE_EVENTS = [
  "signup_started",
  "signup_completed",
  "onboarding_completed",
  "writer_started",
  "writer_draft_generated",
  "rfp_posted",
  "pricing_viewed",
  "upgrade_clicked",
  "checkout_started",
  "checkout_completed",
  "trial_started",
  "follow_buyer",
  "claim_started",
  "claim_verified",
  "respond_to_job",
  "quote_request_posted",
] as const;
export type SiteEvent = (typeof SITE_EVENTS)[number];

/** What the browser beacon may report. Everything else comes from the server. */
export const CLIENT_EVENTS = ["signup_started", "pricing_viewed", "upgrade_clicked", "writer_started"] as const;
export type ClientEvent = (typeof CLIENT_EVENTS)[number];

export function isSiteEvent(v: unknown): v is SiteEvent {
  return typeof v === "string" && (SITE_EVENTS as readonly string[]).includes(v);
}

export function isClientEvent(v: unknown): v is ClientEvent {
  return typeof v === "string" && (CLIENT_EVENTS as readonly string[]).includes(v);
}

export type PropValue = string | number | boolean | null;
export type Props = Record<string, PropValue>;

export const MAX_PROPS = 8;
export const MAX_PROP_LEN = 80;
const KEY = /^[a-z][a-z0-9_]{0,30}$/i;
const EMAIL = /[^\s/@]+@[^\s/@]+/;

/**
 * Small, flat, safe properties: at most 8 keys, short strings (anything that
 * looks like an email address is dropped), finite numbers, booleans.
 */
export function sanitizeProps(raw: unknown): Props {
  const out: Props = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (Object.keys(out).length >= MAX_PROPS) break;
    if (!KEY.test(k)) continue;
    if (typeof v === "string") {
      const s = v.trim().replace(/\p{Cc}|[<>]/gu, "").slice(0, MAX_PROP_LEN);
      if (s && !EMAIL.test(s) && !s.includes("%40")) out[k] = s;
    } else if (typeof v === "number") {
      if (Number.isFinite(v)) out[k] = Math.round(v * 100) / 100;
    } else if (typeof v === "boolean" || v === null) {
      out[k] = v;
    }
  }
  return out;
}

/** "CA" and "US" stay apart; everything else (and unknown) is "other". */
export type Market = "CA" | "US" | "other";
export const MARKETS: readonly Market[] = ["CA", "US", "other"];

export function marketOf(country: string | null | undefined): Market {
  const c = String(country ?? "").toUpperCase();
  return c === "CA" ? "CA" : c === "US" ? "US" : "other";
}

/** A two-letter country code from a header, or null. */
export function countryCode(raw: string | null | undefined): string | null {
  const c = String(raw ?? "").trim().toUpperCase();
  return /^[A-Z]{2}$/.test(c) ? c : null;
}

/** The page language from a path: /fr/… and /es/…, English otherwise. */
export function langOfPath(path: string | null | undefined): "en" | "fr" | "es" {
  const first = String(path ?? "").split("/")[1];
  return first === "fr" || first === "es" ? first : "en";
}
