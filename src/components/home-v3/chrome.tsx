"use client";

import "./home-v3.css";
import Image from "next/image";
import { useState, type MouseEvent } from "react";
import { usePathname, useRouter } from "next/navigation";
import { setMarket, useVisitorMarket } from "@/components/geo/use-visitor-market";
import { FOUNDING_LOW_SPOTS, FOUNDING_PATH, foundingScarcity } from "@/lib/founding/config";
import { localizePath, type Locale } from "@/i18n/config";
import { fmt, formatNumber } from "@/i18n/format";
import type { Messages } from "@/i18n/dictionaries";

/**
 * The v3 design's shared chrome (Founding 500 bar, header, footer), used by the
 * homepage and every page built on the v3 templates. One copy, so the nav, the
 * market switch and the Founding 500 rule can't drift between pages.
 */
type T = Pick<Messages["homeV3"], "founding" | "nav" | "footer">;

const MARK = "/brand/mark-white.svg";
const NAV = [
  ["rfps", "/rfps"],
  ["directory", "/directory"],
  ["winners", "/contract-winners"],
  ["jobs", "/jobs"],
  ["forum", "/forum"],
  ["pricing", "/pricing"],
] as const;

/** "/fr/rfps/x" → "/rfps/x". */
function stripLang(path: string): string {
  return path.replace(/^\/(fr|es)(?=\/|$)/, "") || "/";
}

export function V3Top({
  t,
  lang,
  foundingLeft,
  onJoin,
}: {
  t: T;
  lang: Locale;
  /** Founding 500 spots left; null when unknown. Only picks quiet / low / sold-out copy, never shown. */
  foundingLeft: number | null;
  /** The homepage opens its sign-up dialog instead of following the link. */
  onJoin?: (e: MouseEvent<HTMLAnchorElement>) => void;
}) {
  const router = useRouter();
  const path = stripLang(usePathname() ?? "/");
  const market = useVisitorMarket();
  const [menu, setMenu] = useState(false);
  const L = (p: string) => localizePath(p, lang);
  const num = (n: number) => (lang === "en" ? String(n) : formatNumber(n, lang));

  const scarcity = foundingScarcity(foundingLeft);
  const showFounding = scarcity !== "soldout";
  const spots = scarcity === "low" ? fmt(t.founding.spots, { n: num(FOUNDING_LOW_SPOTS) }) : null;

  const goMarket = (m: "CA" | "US") => {
    if (m === (market ?? "CA")) return;
    setMarket(m);
    router.refresh();
  };

  return (
    <div className="v3-top">
      {showFounding && (
        <a href={L(FOUNDING_PATH)} className="v3-found">
          <b><span className="d">{t.founding.bar}</span><span className="m">{t.founding.barShort}</span></b>
          {spots && <span className="badge">{spots}</span>}
          <span className="u">{t.founding.claim}</span>
        </a>
      )}
      <header>
        <div className="v3-hdr">
          <a href={L("/")} aria-label={t.nav.home} className="v3-logo">
            <Image src={MARK} alt="" width={32} height={32} />
            <span>pmrfp.com</span>
          </a>
          <nav id="v3-nav" aria-label={t.nav.main} className={`v3-nav${menu ? " open" : ""}`}>
            <div className="v3-nav-links">
              {NAV.map(([k, href]) => (
                <a key={k} href={L(href)} aria-current={path === href || path.startsWith(`${href}/`) ? "page" : undefined}>
                  {t.nav[k]}
                </a>
              ))}
            </div>
            <div role="group" aria-label={t.nav.market} className="v3-market">
              {(["CA", "US"] as const).map((m) => (
                <button key={m} type="button" aria-pressed={(market ?? "CA") === m} onClick={() => goMarket(m)}>{m}</button>
              ))}
            </div>
            <a href={L("/sign-in")}>{t.nav.signIn}</a>
          </nav>
          <a href={L("/sign-up?role=trade")} onClick={onJoin} className="v3-join">
            <span className="d">{t.nav.join}</span><span className="m">{t.nav.joinShort}</span>
          </a>
          <button
            type="button"
            className="v3-burger"
            aria-label={menu ? t.nav.closeMenu : t.nav.openMenu}
            aria-expanded={menu}
            aria-controls="v3-nav"
            onClick={() => setMenu((m) => !m)}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2" aria-hidden><path d={menu ? "M5 5l14 14M19 5L5 19" : "M3 7h18M3 12h18M3 17h18"} /></svg>
          </button>
        </div>
      </header>
    </div>
  );
}

export function V3Footer({ t, lang }: { t: T; lang: Locale }) {
  const L = (p: string) => localizePath(p, lang);
  const cols = [
    [t.footer.find, [[t.footer.rfps, "/rfps"], [t.footer.directory, "/directory"], [t.footer.winners, "/contract-winners"], [t.footer.jobs, "/jobs"], [t.footer.marketplace, "/marketplace"], [t.footer.forum, "/forum"]]],
    [t.footer.who, [[t.footer.trades, "/for/tradesmen"], [t.footer.pms, "/for-property-managers"], [t.footer.landlords, "/sign-up?role=landlord"], [t.footer.condos, "/for/condo-boards"], [t.footer.realEstate, "/for/real-estate"], [t.footer.suppliers, "/for/suppliers"], [t.footer.builders, "/for/builders"]]],
    [t.footer.company, [[t.footer.about2, "/about"], [t.footer.advertise, "/advertise"], [t.footer.spotlight, "/spotlight"], [t.footer.contact, "/contact"], [t.footer.terms, "/terms"], [t.footer.privacy, "/privacy"]]],
  ] as const;
  return (
    <footer className="v3-foot">
      <div className="v3-wrap v3-foot-in">
        <div className="v3-foot-grid">
          <div>
            <div className="brand"><Image src={MARK} alt="" width={30} height={30} /><span>pmrfp.com</span></div>
            <div className="txt">{t.footer.about}</div>
            <div className="txt">{t.footer.address}</div>
          </div>
          {cols.map(([title, links]) => (
            <nav key={title} aria-label={title} className="v3-foot-col">
              <h2>{title}</h2>
              {links.map(([l, h]) => <a key={l} href={L(h)}>{l}</a>)}
            </nav>
          ))}
        </div>
        <div className="legal">{t.footer.legal}</div>
      </div>
    </footer>
  );
}
