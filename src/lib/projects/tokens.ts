import { createHash, randomBytes } from "node:crypto";

/**
 * One-time review links. The raw token only travels in the email to the
 * client; the database keeps its sha256, so nobody who can read
 * review_invites (the trade included) can use a link they weren't sent.
 */
export function generateReviewToken(): string {
  // 24 random bytes → 32 URL-safe characters, 192 bits.
  return randomBytes(24).toString("base64url");
}

export function hashReviewToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Cheap shape check before touching the database. */
export function isWellFormedToken(token: string): boolean {
  return /^[A-Za-z0-9_-]{32}$/.test(token);
}
