"use client";

import { useActionState, useState } from "react";
import { startSponsorCheckout, submitSponsorEnquiry, type SponsorEnquiryState, type SponsorFormError } from "./actions";

export interface SponsorFormStrings {
  name: string;
  email: string;
  company: string;
  website: string;
  websitePh: string;
  phone: string;
  tier: string;
  unsure: string;
  trade: string;
  pickTrade: string;
  where: string;
  pickWhere: string;
  message: string;
  messagePh: string;
  optional: string;
  submit: string;
  sending: string;
  pay: string;
  paying: string;
  payNote: string;
  sent: string;
  paid: string;
  errors: Record<SponsorFormError, string>;
  success: string;
}

export interface TierOption {
  value: "province" | "national" | "digest";
  /** "Province × trade · $199 CAD / month". */
  label: string;
  /** Card payment is set up for this tier in the visitor's currency. */
  payable: boolean;
}

/**
 * Sponsorship enquiry, plus "Reserve and pay by card" when the chosen tier
 * has a Stripe Price for the visitor's currency. Copy comes from the server
 * (v3Pages.advertise.form) as props; the actions answer with codes.
 */
export function SponsorEnquiryForm({
  t,
  country,
  tiers,
  trades,
  regions,
  nationalLabel,
  initial,
  paid,
}: {
  t: SponsorFormStrings;
  country: "CA" | "US";
  tiers: TierOption[];
  trades: { value: string; label: string }[];
  regions: { value: string; label: string }[];
  nationalLabel: string;
  initial: { tier: string; trade: string; where: string };
  paid: boolean;
}) {
  const [enquiry, enquire, sending] = useActionState(submitSponsorEnquiry, {} as SponsorEnquiryState);
  const [checkout, pay, paying] = useActionState(startSponsorCheckout, {} as SponsorEnquiryState);
  const [tier, setTier] = useState(initial.tier);
  const chosen = tiers.find((x) => x.value === tier);
  const national = tier === "national";
  const error = checkout.error ?? enquiry.error;

  if (paid) {
    return (
      <div role="status" className="s-callout">
        <p><b>{t.sent}</b></p>
        <p>{t.paid}</p>
      </div>
    );
  }
  if (enquiry.success) {
    return (
      <div role="status" className="s-callout">
        <p><b>{t.sent}</b></p>
        <p>{t.success}</p>
      </div>
    );
  }

  const opt = <span style={{ fontWeight: 400 }}>{t.optional}</span>;
  return (
    <form action={enquire}>
      {error && <p role="alert" className="err">{t.errors[error] ?? t.errors.other}</p>}
      <input type="hidden" name="country" value={country} />
      <label className="s-fld"><span>{t.name}</span><input name="name" required maxLength={120} autoComplete="name" /></label>
      <label className="s-fld"><span>{t.email}</span><input name="email" type="email" required autoComplete="email" /></label>
      <label className="s-fld"><span>{t.company}</span><input name="company" required maxLength={160} autoComplete="organization" /></label>
      <label className="s-fld"><span>{t.website}{chosen?.payable ? null : opt}</span><input name="website" inputMode="url" maxLength={300} autoComplete="url" placeholder={t.websitePh} /></label>
      <label className="s-fld">
        <span>{t.tier}</span>
        <select name="tier" value={tier} onChange={(e) => setTier(e.target.value)}>
          {tiers.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}
          <option value="unsure">{t.unsure}</option>
        </select>
      </label>
      <label className="s-fld">
        <span>{t.trade}</span>
        <select name="trade" defaultValue={initial.trade}>
          <option value="">{t.pickTrade}</option>
          {trades.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}
        </select>
      </label>
      <label className="s-fld">
        <span>{t.where}</span>
        <select name="where" key={national ? "n" : "p"} defaultValue={national ? "*" : initial.where === "*" ? "" : initial.where}>
          {national ? <option value="*">{nationalLabel}</option> : <option value="">{t.pickWhere}</option>}
          {!national && regions.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}
        </select>
      </label>
      <label className="s-fld"><span>{t.phone}{opt}</span><input name="phone" type="tel" maxLength={40} autoComplete="tel" /></label>
      <label className="s-fld"><span>{t.message}{opt}</span><textarea name="message" rows={3} maxLength={2000} placeholder={t.messagePh} /></label>
      <input type="text" name="company_website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />
      <button type="submit" disabled={sending || paying}>{sending ? t.sending : t.submit}</button>
      {chosen?.payable && (
        <>
          <button type="submit" formAction={pay} disabled={sending || paying} className="ad-pay">
            {paying ? t.paying : t.pay}
          </button>
          <p className="ad-note">{t.payNote}</p>
        </>
      )}
    </form>
  );
}
