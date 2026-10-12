import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Resend delivery events (pure, unit-tested). Resend signs webhooks with
 * Svix: HMAC-SHA256 over "<svix-id>.<svix-timestamp>.<body>" with the
 * base64 secret after "whsec_"; the header holds one or more "v1,<base64>".
 */

/** Reject events older or newer than 5 minutes (replays). */
const TOLERANCE_S = 300;

export function verifySvixSignature(
  secret: string,
  h: { id: string | null; timestamp: string | null; signature: string | null },
  body: string,
  nowS = Math.floor(Date.now() / 1000),
): boolean {
  if (!h.id || !h.timestamp || !h.signature) return false;
  const ts = Number(h.timestamp);
  if (!Number.isFinite(ts) || Math.abs(nowS - ts) > TOLERANCE_S) return false;
  let key: Buffer;
  try {
    key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  } catch {
    return false;
  }
  if (!key.length) return false;
  const expected = Buffer.from(createHmac("sha256", key).update(`${h.id}.${h.timestamp}.${body}`).digest("base64"));
  return h.signature
    .split(" ")
    .map((part) => part.split(",")[1] ?? "")
    .some((sig) => {
      const given = Buffer.from(sig);
      return given.length === expected.length && timingSafeEqual(given, expected);
    });
}

export interface Suppression {
  reason: "bounce" | "complaint";
  emails: string[];
  detail: string | null;
}

/** email.bounced / email.complained → addresses to suppress; anything else → null. */
export function suppressionFromEvent(event: unknown): Suppression | null {
  const e = event as { type?: unknown; data?: { to?: unknown; bounce?: { type?: unknown; message?: unknown } } } | null;
  const type = typeof e?.type === "string" ? e.type : "";
  const reason = type === "email.bounced" ? "bounce" : type === "email.complained" ? "complaint" : null;
  if (!reason) return null;
  // Soft (temporary) bounces are not suppressed; Resend retries those.
  const bounceType = typeof e?.data?.bounce?.type === "string" ? e.data.bounce.type.toLowerCase() : "";
  if (reason === "bounce" && (bounceType === "transient" || bounceType === "soft")) return null;
  const to = Array.isArray(e?.data?.to) ? e!.data!.to : typeof e?.data?.to === "string" ? [e.data.to] : [];
  const emails = [...new Set(to.map((x) => String(x).trim().toLowerCase()).filter((x) => /^[^\s@]+@[^\s@]+$/.test(x) && x.length <= 254))];
  if (!emails.length) return null;
  const detail = typeof e?.data?.bounce?.message === "string" ? e.data.bounce.message.slice(0, 500) : null;
  return { reason, emails, detail };
}
