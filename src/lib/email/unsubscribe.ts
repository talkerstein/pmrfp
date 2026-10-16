import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Signed one-click unsubscribe links — no login needed, can't be forged for
 * someone else's account. Keyed off a server-only secret that is always set
 * in any environment that can send email.
 */
function secret(): string | null {
  return process.env.UNSUBSCRIBE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || null;
}

function sign(userId: string, key: string): string {
  return createHmac("sha256", key).update(`unsub:${userId}`).digest("base64url");
}

export function unsubscribeUrl(base: string, userId: string): string | null {
  const key = secret();
  if (!key) return null;
  return `${base}/api/email/unsubscribe?u=${encodeURIComponent(userId)}&t=${sign(userId, key)}`;
}

/* The free weekly email (digest_subscribers): same secret, its own prefix, so a digest link can't unsubscribe an account and vice versa. */
function signDigest(subscriberId: string, key: string): string {
  return createHmac("sha256", key).update(`digest-unsub:${subscriberId}`).digest("base64url");
}

export function digestUnsubscribeUrl(base: string, subscriberId: string): string | null {
  const key = secret();
  if (!key) return null;
  return `${base}/api/digest/unsubscribe?s=${encodeURIComponent(subscriberId)}&t=${signDigest(subscriberId, key)}`;
}

export function verifyDigestUnsubscribe(subscriberId: string | null, token: string | null): boolean {
  const key = secret();
  if (!key || !subscriberId || !token) return false;
  const expected = Buffer.from(signDigest(subscriberId, key));
  const given = Buffer.from(token);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

export function verifyUnsubscribe(userId: string | null, token: string | null): boolean {
  const key = secret();
  if (!key || !userId || !token) return false;
  const expected = Buffer.from(sign(userId, key));
  const given = Buffer.from(token);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/*
 * The lifecycle sequence (lib/lifecycle: onboarding tips, trial and offer
 * emails): same secret, its own prefix, so this link only stops those emails
 * and can't turn off someone's alerts (or the other way round).
 */
function signLifecycle(userId: string, key: string): string {
  return createHmac("sha256", key).update(`lifecycle-unsub:${userId}`).digest("base64url");
}

export function lifecycleUnsubscribeUrl(base: string, userId: string): string | null {
  const key = secret();
  if (!key) return null;
  return `${base}/api/email/lifecycle-unsubscribe?u=${encodeURIComponent(userId)}&t=${signLifecycle(userId, key)}`;
}

export function verifyLifecycleUnsubscribe(userId: string | null, token: string | null): boolean {
  const key = secret();
  if (!key || !userId || !token) return false;
  const expected = Buffer.from(signLifecycle(userId, key));
  const given = Buffer.from(token);
  return expected.length === given.length && timingSafeEqual(expected, given);
}
