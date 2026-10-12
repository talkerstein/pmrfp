import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { CA_PROVINCES, US_STATE_NAMES } from "@/lib/geo";

/**
 * The free weekly email ("major projects + open bids + recent awards in your
 * province/state and trades"). Pure settings and checks, unit-tested.
 *
 * Nothing sends unless WEEKLY_DIGEST_ENABLED is "1" or "true": the sign-up
 * forms don't render, the sign-up action refuses, and the cron only dry-runs.
 */

export function weeklyDigestEnabled(env: string | undefined = process.env.WEEKLY_DIGEST_ENABLED): boolean {
  return env === "1" || env === "true";
}

/** CASL / CAN-SPAM sender identification, in every weekly email's footer. */
export const DIGEST_SENDER = "Talkerstein Consulting Group";
export const DIGEST_ADDRESS = "5050 Dufferin St., Toronto, ON M3H 5T5";
export const CONSENT_VERSION = "v1-2026-10";
export const MAX_DIGEST_TRADES = 5;
/** A confirmation link works for 7 days. */
export const CONFIRM_TTL_MS = 7 * 86_400_000;
/** At most one confirmation email per address per 10 minutes. */
export const CONFIRM_RESEND_MS = 10 * 60_000;
/** Weekly: never twice inside 6 days, whatever triggers the cron. */
export const MIN_GAP_MS = 6 * 86_400_000;
export const DIGEST_BUCKETS = 4;

export type DigestCountry = "CA" | "US";
export type DigestLang = "en" | "fr" | "es";
export type SubscriberStatus = "pending" | "active" | "unsubscribed" | "bounced";

/** Provinces/states we serve, per country. Never mixed. */
export function placesOf(country: DigestCountry): readonly string[] {
  return country === "US" ? US_STATE_NAMES : CA_PROVINCES;
}

export interface DigestSignupInput {
  email: string;
  country: DigestCountry;
  province: string;
  trades: string[];
  lang: DigestLang;
  consent: boolean;
  source: string;
}

export type DigestSignupError = "email" | "province" | "consent" | "trades";

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[a-z]{2,24}$/i;
const SOURCES = new Set(["home", "major-projects", "benchmarks", "forum", "contract-winners", "contract-winner", "weekly-email"]);

/** Form fields → a clean sign-up, or the first problem. `validTrades` = the trade slugs that exist. */
export function parseDigestSignup(
  f: { email?: unknown; country?: unknown; province?: unknown; trades?: unknown; lang?: unknown; consent?: unknown; source?: unknown },
  validTrades: ReadonlySet<string>,
): { ok: true; value: DigestSignupInput } | { ok: false; error: DigestSignupError } {
  const email = String(f.email ?? "").trim().slice(0, 254);
  if (!EMAIL.test(email)) return { ok: false, error: "email" };
  const country: DigestCountry = f.country === "US" ? "US" : "CA";
  const province = String(f.province ?? "").trim();
  // The province/state must belong to the chosen country.
  if (!placesOf(country).includes(province)) return { ok: false, error: "province" };
  const raw = Array.isArray(f.trades) ? f.trades : f.trades ? [f.trades] : [];
  const trades = [...new Set(raw.map((t) => String(t).trim()).filter((t) => validTrades.has(t)))];
  if (trades.length > MAX_DIGEST_TRADES) return { ok: false, error: "trades" };
  if (f.consent !== true && f.consent !== "on" && f.consent !== "1" && f.consent !== "yes") return { ok: false, error: "consent" };
  const lang: DigestLang = f.lang === "fr" || f.lang === "es" ? f.lang : "en";
  const source = SOURCES.has(String(f.source)) ? String(f.source) : "site";
  return { ok: true, value: { email, country, province, trades, lang, consent: true, source } };
}

/* ------------------------------------------------------------------ double opt-in */

export function newConfirmToken(): { token: string; hash: string } {
  const token = randomBytes(24).toString("base64url");
  return { token, hash: hashToken(token) };
}

export function hashToken(token: string): string {
  return createHash("sha256").update(`digest-confirm:${token}`).digest("hex");
}

/** The link's token matches the stored hash and the link is under 7 days old. */
export function confirmTokenValid(token: string | null | undefined, storedHash: string | null | undefined, sentAt: string | null | undefined, now = Date.now()): boolean {
  if (!token || !storedHash || !sentAt) return false;
  const sent = Date.parse(sentAt);
  if (!Number.isFinite(sent) || now - sent > CONFIRM_TTL_MS) return false;
  const a = Buffer.from(hashToken(token));
  const b = Buffer.from(storedHash);
  return a.length === b.length && timingSafeEqual(a, b);
}

/* ------------------------------------------------------------------ who gets this week's email */

export interface SendCandidate {
  status: SubscriberStatus;
  emailKey: string;
  lastSentAt: string | null;
}

/**
 * Only CONFIRMED (active) subscribers, never a suppressed address (bounce,
 * complaint, manual), never twice inside 6 days. A pending sign-up gets
 * nothing but its one confirmation email.
 */
export function isSendable(s: SendCandidate, suppressed: ReadonlySet<string>, now = Date.now()): boolean {
  if (s.status !== "active") return false;
  if (suppressed.has(s.emailKey)) return false;
  if (s.lastSentAt && now - Date.parse(s.lastSentAt) < MIN_GAP_MS) return false;
  return true;
}

/** Staggered weekly send: the cron runs at :05, :20, :35, :50 and each run takes one quarter. */
export function bucketForMinute(minute: number): number {
  return Math.min(DIGEST_BUCKETS - 1, Math.max(0, Math.floor(minute / 15)));
}
