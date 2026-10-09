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
import { useState, type MouseEvent, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { setMarket, useUsdPerCad, useVisitorMarket } from "@/components/geo/use-visitor-market";
import { foundingScarcity } from "@/lib/founding/config";
import { toUsd } from "@/lib/markets";
import { localizePath, type Locale } from "@/i18n/config";
import { fmt, formatNumber } from "@/i18n/format";

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
  const path = (usePathname() ?? "/").replace(/^\/(fr|es)(?=\/|$)/, "") || "/";
  const cur = (href: string) => (path === href || path.startsWith(`${href}/`) ? ("page" as const) : undefined);
  const spots = foundingLabel(t, foundingLeft);
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
            <a href={L(V3H.signIn)}>{t.nav.signIn}</a>
          </nav>
          <a href={L(joinHref)} onClick={onJoin} className="v3-join">
            <span className="d">{t.nav.join}</span><span className="m">{t.nav.joinShort}</span>
          </a>
          <button type="button" className="v3-burger" aria-label={menu ? t.nav.closeMenu : t.nav.openMenu} aria-expanded={menu} aria-controls="v3-nav" onClick={() => setMenu((m) => !m)}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2" aria-hidden><path d={menu ? "M5 5l14 14M19 5L5 19" : "M3 7h18M3 12h18M3 17h18"} /></svg>
          </button>
        </div>
      </header>
    </div>
  );
}

/** Alias kept for pages written against the older name. */
export const V3Top = V3Header;

/* ------------------------------------------------------------------ footer */

export function V3Footer({ t, lang }: { t: V3ChromeMessages; lang: Locale }) {
  const L = (p: string) => localizePath(p, lang);
  const f = t.footer;
  const cols = [
    [f.find, [[f.rfps, V3H.rfps], [f.directory, V3H.directory], [f.winners, V3H.winners], [f.jobs, V3H.jobs], [f.marketplace, V3H.marketplace], [f.forum, V3H.forum]]],
    [f.who, [[f.trades, "/for-trades"], [f.pms, "/for-property-managers"], [f.landlords, V3H.landlord], [f.condos, "/for/condo-boards"], [f.realEstate, V3H.forRealEstate], [f.suppliers, "/for/suppliers"], [f.builders, "/for/builders"], [f.agencies, "/for-agencies"]]],
    [f.resources, [[f.monthlyReports, "/reports/contract-winners"], [f.contractsReport, "/reports/public-building-contracts"], [f.directories, "/resources/contractor-directories"]]],
    [f.company, [[f.about2, "/about"], [f.advertise, V3H.advertise], [f.spotlight, "/spotlight"], [f.contact, "/contact"], [f.terms, "/terms"], [f.privacy, "/privacy"]]],
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

/** Live board numbers only; renders nothing when the board can't be read. */
export function V3Sticky({ t, lang, open, closing7 }: { t: Pick<V3Messages, "sticky" | "nav">; lang: Locale; open: number | null; closing7: number | null }) {
  const L = (p: string) => localizePath(p, lang);
  const num = (n: number) => (lang === "en" ? String(n) : formatNumber(n, lang));
  if (open == null || closing7 == null || open <= 0) return null;
  return (
    <div className="v3-sticky">
      <div className="v3-sticky-in">
        <span className="v3-dot d" style={{ width: 10, height: 10 }} />
        <div className="txt">
          <b><span className="d">{fmt(t.sticky.open, { n: num(open) })}</span><span className="m">{fmt(t.sticky.openShort, { n: num(open) })}</span></b>{" "}
          <span className="c"><span className="d">{fmt(t.sticky.closing, { n: num(closing7) })}</span><span className="m">{fmt(t.sticky.closingShort, { n: num(closing7) })}</span></span>
        </div>
        <a href={L("/sign-up?role=property_manager")} className="v3-pill ghost">{t.sticky.post}</a>
        <a href={L(V3H.joinTrade)} className="v3-pill mint">{t.nav.join} →</a>
      </div>
    </div>
  );
}
