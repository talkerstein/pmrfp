"use client";

import { useSyncExternalStore, type MouseEvent } from "react";
import { usePathname } from "next/navigation";
import { ENABLED_LOCALES, LOCALE_COOKIE } from "@/i18n/config";
import { useLang, useT } from "@/i18n/provider";
import { languageHref, languageLinks, localeCookie, type LanguageLink } from "@/i18n/switch";
import { cn } from "@/lib/utils";

const subscribe = (cb: () => void) => {
  window.addEventListener("popstate", cb);
  window.addEventListener("hashchange", cb);
  return () => {
    window.removeEventListener("popstate", cb);
    window.removeEventListener("hashchange", cb);
  };
};
const clientLoc = () => window.location.search + window.location.hash;
const serverLoc = () => "";

/**
 * The current page in every open language, as real links. The server renders
 * path-only hrefs (prerendered pages can't know the query); after hydration
 * the query and hash are added, and a click re-reads them so a client-side
 * filter change is never lost.
 */
export function useLanguageLinks() {
  const lang = useLang();
  const pathname = usePathname() ?? "/";
  const loc = useSyncExternalStore(subscribe, clientLoc, serverLoc);
  const hashAt = loc.indexOf("#");
  const search = hashAt < 0 ? loc : loc.slice(0, hashAt);
  const hash = hashAt < 0 ? "" : loc.slice(hashAt);
  const links = languageLinks(pathname, lang, search, hash);
  /** Remembers the pick (the proxy reads the cookie) and goes to the freshest URL. */
  const onPick = (e: MouseEvent<HTMLAnchorElement>, link: LanguageLink) => {
    try {
      document.cookie = localeCookie(link.lang, LOCALE_COOKIE);
    } catch {
      /* cookies blocked: the link still works */
    }
    e.currentTarget.href = languageHref(window.location.pathname, link.lang, window.location.search, window.location.hash);
  };
  return { lang, links, onPick };
}

/**
 * EN | FR | ES pills for the marketing chrome (SiteHeader / SiteFooter). Each
 * one is a crawlable link to the same page in that language.
 */
export function LanguageSwitcher({ tone = "light", className }: { tone?: "light" | "dark"; className?: string }) {
  const t = useT("common");
  const { links, onPick } = useLanguageLinks();
  if (ENABLED_LOCALES.length < 2) return null;

  return (
    <div role="group" aria-label={t.lang.label} className={cn("inline-flex items-center rounded-full p-0.5 text-xs font-semibold", tone === "dark" ? "bg-white/10" : "bg-secondary", className)}>
      {links.map((l) => (
        <a
          key={l.lang}
          href={l.href}
          lang={l.tag}
          hrefLang={l.lang}
          aria-current={l.current ? "true" : undefined}
          aria-label={l.name}
          title={l.title}
          onClick={(e) => onPick(e, l)}
          onAuxClick={(e) => onPick(e, l)}
          className={cn(
            "rounded-full px-2.5 py-1 uppercase tracking-wide no-underline transition-colors",
            l.current
              ? tone === "dark" ? "bg-teal-300 text-indigo" : "bg-indigo text-white"
              : tone === "dark" ? "text-indigo-100/70 hover:text-white" : "text-ink-2/70 hover:text-foreground",
          )}
        >
          {l.code}
        </a>
      ))}
    </div>
  );
}
