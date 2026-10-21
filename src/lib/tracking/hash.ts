import { createHash, createHmac, randomBytes } from "node:crypto";

/**
 * Anonymous visitor hashes. Server-only (node:crypto), pure given its inputs.
 *
 * hash = sha256(dailySalt(day) | who), cut to 32 hex characters, where
 *  - dailySalt(day) = HMAC-SHA256(server secret, day). It changes every
 *    Toronto day and is never stored, so the same browser gets a different
 *    hash tomorrow and nothing links one day to the next;
 *  - who = the signed-in user id, or else the browser's first-party
 *    attribution cookie (pmrfp_ft, when it has one) plus its user agent,
 *    language and coarse location (country / province as the host
 *    estimates it). Never an IP address.
 *
 * The secret is TRACKING_SALT_SECRET, or the existing server-only
 * SUPABASE_SERVICE_ROLE_KEY / CRON_SECRET, so nothing new needs setting.
 */

let processSecret: string | null = null;

export function trackingSecret(): string {
  const s = process.env.TRACKING_SALT_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.CRON_SECRET;
  if (s) return s;
  // Local dev with no secrets: random per process (hashes don't dedupe across restarts, which is fine).
  processSecret ??= randomBytes(32).toString("hex");
  return processSecret;
}

export function dailySalt(day: string, secret: string = trackingSecret()): string {
  return createHmac("sha256", secret).update(`pmrfp-visitor-salt:${day}`).digest("hex");
}

export interface VisitorFacts {
  /** YYYY-MM-DD (Toronto). */
  day: string;
  userId?: string | null;
  /** The pmrfp_ft cookie value, when the browser has one. */
  browserKey?: string | null;
  userAgent?: string | null;
  acceptLanguage?: string | null;
  /** "CA-ON" style, from the host's geolocation headers. */
  geo?: string | null;
}

export const HASH_LEN = 32;

export function visitorHash(f: VisitorFacts, secret?: string): string {
  const who = f.userId
    ? `u:${f.userId}`
    : ["b", f.browserKey ?? "", (f.userAgent ?? "").slice(0, 300), (f.acceptLanguage ?? "").slice(0, 100), f.geo ?? ""].join("|");
  return createHash("sha256").update(`${dailySalt(f.day, secret)}|${who}`).digest("hex").slice(0, HASH_LEN);
}

/** One-way key for rate limiting by IP (never stored). */
export function ipKey(ip: string): string {
  return createHash("sha256").update(`beacon:${ip}`).digest("hex").slice(0, 32);
}
