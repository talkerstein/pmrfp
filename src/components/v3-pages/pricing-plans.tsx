"use client";

import { annualSaving } from "@/lib/pricing/annual";
import { useState, type ReactNode } from "react";
import { PRICING } from "@/lib/site";
import { signUpHrefForPlan } from "@/lib/billing/plan-intent";
import { localizePath, type Locale } from "@/i18n/config";
import { fmt } from "@/i18n/format";
import { Sk, useMoney } from "./price";

export interface PricingPlansCopy {
  interval: string;
  annual: string;
  save: string;
  monthly: string;
  noteAnnual: string;
  noteMonthly: string;
  joinFree: string;
  postFree: string;
  step: string;
  popular: string;
  perYear: string;
  perMonth: string;
  forever: string;
  freeNote: string;
  annualOnly: string;
  annualPlan: string;
  monthlyNote: string;
  annualNote: string;
  plans: { name: string; blurb: string; cta: string; features: string[] }[];
}

/**
 * Card index in `t.plans`: 0 Free, 1 Trade Pro, 2 Featured. The SEO Listing
 * plan is retired (no longer sold); existing SEO subscribers are grandfathered
 * in entitlement code only, never on this page.
 */
export type PlanCard = 0 | 1 | 2;

const Tick = ({ stroke }: { stroke: string }) => (
  <svg width="18" height="18" viewBox="0 0 22 22" fill="none" stroke={stroke} strokeWidth="2.5" aria-hidden><path d="M4 11.5l4.5 4.5L18 6.5" /></svg>
);

/**
 * Plan cards with the annual / monthly switch. Plan CTAs carry the plan +
 * interval as sign-up intent (Stripe checkout resolves the price later).
 * A plan without a configured monthly Stripe price stays annual.
 * `show` picks the cards (the pricing hero shows Free + Trade Pro; Featured
 * sits in "Get found" below). `actions` fills the right side of
 * the tool bar (the trial / Join free buttons), `actionsNote` goes under it.
 */
export function PricingPlans({
  t,
  lang,
  proMonthly,
  show = [0, 1, 2],
  actions,
  actionsNote,
  steps = true,
}: {
  t: PricingPlansCopy;
  lang: Locale;
  proMonthly: boolean;
  show?: PlanCard[];
  actions?: ReactNode;
  actionsNote?: ReactNode;
  /** "Step 01", "Step 02" labels on the cards. */
  steps?: boolean;
}) {
  const m = useMoney(lang);
  const [monthly, setMonthly] = useState(false);
  const [tick, setTick] = useState(0);
  const L = (p: string) => localizePath(p, lang);
  const anyMonthly = show.includes(1) && proMonthly;
  const swap = tick % 2 ? "swapb" : "swapa";
  const price = (cad: number, w = "3.5ch") => (m.known ? m.money(cad) : <Sk w={w} />);
  const per = (isMonthly: boolean) => (m.known ? fmt(isMonthly ? t.perMonth : t.perYear, { currency: m.currency }) : <Sk w="5em" />);
  const pick = (next: boolean) => {
    if (next === monthly) return;
    setMonthly(next);
    setTick((x) => x + 1);
  };

  const proM = monthly && proMonthly;
  // From the real price constants (lib/pricing/annual); 0 hides the "save" label when yearly isn't cheaper.
  const proSave = annualSaving()?.save ?? 0;
  const note = (tpl: string, vals: Record<string, number>) => {
    if (!m.known) return <Sk w="12em" />;
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(vals)) out[k] = m.money(v);
    return fmt(tpl, out);
  };

  const all = [
    {
      i: 0, offset: 96, cls: "",
      price: lang === "fr" ? "0 $" : "$0", per: t.forever, note: t.freeNote,
      href: "/sign-up?role=trade", btn: "out", swap: false,
    },
    {
      i: 1, offset: 0, cls: " pro",
      price: price(proM ? PRICING.proMonthly : PRICING.proAnnual), per: per(proM),
      note: proM ? note(t.monthlyNote, { total: PRICING.proMonthly * 12, save: proSave }) : monthly && !proMonthly ? t.annualOnly : note(t.annualNote, { n: Math.round(PRICING.proAnnual / 12) }),
      href: signUpHrefForPlan("pro", proM ? "monthly" : "annual"), btn: "ink", swap: true,
    },
    {
      i: 2, offset: 48, cls: " feat",
      price: price(PRICING.featuredAnnual), per: per(false),
      note: monthly ? t.annualOnly : t.annualPlan,
      href: signUpHrefForPlan("featured"), btn: "mintline", swap: false,
    },
  ];
  const cards = all.filter((c) => show.includes(c.i as PlanCard));
  // The staggered offsets are for the three-across row; fewer cards sit level, the tallest (Pro) aside.
  const offset = (c: (typeof all)[number]) => (cards.length === 3 ? c.offset : c.i === 1 ? 0 : cards.some((x) => x.i === 1) ? 48 : 0);

  return (
    <>
      <div className="v3-wrap vp-ptools">
        <div className="vp-ptools-l">
          {anyMonthly && (
            <div role="group" aria-label={t.interval} className="vp-toggle">
              <button type="button" aria-pressed={!monthly} onClick={() => pick(false)} className="tgl">
                {t.annual}
                {proSave > 0 && <span className="sv">{m.known ? fmt(t.save, { n: m.money(proSave) }) : <Sk w="4em" />}</span>}
              </button>
              <button type="button" aria-pressed={monthly} onClick={() => pick(true)} className="tgl">{t.monthly}</button>
            </div>
          )}
          <span className="vp-ptools-note">{m.known ? fmt(monthly ? t.noteMonthly : t.noteAnnual, { currency: m.currency }) : <Sk w="16em" />}</span>
        </div>
        {actions !== undefined && (
          <div className="vp-ptools-rr">
            <div className="vp-ptools-r">{actions}</div>
            {actionsNote && <div className="vp-ptools-an">{actionsNote}</div>}
          </div>
        )}
      </div>

      <div className="v3-wrap vp-cards" style={{ ["--cols" as string]: String(Math.max(cards.length, 2)) }}>
        {cards.map((c, pos) => {
          const p = t.plans[c.i];
          return (
            <div key={c.i} className="vp-cardcol rise" style={{ ["--off" as string]: `${offset(c)}px`, animationDelay: `${c.i * 0.08}s` }}>
              <div className={`vp-plan lift${c.cls}`}>
                <div className="top">
                  <span className="st">{steps ? fmt(t.step, { n: `0${pos + 1}` }) : null}</span>
                  {c.i === 1 && <span className="pop">{t.popular}</span>}
                </div>
                <h2 className="nm">{p.name}</h2>
                <p className="bl">{p.blurb}</p>
                <div className="pr">{c.swap ? <span key={tick} className={swap}>{c.price}</span> : c.price}</div>
                <div className="per">{c.per}</div>
                <div className="nt">{c.note}</div>
                <a href={L(c.href)} className={`cta ${c.btn}`}>{p.cta}</a>
                <ul className="ft">
                  {p.features.map((f, k) => (
                    <li key={f} className={c.i > 0 && k === 0 ? "b" : undefined}><Tick stroke={c.i === 1 ? "#1B1D3A" : c.i === 2 ? "#91F2CF" : "#282B59"} />{f}</li>
                  ))}
                </ul>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
