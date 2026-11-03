import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * The bidder's one-click opt-out on a bid comparison email (the award
 * notice and the "join PMRFP" invite). Keyed by the bid's id, so the
 * address never sits in the link; the route puts the bid's address on the
 * do-not-contact list (email_suppressions). Same server-only secret as the
 * other PMRFP unsubscribe links, with its own prefix, so this link can't
 * be replayed against any other kind.
 */
function secret(): string | null {
  return process.env.UNSUBSCRIBE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || null;
}

function sign(bidId: string, key: string): string {
  return createHmac("sha256", key).update(`bid-unsub:${bidId}`).digest("base64url");
}

export function bidUnsubscribeUrl(base: string, bidId: string): string | null {
  const key = secret();
  if (!key) return null;
  return `${base}/api/email/bid-unsubscribe?i=${encodeURIComponent(bidId)}&t=${sign(bidId, key)}`;
}

export function verifyBidUnsubscribe(bidId: string | null, token: string | null): boolean {
  const key = secret();
  if (!key || !bidId || !token) return false;
  const expected = Buffer.from(sign(bidId, key));
  const given = Buffer.from(token);
  return expected.length === given.length && timingSafeEqual(expected, given);
}
