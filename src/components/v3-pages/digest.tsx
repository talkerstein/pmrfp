"use client";

import { useState, useTransition, type FormEvent } from "react";
import { joinRegionalWaitlistAction } from "@/lib/waitlist/actions";
import { signUpHrefForPlan } from "@/lib/billing/plan-intent";
import { PRICING } from "@/lib/site";
import { localizePath, type Locale } from "@/i18n/config";
import { PriceLine } from "./price";

export interface DigestCopy {
  eyebrow: string;
  title: string;
  trade: string;
  area: string;
  email: string;
  placeholder: string;
  submit: string;
  sending: string;
  note: string;
  pro: string;
  doneTitle: string;
  doneBody: string;
  doneCta: string;
}

/** The "free weekly tender digest" band. Stores the address in the regional waitlist, like the homepage form. */
export function DigestBand({
  t,
  lang,
  trades,
  areas,
  defaultTrade,
  defaultArea,
}: {
  t: DigestCopy;
  lang: Locale;
  trades: { value: string; label: string }[];
  areas: { label: string; region?: string; country?: "ca" | "us" }[];
  defaultTrade?: string;
  defaultArea?: number;
}) {
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const L = (p: string) => localizePath(p, lang);

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    const f = new FormData(e.currentTarget);
    const area = areas[Number(f.get("area") ?? 0)];
    const fd = new FormData();
    fd.set("email", String(f.get("email") ?? ""));
    fd.set("role", "trade");
    fd.set("reason", "early_access");
    fd.set("company_website", String(f.get("company_website") ?? ""));
    const trade = String(f.get("trade") ?? "");
    if (trade) fd.set("categorySlug", trade);
    if (area?.region) fd.set("regionSlug", area.region);
    if (area?.country) fd.set("country", area.country === "us" ? "United States" : "Canada");
    start(async () => {
      const res = await joinRegionalWaitlistAction({}, fd);
      if (res.error) setError(res.error);
      else setSent(true);
    });
  };

  return (
    <div className="vp-band">
      <div className="vp-band-badge" aria-hidden>
        <span>9:00 AM</span>
        <svg width="34" height="26" viewBox="0 0 34 26" fill="none" stroke="#FFFFFF" strokeWidth="2.4"><rect x="2" y="2" width="30" height="22" rx="4" /><path d="M3 5l14 10L31 5" /></svg>
      </div>
      {!sent ? (
        <div>
          <div className="v3-label ink">{t.eyebrow}</div>
          <h2 className="vp-band-h">{t.title}</h2>
          <form onSubmit={onSubmit} className="vp-pillform sm ink">
            <input type="text" name="company_website" tabIndex={-1} autoComplete="off" aria-hidden className="vp-hp" />
            <label className="vp-pf first">
              <span>{t.trade}</span>
              <select name="trade" defaultValue={defaultTrade ?? ""}>
                {trades.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </label>
            <label className="vp-pf">
              <span>{t.area}</span>
              <select name="area" defaultValue={String(defaultArea ?? 0)}>
                {areas.map((o, i) => <option key={o.label} value={i}>{o.label}</option>)}
              </select>
            </label>
            <label className="vp-pf grow">
              <span>{t.email}</span>
              <input type="email" name="email" required autoComplete="email" placeholder={t.placeholder} />
            </label>
            <button type="submit" disabled={pending} className="vp-pf-go">{pending ? t.sending : t.submit}</button>
          </form>
          {error && <div role="alert" className="vp-err">{error}</div>}
          <div className="vp-band-note">{t.note} <a href={L(signUpHrefForPlan("pro", "monthly"))}>{t.pro}</a></div>
        </div>
      ) : (
        <div className="fadeup" role="status">
          <div className="vp-band-h">{t.doneTitle}</div>
          <div className="vp-band-body">{t.doneBody}</div>
          <a href={L(signUpHrefForPlan("pro", "monthly"))} className="v3-pill ink vp-mt14">
            <PriceLine tpl={t.doneCta} cad={{ monthly: PRICING.proMonthly }} lang={lang} w="12em" />
          </a>
        </div>
      )}
    </div>
  );
}
