"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useT } from "@/i18n/provider";

/**
 * The contact form in the v3 design. Same request as components/public/
 * contact-form (POST /api/contact, same fields and honeypot); only the look
 * changes. `compact` is the sidebar note (name, email, message).
 */
export function ContactFormV3({ title, sub, again, compact }: { title: string; sub?: string; again: string; compact?: boolean }) {
  const t = useT("miscClient").contactForm;
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setSubmitting(true);
    setError(false);
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestType: fd.get("requestType") || "general_contact",
          name: fd.get("name"),
          email: fd.get("email"),
          phone: fd.get("phone") || undefined,
          organization: fd.get("organization") || undefined,
          message: fd.get("message"),
          company_website: fd.get("company_website") ?? "",
        }),
      });
      if (!res.ok) throw new Error();
      setDone(true);
      toast.success(t.sent);
    } catch {
      setError(true);
      toast.error(t.failed);
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="s-sent fadeup" role="status">
        <span className="ok" aria-hidden><svg width="28" height="28" viewBox="0 0 22 22" fill="none" stroke="#1B1D3A" strokeWidth="2.5"><path d="M4 11.5l4.5 4.5L18 6.5" /></svg></span>
        <div className="hd">{t.doneTitle}</div>
        <p>{t.doneBody}</p>
        <button type="button" onClick={() => setDone(false)}>{again}</button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit}>
      <div className="hd">{title}</div>
      {sub && <div className="sb">{sub}</div>}
      <div className={compact ? undefined : "s-two"} style={compact ? { display: "contents" } : undefined}>
        <label className="s-fld fld"><span>{t.name}</span><input name="name" required autoComplete="name" /></label>
        <label className="s-fld fld"><span>{t.email}</span><input name="email" type="email" required autoComplete="email" /></label>
        {!compact && (
          <>
            <label className="s-fld fld"><span>{t.phone}</span><input name="phone" type="tel" autoComplete="tel" /></label>
            <label className="s-fld fld"><span>{t.organization}</span><input name="organization" autoComplete="organization" /></label>
          </>
        )}
      </div>
      {!compact && (
        <label className="s-fld fld">
          <span>{t.reachingAs}</span>
          <select name="requestType" defaultValue="general_contact">
            <option value="general_contact">{t.types.general_contact}</option>
            <option value="property_manager_help">{t.types.property_manager_help}</option>
            <option value="vendor_question">{t.types.vendor_question}</option>
          </select>
        </label>
      )}
      <label className="s-fld fld"><span>{t.message}</span><textarea name="message" rows={compact ? 4 : 6} required /></label>
      <input type="text" name="company_website" tabIndex={-1} autoComplete="off" aria-hidden style={{ position: "absolute", left: "-9999px", width: 1, height: 1, opacity: 0 }} />
      {error && <p className="err" role="alert">{t.failed}</p>}
      <button type="submit" disabled={submitting}>{submitting ? t.sending : `${t.send} →`}</button>
    </form>
  );
}
