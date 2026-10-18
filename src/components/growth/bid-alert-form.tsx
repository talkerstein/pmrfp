"use client";

import "./digest.css";
import { useActionState, useState } from "react";
import { subscribeDigestAction, type DigestSignupState } from "@/lib/digest/actions";
import { useT } from "@/i18n/provider";
import { fmt } from "@/i18n/format";

export interface BidAlertFormProps {
  source: string;
  lang: "en" | "fr" | "es";
  country: "CA" | "US";
  /** Full English province/state name (the page's own). */
  province: string;
  /** Trade slugs from the page (may be empty = every trade). */
  trades: string[];
  title: string;
  lead: string;
  privacy: string;
  /** Free account link (already localized), offered once the email is in. */
  accountHref: string | null;
  accountLabel: string;
}

/**
 * "Email me bids like this": one visible field. The trade and the
 * province/state ride along as hidden fields from the page, so the sign-up is
 * the same double opt-in weekly email, scoped to what the visitor was
 * looking at. Explicit consent checkbox (CASL).
 */
export function BidAlertForm(p: BidAlertFormProps) {
  const t = useT("growthClient").digest;
  const [state, action, pending] = useActionState<DigestSignupState, FormData>(subscribeDigestAction, {});
  const [again, setAgain] = useState(false);

  if (state.ok && !again) {
    return (
      <div className="dg-box" role="status" data-bid-alert="sent">
        <div className="dg-hd">{state.held ? t.heldTitle : t.sentTitle}</div>
        <p className="dg-lead">{fmt(state.held ? t.heldBody : t.sentBody, { email: state.email ?? "" })}</p>
        {p.accountHref && <a className="dg-link" href={p.accountHref}>{p.accountLabel} →</a>}
        <button type="button" className="dg-link" onClick={() => setAgain(true)}>{t.again}</button>
      </div>
    );
  }
  const err = state.error && !again ? t.errors[state.error] : null;
  return (
    <form className="dg-box" action={(fd) => { setAgain(false); return action(fd); }} data-bid-alert="form">
      <div className="dg-hd">{p.title}</div>
      <p className="dg-lead">{p.lead}</p>
      <input type="hidden" name="source" value={p.source} />
      <input type="hidden" name="lang" value={p.lang} />
      <input type="hidden" name="country" value={p.country} />
      <input type="hidden" name="province" value={p.province} />
      {p.trades.map((s) => <input key={s} type="hidden" name="trades" value={s} />)}
      <div className="dg-actions">
        <label className="dg-fld" style={{ flex: "1 1 240px" }}>
          <span>{t.email}</span>
          <input name="email" type="email" required autoComplete="email" maxLength={254} />
        </label>
        <button type="submit" disabled={pending}>{pending ? t.sending : `${t.boxSubmit} →`}</button>
      </div>
      <label className="dg-consent">
        <input type="checkbox" name="consent" value="yes" required />
        <span>{t.boxConsent}</span>
      </label>
      <input type="text" name="company_website" tabIndex={-1} autoComplete="off" aria-hidden style={{ position: "absolute", left: "-9999px", width: 1, height: 1, opacity: 0 }} />
      {err && <p className="dg-err" role="alert">{err}</p>}
      <span className="dg-hint">{p.privacy}</span>
    </form>
  );
}
