/**
 * User text for the forum. Nothing a member types is ever rendered as HTML:
 * bodies are stored as plain text and turned into a small token tree
 * (paragraphs, line breaks, links, **bold**, `code`) that React renders as
 * elements, so any "<script>" just shows up as text.
 */

export const MAX_BODY = 10_000;
export const MAX_TITLE = 140;

/** Clean input before storing: strip control chars, trim, collapse blank runs. */
export function normalizeBody(raw: string): string {
  return raw
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F​-‏‪-‮⁦-⁩]/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, MAX_BODY);
}

export function normalizeTitle(raw: string): string {
  return normalizeBody(raw).replace(/\s+/g, " ").slice(0, MAX_TITLE);
}

export function wordCount(text: string): number {
  const m = text.trim().match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu);
  return m ? m.length : 0;
}

export function slugify(title: string): string {
  const s = title
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70)
    .replace(/-+$/g, "");
  return s || "thread";
}

const ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";
export function shortId(len = 8, rand: () => number = Math.random): string {
  let s = "";
  for (let i = 0; i < len; i++) s += ALPHABET[Math.floor(rand() * ALPHABET.length)];
  return s;
}

/** "{slug}-{shortid}" → parts, or null when it can't be a thread URL. */
export function parseThreadParam(param: string): { slug: string; shortId: string } | null {
  const m = /^([a-z0-9-]{1,80})-([a-z0-9]{6,12})$/.exec(param);
  return m ? { slug: m[1], shortId: m[2] } : null;
}

export function threadParam(slug: string, sid: string): string {
  return `${slug}-${sid}`;
}

/** A forum handle from a name or email: lowercase, a-z0-9_, 3-24 chars. */
export function handleFrom(source: string): string {
  const base = source
    .split("@")[0]
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 24);
  return base.length >= 3 ? base : `member_${base}`.slice(0, 24).replace(/_+$/, "") || "member";
}

// ── Rendering tokens ────────────────────────────────────────────────
export type Inline =
  | { t: "text"; v: string }
  | { t: "bold"; v: string }
  | { t: "code"; v: string }
  | { t: "link"; href: string; v: string }
  | { t: "br" };

export type Block = Inline[];

const LINK_RE = /(https?:\/\/[^\s<>"]+|www\.[a-z0-9-]+(?:\.[a-z0-9-]+)+[^\s<>"]*)/gi;

/** A safe absolute http(s) URL, or null. Rejects javascript:, data:, etc. */
export function safeHref(raw: string): string | null {
  const candidate = /^www\./i.test(raw) ? `https://${raw}` : raw;
  try {
    const u = new URL(candidate);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    if (u.username || u.password) return null;
    return u.toString();
  } catch {
    return null;
  }
}

function trimTrailingPunct(url: string): [string, string] {
  const m = /[.,;:!?)\]]+$/.exec(url);
  return m ? [url.slice(0, -m[0].length), m[0]] : [url, ""];
}

function inline(line: string, out: Inline[]) {
  // `code` first, then **bold**, then links inside plain text.
  const parts = line.split(/(`[^`\n]{1,200}`|\*\*[^*\n]{1,200}\*\*)/g);
  for (const p of parts) {
    if (!p) continue;
    if (/^`[^`]+`$/.test(p)) out.push({ t: "code", v: p.slice(1, -1) });
    else if (/^\*\*[^*]+\*\*$/.test(p)) out.push({ t: "bold", v: p.slice(2, -2) });
    else linkify(p, out);
  }
}

function linkify(text: string, out: Inline[]) {
  let last = 0;
  LINK_RE.lastIndex = 0;
  for (let m = LINK_RE.exec(text); m; m = LINK_RE.exec(text)) {
    const [url, tail] = trimTrailingPunct(m[0]);
    const href = safeHref(url);
    if (m.index > last) out.push({ t: "text", v: text.slice(last, m.index) });
    if (href) out.push({ t: "link", href, v: url });
    else out.push({ t: "text", v: url });
    if (tail) out.push({ t: "text", v: tail });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ t: "text", v: text.slice(last) });
}

/** Plain text → paragraphs of inline tokens. Pure; never produces HTML. */
export function parseBody(text: string): Block[] {
  const clean = normalizeBody(text);
  if (!clean) return [];
  return clean.split(/\n{2,}/).map((para) => {
    const out: Inline[] = [];
    para.split("\n").forEach((line, i) => {
      if (i > 0) out.push({ t: "br" });
      inline(line, out);
    });
    return out;
  });
}

/** First ~N chars of plain text for meta descriptions and JSON-LD. */
export function excerpt(text: string, max = 160): string {
  const flat = normalizeBody(text).replace(/\*\*|`/g, "").replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max - 1);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), max - 20))}…`;
}
