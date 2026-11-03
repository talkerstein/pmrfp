import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * The roster invite's one-click unsubscribe link (lib/roster/server
 * inviteVendor). Keyed by the invite's id, so the address never sits in the
 * link; the route puts the address on the do-not-contact list
 * (email_suppressions). Same server-only secret as lib/email/unsubscribe,
 * its own prefix, so this link can't unsubscribe anything else.
 */
function secret(): string | null {
  return process.env.UNSUBSCRIBE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || null;
}

function sign(inviteId: string, key: string): string {
  return createHmac("sha256", key).update(`roster-invite-unsub:${inviteId}`).digest("base64url");
}

export function hasUnsubscribeSecret(): boolean {
  return Boolean(secret());
}

export function rosterInviteUnsubscribeUrl(base: string, inviteId: string): string | null {
  const key = secret();
  if (!key) return null;
  return `${base}/api/email/roster-unsubscribe?i=${encodeURIComponent(inviteId)}&t=${sign(inviteId, key)}`;
}

export function verifyRosterInviteUnsubscribe(inviteId: string | null, token: string | null): boolean {
  const key = secret();
  if (!key || !inviteId || !token) return false;
  const expected = Buffer.from(sign(inviteId, key));
  const given = Buffer.from(token);
  return expected.length === given.length && timingSafeEqual(expected, given);
}
