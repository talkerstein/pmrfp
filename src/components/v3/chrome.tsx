"use client";

import "../home-v3/home-v3.css";
import Image from "next/image";
import { useState } from "react";
import { setMarket, useVisitorMarket } from "@/components/geo/use-visitor-market";
import { foundingScarcity } from "@/lib/founding/config";
import { localizePath, type Locale } from "@/i18n/config";
import { fmt, formatNumber } from "@/i18n/format";
import type { Messages } from "@/i18n/dictionaries";

/**
 * The homepage's announcement bar, header, footer and sticky bar (Claude
 * Design handoff 2026-10-07) for every page in the (v3) route group. Same
 * classes as components/home-v3, scoped under .pmrfp-v3. Page bodies sit
 * outside that scope (they use .v3p, components/v3/pages.css).
 */
type T = Messages["homeV3"];
export type ChromeCopy = Pick<T, "skip" | "nav" | "footer" | "sticky"> & { founding: Pick<T["founding"], "bar" | "barShort" | "claim" | "limited" | "low"> };

const mark = (size: number) => <Image src="/brand/mark-white.svg" alt="" width={size} height={size} />;

export function V3Header({ t, lang, foundingLeft }: { t: ChromeCopy; lang: Locale; foundingLeft: number | null }) {
  const L = (p: string) => localizePath(p, lang);
  const market = useVisitorMarket();
  const [menu, setMenu] = useState(false);
  const scarcity = foundingScarcity(foundingLeft);
  return (
    <div className="pmrfp-v3">
      <a href="#main" className="v3-skip">{t.skip}</a>
      <div className="v3-top">
        {scarcity !== "soldout" && (
          <a href={L("/founding-500")} className="v3-found">
            <b><span className="d">{t.founding.bar}</span><span className="m">{t.founding.barShort}</span></b>
            {/* Never the exact count while more than 50 remain. */}
            <span className="badge">{scarcity === "low" ? t.founding.low : t.founding.limited}</span>
            <span className="u">{t.founding.claim}</span>
          </a>
        )}
        <header>
          <div className="v3-hdr">
            <a href={L("/")} aria-label={t.nav.home} className="v3-logo">
              {mark(32)}
              <span>pmrfp.com</span>
            </a>
            <nav id="v3-nav" aria-label={t.nav.main} className={`v3-nav${menu ? " open" : ""}`}>
              <div className="v3-nav-links">
                <a href={L("/rfps")}>{t.nav.rfps}</a>
                <a href={L("/directory")}>{t.nav.directory}</a>
                <a href={L("/contract-winners")}>{t.nav.winners}</a>
                <a href={L("/jobs")}>{t.nav.jobs}</a>
                <a href={L("/forum")}>{t.nav.forum}</a>
                <a href={L("/pricing")}>{t.nav.pricing}</a>
              </div>
              <div role="group" aria-label={t.nav.market} className="v3-market">
                {(["CA", "US"] as const).map((m) => (
                  <button key={m} type="button" aria-pressed={(market ?? "CA") === m} onClick={() => setMarket(m)}>{m}</button>
                ))}
              </div>
              <a href={L("/sign-in")}>{t.nav.signIn}</a>
            </nav>
            <a href={L("/sign-up?role=trade")} className="v3-join">
              <span className="d">{t.nav.join}</span><span className="m">{t.nav.joinShort}</span>
            </a>
            <button type="button" className="v3-burger" aria-label={menu ? t.nav.closeMenu : t.nav.openMenu} aria-expanded={menu} aria-controls="v3-nav" onClick={() => setMenu((m) => !m)}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2" aria-hidden><path d={menu ? "M5 5l14 14M19 5L5 19" : "M3 7h18M3 12h18M3 17h18"} /></svg>
            </button>
          </div>
        </header>
      </div>
    </div>
  );
}

export function V3Footer({ t, lang }: { t: ChromeCopy; lang: Locale }) {
  const L = (p: string) => localizePath(p, lang);
  const f = t.footer;
  const cols = [
    [f.find, [[f.rfps, "/rfps"], [f.directory, "/directory"], [f.winners, "/contract-winners"], [f.jobs, "/jobs"], [f.marketplace, "/marketplace"], [f.forum, "/forum"]]],
    [f.who, [[f.trades, "/for-trades"], [f.pms, "/for-property-managers"], [f.landlords, "/sign-up?role=landlord"], [f.condos, "/for/condo-boards"], [f.realEstate, "/for/real-estate"], [f.suppliers, "/for/suppliers"], [f.builders, "/for/builders"]]],
    [f.company, [[f.about2, "/about"], [f.advertise, "/advertise"], [f.spotlight, "/spotlight"], [f.contact, "/contact"], [f.terms, "/terms"], [f.privacy, "/privacy"]]],
  ] as const;
  return (
    <div className="pmrfp-v3">
      <footer className="v3-foot">
        <div className="v3-wrap v3-foot-in">
          <div className="v3-foot-grid">
            <div>
              <div className="brand">{mark(30)}<span>pmrfp.com</span></div>
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
    </div>
  );
}

/** Live board numbers only; renders nothing when the board can't be read. */
export function V3Sticky({ t, lang, open, closing7 }: { t: ChromeCopy; lang: Locale; open: number | null; closing7: number | null }) {
  const L = (p: string) => localizePath(p, lang);
  const num = (n: number) => (lang === "en" ? String(n) : formatNumber(n, lang));
  if (open == null || closing7 == null || open <= 0) return null;
  return (
    <div className="pmrfp-v3 v3-sticky">
      <div className="v3-sticky-in">
        <span className="v3-dot d" style={{ width: 10, height: 10 }} />
        <div className="txt">
          <b><span className="d">{fmt(t.sticky.open, { n: num(open) })}</span><span className="m">{fmt(t.sticky.openShort, { n: num(open) })}</span></b>{" "}
          <span className="c"><span className="d">{fmt(t.sticky.closing, { n: num(closing7) })}</span><span className="m">{fmt(t.sticky.closingShort, { n: num(closing7) })}</span></span>
        </div>
        <a href={L("/sign-up?role=property_manager")} className="v3-pill ghost">{t.sticky.post}</a>
        <a href={L("/sign-up?role=trade")} className="v3-pill mint">{t.nav.join} →</a>
      </div>
    </div>
  );
}
