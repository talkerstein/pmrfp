"use client";

import "./home-v3.css";
import Image from "next/image";
import { useCallback, useEffect, useRef, useState, useTransition, type CSSProperties, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { setMarket, useUsdPerCad, useVisitorMarket } from "@/components/geo/use-visitor-market";
import { joinRegionalWaitlistAction } from "@/lib/waitlist/actions";
import { signUpHrefForPlan } from "@/lib/billing/plan-intent";
import { PRICING } from "@/lib/site";
import { FOUNDING } from "@/lib/founding/config";
import { toUsd } from "@/lib/markets";
import { localizePath, type Locale } from "@/i18n/config";
import { fmt, formatNumber } from "@/i18n/format";
import type { Messages } from "@/i18n/dictionaries";

/* ------------------------------------------------------------------ data */

export type V3Messages = Messages["homeV3"];
export interface V3Closing { mon: string; day: string; tag: string; left: string; title: string; href: string; soon: boolean }
export interface V3Trade { name: string; n: number; href: string }
export interface V3Data {
  open: number;
  closing7: number;
  trades: number;
  regions: number;
  /** Founding 500 spots left; null when the count can't be read. */
  foundingLeft: number | null;
  big: V3Trade & { img: string };
  tiles: (V3Trade & { img: string })[];
  chips: V3Trade[];
  tradeOptions: { value: string; label: string }[];
  areaOptions: { label: string; region?: string; country?: "ca" | "us" }[];
  closingCa: V3Closing[];
  closingUs: V3Closing[];
  ticker: { tag: string; title: string; when: string; href: string }[];
  toast: { tag: string; color: string; title: string }[];
  alertTrade: string;
  alerts: { where: string; title: string; href: string }[];
  winners: {
    repeat: number;
    contracts: number;
    value: string;
    top: { name: string; n: number; value: string; weight: number; href: string; most: boolean }[];
    most: { name: string; n: number };
  };
  awards: { trade: string; value: string; title: string; buyer: string; winner: string; date: string; href: string }[];
  /** Crawlable links to trade × city pages and fresh tenders (SEO). */
  browse: { combos: { href: string; label: string; n: number }[]; newest: { href: string; title: string; city: string | null }[] };
}

/* ------------------------------------------------------------------ constants */

const IMG = {
  mark: "/brand/mark-white.svg",
  electrical: "/images/photos/electrical-panel-testing.webp",
  pmLobby: "/images/home/pm-lobby.webp",
  retail: "/images/photos/retail-power-centre-aerial.webp",
  condo: "/images/photos/condo-midrise.webp",
  keys: "/images/photos/keys-in-door.webp",
  warehouse: "/images/photos/warehouse-loading-docks.webp",
  crew: "/images/photos/site-crew-deck.webp",
  roofing: "/images/home/hero-roofing.webp",
  hvac: "/images/home/trade-hvac.webp",
  cleaning: "/images/home/trade-cleaning.webp",
};

const H = {
  home: "/",
  founding: "/founding-500",
  rfps: "/rfps",
  directory: "/directory",
  trades: "/trades",
  regions: "/regions",
  winners: "/contract-winners",
  jobs: "/jobs",
  postJob: "/jobs/post",
  forum: "/forum",
  pricing: "/pricing",
  marketplace: "/marketplace",
  talent: "/talent",
  talentSignUp: "/sign-up?role=talent",
  signIn: "/sign-in",
  joinTrade: "/sign-up?role=trade",
  postRfp: "/sign-up?role=property_manager",
  landlord: "/sign-up?role=landlord",
  realtor: "/sign-up?role=real_estate_agent",
  supplier: "/sign-up?role=supplier",
  suppliers: "/suppliers",
  gcPackage: "/gc-packages/new",
  forRealEstate: "/for/real-estate",
  advertise: "/advertise",
  proAnnual: signUpHrefForPlan("pro", "annual"),
  proMonthly: signUpHrefForPlan("pro", "monthly"),
  seo: signUpHrefForPlan("seo", "annual"),
  featured: signUpHrefForPlan("featured", "annual"),
};

const AUD_IMG = [IMG.electrical, IMG.pmLobby, IMG.retail, IMG.condo, IMG.keys, IMG.warehouse, IMG.crew];
const AUD_HREF = [H.joinTrade, H.postRfp, H.landlord, H.postRfp, H.realtor, H.supplier, H.gcPackage];
const DECK = [IMG.roofing, IMG.hvac, IMG.electrical, IMG.cleaning];
const TF_D = ["translate(0px,0px) rotate(-3deg)", "translate(34px,10px) rotate(5deg)", "translate(60px,24px) rotate(11deg)", "translate(-22px,16px) rotate(-10deg)"];
const TF_M = ["translate(0px,0px) rotate(-3deg)", "translate(30px,8px) rotate(5deg)", "translate(54px,20px) rotate(11deg)", "translate(-20px,14px) rotate(-10deg)"];
const PAL = [["#91F2CF", "#1B1D3A"], ["#282B59", "#FFFFFF"], ["#4A4E85", "#FFFFFF"], ["#FFFFFF", "#1B1D3A"]];
/** Forum bubbles: desktop x/y, mobile x/y, desktop font size, palette. */
const BUBBLES = [
  ["0%", "4%", "0%", "2%", 19, 0], ["36%", "0%", "34%", "0%", 15, 1], ["74%", "4%", "68%", "6%", 15, 2], ["50%", "24%", "40%", "24%", 16, 3], ["4%", "34%", "0%", "30%", 15, 2],
  ["30%", "48%", "22%", "50%", 18, 0], ["74%", "50%", "70%", "48%", 15, 1], ["0%", "70%", "0%", "72%", 15, 3], ["24%", "78%", "28%", "78%", 15, 1], ["62%", "76%", "72%", "76%", 17, 0],
] as const;
const FACES = [["#EEEEF8", "#282B59", "#91F2CF"], ["#DDFBF0", "#282B59", "#1B1D3A"], ["#282B59", "#FFFFFF", "#91F2CF"], ["#91F2CF", "#282B59", "#1B1D3A"], ["#EEEEF8", "#4A4E85", "#282B59"]].map((f) => ({ bg: f[0], fg: f[1], hat: f[2] }));
const SMALL_BG = ["#4A4E85", "#444879", "#3D416F", "#363A66", "#30335D"];
const BARS = [{ h: 16, c: "#4A4E85" }, { h: 26, c: "#5A6394" }, { h: 36, c: "#3E9F85" }, { h: 46, c: "#5FD3AC" }, { h: 56, c: "#91F2CF" }];
const SPOTLIGHT_CAD = 149;
const PARTNER_CAD = 399;

const reducedMotion = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
const vars = (v: Record<string, string | number>) => v as CSSProperties;

/* ------------------------------------------------------------------ shared bits */

const Check = ({ size = 22 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 22 22" fill="none" stroke="#1B1D3A" strokeWidth="2.5" aria-hidden><path d="M4 11.5l4.5 4.5L18 6.5" /></svg>
);
const SmallCheck = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="#1B1D3A" strokeWidth="2.5" aria-hidden><path d="M2.5 7.5l3 3 6-6.5" /></svg>
);
const CloseX = ({ size, stroke }: { size: number; stroke: string }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke={stroke} strokeWidth="2.5" aria-hidden><path d="M3 3l10 10M13 3L3 13" /></svg>
);
function Face({ f }: { f: (typeof FACES)[number] }) {
  return (
    <svg viewBox="0 0 44 48" fill={f.fg} aria-hidden>
      <circle cx="22" cy="18" r="10" />
      <path d="M2 48c2-12 10-17 20-17s18 5 20 17z" />
      <path d="M10 14c0-8 5-12 12-12s12 4 12 12z" fill={f.hat} />
      <rect x="8" y="13" width="28" height="3" rx="1.5" fill={f.hat} />
    </svg>
  );
}
/** Fixed-width placeholder while the visitor's market (and so the currency) is unknown. */
const Sk = ({ w }: { w: string }) => <span className="v3-sk" aria-hidden style={{ width: w }} />;

/* ------------------------------------------------------------------ component */

export function HomeV3({ data, t, lang, dataSources }: { data: V3Data; t: V3Messages; lang: Locale; dataSources?: { live: string[]; fallback: string[] } }) {
  const router = useRouter();
  const market = useVisitorMarket();
  const rate = useUsdPerCad();
  const L = (p: string) => localizePath(p, lang);
  const num = (n: number) => (lang === "en" ? String(n) : formatNumber(n, lang));

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

  const [active, setActive] = useState(0);
  const [tick, setTick] = useState(0);
  const user = useRef(false);
  const [deck, setDeck] = useState(0);
  const [modal, setModal] = useState(false);
  const seen = useRef(false);
  const lastFocus = useRef<HTMLElement | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const [sent, setSent] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [toastOn, setToastOn] = useState(false);
  const [toastOff, setToastOff] = useState(false);
  const [toastIdx, setToastIdx] = useState(0);
  const [menu, setMenu] = useState(false);

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
    const still = reducedMotion();
    const timer = setInterval(() => {
      if (user.current || still) return;
      setActive((a) => (a + 1) % 7);
      setTick((x) => x + 1);
    }, 4000);
    const timer2 = setInterval(() => {
      if (still) return;
      setDeck((d) => (d + 1) % 4);
    }, 2800);
    const t3 = setTimeout(() => {
      if (!seen.current) {
        seen.current = true;
        setModal(true);
      }
    }, 9000);
    const t5 = setTimeout(() => setToastOn(true), 4000);
    const t4 = setInterval(() => setToastIdx((x) => x + 1), 7000);
    // Exit intent: desktop only (cursor leaves through the top of the viewport).
    const onLeave = (e: MouseEvent) => {
      if (e.clientY <= 0 && !seen.current && window.matchMedia("(min-width: 1024px)").matches) {
        seen.current = true;
        setModal(true);
      }
    };
    document.addEventListener("mouseleave", onLeave);
    return () => {
      clearInterval(timer);
      clearInterval(timer2);
      clearInterval(t4);
      clearTimeout(t3);
      clearTimeout(t5);
      document.removeEventListener("mouseleave", onLeave);
    };
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

  const pick = (i: number) => {
    user.current = true;
    if (i !== active) {
      setActive(i);
      setTick((x) => x + 1);
    }
  };

  const aud = t.audience.map((a, i) => ({
    ...a,
    img: AUD_IMG[i],
    href: AUD_HREF[i],
    fact: fmt(a.fact, { n: num(i === 0 ? data.open : data.regions) }),
  }));
  const word = aud[active].word;
  const swapClass = tick % 2 ? "swapb" : "swapa";
  const closing = market === "US" && data.closingUs.length ? data.closingUs : data.closingCa;
  const ticker = data.ticker.concat(data.ticker);
  const toastItem = data.toast.length ? data.toast[toastIdx % data.toast.length] : null;
  const showToast = toastOn && !toastOff && !modal && toastItem != null;
  const showFounding = data.foundingLeft !== 0;
  const spots = data.foundingLeft == null ? null : fmt(t.founding.spots, { n: num(data.foundingLeft) });
  const spotsShort = data.foundingLeft == null ? null : fmt(t.founding.spotsShort, { n: num(data.foundingLeft) });
  const w = data.winners;
  const top = w.top;
  const bigwords = [
    fmt(t.platform.bigwords.open, { n: num(data.open) }),
    fmt(t.platform.bigwords.trades, { n: num(data.trades) }),
    fmt(t.platform.bigwords.regions, { n: num(data.regions) }),
    fmt(t.platform.bigwords.awarded, { value: w.value }),
  ];
  const cards = DECK.map((img, i) => {
    const slot = (i - deck + 4) % 4;
    return { no: `0${i + 1}`, cap: t.platform.work.steps[i], img, slot, z: 4 - slot, pick: () => setDeck(i) };
  });
  const plans = [
    { ...t.plans.items[0], price: known ? (lang === "fr" ? "0 $" : "$0") : null, per: t.plans.forever, href: H.joinTrade, pop: false, w: "3ch" },
    { ...t.plans.items[1], price: known ? money(PRICING.seoAnnual) : null, per: known ? fmt(t.plans.perYear, { currency }) : null, href: H.seo, pop: false, w: "4ch" },
    { ...t.plans.items[2], price: known ? money(PRICING.proAnnual) : null, per: known ? fmt(t.plans.perYearOr, { currency, monthly: money(PRICING.proMonthly) }) : null, href: H.proAnnual, pop: true, w: "4ch" },
    { ...t.plans.items[3], price: known ? money(PRICING.featuredAnnual) : null, per: known ? fmt(t.plans.perYear, { currency }) : null, href: H.featured, pop: false, w: "4ch" },
  ];

  const onSearch = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const q = new URLSearchParams();
    const trade = String(f.get("trade") ?? "");
    if (trade) q.set("category", trade);
    const area = data.areaOptions[Number(f.get("area") ?? 0)];
    if (area?.region) q.set("region", area.region);
    if (area?.country) q.set("country", area.country);
    const qs = q.toString();
    router.push(L(qs ? `/rfps?${qs}` : "/rfps"));
  };

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFormError(null);
    const f = new FormData(e.currentTarget);
    const area = data.areaOptions[Number(f.get("area") ?? 0)];
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

  const goMarket = (m: "CA" | "US") => {
    if (m === (market ?? "CA")) return;
    setMarket(m);
    router.refresh();
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
      {data.areaOptions.map((o, i) => (
        <option key={o.label} value={i}>{t.areas[o.label] ?? o.label}</option>
      ))}
    </select>
  );
  const marketSwitch = (
    <div role="group" aria-label={t.nav.market} className="v3-market">
      {(["CA", "US"] as const).map((m) => (
        <button key={m} type="button" aria-pressed={(market ?? "CA") === m} onClick={() => goMarket(m)}>{m}</button>
      ))}
    </div>
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
      <div className="fine">{t.popup.note} <a href={L(H.postRfp)}>{t.popup.post}</a></div>
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

      <div className="v3-top">
        {showFounding && (
          <a href={L(H.founding)} className="v3-found">
            <b><span className="d">{t.founding.bar}</span><span className="m">{t.founding.barShort}</span></b>
            {spots && <span className="badge">{spots}</span>}
            <span className="u">{t.founding.claim}</span>
          </a>
        )}
        <header>
          <div className="v3-hdr">
            <a href={L(H.home)} aria-label={t.nav.home} className="v3-logo">
              {mark(32)}
              <span>pmrfp.com</span>
            </a>
            <nav id="v3-nav" aria-label={t.nav.main} className={`v3-nav${menu ? " open" : ""}`}>
              <div className="v3-nav-links">
                <a href={L(H.rfps)}>{t.nav.rfps}</a>
                <a href={L(H.directory)}>{t.nav.directory}</a>
                <a href={L(H.winners)}>{t.nav.winners}</a>
                <a href={L(H.jobs)}>{t.nav.jobs}</a>
                <a href={L(H.forum)}>{t.nav.forum}</a>
                <a href={L(H.pricing)}>{t.nav.pricing}</a>
              </div>
              {marketSwitch}
              <a href={L(H.signIn)}>{t.nav.signIn}</a>
            </nav>
            <a href={L(H.joinTrade)} onClick={openModalLink} className="v3-join">
              <span className="d">{t.nav.join}</span><span className="m">{t.nav.joinShort}</span>
            </a>
            <button type="button" className="v3-burger" aria-label={menu ? t.nav.closeMenu : t.nav.openMenu} aria-expanded={menu} aria-controls="v3-nav" onClick={() => setMenu((m) => !m)}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2" aria-hidden><path d={menu ? "M5 5l14 14M19 5L5 19" : "M3 7h18M3 12h18M3 17h18"} /></svg>
            </button>
          </div>
        </header>
      </div>

      <main id="main" tabIndex={-1} style={{ outline: "none" }}>
        <div className="v3-top">
          <section>
            <div className="v3-hero">
              <div className="v3-hero-main">
                <div className="v3-hero-eyebrow">
                  <span className="v3-dot" />
                  <span className="d">{fmt(t.hero.eyebrow, { n: num(data.open) })}</span>
                  <span className="m">{fmt(t.hero.eyebrowShort, { n: num(data.open) })}</span>
                </div>
                <h1 className="v3-h1">
                  {t.hero.title} <span key={tick} className={`w ${swapClass}`} aria-live="off">{word}.</span>
                </h1>
              </div>
              <div className="v3-hero-side">
                <p className="v3-hero-sub"><span className="d">{t.hero.sub}</span><span className="m">{t.hero.subShort}</span></p>
                <div className="v3-hero-ctas">
                  <button type="button" onClick={openModal} className="v3-pill mint">{t.hero.join}</button>
                  <a href={L(H.postRfp)} className="v3-pill ghost">{t.hero.post}</a>
                </div>
              </div>
            </div>

            <div className="v3-aud-wrap">
              <div className="v3-aud" role="group" aria-label={t.hero.audience}>
                {aud.map((p, i) => {
                  const on = i === active;
                  const no = `0${i + 1}`;
                  return (
                    <div key={p.label} className={`v3-tile${on ? " on" : ""}`} onMouseEnter={() => pick(i)}>
                      <Image src={p.img} alt="" fill sizes="(max-width: 1023px) 100vw, 680px" className="v3-img" priority={i === 0} />
                      <div className="v3-tile-shade" />
                      {!on && (
                        <button type="button" onClick={() => pick(i)} aria-expanded={false} className="v3-tile-btn">
                          <span className="grp"><span className="no">{no}</span><span className="lab">{p.label}</span></span>
                          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="#91F2CF" strokeWidth="2.5" aria-hidden><path d="M4 7l5 5 5-5" /></svg>
                        </button>
                      )}
                      {on && (
                        <div className="v3-tile-body fadeup">
                          <div className="k">{no} · {p.label}</div>
                          <div className="h">{p.head}</div>
                          <div className="p"><span className="d">{p.desc}</span><span className="m">{p.descShort}</span></div>
                          <div className="row">
                            <a href={L(p.href)} className="v3-pill mint"><span className="d">{p.cta}</span><span className="m">{p.ctaShort}</span> →</a>
                            <span className="fact">{p.fact}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </section>

          <div className="v3-ticker">
            <div className="marquee">
              {ticker.map((k, i) => (
                <a key={i} href={L(k.href)} aria-hidden={i >= data.ticker.length || undefined} tabIndex={i >= data.ticker.length ? -1 : undefined}>
                  <span className="tg">{k.tag}</span>
                  <span className="tt">{k.title}</span>
                  <span className="tw">{k.when}</span>
                </a>
              ))}
            </div>
          </div>
        </div>

        <section className="v3-wrap v3-stats" aria-label={t.stats.open}>
          {([[data.open, t.stats.open], [data.closing7, t.stats.closing], [data.trades, t.stats.trades], [data.regions, t.stats.regions]] as const).map(([n, l]) => (
            <div key={l}><div className="n">{num(n)}</div><div className="l">{l}</div></div>
          ))}
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
                <span className="n">{num(data.big.n)}</span>
                <span className="row"><span className="nm">{data.big.name}</span><span className="on">{t.trades.openNow}</span></span>
              </span>
            </a>
            {data.tiles.map((x) => (
              <a key={x.name} className="v3-tt zoom" href={L(x.href)}>
                <Image src={x.img} alt="" fill sizes="(max-width: 1023px) 50vw, 230px" className="v3-img" />
                <span className="sh" />
                <span className="in"><span className="n">{num(x.n)}</span><span className="nm">{x.name}</span></span>
              </a>
            ))}
            <a className="v3-allt lift" href={L(H.trades)}>
              <svg width="36" height="36" viewBox="0 0 36 36" fill="none" stroke="#1B1D3A" strokeWidth="3" aria-hidden><path d="M9 27L27 9M12 9h15v15" /></svg>
              <span><span className="n">{num(data.trades)}</span><span className="nm">{t.trades.all}</span></span>
            </a>
          </div>

          <div className="v3-chips hs">
            {data.chips.map((c) => (
              <a key={c.name} className="v3-chip lift" href={L(c.href)}><b>{c.name}</b><span className="c">{num(c.n)}</span></a>
            ))}
          </div>
        </section>

        <section className="v3-wrap v3-closing">
          <div className="v3-row-head">
            <h2 className="v3-h3">{t.closing.title}</h2>
            <a href={L(H.rfps)}><span className="d">{fmt(t.closing.all, { n: num(data.open) })}</span><span className="m">{fmt(t.closing.allShort, { n: num(data.open) })}</span></a>
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

          <div className="v3-src">
            <h2 className="v3-h3">{t.sources.title}</h2>
            <div className="note">{t.sources.note}</div>
            <div className="v3-src-grid">
              {[
                ["CA", "CanadaBuys", t.sources.federal],
                ["US", "SAM.gov", t.sources.usFederal],
                ["TO", "City of Toronto", t.sources.municipal],
                ["QC", "Québec SEAO", t.sources.provincial],
                ["NS", "Nova Scotia", t.sources.provincial],
                ["YT", "Yukon", t.sources.territorial],
                ["NYC", "NYC City Record", t.sources.municipal],
                ["+", t.sources.pms, t.sources.private],
              ].map(([code, name, kind], i) => (
                <div key={code} style={{ background: i === 7 ? "#91F2CF" : "#FFFFFF" }}>
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
              <div className="v3-mailpill">
                {mark(30)}
                <span className="t">{t.pro.time}</span>
                <b><span className="d">{fmt(t.pro.matches, { n: num(data.alerts.length), trade: data.alertTrade })}</span><span className="m">{fmt(t.pro.matches, { n: num(data.alerts.length), trade: data.alertTrade.split(" / ")[0] })}</span></b>
              </div>
              {data.alerts.map((a, i) => (
                <a key={a.href + i} href={L(a.href)} className="v3-alert drop" style={vars({ marginLeft: `${i * 36}px`, animationDelay: `${i * 0.35}s`, "--im": `${i * 14}px` })}>
                  <div className="hd"><span className="w">{a.where}</span><span className="i">{i + 1}/{data.alerts.length}</span></div>
                  <div className="ti">{a.title}</div>
                  <div className="chips">{t.pro.chips.map((c) => <span key={c}><SmallCheck />{c}</span>)}</div>
                </a>
              ))}
              <div className="v3-pro-note">{t.pro.note}</div>
            </div>
          </div>
        </section>

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
            <div className="v3-win-legend"><span>{t.winners.legend}</span><a href={L(H.winners)} className="mintlink">{t.winners.seeMost}</a></div>

            <div className="v3-callout">
              <p>{fmt(t.winners.callout, { name: w.most.name, n: num(w.most.n) })}</p>
              <button type="button" onClick={openModal} className="v3-pill mint">{t.winners.calloutCta}</button>
            </div>
            <h3 className="v3-h3">{t.winners.justAwarded}</h3>
            <div className="v3-awards hs">
              {data.awards.map((a) => (
                <a key={a.href + a.title} className="v3-award blk" href={L(a.href)}>
                  <span className="hd"><span className="tr">{a.trade}</span><span className="dt">{a.date}</span></span>
                  <span className="val">{a.value}</span>
                  <span className="ti">{a.title}</span>
                  <span className="by">{t.winners.wonBy} <b>{a.winner}</b><span className="d"> · {a.buyer}</span></span>
                </a>
              ))}
            </div>
          </div>
        </section>

        <section className="v3-plat">
          <div className="v3-wrap v3-plat-in">
            <div className="v3-plat-head">
              <div>
                <div className="v3-eyebrow">{t.platform.eyebrow}</div>
                <h2 className="v3-h2">{t.platform.title} <span className="mk">{t.platform.titleMark}</span></h2>
              </div>
              <p>{t.platform.sub}</p>
            </div>

            <div className="v3-grid">
              <div className="v3-card white v3-work">
                <div className="v3-work-l">
                  <div className="v3-label">{t.platform.work.label}</div>
                  <h3 className="hd">{t.platform.work.head}</h3>
                  <div className="v3-steps">
                    {cards.map((c) => (
                      <button key={c.no} type="button" aria-pressed={c.slot === 0} onClick={c.pick}><span className="no">{c.no}</span><b>{c.cap}</b></button>
                    ))}
                  </div>
                  <a href={L(H.joinTrade)} className="v3-pill navy v3-work-cta">{t.platform.work.cta}</a>
                  <div className="v3-work-sub">{t.platform.work.sub}</div>
                </div>
                <div className="v3-deck" aria-hidden>
                  <div className="sun" />
                  {cards.map((c) => (
                    <div key={c.no} className="v3-pcard" style={vars({ "--td": TF_D[c.slot], "--tm": TF_M[c.slot], zIndex: c.z })}>
                      <div className="ph"><Image src={c.img} alt="" fill sizes="250px" className="v3-img" /></div>
                      <div className="cap"><b>{c.cap}</b><span>{c.no}/04</span></div>
                    </div>
                  ))}
                  <span className="v3-example">{t.platform.work.example}</span>
                </div>
              </div>

              <div className="v3-card ink v3-forum">
                <div className="v3-label mint">{t.platform.forum.label}</div>
                <h3 className="hd">{t.platform.forum.head}</h3>
                <div className="v3-bubbles" aria-hidden>
                  {BUBBLES.map((b, i) => (
                    <span key={i} className="float" style={vars({ "--xd": b[0], "--yd": b[1], "--xm": b[2], "--ym": b[3], "--fs": `${b[4]}px`, background: PAL[b[5]][0], color: PAL[b[5]][1], animationDuration: `${4 + (i % 4)}s`, animationDelay: `${-i * 0.7}s` })}>{t.platform.forum.bubbles[i]}</span>
                  ))}
                </div>
                <div className="v3-forum-foot">
                  <a href={L(H.forum)} className="v3-pill mint">{t.platform.forum.cta}</a>
                  <div aria-hidden>
                    <div className="v3-bars">
                      {BARS.map((b, i) => <span key={i} className="wave" style={vars({ "--h": `${b.h}px`, background: b.c, animationDelay: `${i * 0.2}s` })} />)}
                    </div>
                    <div className="v3-rank">{t.platform.forum.rank}</div>
                  </div>
                </div>
              </div>

              <div className="v3-card navy">
                <div className="v3-label mint">{t.platform.jobs.label}</div>
                <h3 className="hd">{t.platform.jobs.head} <span className="v3-roll-box" style={{ display: "block" }}>
                  <span className="roll" style={{ display: "flex" }}>
                    {[...t.platform.jobs.roll, t.platform.jobs.roll[0]].map((r, i) => <span key={i} aria-hidden={i > 0 || undefined}>{r}</span>)}
                  </span>
                </span></h3>
                <div className="v3-types">
                  {t.platform.jobs.types.map((x, i) => <span key={x} className={i === 4 ? "on" : undefined}>{x}</span>)}
                </div>
                <div className="v3-note">{t.platform.jobs.note}</div>
                <a href={L(H.postJob)} className="lk" style={{ marginTop: 14 }}>{t.platform.jobs.cta}</a>
              </div>

              <div className="v3-card white">
                <div className="v3-label">{t.platform.hiring.label}</div>
                <h3 className="hd">{t.platform.hiring.head}</h3>
                <div className="v3-faces">
                  {FACES.map((f, i) => (
                    <span key={i} className="v3-face" style={{ background: f.bg }}><Face f={f} /></span>
                  ))}
                  <span className="v3-avail"><span className="dot"><span className="ping" /><span /></span>{t.platform.hiring.available}</span>
                </div>
                <div className="v3-tags">
                  <span style={{ background: "#282B59", color: "#FFFFFF" }}>{t.platform.hiring.chips[0]}</span>
                  <span style={{ background: "#EEEEF8" }}>{t.platform.hiring.chips[1]}</span>
                  <span style={{ background: "#DDFBF0" }}>{t.platform.hiring.chips[2]}</span>
                </div>
                <div className="v3-note" style={{ marginTop: 14 }}>{t.platform.hiring.note}</div>
                <div className="v3-links2"><a href={L(H.talent)} className="lk">{t.platform.hiring.see}</a><a href={L(H.talentSignUp)} className="lk">{t.platform.hiring.profile}</a></div>
              </div>

              <a className="v3-card v3-photo zoom" href={L(H.suppliers)}>
                <Image src={IMG.warehouse} alt="" fill sizes="(max-width: 1023px) 100vw, 400px" className="v3-img" style={{ opacity: 0.6 }} />
                <span className="sh" />
                <span className="v3-ring spin" aria-hidden><svg width="96" height="96" viewBox="0 0 96 96"><defs><path id="v3circ" d="M48 48m-36 0a36 36 0 1 1 72 0a36 36 0 1 1 -72 0" /></defs><text fontFamily="IBM Plex Mono, monospace" fontSize="10.5" letterSpacing="2.2" fill="#91F2CF"><textPath href="#v3circ">{t.platform.suppliers.ring}</textPath></text></svg></span>
                <span className="rel v3-label mint">{t.platform.suppliers.label}</span>
                <span className="rel hd">{t.platform.suppliers.head}</span>
                <span className="sub m">{t.platform.suppliers.sub}</span>
                <span className="cta">{t.platform.suppliers.cta}</span>
              </a>

              <a className="v3-card v3-photo zoom" href={L(H.landlord)}>
                <Image src={IMG.retail} alt="" fill sizes="(max-width: 1023px) 100vw, 400px" className="v3-img" style={{ opacity: 0.6 }} />
                <span className="sh" />
                <span className="v3-freebadge">{t.platform.landlords.badge}</span>
                <span className="rel v3-label mint">{t.platform.landlords.label}</span>
                <span className="rel hd">{t.platform.landlords.head}</span>
                <span className="sub m">{t.platform.landlords.badge}.</span>
                <span className="cta">{t.platform.landlords.cta}</span>
              </a>

              <div className="v3-card mint">
                <div className="v3-label ink">{t.platform.realtors.label}</div>
                <h3 className="hd">{t.platform.realtors.head}</h3>
                <div className="v3-chat">
                  <div className="drop" style={{ animationDelay: "0s" }}>{t.platform.realtors.message}</div>
                  <div className="drop url" style={{ animationDelay: "0.6s" }}>{t.platform.realtors.link}</div>
                  <div className="drop tags" style={{ animationDelay: "1.2s" }}>{t.platform.realtors.tags.map((x) => <span key={x}>{x}</span>)}</div>
                </div>
                <div className="v3-note" style={{ marginTop: 14 }}>{known ? fmt(t.platform.realtors.price, { price: `${money(PRICING.realtorAnnual)} ${currency}` }) : <Sk w="14em" />}</div>
                <a href={L(H.forRealEstate)} className="lk" style={{ marginTop: 10 }}>{t.platform.realtors.cta}</a>
              </div>

              <a className="v3-card v3-photo zoom" href={L(H.forRealEstate)}>
                <Image src={IMG.keys} alt="" fill sizes="(max-width: 1023px) 100vw, 400px" className="v3-img" style={{ opacity: 0.65 }} />
                <span className="sh" />
                <span className="rel v3-label mint">{t.platform.residential.label}</span>
                <span className="rel hd">{t.platform.residential.head}</span>
                <span className="sub">{t.platform.residential.sub}</span>
                <span className="cta">{t.platform.residential.cta}</span>
              </a>

              <div className="v3-card navy v3-spon">
                <div className="bw" aria-hidden>
                  <div className="marquee" style={{ display: "flex", width: "max-content", animationDuration: "45s" }}>
                    {bigwords.concat(bigwords).map((x, i) => <span key={i} className={i % 2 ? "o" : undefined}>{x} ·</span>)}
                  </div>
                </div>
                <div className="v3-spon-in">
                  <div className="v3-spon-l">
                    <div className="v3-label mint">{t.platform.sponsor.label}</div>
                    <h3 className="hd">{t.platform.sponsor.head}</h3>
                    <a href={L(H.advertise)} className="v3-pill mint">{t.platform.sponsor.cta}</a>
                  </div>
                  <div className="v3-offer dk blk">
                    <div className="t">{t.platform.sponsor.spotlight}</div>
                    <div className="pr">{known ? <>{money(SPOTLIGHT_CAD)} <small>{fmt(t.platform.sponsor.perMonth, { currency })}</small></> : <Sk w="3.5ch" />}</div>
                    <div className="bd">{t.platform.sponsor.spotlightBody}</div>
                  </div>
                  <div className="v3-offer lt blk">
                    <div className="t">{t.platform.sponsor.partner}<span className="b">{t.platform.sponsor.partnerBadge}</span></div>
                    <div className="pr">{known ? <>{money(PARTNER_CAD)} <small>{fmt(t.platform.sponsor.perMonth, { currency })}</small></> : <Sk w="3.5ch" />}</div>
                    <div className="bd">{t.platform.sponsor.partnerBody}</div>
                  </div>
                </div>
              </div>
            </div>
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
                <div className="r">{spots && <span className="mono"><span className="d">{spots}</span><span className="m">{spotsShort}</span></span>}<a href={L(H.founding)}>{t.plans.foundingCta}</a></div>
              </div>
            )}
          </div>
        </section>

        <section className="v3-final">
          <div className="v3-wrap v3-final-in">
            <div className="big" aria-hidden>{num(data.open)}</div>
            <div>
              <h2><span className="v3-sr">{num(data.open)} </span>{t.cta.line1}<br /> {fmt(t.cta.line2, { n: num(data.closing7) })}</h2>
              <div className="note">{t.cta.note}</div>
            </div>
            <div className="btns">
              <button type="button" onClick={openModal} className="v3-pill ink">{t.cta.join}</button>
              <a href={L(H.postRfp)} className="v3-pill out">{t.cta.post}</a>
            </div>
          </div>
        </section>

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

      <footer className="v3-foot">
        <div className="v3-wrap v3-foot-in">
          <div className="v3-foot-grid">
            <div>
              <div className="brand">{mark(30)}<span>pmrfp.com</span></div>
              <div className="txt">{t.footer.about}</div>
              <div className="txt">{t.footer.address}</div>
            </div>
            {(
              [
                [t.footer.find, [[t.footer.rfps, H.rfps], [t.footer.directory, H.directory], [t.footer.winners, H.winners], [t.footer.jobs, H.jobs], [t.footer.marketplace, H.marketplace], [t.footer.forum, H.forum]]],
                [t.footer.who, [[t.footer.trades, "/for/tradesmen"], [t.footer.pms, "/for-property-managers"], [t.footer.landlords, H.landlord], [t.footer.condos, "/for/condo-boards"], [t.footer.realEstate, H.forRealEstate], [t.footer.suppliers, "/for/suppliers"], [t.footer.builders, "/for/builders"]]],
                [t.footer.company, [[t.footer.about2, "/about"], [t.footer.advertise, H.advertise], [t.footer.spotlight, "/spotlight"], [t.footer.contact, "/contact"], [t.footer.terms, "/terms"], [t.footer.privacy, "/privacy"]]],
              ] as const
            ).map(([title, links]) => (
              <nav key={title} aria-label={title} className="v3-foot-col">
                <h2>{title}</h2>
                {links.map(([l, h]) => <a key={l} href={L(h)}>{l}</a>)}
              </nav>
            ))}
          </div>
          <div className="legal">{t.footer.legal}</div>
        </div>
      </footer>

      <div className="v3-sticky">
        <div className="v3-sticky-in">
          <span className="v3-dot d" style={{ width: 10, height: 10 }} />
          <div className="txt">
            <b><span className="d">{fmt(t.sticky.open, { n: num(data.open) })}</span><span className="m">{fmt(t.sticky.openShort, { n: num(data.open) })}</span></b>{" "}
            <span className="c"><span className="d">{fmt(t.sticky.closing, { n: num(data.closing7) })}</span><span className="m">{fmt(t.sticky.closingShort, { n: num(data.closing7) })}</span></span>
          </div>
          <a href={L(H.postRfp)} className="v3-pill ghost">{t.sticky.post}</a>
          <button type="button" onClick={openModal} className="v3-pill mint"><span className="d">{t.sticky.cta}</span><span className="m">{t.sticky.ctaShort}</span></button>
        </div>
      </div>

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
              <span className="n">{num(data.open)}</span>
              <span className="l">{t.popup.open}</span>
              <span className="ls">
                <span>{fmt(t.popup.closing, { n: num(data.closing7) })}</span>
                <span>{fmt(t.popup.tradesRegions, { trades: num(data.trades), regions: num(data.regions) })}</span>
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
