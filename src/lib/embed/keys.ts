import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Widget keys: an org's "open bids" widget shows RFPs whose poster is only
 * visible to paid members, so its URL can't be just the public slug. The key
 * is an HMAC of the org id; only the org's own dashboard can hand it out.
 *
 * The secret is EMBED_SIGNING_SECRET when set, else derived from the service
 * role key (HMAC output never reveals it). Changing either invalidates every
 * issued bids widget, so pick one and leave it.
 */
const LENGTH = 20;

function secret(): string | null {
  return process.env.EMBED_SIGNING_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || null;
}

export function bidsWidgetKey(orgId: string, s: string | null = secret()): string | null {
  if (!s) return null;
  return createHmac("sha256", s).update(`pmrfp-embed:bids:v1:${orgId}`).digest("hex").slice(0, LENGTH);
}

export function isValidBidsKey(orgId: string, key: string, s: string | null = secret()): boolean {
  const expected = bidsWidgetKey(orgId, s);
  if (!expected || key.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(key), Buffer.from(expected));
}
