/**
 * First-touch attribution cookie (pmrfp_ft). Pure and unit-tested: no
 * database, no Next.js imports, so the proxy can use it on every request.
 *
 * What it holds, and nothing else:
 *  - the path of the first page a browser landed on (no query string);
 *  - the referring site's HOST only ("google.com"), never the full URL;
 *  - utm_source / utm_medium / utm_campaign / utm_content from that visit;
 *  - the first-seen date (Toronto day), the page language and the country
 *    Vercel resolved for the request (two letters). Never an IP address;
 *  - the last campaign (utm_*) seen on a later visit, when one differs.
 *
 * Every value is re-sanitized when the cookie is read back, because the
 * browser can send anything. Anything that looks like an email address is
 * dropped. Once set, the first-touch fields are never overwritten.
 */

export const FT_COOKIE = "pmrfp_ft";
/** 90 days, counted from the first visit (a later campaign doesn't extend it). */
export const FT_MAX_AGE = 60 * 60 * 24 * 90;
export const MAX_PATH = 200;
export const MAX_HOST = 100;
export const MAX_UTM = 80;
/** Hard cap on the serialized cookie value. */
export const MAX_COOKIE_LEN = 1200;

export const UTM_KEYS = ["source", "medium", "campaign", "content"] as const;
export type UtmKey = (typeof UTM_KEYS)[number];
export type Utm = Partial<Record<UtmKey, string>>;

const LANGS = new Set(["en", "fr", "es"]);

export interface FirstTouch {
  /** Landing path, e.g. "/fr/rfps". */
  path: string;
  /** Referring host ("" = none sent). */
  ref: string;
  utm: Utm;
  /** YYYY-MM-DD. */
  first: string;
  lang: string;
  country: string;
  /** Last-touch campaign, when a later visit carried different utm_* tags. */
  last?: Utm & { at: string };
}

const EMAIL = /[^\s/@]+@[^\s/@]+/;

/** A YYYY-MM-DD day in Toronto (the same day boundary as the other counters). */
export function torontoDay(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/**
 * A request path cut down to something safe to keep: no query or fragment,
 * only URL-path characters, segments that look like an email address
 * replaced, capped at MAX_PATH. "" when it isn't a path.
 */
export function sanitizePath(raw: string | null | undefined): string {
  let p = String(raw ?? "").trim();
  if (!p) return "";
  p = p.split(/[?#]/)[0];
  if (!p.startsWith("/")) return "";
  const segs = p.split("/").map((s) => {
    let d = s;
    try {
      d = decodeURIComponent(s);
    } catch {
      /* keep raw */
    }
    return EMAIL.test(d) ? "-" : s;
  });
  p = segs.join("/").replace(/[^A-Za-z0-9\-._~/%:+,]/g, "").replace(/\/{2,}/g, "/");
  return p.slice(0, MAX_PATH) || "/";
}

/**
 * The host of a Referer header ("https://www.google.com/search?q=…" →
 * "google.com"). Lowercase, "www." dropped, hostnames only. "" when there is
 * none or it isn't a web URL. Never returns a path or query.
 */
export function referrerHost(raw: string | null | undefined): string {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  let host: string;
  try {
    const u = new URL(s);
    if (u.protocol !== "http:" && u.protocol !== "https:" && u.protocol !== "android-app:") return "";
    host = u.hostname.toLowerCase();
  } catch {
    // Already a bare host (from the cookie)?
    host = s.toLowerCase();
  }
  host = host.replace(/^www\./, "").replace(/\.$/, "");
  if (!/^[a-z0-9.-]{1,100}$/.test(host) || !/[a-z0-9]/.test(host)) return "";
  return host.slice(0, MAX_HOST);
}

/** One utm value: lowercase, safe characters only, capped. Emails dropped. */
export function sanitizeUtm(raw: string | null | undefined): string {
  let v = String(raw ?? "").trim().toLowerCase();
  if (!v || EMAIL.test(v) || v.includes("%40")) return "";
  v = v.replace(/\s+/g, "_").replace(/[^a-z0-9._\-+:]/g, "").replace(/_{2,}/g, "_");
  return v.slice(0, MAX_UTM);
}

/** utm_* tags from a query string (anything else in the query is ignored). */
export function utmFrom(params: URLSearchParams | null | undefined): Utm {
  const out: Utm = {};
  if (!params) return out;
  for (const k of UTM_KEYS) {
    const v = sanitizeUtm(params.get(`utm_${k}`));
    if (v) out[k] = v;
  }
  return out;
}

export function hasUtm(u: Utm | null | undefined): boolean {
  return !!u && UTM_KEYS.some((k) => !!u[k]);
}

export function sameUtm(a: Utm | null | undefined, b: Utm | null | undefined): boolean {
  return UTM_KEYS.every((k) => (a?.[k] ?? "") === (b?.[k] ?? ""));
}

const day = (v: string | null | undefined) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v ?? "")) ? String(v) : "");
const lang = (v: string | null | undefined) => (LANGS.has(String(v ?? "")) ? String(v) : "");
const country = (v: string | null | undefined) => {
  const c = String(v ?? "").trim().toUpperCase();
  return /^[A-Z]{2}$/.test(c) ? c : "";
};

/** Builds a first touch for a new visitor, sanitizing every input. */
export function buildFirstTouch(i: {
  path: string;
  referer?: string | null;
  params?: URLSearchParams | null;
  lang?: string | null;
  country?: string | null;
  now?: Date;
}): FirstTouch {
  return {
    path: sanitizePath(i.path) || "/",
    ref: referrerHost(i.referer),
    utm: utmFrom(i.params),
    first: torontoDay(i.now),
    lang: lang(i.lang),
    country: country(i.country),
  };
}

/**
 * The cookie after a later visit: first-touch fields never change; the
 * last-touch campaign is recorded only when the visit carried utm tags that
 * differ from what we already hold. Returns null when nothing changes.
 */
export function withLastTouch(ft: FirstTouch, params: URLSearchParams | null | undefined, now = new Date()): FirstTouch | null {
  const utm = utmFrom(params);
  if (!hasUtm(utm)) return null;
  const current = ft.last ?? ft.utm;
  if (sameUtm(utm, current)) return null;
  return { ...ft, last: { ...utm, at: torontoDay(now) } };
}

const SHORT: Record<UtmKey, string> = { source: "s", medium: "m", campaign: "c", content: "t" };

/** Cookie value (URL-encoded key=value pairs), at most MAX_COOKIE_LEN chars. */
export function serializeFirstTouch(ft: FirstTouch): string {
  const build = (keepLast: boolean, keepContent: boolean) => {
    const q = new URLSearchParams();
    q.set("v", "1");
    q.set("p", sanitizePath(ft.path) || "/");
    if (ft.ref) q.set("r", referrerHost(ft.ref));
    for (const k of UTM_KEYS) {
      if (k === "content" && !keepContent) continue;
      const v = sanitizeUtm(ft.utm[k]);
      if (v) q.set(`u${SHORT[k]}`, v);
    }
    q.set("d", day(ft.first));
    if (lang(ft.lang)) q.set("l", lang(ft.lang));
    if (country(ft.country)) q.set("g", country(ft.country));
    if (keepLast && ft.last && hasUtm(ft.last)) {
      for (const k of UTM_KEYS) {
        if (k === "content" && !keepContent) continue;
        const v = sanitizeUtm(ft.last[k]);
        if (v) q.set(`l${SHORT[k]}`, v);
      }
      if (day(ft.last.at)) q.set("la", day(ft.last.at));
    }
    return q.toString();
  };
  let s = build(true, true);
  if (s.length > MAX_COOKIE_LEN) s = build(false, true);
  if (s.length > MAX_COOKIE_LEN) s = build(false, false);
  return s.slice(0, MAX_COOKIE_LEN);
}

/** Reads a cookie value back, re-sanitizing everything. Null when it isn't ours. */
export function parseFirstTouch(value: string | null | undefined): FirstTouch | null {
  const raw = String(value ?? "");
  if (!raw || raw.length > MAX_COOKIE_LEN * 3) return null;
  let q: URLSearchParams;
  try {
    q = new URLSearchParams(raw);
  } catch {
    return null;
  }
  if (q.get("v") !== "1") return null;
  const first = day(q.get("d"));
  if (!first) return null;
  const utm: Utm = {};
  const last: Utm = {};
  for (const k of UTM_KEYS) {
    const a = sanitizeUtm(q.get(`u${SHORT[k]}`));
    if (a) utm[k] = a;
    const b = sanitizeUtm(q.get(`l${SHORT[k]}`));
    if (b) last[k] = b;
  }
  const ft: FirstTouch = {
    path: sanitizePath(q.get("p")) || "/",
    ref: referrerHost(q.get("r")),
    utm,
    first,
    lang: lang(q.get("l")),
    country: country(q.get("g")),
  };
  if (hasUtm(last)) ft.last = { ...last, at: day(q.get("la")) || first };
  return ft;
}

/** Seconds left in the 90-day window that started on `first` (at least one day). */
export function remainingMaxAge(first: string, now = new Date()): number {
  const start = Date.parse(`${first}T12:00:00Z`);
  if (Number.isNaN(start)) return FT_MAX_AGE;
  const left = FT_MAX_AGE - Math.floor((now.getTime() - start) / 1000);
  return Math.max(60 * 60 * 24, Math.min(FT_MAX_AGE, left));
}
