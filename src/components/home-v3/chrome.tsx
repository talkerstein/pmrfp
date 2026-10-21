"use client";

/**
 * The approved v3 design's shared chrome: Founding 500 announcement bar,
 * header (nav, CA/US market switch, mobile menu), footer, and the
 * one-currency-per-visitor price helpers. Used by the homepage and every page
 * built from the Claude Design templates (directory lists, company profile,
 * sign-up), so the header and footer exist once.
 */
import "./home-v3.css";
import Image from "next/image";
import { useEffect, useState, type MouseEvent, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { isPmAudiencePath, rememberAudience } from "@/lib/audience/pm";
import { VIEWS_COOKIE, readCookie } from "@/lib/growth/interruptions";
import { setMarket, useUsdPerCad, useVisitorMarket } from "@/components/geo/use-visitor-market";
import { foundingScarcity } from "@/lib/founding/config";
import { toUsd } from "@/lib/markets";
import { localizePath, splitLocale, type Locale } from "@/i18n/config";
import { fmt, formatNumber } from "@/i18n/format";
import { useT } from "@/i18n/provider";
import { useLanguageLinks } from "@/components/language-switcher";
import { V3AccountLink } from "./account-link";
import { LanguageBanner } from "@/components/language-banner";

import { V3H, V3_MARK, type V3ChromeMessages, type V3Messages } from "./chrome-shared";

/* ------------------------------------------------------------------ money */

/**
 * One currency per visitor: CAD in Canada, USD in the U.S., and nothing (a
 * skeleton) until the market is known, so a visitor never sees both.
 */
export function useV3Money(lang: Locale) {
  const market = useVisitorMarket();
  const rate = useUsdPerCad();
  const known = market != null;
  const us = market === "US";
  const currency = us ? "USD" : "CAD";
  const amount = (n: number) => {
    const s = formatNumber(n, lang);
    return lang === "fr" ? `${s} $` : `$${s}`;
  };
  return {
    known,
    us,
    currency,
    /** A CAD list price in the visitor's currency, without the code ("$249"). */
    money: (cad: number) => amount(us ? toUsd(cad, rate) : cad),
    /** A price already set per market (e.g. Founding 500). */
    pick: (cad: number, usd: number) => amount(us ? usd : cad),
  };
}

/** Fixed-width placeholder while the visitor's market (and so the currency) is unknown. */
export const V3Skeleton = ({ w }: { w: string }) => <span className="v3-sk" aria-hidden style={{ width: w }} />;

/**
 * A sentence with prices in the visitor's currency. `template` holds {price},
 * {price2} and {currency} placeholders; `cad` / `cad2` are CAD list prices.
 */
export function V3Price({ lang, template, cad, cad2, w = "6ch" }: { lang: Locale; template: string; cad: number; cad2?: number; w?: string }) {
  const m = useV3Money(lang);
  if (!m.known) return <V3Skeleton w={w} />;
  return <>{fmt(template, { price: m.money(cad), price2: cad2 != null ? m.money(cad2) : "", currency: m.currency })}</>;
}

/** "$599 <small>CAD / year</small>": the amount, then a smaller suffix with {currency}. */
export function V3PriceParts({ lang, cad, suffix, w = "3.5ch" }: { lang: Locale; cad: number; suffix?: string; w?: string }) {
  const m = useV3Money(lang);
  if (!m.known) return <V3Skeleton w={w} />;
  return <>{m.money(cad)}{suffix && <> <small>{fmt(suffix, { currency: m.currency })}</small></>}</>;
}

/* ------------------------------------------------------------------ founding bar */

export function foundingLabel(t: V3ChromeMessages, left: number | null) {
  const s = foundingScarcity(left);
  if (s === "soldout") return null;
  return s === "low" ? { d: t.founding.low, m: t.founding.lowShort } : { d: t.founding.limited, m: t.founding.limitedShort };
}

/* ------------------------------------------------------------------ language */

/**
 * EN | FR | ES: real links to the same page in each language (the mobile
 * menu spells the names out). Sits next to the CA | US switch.
 */
export function V3LangSwitch() {
  const t = useT("common");
  const { links, onPick } = useLanguageLinks();
  if (links.length < 2) return null;
  return (
    <div role="group" aria-label={t.lang.label} className="v3-lang">
      {links.map((l) => (
        <a key={l.lang} href={l.href} lang={l.tag} hrefLang={l.lang} aria-current={l.current ? "true" : undefined} aria-label={l.name} title={l.title} onClick={(e) => onPick(e, l)} onAuxClick={(e) => onPick(e, l)}>
          <span className="d">{l.code}</span><span className="m">{l.name}</span>
        </a>
      ))}
    </div>
  );
}

/** Footer row: "Language  English · Français · Español". */
function V3FootLang() {
  const t = useT("common");
  const { links, onPick } = useLanguageLinks();
  if (links.length < 2) return null;
  return (
    <nav aria-label={t.lang.label} className="v3-foot-lang">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z" /></svg>
      <span className="k">{t.lang.label}</span>
      {links.map((l) => (
        <a key={l.lang} href={l.href} lang={l.tag} hrefLang={l.lang} aria-current={l.current ? "true" : undefined} title={l.title} onClick={(e) => onPick(e, l)} onAuxClick={(e) => onPick(e, l)}>{l.name}</a>
      ))}
    </nav>
  );
}

/* ------------------------------------------------------------------ header */

export function V3Header({
  t,
  lang,
  foundingLeft,
  onJoin,
  joinHref = V3H.joinTrade,
}: {
  t: V3ChromeMessages;
  lang: Locale;
  /** Founding 500 spots left; null when the count can't be read. */
  foundingLeft: number | null;
  /** Homepage: "Join free" opens the early-access dialog instead of navigating. */
  onJoin?: (e: MouseEvent) => void;
  joinHref?: string;
}) {
  const router = useRouter();
  const market = useVisitorMarket();
  const [menu, setMenu] = useState(false);
  const L = (p: string) => localizePath(p, lang);
  // splitLocale also drops /en: a prerendered English page renders with its internal /en path.
  const path = splitLocale(usePathname() ?? "/").path;
  const cur = (href: string) => (path === href || path.startsWith(`${href}/`) ? ("page" as const) : undefined);
  const spots = foundingLabel(t, foundingLeft);
  // Property-manager / condo-board pages: "Join free" is the buyer sign-up, not the trade one.
  const pmSide = isPmAudiencePath(path);
  const join = pmSide && joinHref === V3H.joinTrade ? V3H.joinPm : joinHref;
  usePageView(pmSide);
  const goMarket = (m: "CA" | "US") => {
    if (m === (market ?? "CA")) return;
    setMarket(m);
    router.refresh();
  };
  return (
    <div className="v3-top">
      {spots && (
        <a href={L(V3H.founding)} className="v3-found">
          <b><span className="d">{t.founding.bar}</span><span className="m">{t.founding.barShort}</span></b>
          <span className="badge"><span className="d">{spots.d}</span><span className="m">{spots.m}</span></span>
          <span className="u">{t.founding.claim}</span>
        </a>
      )}
      <header>
        <div className="v3-hdr">
          <a href={L(V3H.home)} aria-label={t.nav.home} className="v3-logo">
            <Image src={V3_MARK} alt="" width={32} height={32} />
            <span>pmrfp.com</span>
          </a>
          <nav id="v3-nav" aria-label={t.nav.main} className={`v3-nav${menu ? " open" : ""}`}>
            <div className="v3-nav-links">
              <a href={L(V3H.rfps)} aria-current={cur(V3H.rfps)}>{t.nav.rfps}</a>
              {/* Property-manager side: the free RFP writer, no sign-up until "Post it free". */}
              <a href={L(V3H.writer)} aria-current={cur(V3H.writer)}>{t.nav.writer}</a>
              <a href={L(V3H.directory)} aria-current={cur(V3H.directory)}>{t.nav.directory}</a>
              <a href={L(V3H.winners)} aria-current={cur(V3H.winners)}>{t.nav.winners}</a>
              <a href={L(V3H.jobs)} aria-current={cur(V3H.jobs)}>{t.nav.jobs}</a>
              <a href={L(V3H.forum)} aria-current={cur(V3H.forum)}>{t.nav.forum}</a>
              <a href={L(V3H.pricing)} aria-current={cur(V3H.pricing)}>{t.nav.pricing}</a>
            </div>
            <div role="group" aria-label={t.nav.market} className="v3-market">
              {(["CA", "US"] as const).map((m) => (
                <button key={m} type="button" aria-pressed={(market ?? "CA") === m} onClick={() => goMarket(m)}>{m}</button>
              ))}
            </div>
            <V3LangSwitch />
            <V3AccountLink L={L} signIn={{ href: V3H.signIn, label: t.nav.signIn }} listBusiness={t.nav.listBusiness} />
          </nav>
          <a href={L(join)} onClick={pmSide ? undefined : onJoin} className="v3-join">
            <span className="d">{t.nav.join}</span><span className="m">{t.nav.joinShort}</span>
          </a>
          <button type="button" className="v3-burger" aria-label={menu ? t.nav.closeMenu : t.nav.openMenu} aria-expanded={menu} aria-controls="v3-nav" onClick={() => setMenu((m) => !m)}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2" aria-hidden><path d={menu ? "M5 5l14 14M19 5L5 19" : "M3 7h18M3 12h18M3 17h18"} /></svg>
          </button>
        </div>
      </header>
      {!menu && <LanguageBanner />}
    </div>
  );
}

/** Alias kept for pages written against the older name. */
export const V3Top = V3Header;

/**
 * Counts page views this browser session (lib/growth/interruptions: nothing
 * interrupts a first page view before the visitor interacts) and remembers a
 * visitor who reached a property-manager page (no trade popups for them).
 */
let lastCountedView = "";
function usePageView(pmSide: boolean) {
  // Without the locale: a prerendered English page can report "/en" then "/".
  const path = splitLocale(usePathname() ?? "/").path;
  useEffect(() => {
    // Once per page view, even when React runs the effect twice (Strict Mode).
    const key = `${performance.timeOrigin}|${path}`;
    if (key !== lastCountedView) {
      lastCountedView = key;
      try {
        const n = (Number(readCookie(document.cookie, VIEWS_COOKIE)) || 0) + 1;
        document.cookie = `${VIEWS_COOKIE}=${n}; Path=/; SameSite=Lax`;
      } catch {
        /* cookies blocked */
      }
    }
    if (pmSide) rememberAudience("pm");
  }, [pmSide, path]);
}

/* ------------------------------------------------------------------ footer */

export function V3Footer({ t, lang }: { t: V3ChromeMessages; lang: Locale }) {
  const L = (p: string) => localizePath(p, lang);
  const f = t.footer;
  const cols = [
    [f.find, [[f.rfps, V3H.rfps], [f.directory, V3H.directory], [f.winners, V3H.winners], [f.gcHub, "/gc-hub"], [f.jobs, V3H.jobs], [f.marketplace, V3H.marketplace], [f.forum, V3H.forum]]],
    [f.who, [[f.trades, "/for-trades"], [f.pms, "/for-property-managers"], [f.writer, V3H.writer], [f.landlords, V3H.landlord], [f.condos, "/for/condo-boards"], [f.realEstate, V3H.forRealEstate], [f.suppliers, "/for/suppliers"], [f.builders, "/for/builders"], [f.agencies, "/for-agencies"]]],
    [f.resources, [[f.monthlyReports, "/reports/contract-winners"], [f.contractsReport, "/reports/public-building-contracts"], [f.directories, "/resources/contractor-directories"]]],
    [f.company, [[f.about2, "/about"], [f.advertise, V3H.advertise], [f.spotlight, "/spotlight"], [f.contact, "/contact"], [f.terms, "/terms"], [f.privacy, "/privacy"], [f.corrections, "/corrections"], [f.forumRules, "/forum/rules"]]],
  ] as const;
  return (
    <footer className="v3-foot">
      <div className="v3-wrap v3-foot-in">
        <div className="v3-foot-grid">
          <div>
            <div className="brand"><Image src={V3_MARK} alt="" width={30} height={30} /><span>pmrfp.com</span></div>
            <div className="txt">{f.about}</div>
            <div className="txt">{f.address}</div>
          </div>
          {cols.map(([title, links]) => (
            <nav key={title} aria-label={title} className="v3-foot-col">
              <h2>{title}</h2>
              {links.map(([l, h]) => <a key={l} href={L(h)}>{l}</a>)}
            </nav>
          ))}
        </div>
        <V3FootLang />
        <div className="legal">{f.legal}</div>
      </div>
    </footer>
  );
}

/* ------------------------------------------------------------------ page shell */

/** Page frame for template pages: skip link, chrome, one <main>. */
export function V3Frame({ t, lang, foundingLeft, joinHref, children }: { t: V3ChromeMessages; lang: Locale; foundingLeft: number | null; joinHref?: string; children: ReactNode }) {
  return (
    <div className="pmrfp-v3">
      <a href="#main" className="v3-skip">{t.skip}</a>
      <V3Header t={t} lang={lang} foundingLeft={foundingLeft} joinHref={joinHref} />
      <main id="main" tabIndex={-1} style={{ outline: "none" }}>{children}</main>
      <V3Footer t={t} lang={lang} />
    </div>
  );
}

/* ------------------------------------------------------------------ sticky board bar */

/**
 * Live board numbers for the visitor's country only (country-first); renders
 * nothing when the board can't be read or until the market is known.
 */
export function V3Sticky({
  t,
  lang,
  counts,
  where,
}: {
  t: Pick<V3Messages, "sticky" | "nav">;
  lang: Locale;
  counts: Record<"CA" | "US", { open: number; openPublic?: number; closing7: number }> | null;
  /** common.market.where: "in Canada" / "in the U.S.". */
  where: Record<"CA" | "US", string>;
}) {
  const market = useVisitorMarket();
  const L = (p: string) => localizePath(p, lang);
  const num = (n: number) => (lang === "en" ? String(n) : formatNumber(n, lang));
  const pmSide = isPmAudiencePath(splitLocale(usePathname() ?? "/").path);
  if (!counts || market == null) return null;
  const { open, openPublic, closing7 } = counts[market];
  // The label says "open public tenders": property-manager RFPs aren't in this number.
  const pub = openPublic ?? open;
  if (pub <= 0) return null;
  return (
    <div className="v3-sticky">
      <div className="v3-sticky-in">
        <span className="v3-dot d" style={{ width: 10, height: 10 }} />
        <div className="txt">
          <b><span className="d">{fmt(t.sticky.open, { n: num(pub), where: where[market] })}</span><span className="m">{fmt(t.sticky.openShort, { n: num(pub), where: where[market] })}</span></b>{" "}
          <span className="c"><span className="d">{fmt(t.sticky.closing, { n: num(closing7) })}</span><span className="m">{fmt(t.sticky.closingShort, { n: num(closing7) })}</span></span>
        </div>
        {/* Property managers write the RFP first; sign-up only at "Post it free". */}
        <a href={L(V3H.writer)} onClick={() => rememberAudience("pm")} className="v3-pill ghost">{t.sticky.post}</a>
        {/* On property-manager / condo-board pages, "Join free" is the buyer sign-up. */}
        <a href={L(pmSide ? V3H.joinPm : V3H.joinTrade)} className="v3-pill mint">{t.nav.join} →</a>
      </div>
    </div>
  );
}
