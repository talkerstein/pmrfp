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

export function verifyUnsubscribe(userId: string | null, token: string | null): boolean {
  const key = secret();
  if (!key || !userId || !token) return false;
  const expected = Buffer.from(sign(userId, key));
  const given = Buffer.from(token);
  return expected.length === given.length && timingSafeEqual(expected, given);
}
