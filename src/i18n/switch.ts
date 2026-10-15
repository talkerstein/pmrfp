/**
 * Language switcher + "also in French / Spanish" banner logic. Pure functions
 * (no React, no DOM) so they're shared by the v3 chrome, the marketing chrome
 * and the tests.
 *
 * The switcher links to the SAME page in each language (path + query + hash
 * kept). A page that isn't translated into a language links to that
 * language's home instead, so a visitor never lands on English copy dressed
 * as French (or on a 404).
 */
import { DEFAULT_LOCALE, ENABLED_LOCALES, LOCALE_NAME, LOCALE_TAG, isEnabledLocale, localizePath, splitLocale, type Locale } from "./config";
import { isTranslatedPath } from "./translated";
import { parseAccountCookie, parseGeoCookie, resolveCountry } from "@/lib/visitor-geo";

/** Dismissed "also in French/Spanish" banner (1 year). */
export const LANG_HINT_COOKIE = "pmrfp_lang_hint";
export const LANG_HINT_STORAGE = "pmrfp:lang-hint";

/** Crawlers, link unfurlers and headless browsers: never shown the banner. */
export const BOT_UA = /bot|crawl|spider|slurp|facebookexternalhit|whatsapp|embedly|preview|lighthouse|headless|google-inspectiontool|bingpreview|semrush|ahrefs|mediapartners/i;

export function isBot(userAgent: string | null | undefined): boolean {
  return !userAgent || BOT_UA.test(userAgent);
}

/** Short code shown in the compact header switch. */
export const LOCALE_CODE: Record<Locale, string> = { en: "EN", fr: "FR", es: "ES" };

/** Tooltip on each switcher link, in that link's own language. */
export const READ_IN: Record<Locale, string> = {
  en: "Read this page in English",
  fr: "Lire cette page en français",
  es: "Leer esta página en español",
};

/** The banner, in the language it offers. */
export const BANNER_COPY: Record<Exclude<Locale, "en">, { text: string; cta: string; dismiss: string; label: string }> = {
  fr: { text: "Ce site est aussi en français", cta: "Voir en français", dismiss: "Fermer", label: "Langue" },
  es: { text: "También en español", cta: "Ver en español", dismiss: "Cerrar", label: "Idioma" },
};

/**
 * Where the switcher's link for `target` goes from `pathname` (any language
 * prefix). `search` / `hash` include their leading "?" / "#".
 */
export function languageHref(pathname: string, target: Locale, search = "", hash = ""): string {
  const { lang: from, path } = splitLocale(pathname || "/");
  // The page being viewed obviously exists in its own language.
  if (target !== from && !isTranslatedPath(path, target)) return localizePath("/", target);
  const q = search && search !== "?" ? (search.startsWith("?") ? search : `?${search}`) : "";
  const h = hash && hash !== "#" ? (hash.startsWith("#") ? hash : `#${hash}`) : "";
  return localizePath(`${path}${q}${h}`, target);
}

export interface LanguageLink {
  lang: Locale;
  href: string;
  /** BCP 47 tag for the link's lang attribute ("fr-CA"). */
  tag: string;
  name: string;
  code: string;
  title: string;
  current: boolean;
  /** False when the page isn't translated and the link goes to that language's home. */
  samePage: boolean;
}

/** One link per open language, in a fixed order (English, Français, Español). */
export function languageLinks(pathname: string, current: Locale, search = "", hash = ""): LanguageLink[] {
  const { lang: from, path } = splitLocale(pathname || "/");
  return ENABLED_LOCALES.map((lang) => ({
    lang,
    href: languageHref(pathname, lang, search, hash),
    tag: LOCALE_TAG[lang],
    name: LOCALE_NAME[lang],
    code: LOCALE_CODE[lang],
    title: READ_IN[lang],
    current: lang === current,
    samePage: lang === from || isTranslatedPath(path, lang),
  }));
}

/** Cookie string remembering a picked language (the proxy reads it on unprefixed URLs). */
export function localeCookie(lang: Locale, cookieName: string): string {
  return `${cookieName}=${lang}; path=/; max-age=31536000; samesite=lax`;
}

/* ------------------------------------------------------------------ banner */

/**
 * Accept-Language ("fr-CA,fr;q=0.9,en;q=0.8") or navigator.languages
 * (["fr-CA", "fr", "en"]) -> base language codes, best first, deduplicated.
 */
export function parseAcceptLanguage(input: string | readonly string[] | null | undefined): string[] {
  if (!input) return [];
  const parts: { code: string; q: number; i: number }[] = [];
  const items = typeof input === "string" ? input.split(",") : input;
  items.forEach((raw, i) => {
    const [tag, ...params] = String(raw).trim().split(";");
    const code = tag.trim().split("-")[0].toLowerCase();
    if (!code || code === "*" || !/^[a-z]{2,3}$/.test(code)) return;
    let q = 1;
    for (const p of params) {
      const m = p.trim().match(/^q=([0-9.]+)$/i);
      if (m) q = Number(m[1]);
    }
    if (!Number.isFinite(q) || q <= 0) return;
    parts.push({ code, q, i });
  });
  parts.sort((a, b) => b.q - a.q || a.i - b.i);
  return [...new Set(parts.map((p) => p.code))];
}

/** The visitor's top language among the ones we serve (English included), or null. */
export function preferredLocale(input: string | readonly string[] | null | undefined): Locale | null {
  for (const code of parseAcceptLanguage(input)) if (isEnabledLocale(code)) return code;
  return null;
}

export interface BannerSignals {
  /** Language of the page being viewed. */
  lang: Locale;
  /** NEXT_LOCALE cookie: any valid value means the visitor already chose. */
  chosen?: string | null;
  /** Banner dismissed before (cookie or localStorage). */
  dismissed?: boolean;
  userAgent?: string | null;
  /** navigator.languages or an Accept-Language header. */
  languages?: string | readonly string[] | null;
  /** Raw pmrfp_geo cookie ("CA-QC"). */
  geo?: string | null;
  /** Raw pmrfp_market cookie (the CA | US switch). */
  market?: string | null;
  /** Raw pmrfp_acct cookie (signed-in company's location). */
  account?: string | null;
}

/** True when the visitor's country resolves to Canada and they browse from Québec. */
export function isQuebec(s: Pick<BannerSignals, "geo" | "market" | "account">): boolean {
  const geo = parseGeoCookie(s.geo);
  const resolved = resolveCountry({ cookie: s.market, account: parseAccountCookie(s.account), geo });
  return resolved.country === "CA" && geo.country === "CA" && geo.province === "Quebec";
}

/**
 * Which languages the banner offers, first one first; empty = no banner.
 * Only on English pages, only for first-time human visitors (no language
 * chosen, never dismissed). Québec gets French first; otherwise the browser's
 * top language when it is French or Spanish (a browser that ranks English
 * above them gets nothing).
 */
export function bannerOffers(s: BannerSignals): Exclude<Locale, "en">[] {
  if (s.lang !== DEFAULT_LOCALE) return [];
  if (isEnabledLocale(s.chosen)) return [];
  if (s.dismissed) return [];
  if (isBot(s.userAgent)) return [];
  const offers: Exclude<Locale, "en">[] = [];
  if (isQuebec(s) && isEnabledLocale("fr")) offers.push("fr");
  const pref = preferredLocale(s.languages);
  if (pref && pref !== "en" && !offers.includes(pref)) offers.push(pref);
  return offers;
}

/** Reads one cookie from a document.cookie string. */
export function readCookie(cookies: string, name: string): string | null {
  for (const part of cookies.split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    if (part.slice(0, i).trim() === name) {
      try {
        return decodeURIComponent(part.slice(i + 1).trim());
      } catch {
        return part.slice(i + 1).trim();
      }
    }
  }
  return null;
}
