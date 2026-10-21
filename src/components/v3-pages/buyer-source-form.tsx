"use client";

import { useState } from "react";
import type { PermissionMethod } from "@/lib/buyers/permissions";
import { HONEYPOT, mailtoFallback } from "@/lib/buyers/source-links";

export interface BuyerSourceFormCopy {
  title: string;
  organization: string;
  contactName: string;
  workEmail: string;
  tendersUrl: string;
  tendersHint: string;
  method: string;
  feedUrl: string;
  province: string;
  choose: string;
  authorized: string;
  submit: string;
  sending: string;
  doneTitle: string;
  doneBody: string;
  error: string;
  tooMany: string;
  invalid: string;
  fallbackTitle: string;
  fallbackBody: string;
  fallbackCta: string;
  mailSubject: string;
  prefer: string;
  methods: Record<PermissionMethod, { t: string; d: string }>;
}

export interface BuyerSourcePrefill {
  buyerSlug: string;
  organization: string;
  tendersUrl: string;
  provinceCode: string;
}

const METHODS: PermissionMethod[] = ["read_public_page", "email_notices", "feed"];

/**
 * "List your tenders on PMRFP, free": the request form on /for-public-buyers
 * (POST /api/buyer-sources). Strings come from the page (buyers.forBuyers),
 * already filled in with the info@pmrfp.com address. When the request can't be
 * stored (no table yet, no backend) it turns into a mailto: link with what
 * was typed, so a buyer is never stuck.
 */
export function BuyerSourceForm({
  t,
  lang,
  provinces,
  prefill,
  available,
}: {
  t: BuyerSourceFormCopy;
  lang: string;
  provinces: { code: string; name: string }[];
  prefill: BuyerSourcePrefill;
  /** False when the server can't store requests: show the email fallback straight away. */
  available: boolean;
}) {
  const [method, setMethod] = useState<PermissionMethod>("read_public_page");
  const [state, setState] = useState<"idle" | "busy" | "done" | "fallback">(available ? "idle" : "fallback");
  const [error, setError] = useState<string | null>(null);
  const [typed, setTyped] = useState<Record<string, string>>({});

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const field = (k: string) => String(fd.get(k) ?? "").trim();
    const values = {
      organization: field("organization"),
      contactName: field("contactName"),
      workEmail: field("workEmail"),
      tendersUrl: field("tendersUrl"),
      method,
      feedUrl: method === "feed" ? field("feedUrl") : "",
    };
    setTyped(values);
    setState("busy");
    setError(null);
    try {
      const res = await fetch("/api/buyer-sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...values,
          provinceCode: field("provinceCode"),
          buyerSlug: prefill.buyerSlug || undefined,
          authorized: fd.get("authorized") === "on",
          lang,
          [HONEYPOT]: field(HONEYPOT),
        }),
      });
      if (res.ok) {
        setState("done");
        return;
      }
      const body = (await res.json().catch(() => ({}))) as { fallback?: string };
      if (body.fallback === "email" && res.status === 503) {
        setState("fallback");
        return;
      }
      setError(res.status === 429 ? t.tooMany : res.status === 422 ? t.invalid : t.error);
    } catch {
      setError(t.error);
    }
    setState("idle");
  }

  if (state === "done") {
    return (
      <div className="s-sent fadeup" role="status" data-state="done">
        <span className="ok" aria-hidden><svg width="28" height="28" viewBox="0 0 22 22" fill="none" stroke="#1B1D3A" strokeWidth="2.5"><path d="M4 11.5l4.5 4.5L18 6.5" /></svg></span>
        <div className="hd">{t.doneTitle}</div>
        <p>{t.doneBody}</p>
      </div>
    );
  }

  if (state === "fallback") {
    const href = mailtoFallback(t.mailSubject, { organization: typed.organization || prefill.organization, tendersUrl: typed.tendersUrl || prefill.tendersUrl, ...typed });
    return (
      <div data-state="fallback">
        <div className="hd">{t.fallbackTitle}</div>
        <p className="pb-note" style={{ marginTop: 8 }}>{t.fallbackBody}</p>
        <p style={{ marginTop: 16 }}><a href={href} className="btn ink md" data-cta="email-fallback">{t.fallbackCta} →</a></p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} data-form="buyer-source">
      <div className="hd">{t.title}</div>
      <div className="s-two">
        <label className="s-fld fld"><span>{t.organization}</span><input name="organization" required minLength={2} maxLength={200} defaultValue={prefill.organization} autoComplete="organization" /></label>
        <label className="s-fld fld"><span>{t.contactName}</span><input name="contactName" required minLength={2} maxLength={200} autoComplete="name" /></label>
        <label className="s-fld fld"><span>{t.workEmail}</span><input name="workEmail" type="email" required maxLength={254} autoComplete="email" /></label>
        <label className="s-fld fld">
          <span>{t.province}</span>
          <select name="provinceCode" required defaultValue={prefill.provinceCode}>
            <option value="" disabled>{t.choose}</option>
            {provinces.map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}
          </select>
        </label>
      </div>
      <label className="s-fld fld">
        <span>{t.tendersUrl}</span>
        <input name="tendersUrl" type="url" required maxLength={500} placeholder="https://" defaultValue={prefill.tendersUrl} />
        <span className="pb-hint">{t.tendersHint}</span>
      </label>
      <fieldset className="pb-methods">
        <legend>{t.method}</legend>
        {METHODS.map((m) => (
          <label key={m}>
            <input type="radio" name="method" value={m} checked={method === m} onChange={() => setMethod(m)} />
            <span><b>{t.methods[m].t}</b><small>{t.methods[m].d}</small></span>
          </label>
        ))}
      </fieldset>
      {method === "feed" && (
        <label className="s-fld fld"><span>{t.feedUrl}</span><input name="feedUrl" type="url" required maxLength={500} placeholder="https://" /></label>
      )}
      <label className="pb-check">
        <input type="checkbox" name="authorized" required />
        <span>{t.authorized}</span>
      </label>
      {/* Honeypot: hidden from people, filled by bots. */}
      <input type="text" name={HONEYPOT} tabIndex={-1} autoComplete="off" aria-hidden style={{ position: "absolute", left: "-9999px", width: 1, height: 1, opacity: 0 }} />
      {error && <p className="err" role="alert">{error}</p>}
      <button type="submit" disabled={state === "busy"}>{state === "busy" ? t.sending : `${t.submit} →`}</button>
      <p className="pb-note">{t.prefer}</p>
    </form>
  );
}
