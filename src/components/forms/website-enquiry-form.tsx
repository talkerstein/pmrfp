"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/provider";
import { ENQUIRY_TYPE, enquiryMessage, type WebsiteKind } from "@/lib/websites/config";

/**
 * The /websites enquiry form. Same request as the contact form (POST
 * /api/contact, same fields and honeypot), so enquiries land in
 * contact_requests and the admin email with a "[Website enquiry: …]" first
 * line. Shared labels come from miscClient.contactForm; the page passes the
 * ones that differ per door.
 */
export function WebsiteEnquiryForm({
  kind,
  labels,
}: {
  kind: WebsiteKind;
  labels: { website: string; message: string; send: string };
}) {
  const t = useT("miscClient").contactForm;
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setSubmitting(true);
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestType: ENQUIRY_TYPE[kind],
          name: fd.get("name"),
          email: fd.get("email"),
          phone: fd.get("phone") || undefined,
          organization: fd.get("organization") || undefined,
          message: enquiryMessage(kind, String(fd.get("website") ?? ""), String(fd.get("message") ?? "")),
          company_website: fd.get("company_website") ?? "",
        }),
      });
      if (!res.ok) throw new Error();
      setDone(true);
      toast.success(t.sent);
    } catch {
      toast.error(t.failed);
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="rounded-lg border border-border bg-card p-6 text-center" role="status">
        <p className="font-medium text-success">{t.doneTitle}</p>
        <p className="mt-1 text-sm text-muted-foreground">{t.doneBody}</p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t.name}><Input name="name" required autoComplete="name" /></Field>
        <Field label={t.email}><Input name="email" type="email" required autoComplete="email" /></Field>
        <Field label={t.phone}><Input name="phone" type="tel" autoComplete="tel" /></Field>
        <Field label={t.organization}><Input name="organization" autoComplete="organization" /></Field>
      </div>
      <Field label={labels.website}><Input name="website" inputMode="url" autoComplete="url" /></Field>
      <Field label={labels.message}><Textarea name="message" rows={4} required maxLength={2500} /></Field>
      <input type="text" name="company_website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />
      <Button type="submit" size="lg" disabled={submitting}>
        {submitting ? t.sending : labels.send}
      </Button>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="eyebrow mb-1 block text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
