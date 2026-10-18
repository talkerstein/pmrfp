"use client";

import "./digest.css";
import { useActionState, useState } from "react";
import { subscribeDigestAction, type DigestSignupState } from "@/lib/digest/actions";
import { useVisitorCountry } from "@/components/geo/use-visitor-market";
import { useT } from "@/i18n/provider";
import { fmt } from "@/i18n/format";

const MAX = 5;

export interface DigestFormProps {
  source: string;
  lang: "en" | "fr" | "es";
  title: string;
  lead: string;
  privacy: string;
  /** Province/state lists per country (value = full English name, label = in the page language). */
  places: Record<"CA" | "US", { value: string; label: string }[]>;
  trades: { slug: string; label: string }[];
}

/**
 * Free weekly email sign-up (double opt-in). Country first, then that
 * country's provinces/states only; prefilled from the visitor's country and
 * province once the page knows it. Explicit consent checkbox (CASL).
 */
export function DigestSignupForm(p: DigestFormProps) {
  // Prefill once the visitor's country is known (cached pages render Canada first):
  // the form remounts with that default, before anyone has typed.
  const visitor = useVisitorCountry();
  const country = visitor?.country ?? "CA";
  const province = visitor?.province && p.places[country].some((x) => x.value === visitor.province) ? visitor.province : "";
  return <SignupForm key={`${country}|${province}`} {...p} initialCountry={country} initialProvince={province} />;
}

function SignupForm({ initialCountry, initialProvince, ...p }: DigestFormProps & { initialCountry: "CA" | "US"; initialProvince: string }) {
  const t = useT("growthClient").digest;
  const [state, action, pending] = useActionState<DigestSignupState, FormData>(subscribeDigestAction, {});
  const [country, setCountry] = useState<"CA" | "US">(initialCountry);
  const [province, setProvince] = useState(initialProvince);
  const [picked, setPicked] = useState<string[]>([]);
  const [again, setAgain] = useState(false);

  if (state.ok && !again) {
    return (
      <div className="dg-box" role="status" data-digest="sent">
        <div className="dg-hd">{state.held ? t.heldTitle : t.sentTitle}</div>
        <p className="dg-lead">{fmt(state.held ? t.heldBody : t.sentBody, { email: state.email ?? "" })}</p>
        <button type="button" className="dg-link" onClick={() => setAgain(true)}>{t.again}</button>
      </div>
    );
  }

  const err = state.error && !again ? t.errors[state.error] : null;
  const toggle = (slug: string) =>
    setPicked((cur) => (cur.includes(slug) ? cur.filter((s) => s !== slug) : cur.length >= MAX ? cur : [...cur, slug]));

  return (
    <form className="dg-box" action={(fd) => { setAgain(false); return action(fd); }} data-digest="form">
      <div className="dg-hd">{p.title}</div>
      <p className="dg-lead">{p.lead}</p>
      <input type="hidden" name="source" value={p.source} />
      <input type="hidden" name="lang" value={p.lang} />
      <div className="dg-row">
        <label className="dg-fld dg-email">
          <span>{t.email}</span>
          <input name="email" type="email" required autoComplete="email" maxLength={254} />
        </label>
        <label className="dg-fld">
          <span>{t.country}</span>
          <select name="country" value={country} onChange={(e) => { setCountry(e.target.value === "US" ? "US" : "CA"); setProvince(""); }}>
            <option value="CA">{t.canada}</option>
            <option value="US">{t.us}</option>
          </select>
        </label>
        <label className="dg-fld">
          <span>{country === "US" ? t.state : t.province}</span>
          <select name="province" required value={province} onChange={(e) => setProvince(e.target.value)}>
            <option value="">{t.pick}</option>
            {p.places[country].map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}
          </select>
        </label>
      </div>
      {p.trades.length > 0 && (
        <fieldset className="dg-trades">
          <legend>{t.trades} <span className="dg-hint">{t.tradesHint}</span></legend>
          <div className="dg-chips">
            {p.trades.map((c) => {
              const on = picked.includes(c.slug);
              return (
                <label key={c.slug} className={on ? "dg-chip on" : "dg-chip"}>
                  <input type="checkbox" name="trades" value={c.slug} checked={on} disabled={!on && picked.length >= MAX} onChange={() => toggle(c.slug)} />
                  {c.label}
                </label>
              );
            })}
          </div>
        </fieldset>
      )}
      <label className="dg-consent">
        <input type="checkbox" name="consent" value="yes" required />
        <span>{t.consent}</span>
      </label>
      <input type="text" name="company_website" tabIndex={-1} autoComplete="off" aria-hidden style={{ position: "absolute", left: "-9999px", width: 1, height: 1, opacity: 0 }} />
      {err && <p className="dg-err" role="alert">{err}</p>}
      <div className="dg-actions">
        <button type="submit" disabled={pending}>{pending ? t.sending : `${t.submit} →`}</button>
        <span className="dg-hint">{p.privacy}</span>
      </div>
    </form>
  );
}
