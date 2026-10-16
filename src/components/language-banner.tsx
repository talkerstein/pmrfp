"use client";

import { useState, useSyncExternalStore } from "react";
import { LOCALE_COOKIE, LOCALE_TAG, type Locale } from "@/i18n/config";
import { useLang } from "@/i18n/provider";
import { BANNER_COPY, LANG_HINT_COOKIE, LANG_HINT_STORAGE, bannerOffers, readCookie } from "@/i18n/switch";
import { ACCOUNT_COOKIE, GEO_COOKIE, MARKET_COOKIE } from "@/lib/visitor-geo";
import { useLanguageLinks } from "./language-switcher";

const noSubscribe = () => () => {};

function dismissedBefore(cookies: string): boolean {
  if (readCookie(cookies, LANG_HINT_COOKIE) === "dismissed") return true;
  try {
    return window.localStorage.getItem(LANG_HINT_STORAGE) === "dismissed";
  } catch {
    return false;
  }
}

function remember() {
  try {
    document.cookie = `${LANG_HINT_COOKIE}=dismissed; path=/; max-age=31536000; samesite=lax`;
  } catch {
    /* cookies blocked */
  }
  try {
    window.localStorage.setItem(LANG_HINT_STORAGE, "dismissed");
  } catch {
    /* storage blocked (private mode) */
  }
}

/** "fr,es" for the visitor in this browser; "" on the server and for everyone who gets no banner. */
function offersSnapshot(lang: Locale): string {
  if (lang !== "en") return "";
  const cookies = document.cookie;
  return bannerOffers({
    lang,
    chosen: readCookie(cookies, LOCALE_COOKIE),
    dismissed: dismissedBefore(cookies),
    userAgent: navigator.userAgent,
    languages: navigator.languages?.length ? navigator.languages : navigator.language,
    geo: readCookie(cookies, GEO_COOKIE),
    market: readCookie(cookies, MARKET_COOKIE),
    account: readCookie(cookies, ACCOUNT_COOKIE),
  }).join(",");
}

/**
 * "Ce site est aussi en français → Voir en français" for first-time visitors
 * on an English page whose browser prefers French or Spanish (Québec: French
 * first). Never server-rendered, so crawlers and cached HTML never carry it;
 * it floats under the header (absolutely positioned) so nothing shifts when
 * it appears. Dismissal is remembered in a cookie and localStorage.
 */
export function LanguageBanner({ variant = "v3" }: { variant?: "v3" | "site" }) {
  const lang = useLang();
  const { links, onPick } = useLanguageLinks();
  const snapshot = useSyncExternalStore(noSubscribe, () => offersSnapshot(lang), () => "");
  const [closed, setClosed] = useState(false);
  if (closed || !snapshot) return null;

  const offers = snapshot.split(",") as Exclude<Locale, "en">[];
  const first = BANNER_COPY[offers[0]];
  const close = () => {
    remember();
    setClosed(true);
  };
  const v3 = variant === "v3";

  return (
    <aside
      lang={LOCALE_TAG[offers[0]]}
      aria-label={first.label}
      className={v3 ? "v3-langbar" : "absolute inset-x-4 top-full z-40 mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-border bg-card py-2 pl-4 pr-1 text-sm text-foreground shadow-lg sm:left-auto sm:right-6 sm:max-w-md"}
    >
      <span className={v3 ? "txt" : "font-medium"}>{first.text}</span>
      {offers.map((o) => {
        const link = links.find((l) => l.lang === o);
        if (!link) return null;
        return (
          <a
            key={o}
            href={link.href}
            lang={link.tag}
            hrefLang={o}
            className={v3 ? "cta" : "font-semibold text-indigo underline underline-offset-4"}
            onClick={(e) => {
              remember();
              onPick(e, link);
            }}
          >
            {BANNER_COPY[o].cta} →
          </a>
        );
      })}
      <button
        type="button"
        onClick={close}
        aria-label={first.dismiss}
        title={first.dismiss}
        className={v3 ? "x" : "ml-auto inline-flex size-10 items-center justify-center rounded-md text-ink-2/70 hover:bg-secondary hover:text-foreground"}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden><path d="M6 6l12 12M18 6L6 18" /></svg>
      </button>
    </aside>
  );
}
