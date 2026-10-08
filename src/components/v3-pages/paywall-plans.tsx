"use client";

import { useState } from "react";
import { PRICING } from "@/lib/site";
import { localizePath, type Locale } from "@/i18n/config";
import { fmt } from "@/i18n/format";
import { Sk, useMoney } from "./price";

export interface PaywallPlansCopy {
  aria: string;
  monthly: string;
  yearly: string;
  perMonth: string;
  perYear: string;
  shortMonth: string;
  shortYear: string;
  start: string;
}

/**
 * Monthly / yearly picker on the RFP paywall. The CTA carries the chosen
 * interval as plan intent (sign-up for visitors, billing for signed-in trades).
 * Monthly only shows when its Stripe price is configured.
 */
export function PaywallPlans({
  t,
  lang,
  monthlyEnabled,
  hrefs,
  children,
}: {
  t: PaywallPlansCopy;
  lang: Locale;
  monthlyEnabled: boolean;
  hrefs: { monthly: string; annual: string };
  children?: React.ReactNode;
}) {
  const m = useMoney(lang);
  const [plan, setPlan] = useState<"monthly" | "annual">("annual");
  const plans = (monthlyEnabled ? (["monthly", "annual"] as const) : (["annual"] as const)).map((p) => ({
    key: p,
    name: p === "monthly" ? t.monthly : t.yearly,
    cad: p === "monthly" ? PRICING.proMonthly : PRICING.proAnnual,
    per: fmt(p === "monthly" ? t.perMonth : t.perYear, { currency: m.currency }),
    short: p === "monthly" ? t.shortMonth : t.shortYear,
  }));
  const chosen = plans.find((p) => p.key === plan) ?? plans[0];
  return (
    <>
      <div role="radiogroup" aria-label={t.aria} className={`vp-plans${plans.length === 1 ? " one" : ""}`}>
        {plans.map((p) => {
          const on = p.key === chosen.key;
          return (
            <button key={p.key} type="button" role="radio" aria-checked={on} onClick={() => setPlan(p.key)} className={`plan${on ? " on" : ""}`}>
              <span>
                <span className="nm">{p.name}</span>
                <span className="pr">{m.known ? m.money(p.cad) : <Sk w="3ch" />}<span className="per"> {m.known ? p.per : ""}</span></span>
              </span>
              <span className="ring" aria-hidden><span /></span>
            </button>
          );
        })}
      </div>
      <div className="vp-pay-ctas">
        <a href={localizePath(hrefs[chosen.key], lang)} className="v3-pill mint vp-big">
          {m.known ? fmt(t.start, { price: `${m.money(chosen.cad)}${chosen.short}` }) : <Sk w="12em" />}
        </a>
        {children}
      </div>
    </>
  );
}
