import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Report → Quotes by email: pure rules. A user forwards an inspection report
 * email to their private address r-<token>@<INBOUND_EMAIL_DOMAIN>; the
 * provider (Resend receiving) posts a signed webhook; each PDF attachment
 * becomes a normal upload that goes through the usual read → review flow.
 * Nothing is ever sent back: no replies, no auto-responders, so no loops.
 *
 * Database, storage and the provider API live in ./inbound-server.
 */

// ── Feature switch ───────────────────────────────────────────────────

export interface InboundConfig {
  /** The receiving domain, e.g. "in.pmrfp.com" (its MX record points at the provider). */
  domain: string;
  /** The webhook signing secret (Resend: "whsec_…"). */
  secret: string;
  /** The provider API key used to download attachments (RESEND_API_KEY). */
  apiKey: string;
}

const DOMAIN = /^(?=.{3,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/;

/**
 * On only when the receiving domain, the signing secret and the API key are
 * all set. Off: the dashboard hides the forwarding address and the webhook
 * answers 404.
 */
export function inboundConfig(env: Record<string, string | undefined> = process.env): InboundConfig | null {
  const domain = (env.INBOUND_EMAIL_DOMAIN ?? "").trim().toLowerCase();
  const secret = (env.INBOUND_EMAIL_SECRET ?? "").trim();
  const apiKey = (env.RESEND_API_KEY ?? "").trim();
  if (!DOMAIN.test(domain) || secret.length < 16 || !apiKey) return null;
  return { domain, secret, apiKey };
}

// ── Forwarding addresses ─────────────────────────────────────────────

const TOKEN_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";
export const INBOX_TOKEN = /^[a-z0-9]{20}$/;

/** 20 characters of a–z and 0–9 (about 103 bits), lowercase so no mail system can change it. */
export function newInboxToken(): string {
  let out = "";
  while (out.length < 20) {
    for (const b of randomBytes(32)) {
      // 252 = 7 × 36: drop the top values so every character is equally likely.
      if (b < 252 && out.length < 20) out += TOKEN_ALPHABET[b % 36];
    }
  }
  return out;
}

export function inboxAddress(token: string, domain: string): string {
  return `r-${token}@${domain}`;
}

/** "Jane <r-abc…@in.pmrfp.com>" → "r-abc…@in.pmrfp.com" (lowercased). */
export function bareAddress(raw: string): string {
  const s = String(raw ?? "").trim();
  const angled = s.match(/<([^<>\s]+@[^<>\s]+)>/);
  return (angled ? angled[1] : s).trim().toLowerCase();
}

/**
 * The inbox token from the first recipient on our receiving domain, or
 * null. Plus-tags are ignored (r-<token>+anything@…). Never the sender.
 */
export function pickInboxToken(recipients: readonly string[], domain: string): string | null {
  const d = domain.toLowerCase();
  for (const r of recipients) {
    const addr = bareAddress(r);
    const at = addr.lastIndexOf("@");
    if (at < 1 || addr.slice(at + 1) !== d) continue;
    const local = addr.slice(0, at).split("+")[0];
    const m = local.match(/^r-([a-z0-9]{20})$/);
    if (m) return m[1];
  }
  return null;
}

/** Mail from our own receiving domain is never processed (a forwarding loop or a spoof). */
export function isOwnDomain(from: string, domain: string): boolean {
  const addr = bareAddress(from);
  const host = addr.slice(addr.lastIndexOf("@") + 1);
  return host === domain.toLowerCase() || host.endsWith(`.${domain.toLowerCase()}`);
}

// ── Webhook signature (Standard Webhooks / Svix, which Resend uses) ─

/** Signatures older or newer than this are rejected (replays). */
export const SIGNATURE_TOLERANCE_SECONDS = 5 * 60;

export interface SignatureHeaders {
  id: string | null;
  timestamp: string | null;
  signature: string | null;
}

/** Resend sends svix-* headers; the Standard Webhooks names are accepted too. */
export function signatureHeaders(h: Headers): SignatureHeaders {
  return {
    id: h.get("svix-id") ?? h.get("webhook-id"),
    timestamp: h.get("svix-timestamp") ?? h.get("webhook-timestamp"),
    signature: h.get("svix-signature") ?? h.get("webhook-signature"),
  };
}

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** HMAC-SHA256 over "<id>.<timestamp>.<raw body>" with the base64 secret after "whsec_". */
export function signPayload(secret: string, id: string, timestamp: string, body: string): string {
  const key = Buffer.from(secret.startsWith("whsec_") ? secret.slice(6) : secret, "base64");
  return createHmac("sha256", key).update(`${id}.${timestamp}.${body}`).digest("base64");
}

/**
 * True only for a correctly signed, fresh request. The body must be the raw
 * text exactly as received. Any of several "v1,<sig>" entries may match
 * (the provider sends more than one while a secret is being rotated).
 */
export function verifySignature(body: string, h: SignatureHeaders, secret: string, nowMs: number = Date.now()): boolean {
  if (!h.id || !h.timestamp || !h.signature || !secret) return false;
  if (!/^\d{1,12}$/.test(h.timestamp)) return false;
  if (Math.abs(nowMs / 1000 - Number(h.timestamp)) > SIGNATURE_TOLERANCE_SECONDS) return false;
  const expected = signPayload(secret, h.id, h.timestamp, body);
  return h.signature.split(" ").some((part) => {
    const [version, sig] = part.split(",");
    return version === "v1" && Boolean(sig) && safeEqual(sig, expected);
  });
}

// ── The received email ───────────────────────────────────────────────

export interface InboundAttachmentMeta {
  id: string;
  filename: string | null;
  contentType: string | null;
  size: number | null;
}

/** The provider-neutral shape the server code works with. */
export interface InboundEmail {
  provider: "resend";
  messageId: string;
  from: string;
  /** Every address it was delivered to (to, cc, bcc and the envelope recipients). */
  recipients: string[];
  subject: string;
  attachments: InboundAttachmentMeta[];
}

const str = (v: unknown): string => (typeof v === "string" ? v : "");
const strList = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

/**
 * Resend's "email.received" webhook → InboundEmail. Any other event, or a
 * payload without an email id, is null (acknowledged and ignored).
 */
export function parseResendEvent(payload: unknown): InboundEmail | null {
  if (!payload || typeof payload !== "object") return null;
  const p = payload as { type?: unknown; data?: Record<string, unknown> };
  if (p.type !== "email.received" || !p.data || typeof p.data !== "object") return null;
  const d = p.data;
  const messageId = str(d.email_id).trim();
  if (!messageId || messageId.length > 200) return null;
  const attachments = (Array.isArray(d.attachments) ? d.attachments : [])
    .filter((a): a is Record<string, unknown> => Boolean(a) && typeof a === "object")
    .map((a) => ({
      id: str(a.id),
      filename: str(a.filename) || null,
      contentType: str(a.content_type) || null,
      size: typeof a.size === "number" ? a.size : null,
    }))
    .filter((a) => a.id);
  return {
    provider: "resend",
    messageId,
    from: str(d.from),
    recipients: [...strList(d.to), ...strList(d.cc), ...strList(d.bcc), ...strList(d.received_for)],
    subject: str(d.subject).slice(0, 500),
    attachments,
  };
}

/**
 * Could this attachment be a PDF? By its type or its name; the bytes are
 * checked again after download (checkPdf), so a renamed file still fails.
 */
export function isPdfCandidate(a: Pick<InboundAttachmentMeta, "filename" | "contentType">): boolean {
  const type = (a.contentType ?? "").toLowerCase().split(";")[0].trim();
  if (type === "application/pdf" || type === "application/x-pdf") return true;
  const generic = !type || type === "application/octet-stream" || type === "binary/octet-stream";
  return generic && /\.pdf$/i.test(a.filename ?? "");
}

/** Most PDFs one email can turn into reports (each still counts toward the daily cap). */
export const MAX_PDFS_PER_EMAIL = 3;

/** The email mentions a link (a report host's download page). Recorded, never fetched. */
export function hasLink(text: string | null | undefined, html: string | null | undefined): boolean {
  return /\bhttps?:\/\/[^\s<>"']+/i.test(text ?? "") || /<a\b[^>]*\bhref\s*=\s*["']?https?:/i.test(html ?? "") || /\bhttps?:\/\/[^\s<>"']+/i.test(html ?? "");
}

/**
 * The provider gives us a short-lived download URL for each attachment.
 * Only an https URL on the provider's own host is ever fetched; no link from
 * inside an email is.
 */
export function isProviderDownloadUrl(url: string, hosts: readonly string[] = ["resend.com", "resend.app"]): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" || u.username || u.password || (u.port && u.port !== "443")) return false;
    const host = u.hostname.toLowerCase();
    return hosts.some((h) => host === h || host.endsWith(`.${h}`));
  } catch {
    return false;
  }
}

/** A display-safe From address for the owner's log (no name part, capped). */
export function cleanFrom(raw: string): string | null {
  const addr = bareAddress(raw).replace(/[\u0000-\u001f\u007f]/g, "");
  return /^[^\s@]{1,64}@[^\s@]{1,190}$/.test(addr) ? addr.slice(0, 254) : null;
}

/** The subject for the owner's log and a title fallback: "Fwd:" prefixes off, capped. */
export function cleanSubject(raw: string): string {
  return String(raw ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/^(?:\s*(?:fwd?|fw|tr|rv|re)\s*:\s*)+/i, "")
    .replace(/\s{2,}/g, " ")
    .trim()
    .slice(0, 200);
}

export type InboundOutcome = "created" | "no_pdf" | "no_pdf_link" | "too_big" | "not_pdf" | "cap" | "failed";
