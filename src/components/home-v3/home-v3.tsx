"use client";

import "./home-v3.css";
import Image from "next/image";
import { useCallback, useEffect, useRef, useState, useTransition, type CSSProperties, type FormEvent, type ReactNode } from "react";
import { useUsdPerCad, useVisitorMarket } from "@/components/geo/use-visitor-market";
import { audienceFromCookie, rememberAudience } from "@/lib/audience/pm";
import { PROMPT_COOKIE, QUIET_AFTER_INPUT_MS, TOAST_COOKIE, VIEWS_COOKIE, mayInterrupt, mayToast, quietEnough, readCookie } from "@/lib/growth/interruptions";
import { V3Footer, V3Header, foundingLabel } from "./chrome";
import { joinRegionalWaitlistAction } from "@/lib/waitlist/actions";
import { signUpHrefForPlan } from "@/lib/billing/plan-intent";
import { PRICING } from "@/lib/site";
import { FOUNDING } from "@/lib/founding/config";
import { toUsd } from "@/lib/markets";
import { localizePath, type Locale } from "@/i18n/config";
import { fmt, formatNumber } from "@/i18n/format";
import type { Messages } from "@/i18n/dictionaries";

/* ------------------------------------------------------------------ data */

export type { V3Messages } from "./chrome-shared";
type V3Messages = Messages["homeV3"];
export interface V3Closing { mon: string; day: string; tag: string; left: string; title: string; href: string; soon: boolean }
/** `n` is null when the live count couldn't load: the count is hidden, never guessed. */
export interface V3Trade { name: string; n: number | null; href: string }
/**
 * Counts are null when their live query fails (see fallback.ts): the stat
 * block is hidden or reads "Live numbers loading". Never a design-time number.
 */
export interface V3Data {
  /** Open listings: public tenders + property-manager RFPs. */
  open: number | null;
  /** The part of `open` posted by property managers (never demo listings). */
  openPm: number | null;
  /** The part of `open` that is imported public tenders. */
  openPublic: number | null;
  closing7: number | null;
  trades: number | null;
  regions: number | null;
  /** Founding 500 spots left; null when the count can't be read. Only used to pick quiet / low / sold-out copy, never displayed. */
  foundingLeft: number | null;
  big: V3Trade & { img: string };
  tiles: (V3Trade & { img: string })[];
  tradeOptions: { value: string; label: string }[];
  areaOptions: { label: string; region?: string; country?: "ca" | "us" }[];
  closingCa: V3Closing[];
  closingUs: V3Closing[];
  toast: { tag: string; color: string; title: string }[];
  alertTrade: string;
  alerts: { where: string; title: string; href: string }[];
  winners: {
    repeat: number;
    contracts: number;
    value: string;
    top: { name: string; n: number; value: string; weight: number; href: string; most: boolean }[];
    most: { name: string; n: number };
    /** Latest monthly report ("September 2026"), when one exists. */
    report?: { month: string; href: string };
  };
  /** Crawlable links to trade × city pages and fresh tenders (SEO). */
  browse: { combos: { href: string; label: string; n: number }[]; newest: { href: string; title: string; city: string | null }[] };
}

/* ------------------------------------------------------------------ constants */

const IMG = {
  mark: "/brand/mark-white.svg",
  roofing: "/images/home/hero-roofing.webp",
};

const H = {
  founding: "/founding-500",
  rfps: "/rfps",
  trades: "/trades",
  regions: "/regions",
  winners: "/contract-winners",
  jobs: "/jobs",
  forum: "/forum",
  talent: "/talent",
  joinTrade: "/sign-up?role=trade",
  // Property managers write the RFP first; sign-up comes only at "Post it free".
  postRfp: "/rfp-writer",
  landlord: "/sign-up?role=landlord",
  supplier: "/sign-up?role=supplier",
  gcPackage: "/gc-packages/new",
  forRealEstate: "/for/real-estate",
  advertise: "/advertise",
  proAnnual: signUpHrefForPlan("pro", "annual"),
  proMonthly: signUpHrefForPlan("pro", "monthly"),
  featured: signUpHrefForPlan("featured", "annual"),
};

/** One link per t.doors[door].roles[role]: I do the work, then I hire contractors. */
const DOOR_HREF = [[H.joinTrade, H.supplier, H.jobs], [H.postRfp, H.landlord, H.postRfp, H.gcPackage, H.forRealEstate]];
/** One link per t.also.items. */
const ALSO_HREF = [H.forum, H.jobs, H.talent, H.joinTrade, H.advertise];
const SMALL_BG = ["#4A4E85", "#444879", "#3D416F", "#363A66", "#30335D"];

const vars = (v: Record<string, string | number>) => v as CSSProperties;

/* ------------------------------------------------------------------ shared bits */

const Check = ({ size = 22 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 22 22" fill="none" stroke="#1B1D3A" strokeWidth="2.5" aria-hidden><path d="M4 11.5l4.5 4.5L18 6.5" /></svg>
);
const SmallCheck = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="#1B1D3A" strokeWidth="2.5" aria-hidden><path d="M2.5 7.5l3 3 6-6.5" /></svg>
);
const Arrow = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d="M4 10h12M11 5l5 5-5 5" /></svg>
);
const CloseX = ({ size, stroke }: { size: number; stroke: string }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke={stroke} strokeWidth="2.5" aria-hidden><path d="M3 3l10 10M13 3L3 13" /></svg>
);
/** Fixed-width placeholder while the visitor's market (and so the currency) is unknown. */
const Sk = ({ w }: { w: string }) => <span className="v3-sk" aria-hidden style={{ width: w }} />;

/* ------------------------------------------------------------------ component */

export function HomeV3({
  data: dataCa,
  dataUs,
  where,
  t,
  lang,
  dataSources,
  digest,
}: {
  /** Canada's board (also what crawlers and the first paint see). */
  data: V3Data;
  /** The U.S. board; null when the board can't be read. Never mixed with Canada's. */
  dataUs?: V3Data | null;
  /** common.market.where: "in Canada" / "in the U.S.". */
  where: Record<"CA" | "US", string>;
  t: V3Messages;
  lang: Locale;
  dataSources?: { live: string[]; fallback: string[] };
  /** The free weekly email sign-up (server-rendered; null while sign-ups are off). */
  digest?: ReactNode;
}) {
  const market = useVisitorMarket();
  // Country-first: one country's numbers, lists and awards at a time.
  const data = market === "US" && dataUs ? dataUs : dataCa;
  const here = where[market === "US" && dataUs ? "US" : "CA"];
  // The visitor's own country leads the area pick: a U.S. visitor must not land on Ontario.
  const areaOpts = market === "US" ? [...data.areaOptions.filter((o) => o.country === "us"), ...data.areaOptions.filter((o) => o.country !== "us")] : data.areaOptions;
  const rate = useUsdPerCad();
  const L = (p: string) => localizePath(p, lang);
  const num = (n: number) => (lang === "en" ? String(n) : formatNumber(n, lang));
  /**
   * Open PUBLIC tenders: the headline counters say "public tenders", and the
   * property-manager RFPs are counted on their own (persona QA 2026-10-21:
   * "261 contracts open" read as property-manager work; it was all tenders).
   */
  const pub = data.openPublic;
  /** A click on a property-manager CTA: no trade popup or toast for this visitor from now on. */
  const pickPm = () => rememberAudience("pm");

  /* One currency per visitor: CAD in Canada, USD in the U.S.; nothing until we know which. */
  const known = market != null;
  const us = market === "US";
  const currency = us ? "USD" : "CAD";
  const money = (cad: number) => {
    const n = formatNumber(us ? toUsd(cad, rate) : cad, lang);
    return lang === "fr" ? `${n} $` : `$${n}`;
  };
  const foundingMoney = () => {
    const n = formatNumber(us ? FOUNDING.priceUsd : FOUNDING.priceCad, lang);
    return `${lang === "fr" ? `${n} $` : `$${n}`} ${currency}`;
  };

  const heroRef = useRef<HTMLDivElement>(null);
  const [pastHero, setPastHero] = useState(false);
  const [modal, setModal] = useState(false);
  const seen = useRef(false);
  const lastFocus = useRef<HTMLElement | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const [sent, setSent] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [toastOn, setToastOn] = useState(false);
  const [toastOff, setToastOff] = useState(false);

  const openModal = useCallback(() => {
    seen.current = true;
    lastFocus.current = document.activeElement as HTMLElement | null;
    setModal(true);
  }, []);
  const openModalLink = useCallback(
    (e: { preventDefault(): void }) => {
      e.preventDefault();
      openModal();
    },
    [openModal],
  );
  const closeModal = useCallback(() => {
    setModal(false);
    lastFocus.current?.focus?.();
  }, []);

  useEffect(() => {
    // Trade popup and toast: only per lib/growth/interruptions (never for
    // property managers, once per visitor, never before a first-time visitor
    // interacts, never right under a click).
    let interacted = false;
    let lastInput: number | null = null;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const ctx = (cookie: string) => ({
      path: "/",
      audience: audienceFromCookie(document.cookie),
      alreadyShown: readCookie(document.cookie, cookie) === "1",
      pageViews: Number(readCookie(document.cookie, VIEWS_COOKIE)) || 1,
      interacted,
    });
    const setOnce = (cookie: string) => {
      try {
        document.cookie = `${cookie}=1; Max-Age=${60 * 60 * 24 * 365}; Path=/; SameSite=Lax`;
      } catch {
        /* cookies blocked: it may show again next visit */
      }
    };
    const openPrompt = () => {
      if (seen.current || !mayInterrupt(ctx(PROMPT_COOKIE))) return;
      if (!quietEnough(Date.now(), lastInput)) {
        // Never open under a click: wait until the visitor pauses.
        timers.push(setTimeout(openPrompt, QUIET_AFTER_INPUT_MS));
        return;
      }
      seen.current = true;
      setOnce(PROMPT_COOKIE);
      lastFocus.current = document.activeElement as HTMLElement | null;
      setModal(true);
    };
    const openToast = () => {
      if (!mayToast(ctx(TOAST_COOKIE), window.innerWidth)) return;
      setOnce(TOAST_COOKIE);
      setToastOn(true);
    };
    let armed = false;
    const arm = () => {
      if (armed) return;
      armed = true;
      // Long enough to read the page first; exit intent can still open the popup sooner.
      timers.push(setTimeout(openToast, 30000), setTimeout(openPrompt, 45000));
    };
    const onInput = () => {
      lastInput = Date.now();
      interacted = true;
      arm();
    };
    const onScroll = () => {
      interacted = true;
      arm();
    };
    // A returning page view may start the clock; a first view waits for the visitor.
    if (ctx(PROMPT_COOKIE).pageViews > 1) arm();
    window.addEventListener("pointerdown", onInput, { passive: true });
    window.addEventListener("keydown", onInput);
    window.addEventListener("scroll", onScroll, { passive: true, once: true });
    // Exit intent: desktop only (cursor leaves through the top of the viewport).
    const onLeave = (e: MouseEvent) => {
      if (e.clientY <= 0 && window.matchMedia("(min-width: 1024px)").matches) openPrompt();
    };
    document.addEventListener("mouseleave", onLeave);
    return () => {
      timers.forEach(clearTimeout);
      window.removeEventListener("pointerdown", onInput);
      window.removeEventListener("keydown", onInput);
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("mouseleave", onLeave);
    };
  }, []);

  // The sticky bar waits until the visitor is past the hero, so it never competes with the two doors.
  useEffect(() => {
    const el = heroRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => setPastHero(!e.isIntersecting));
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!modal) return;
    const box = dialogRef.current;
    box?.querySelector<HTMLElement>("select, input, a, button:not(.x)")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeModal();
      if (e.key !== "Tab" || !box) return;
      const items = [...box.querySelectorAll<HTMLElement>("a[href], button, select, input:not([tabindex='-1'])")].filter((el) => el.offsetParent !== null);
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [modal, closeModal, sent]);

  const closing = market === "US" && data.closingUs.length ? data.closingUs : data.closingCa;
  // One toast, not a rotation (lib/growth/interruptions).
  const toastItem = data.toast[0] ?? null;
  const showToast = toastOn && !toastOff && !modal && toastItem != null;
  const spots = foundingLabel(t, data.foundingLeft);
  const showFounding = spots != null;
  const w = data.winners;
  const top = w.top;
  const plans = [
    { ...t.plans.items[0], price: known ? (lang === "fr" ? "0 $" : "$0") : null, per: t.plans.forever, href: H.joinTrade, pop: false, w: "3ch" },
    { ...t.plans.items[1], price: known ? money(PRICING.proAnnual) : null, per: known ? fmt(t.plans.perYearOr, { currency, monthly: money(PRICING.proMonthly) }) : null, href: H.proAnnual, pop: true, w: "4ch" },
    { ...t.plans.items[2], price: known ? money(PRICING.featuredAnnual) : null, per: known ? fmt(t.plans.perYear, { currency }) : null, href: H.featured, pop: false, w: "4ch" },
  ];

  const onSearch = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const q = new URLSearchParams();
    const trade = String(f.get("trade") ?? "");
    if (trade) q.set("category", trade);
    const area = areaOpts[Number(f.get("area") ?? 0)];
    if (area?.region) q.set("region", area.region);
    if (area?.country) q.set("country", area.country);
    const qs = q.toString();
    // A full page load, like every other board filter: the results open at the
    // top. A client transition kept the home page's scroll and left phones
    // ~125px down the board, header hidden (persona QA 2026-10-21).
    window.location.assign(L(qs ? `/rfps?${qs}` : "/rfps"));
  };

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFormError(null);
    const f = new FormData(e.currentTarget);
    const area = areaOpts[Number(f.get("area") ?? 0)];
    const fd = new FormData();
    fd.set("email", String(f.get("email") ?? ""));
    fd.set("role", "trade");
    fd.set("reason", "early_access");
    fd.set("company_website", String(f.get("company_website") ?? ""));
    const trade = String(f.get("trade") ?? "");
    if (trade) fd.set("categorySlug", trade);
    if (area?.region) fd.set("regionSlug", area.region);
    if (area?.country) fd.set("country", area.country === "us" ? "United States" : "Canada");
    startTransition(async () => {
      const res = await joinRegionalWaitlistAction({}, fd);
      if (res.error) setFormError(res.error);
      else setSent(true);
    });
  };

  const tradeSelect = (
    <select name="trade">
      {data.tradeOptions.map((o) => (
        <option key={o.label} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
  const areaSelect = (
    <select name="area">
      {areaOpts.map((o, i) => (
        <option key={o.label} value={i}>{t.areas[o.label] ?? o.label}</option>
      ))}
    </select>
  );
  const mark = (size: number) => <Image src={IMG.mark} alt="" width={size} height={size} />;

  const popupBody: ReactNode = !sent ? (
    <div>
      <div className="v3-label">{t.popup.eyebrow}</div>
      <div className="hd" id="v3-dlg-title">{t.popup.title}</div>
      <form onSubmit={onSubmit}>
        <input type="text" name="company_website" tabIndex={-1} autoComplete="off" aria-hidden style={{ position: "absolute", left: "-9999px", width: 1, height: 1, opacity: 0 }} />
        <div className="two">
          <label className="v3-field"><span>{t.trades.yourTrade}</span>{tradeSelect}</label>
          <label className="v3-field"><span>{t.trades.yourArea}</span>{areaSelect}</label>
        </div>
        <label className="v3-field"><span>{t.popup.email}</span><input type="email" name="email" required autoComplete="email" placeholder={t.popup.placeholder} /></label>
        <button type="submit" disabled={pending} style={{ opacity: pending ? 0.7 : 1 }}>{pending ? t.popup.sending : t.popup.submit}</button>
        {formError && <div role="alert" className="err">{formError}</div>}
      </form>
      <div className="fine">{t.popup.note} <a href={L(H.postRfp)} onClick={pickPm}>{t.popup.post}</a></div>
    </div>
  ) : (
    <div className="fadeup">
      <span className="ok"><Check size={28} /></span>
      <div className="hd" id="v3-dlg-title" style={{ marginTop: 16 }}>{t.popup.done}</div>
      <div style={{ marginTop: 8, color: "#4B4F6B" }}>{t.popup.doneBody}</div>
      <a href={L(H.joinTrade)} className="big">{t.popup.doneCta}</a>
      {known && <a href={L(H.proMonthly)} className="prolink">{fmt(t.popup.pro, { price: `${money(PRICING.proMonthly)} ${currency}` })}</a>}
      <button type="button" onClick={closeModal} className="keep">{t.popup.keep}</button>
    </div>
  );

  return (
    <div className="pmrfp-v3" data-live={dataSources?.live.join(",")} data-fallback={dataSources?.fallback.join(",")}>
      <a href="#main" className="v3-skip">{t.skip}</a>

      <V3Header t={t} lang={lang} foundingLeft={data.foundingLeft} joinHref="/sign-up" />

      <main id="main" tabIndex={-1} style={{ outline: "none" }}>
        <div className="v3-top" ref={heroRef}>
          <section>
            <div className="v3-hero">
              <h1 className="v3-h1">{t.hero.title}</h1>
              <p className="v3-hero-sub">{t.hero.sub}</p>
            </div>
            <div className="v3-doors" role="group" aria-label={t.hero.audience}>
              {t.doors.map((door, d) => (
                <div key={door.head} className="v3-door">
                  <h2 className="hd">{door.head}</h2>
                  <p className="sb">{door.sub}</p>
                  <div className="rows">
                    {door.roles.map((r, i) => (
                      // Property managers, landlords, condo boards: the buyer side.
                      <a key={r.who} href={L(DOOR_HREF[d][i])} onClick={d === 1 && i <= 2 ? pickPm : undefined}>
                        <span><b>{r.who}</b><span className="w">{r.what}</span></span>
                        <Arrow />
                      </a>
                    ))}
                  </div>
                  {d === 0 && !!pub && (
                    <a className="live" href={L(H.rfps)}>
                      <span className="v3-dot" />
                      <span><b>{fmt(t.hero.openNow, { n: num(pub), where: here })}</b>{!!data.closing7 && <span className="c">{fmt(t.hero.closing, { n: num(data.closing7) })}</span>}</span>
                    </a>
                  )}
                </div>
              ))}
            </div>
          </section>
        </div>

        <section className="v3-wrap v3-how">
          <h2 className="v3-h2">{t.how.title}</h2>
          <div className="v3-how-grid">
            {t.how.columns.map((c) => (
              <div key={c.head}>
                <h3 className="v3-h3">{c.head}</h3>
                <ol>
                  {c.steps.map((x, i) => (
                    <li key={x.t}><span className="no" aria-hidden>{i + 1}</span><div><b>{x.t}</b><p>{x.b}</p></div></li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
        </section>

        <section className="v3-wrap v3-trades">
          <div className="v3-trades-head">
            <div>
              <div className="v3-eyebrow">{t.trades.eyebrow}</div>
              <h2 className="v3-h2">{t.trades.title}</h2>
            </div>
            <form onSubmit={onSearch} className="v3-search">
              <label className="v3-field"><span>{t.trades.yourTrade}</span>{tradeSelect}</label>
              <label className="v3-field"><span>{t.trades.yourArea}</span>{areaSelect}</label>
              <button type="submit">{t.trades.submit}</button>
            </form>
          </div>

          <div className="v3-bento">
            <a className="v3-tt big zoom" href={L(data.big.href)}>
              <Image src={data.big.img} alt="" fill sizes="(max-width: 1023px) 100vw, 480px" className="v3-img" />
              <span className="sh" />
              <span className="in">
                {!!data.big.n && <span className="n">{num(data.big.n)}</span>}
                <span className="row"><span className="nm">{data.big.name}</span><span className="on">{t.trades.openNow}</span></span>
              </span>
            </a>
            {data.tiles.map((x) => (
              <a key={x.name} className="v3-tt zoom" href={L(x.href)}>
                <Image src={x.img} alt="" fill sizes="(max-width: 1023px) 50vw, 230px" className="v3-img" />
                <span className="sh" />
                <span className="in">{!!x.n && <span className="n">{num(x.n)}</span>}<span className="nm">{x.name}</span></span>
              </a>
            ))}
            <a className="v3-allt lift" href={L(H.trades)}>
              <svg width="36" height="36" viewBox="0 0 36 36" fill="none" stroke="#1B1D3A" strokeWidth="3" aria-hidden><path d="M9 27L27 9M12 9h15v15" /></svg>
              <span>{data.trades != null && <span className="n">{num(data.trades)}</span>}<span className="nm">{t.trades.all}</span></span>
            </a>
          </div>

        </section>

        <section className="v3-wrap v3-closing">
          {closing.length > 0 && (<>
          <div className="v3-row-head">
            <h2 className="v3-h3">{t.closing.title}</h2>
            <a href={L(H.rfps)}>{data.open != null ? <><span className="d">{fmt(t.closing.all, { n: num(data.open) })}</span><span className="m">{fmt(t.closing.allShort, { n: num(data.open) })}</span></> : t.closing.allNoCount}</a>
          </div>
          <div className="v3-cards4 hs">
            {closing.map((r) => {
              const bg = r.soon ? "#FDF0DC" : "#EEEEF8";
              const fg = r.soon ? "#8A3F06" : "#282B59";
              return (
                <a key={r.href + r.title} className="v3-close lift" href={L(r.href)}>
                  <span className="top"><span className="date" style={{ background: bg, color: fg }}><span className="mon">{r.mon}</span><span className="day">{r.day}</span></span><span className="left" style={{ color: fg }}>{r.left}</span></span>
                  <span className="tag">{r.tag}</span>
                  <span className="ti">{r.title}</span>
                </a>
              );
            })}
          </div>
          </>)}

          <div className="v3-src">
            <h2 className="v3-h3">{t.sources.title}</h2>
            <div className="note">{t.sources.note}</div>
            <div className="v3-src-grid">
              {/* Country-first: this visitor's sources, plus the private RFPs. */}
              {([
                ["CA", "CanadaBuys", t.sources.federal, "CA"],
                ["TO", "City of Toronto", t.sources.municipal, "CA"],
                ["QC", "Québec SEAO", t.sources.provincial, "CA"],
                ["NS", "Nova Scotia", t.sources.provincial, "CA"],
                ["YT", "Yukon", t.sources.territorial, "CA"],
                ["US", "SAM.gov", t.sources.usFederal, "US"],
                ["NYC", "NYC City Record", t.sources.municipal, "US"],
                ["+", t.sources.pms, t.sources.private, null],
              ] as const).filter((x) => x[3] == null || x[3] === (market ?? "CA")).map(([code, name, kind, country]) => (
                <div key={code} style={{ background: country == null ? "#91F2CF" : "#FFFFFF" }}>
                  <div className="code">{code}</div>
                  <div className="nm">{name}</div>
                  <div className="kd">{kind}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="v3-pro">
          <div className="v3-wrap v3-pro-in">
            <div className="v3-pro-l">
              <div className="v3-eyebrow ink">{t.pro.eyebrow}</div>
              <h2 className="v3-h2">{t.pro.title}</h2>
              <p className="v3-pro-p">{t.pro.body}</p>
              <ul className="v3-checks">
                {t.pro.points.map((x) => <li key={x}><Check />{x}</li>)}
              </ul>
              <div className="v3-pro-cta">
                <a href={L(H.proAnnual)} className="v3-pill ink">{t.pro.cta}</a>
                <div>{known ? fmt(t.pro.price, { monthly: `${money(PRICING.proMonthly)} ${currency}`, annual: money(PRICING.proAnnual) }) : <Sk w="16em" />}</div>
              </div>
            </div>
            <div className="v3-pro-r">
              {data.alerts.length > 0 && (<>
              <div className="v3-mailpill">
                {mark(30)}
                <span className="t">{t.pro.time}</span>
                <b><span className="d">{fmt(t.pro.matches, { n: num(data.alerts.length), trade: data.alertTrade })}</span><span className="m">{fmt(t.pro.matches, { n: num(data.alerts.length), trade: data.alertTrade.split(" / ")[0] })}</span></b>
              </div>
              {data.alerts.map((a, i) => (
                <a key={a.href + i} href={L(a.href)} className="v3-alert" style={vars({ marginLeft: `${i * 36}px`, "--im": `${i * 14}px` })}>
                  <div className="hd"><span className="w">{a.where}</span><span className="i">{i + 1}/{data.alerts.length}</span></div>
                  <div className="ti">{a.title}</div>
                  <div className="chips">{t.pro.chips.map((c) => <span key={c}><SmallCheck />{c}</span>)}</div>
                </a>
              ))}
              <div className="v3-pro-note">{t.pro.note}</div>
              </>)}
            </div>
          </div>
        </section>

        {/* Contract winners come from public award notices (Canadian today): hidden when the visitor's country has none. */}
        {top.length > 0 && (
        <section className="v3-win">
          <div className="v3-wrap v3-win-in">
            <div className="v3-win-head">
              <div>
                <div className="v3-eyebrow mint">{t.winners.eyebrow}</div>
                <h2 className="v3-h2">{t.winners.title}</h2>
              </div>
              <div className="v3-win-stats">
                {([[num(w.repeat), t.winners.repeat], [num(w.contracts), t.winners.contracts], [w.value, t.winners.awarded]] as const).map(([n, l]) => (
                  <div key={l}><div className="n">{n}</div><div className="l">{l}</div></div>
                ))}
              </div>
            </div>

            {top.length >= 3 && (
              <div className="v3-tree">
                <a className="v3-blk b0 blk" href={L(top[0].href)} style={vars({ "--w": top[0].weight })}>
                  <span className="no">01 · {t.winners.topValue}</span>
                  <span className="grp"><span className="val">{top[0].value}</span><span className="nm">{top[0].name}</span><span className="cn">{fmt(t.winners.nContracts, { n: num(top[0].n) })}</span></span>
                </a>
                <div className="v3-tree-r" style={vars({ "--w": top.slice(1).reduce((a, x) => a + x.weight, 0) })}>
                  <div className="v3-tree-row r12" style={vars({ "--w": top[1].weight + top[2].weight })}>
                    {[1, 2].map((k) => (
                      <a key={k} className={`v3-blk b${k} blk`} href={L(top[k].href)} style={vars({ "--w": top[k].weight, "--wm": Math.max(top[2].weight, top[1].weight * 0.58) })}>
                        <span className="no">0{k + 1}<span className="mostc">{top[k].most ? ` · ${t.winners.most}` : ""}</span></span>
                        <span className="grp"><span className="val">{top[k].value}</span><span className="nm">{top[k].name}</span><span className="cn">{fmt(t.winners.nContracts, { n: num(top[k].n) })}</span></span>
                      </a>
                    ))}
                  </div>
                  {top.length > 3 && (
                    <div className="v3-tree-row rest" style={vars({ "--w": top.slice(3).reduce((a, x) => a + x.weight, 0) })}>
                      {top.slice(3).map((x, i) => (
                        <a key={x.href} className="v3-blk bn blk" href={L(x.href)} style={vars({ "--w": x.weight, background: SMALL_BG[i] })}>
                          <span className="no">0{i + 4}</span>
                          <span className="grp"><span className="val">{x.value}</span><span className="nm">{x.name}</span><span className="cn">{fmt(t.winners.nContracts, { n: num(x.n) })}</span></span>
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
            <div className="v3-win-legend"><span>{t.winners.legend}</span><div>{w.report && <><a href={L(w.report.href)} className="mintlink">{fmt(t.winners.readReport, { month: w.report.month })}</a>{" · "}</>}<a href={L(H.winners)} className="mintlink">{t.winners.seeMost}</a></div></div>

          </div>
        </section>
        )}

        <section className="v3-wrap v3-also">
          <h2 className="v3-h3">{t.also.title}</h2>
          <div className="v3-also-grid">
            {t.also.items.map((x, i) => (
              <a key={x.name} href={L(ALSO_HREF[i])}><b>{x.name}</b><span>{x.what}</span></a>
            ))}
          </div>
        </section>

        <section>
          <div className="v3-wrap v3-plans-in">
            <div className="v3-plans-head">
              <h2 className="v3-h2">{t.plans.title}</h2>
              <p>{t.plans.sub.split("{currency}").map((part, i) => (i ? <span key={i}>{known ? currency : <Sk w="3ch" />}{part}</span> : part))}</p>
            </div>
            <div className="v3-plans">
              {plans.map((p) => (
                <div key={p.name} className={`v3-plan lift${p.pop ? " pop" : ""}`}>
                  <div className="nm"><h3>{p.name}</h3>{p.pop && <span>{t.plans.popular}</span>}</div>
                  <div className="pr"><b>{p.price ?? <Sk w={p.w} />}</b><span>{p.per ?? <Sk w="9em" />}</span></div>
                  <div className="wh"><span className="d">{p.what}</span><span className="m">{p.whatShort}</span></div>
                  <a href={L(p.href)} className="v3-pill">{p.cta}</a>
                </div>
              ))}
            </div>
            {showFounding && (
              <div className="v3-f500">
                <div><span className="t">{t.plans.founding}</span><span className="b">{known ? fmt(t.plans.foundingBody, { price: foundingMoney() }) : <Sk w="22em" />}</span></div>
                <div className="r">{spots && <span className="mono"><span className="d">{spots.d}</span><span className="m">{spots.m}</span></span>}<a href={L(H.founding)}>{t.plans.foundingCta}</a></div>
              </div>
            )}
          </div>
        </section>

        <section className="v3-final">
          <div className="v3-wrap v3-final-in">
            {pub != null && <div className="big" aria-hidden>{num(pub)}</div>}
            <div>
              <h2>
                {pub != null ? <><span className="v3-sr">{num(pub)} </span>{t.cta.line1}</> : t.cta.line1NoCount}
                {data.closing7 != null && <><br /> {fmt(t.cta.line2, { n: num(data.closing7) })}</>}
              </h2>
              <div className="note">{t.cta.note}</div>
            </div>
            <div className="btns">
              <button type="button" onClick={openModal} className="v3-pill ink">{t.cta.join}</button>
              <a href={L(H.postRfp)} onClick={pickPm} className="v3-pill out">{t.cta.post}</a>
            </div>
          </div>
        </section>

        {digest && <div className="v3-wrap">{digest}</div>}

        {(data.browse.combos.length > 0 || data.browse.newest.length > 0) && (
          <section className="v3-browse">
            <div className="v3-wrap v3-browse-in">
              {data.browse.combos.length > 0 && (
                <div>
                  <h2>{t.browse.heading}</h2>
                  <ul className="two">
                    {data.browse.combos.map((c) => (
                      <li key={c.href}><a href={L(c.href)}>{c.label}</a> <span className="c">({num(c.n)})</span></li>
                    ))}
                  </ul>
                  <div className="more"><a href={L(H.trades)}>{t.browse.allTrades}</a><a href={L(H.regions)}>{t.browse.allRegions}</a></div>
                </div>
              )}
              {data.browse.newest.length > 0 && (
                <div>
                  <h2>{t.browse.newest}</h2>
                  <ul>
                    {data.browse.newest.map((r) => (
                      <li key={r.href}><a href={L(r.href)}>{r.title}</a>{r.city && <span className="c"> · {r.city}</span>}</li>
                    ))}
                  </ul>
                  <div className="more"><a href={L(H.rfps)}>{t.browse.allRfps}</a></div>
                </div>
              )}
            </div>
          </section>
        )}
      </main>

      <V3Footer t={t} lang={lang} />

      {pastHero && (
      <div className="v3-sticky">
        <div className="v3-sticky-in">
          <span className="v3-dot d" style={{ width: 10, height: 10 }} />
          <div className="txt">
            <b>{pub != null ? <><span className="d">{fmt(t.sticky.open, { n: num(pub), where: here })}</span><span className="m">{fmt(t.sticky.openShort, { n: num(pub), where: here })}</span></> : t.stats.loading}</b>{" "}
            {data.closing7 != null && <span className="c"><span className="d">{fmt(t.sticky.closing, { n: num(data.closing7) })}</span><span className="m">{fmt(t.sticky.closingShort, { n: num(data.closing7) })}</span></span>}
          </div>
          <a href={L(H.postRfp)} onClick={pickPm} className="v3-pill ghost">{t.sticky.post}</a>
          <button type="button" onClick={openModal} className="v3-pill mint"><span className="d">{t.sticky.cta}</span><span className="m">{t.sticky.ctaShort}</span></button>
        </div>
      </div>
      )}

      {showToast && toastItem && (
        <div className="v3-toast" role="status">
          <button type="button" className="x" onClick={() => setToastOff(true)} aria-label={t.toast.dismiss}><CloseX size={12} stroke="#4B4F6B" /></button>
          <div className="tg" style={{ color: toastItem.color }}><span />{toastItem.tag}</div>
          <div className="ti">{toastItem.title}</div>
          <a href={L(H.joinTrade)} onClick={openModalLink}>{t.toast.cta}</a>
        </div>
      )}

      {modal && (
        <div className="v3-overlay" onClick={(e) => e.target === e.currentTarget && closeModal()}>
          <div ref={dialogRef} className="v3-dialog" role="dialog" aria-modal="true" aria-labelledby="v3-dlg-title">
            <button type="button" className="x" onClick={closeModal} aria-label={t.popup.close}><CloseX size={16} stroke="#1B1D3A" /></button>
            <div className="v3-dlg-side">
              <Image src={IMG.roofing} alt="" fill sizes="400px" className="v3-img" />
              <span className="sh" />
              {pub != null && <span className="n">{num(pub)}</span>}
              <span className="l">{pub != null ? t.popup.open : t.stats.loading}</span>
              <span className="ls">
                {data.closing7 != null && <span>{fmt(t.popup.closing, { n: num(data.closing7) })}</span>}
                {data.trades != null && data.regions != null && <span>{fmt(t.popup.tradesRegions, { trades: num(data.trades), regions: num(data.regions) })}</span>}
                <span>{t.popup.sources}</span>
              </span>
            </div>
            <div className="v3-dlg-body">{popupBody}</div>
          </div>
        </div>
      )}
    </div>
  );
}
