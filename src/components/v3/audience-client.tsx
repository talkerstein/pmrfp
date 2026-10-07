"use client";

import { useState } from "react";
import { useUsdPerCad, useVisitorMarket } from "@/components/geo/use-visitor-market";
import { PRICING } from "@/lib/site";
import { toUsd } from "@/lib/markets";
import { signUpHrefForPlan } from "@/lib/billing/plan-intent";
import { localizePath, type Locale } from "@/i18n/config";
import { fmt, formatNumber } from "@/i18n/format";
import type { Messages } from "@/i18n/dictionaries";
import type { V3OpenCard } from "./data";

type A = Messages["v3Pages"]["audience"];

/** Accordion: one question open at a time, the first open by default (as designed). */
export function AudienceFaq({ items }: { items: { q: string; a: string }[] }) {
  const [open, setOpen] = useState(0);
  return (
    <div className="a-faq-list">
      {items.map((f, i) => {
        const on = open === i;
        const id = `a-faq-${i}`;
        return (
          <div key={f.q} className={`a-q${on ? " on" : ""}`}>
            <h3 style={{ margin: 0, font: "inherit" }}>
              <button type="button" aria-expanded={on} aria-controls={id} onClick={() => setOpen(on ? -1 : i)}>
                <span className="qn">{`0${i + 1}`.slice(-2)}</span>
                <span className="qt">{f.q}</span>
                <span className="ic" aria-hidden>
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke={on ? "#FFFFFF" : "#282B59"} strokeWidth="2.5"><path d="M7 1.5v11M1.5 7h11" /></svg>
                </span>
              </button>
            </h3>
            <div id={id} hidden={!on} className={on ? "ans fadeup" : "ans"}>{f.a}</div>
          </div>
        );
      })}
    </div>
  );
}

/** The visitor's market's next three closers (Canada until we know). */
export function AudienceOpen({ cards, t, total, lang }: { cards: { CA: V3OpenCard[]; US: V3OpenCard[] }; t: A; total: string; lang: Locale }) {
  const market = useVisitorMarket();
  const list = market === "US" && cards.US.length === 3 ? cards.US : cards.CA;
  if (list.length < 3) return null;
  return (
    <>
      <div className="a-open-head">
        <h2>{t.openTitle}</h2>
        <a href={localizePath("/rfps", lang)}>{fmt(t.seeAll, { n: total })}</a>
      </div>
      <div className="a-open">
        {list.map((r) => (
          <a key={r.href} className="a-card blk" href={localizePath(r.href, lang)}>
            <span className="top">
              <span className="date"><span className="m">{r.mon}</span><span className="d">{r.day}</span></span>
              <span className="left">{r.left}</span>
            </span>
            <span className="tg">{r.tag}</span>
            <span className="ti">{r.title}</span>
            {r.src && <span className="src">{fmt(t.publicTender, { src: r.src })}</span>}
          </a>
        ))}
      </div>
    </>
  );
}

/**
 * Pricing band. One currency per visitor: CAD in Canada, USD in the U.S.,
 * and no seller price at all until we know which (the slot keeps its height).
 */
export function AudiencePrice({
  t,
  lang,
  side,
  sellerSub,
  cta,
  founding,
}: {
  t: A;
  lang: Locale;
  side: "seller" | "buyer";
  sellerSub: string;
  cta: { label: string; href: string };
  founding: { name: string; label: string; badge: string } | null;
}) {
  const market = useVisitorMarket();
  const rate = useUsdPerCad();
  const L = (p: string) => localizePath(p, lang);
  const known = market != null;
  const us = market === "US";
  const currency = us ? "USD" : "CAD";
  const money = (cad: number) => {
    const n = formatNumber(us ? toUsd(cad, rate) : cad, lang);
    return lang === "fr" ? `${n} $` : `$${n}`;
  };
  const zero = lang === "fr" ? "0 $" : "$0";

  if (side === "buyer") {
    return (
      <section className="a-price">
        <div className="wrap a-price-in">
          <div className="a-price-main">
            <div className="eb" style={{ color: "inherit" }}>{t.priceLabel}</div>
            <div className="a-price-big"><span className="b">{zero}</span><span className="u">{t.buyerUnit}</span></div>
            <h2>{t.buyerHead}</h2>
            <p>{t.buyerSub}</p>
            <div className="a-price-ctas">
              <a href={L(cta.href)} className="btn ink lg">{cta.label}</a>
            </div>
          </div>
          <div className="a-plans">
            <div className="a-plan pro" style={{ marginLeft: 0 }}>
              <div className="row"><span className="nm">{t.freeName}</span><span className="tg">{t.buyerTag}</span></div>
              <div className="pr"><b>{zero}</b><span>{t.buyerPer}</span></div>
              <div className="wh">{t.buyerWhat}</div>
            </div>
          </div>
        </div>
      </section>
    );
  }

  const pro = known ? money(PRICING.proAnnual) : null;
  return (
    <section className="a-price">
      <div className="wrap a-price-in">
        <div className="a-price-main">
          <div className="eb" style={{ color: "inherit" }}>{t.priceLabel}</div>
          <div className="a-price-big" aria-busy={!known}>
            {pro && <><span className="b">{pro}</span><span className="u">{fmt(t.perYear, { currency })}</span></>}
          </div>
          <h2>{pro ? fmt(t.sellerHead, { price: pro }) : " "}</h2>
          <p>{sellerSub}</p>
          <div className="a-price-ctas">
            <a href={L(signUpHrefForPlan("pro", "annual"))} className="btn ink lg">{t.startPro}</a>
            <a href={L("/pricing")} className="lnk">{t.comparePlans} →</a>
          </div>
        </div>
        <div className="a-plans">
          <div className="a-plan">
            <div className="row"><span className="nm">{t.freeName}</span><span className="tg">{t.freeTag}</span></div>
            <div className="pr">{known && <><b>{zero}</b><span>{t.forever}</span></>}</div>
            <div className="wh">{t.freeWhat}</div>
          </div>
          <div className="a-plan pro">
            <div className="row"><span className="nm">{t.proName}</span><span className="tg">{t.proTag}</span></div>
            <div className="pr">{pro && <><b>{pro}</b><span>{fmt(t.proPer, { currency, monthly: money(PRICING.proMonthly) })}</span></>}</div>
            <div className="wh">{t.proWhat}</div>
          </div>
          {founding && (
            <a href={L("/founding-500")} className="a-found">
              <span><b>{founding.name}</b> {founding.label}</span>
              <span className="bdg">{founding.badge}</span>
            </a>
          )}
        </div>
      </div>
    </section>
  );
}
