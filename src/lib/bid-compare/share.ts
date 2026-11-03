import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * The read-only share link for a comparison's board view. The raw token
 * only exists in the PM's browser (shown once, right after it's made) and
 * in the link they send; the database keeps its sha256. Replacing the link
 * makes a new token, revoking clears the hash: either way the old link
 * opens nothing. Pure, so the access rules are unit tested.
 */

/** 24 random bytes → 32 URL-safe characters (the same shape as the other one-time links). */
export const SHARE_TOKEN = /^[A-Za-z0-9_-]{32}$/;

export function newShareToken(): string {
  return randomBytes(24).toString("base64url");
}

export function hashShareToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Cheap shape check before touching the database. */
export function isShareToken(token: string | null | undefined): token is string {
  return typeof token === "string" && SHARE_TOKEN.test(token);
}

/**
 * May this token open this comparison's board view? Only a well-formed
 * token whose hash is the comparison's current one: a revoked link (no
 * hash) or a replaced one (a different hash) opens nothing.
 */
export function shareTokenOpens(storedHash: string | null | undefined, token: string | null | undefined): boolean {
  if (!isShareToken(token) || !storedHash || !/^[0-9a-f]{64}$/.test(storedHash)) return false;
  const a = Buffer.from(hashShareToken(token));
  const b = Buffer.from(storedHash);
  return a.length === b.length && timingSafeEqual(a, b);
}
