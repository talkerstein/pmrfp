"use client";

import { useState } from "react";
import Link from "@/i18n/link";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useLang, useT } from "@/i18n/provider";
import { REASONS, type CorrectionReason, type PageKind } from "@/lib/corrections/rules";

/**
 * "Report an error or request removal": a small link on pages built from
 * public records (RFPs, contract winners, Award Intelligence profiles, major
 * projects, benchmarks). Opens a form that files a correction_requests row
 * via /api/corrections. Policy: /corrections.
 */
export function ReportErrorLink({ kind, path, refId, className, label }: { kind: PageKind; path?: string; refId?: string; className?: string; label?: React.ReactNode }) {
  const t = useT("correctionsClient");
  const lang = useLang();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<CorrectionReason>("wrong_info");
  const [details, setDetails] = useState("");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [trap, setTrap] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState("busy");
    setError(null);
    try {
      const res = await fetch("/api/corrections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pageKind: kind,
          pagePath: path ?? window.location.pathname,
          pageRef: refId,
          reason,
          details,
          contactEmail: email,
          contactName: name || undefined,
          lang,
          company_website: trap || undefined,
        }),
      });
      if (res.ok) {
        setState("done");
        return;
      }
      setError(res.status === 429 ? t.tooMany : res.status === 422 ? t.invalid : t.error);
    } catch {
      setError(t.error);
    }
    setState("idle");
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <button type="button" className={className ?? "small muted underline underline-offset-2 hover:text-foreground"} data-report-error>
            {label ?? t.link}
          </button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t.title}</DialogTitle>
          <DialogDescription>{t.description}</DialogDescription>
        </DialogHeader>
        {state === "done" ? (
          <p role="status" className="text-sm">{t.done}</p>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <fieldset className="space-y-1">
              <legend className="text-sm font-medium">{t.reason}</legend>
              {REASONS.map((r) => (
                <label key={r} className="flex items-center gap-2 text-sm">
                  <input type="radio" name="reason" value={r} checked={reason === r} onChange={() => setReason(r)} />
                  {t.reasons[r]}
                </label>
              ))}
            </fieldset>
            <label className="block text-sm">
              <span className="font-medium">{t.details}</span>
              <Textarea required minLength={10} maxLength={5000} rows={4} value={details} onChange={(e) => setDetails(e.target.value)} placeholder={t.detailsPlaceholder} />
            </label>
            <label className="block text-sm">
              <span className="font-medium">{t.email}</span>
              <Input type="email" required maxLength={254} value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
            </label>
            <label className="block text-sm">
              <span className="font-medium">{t.name}</span>
              <Input maxLength={200} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
            </label>
            {/* Honeypot: hidden from people, filled by bots. */}
            <input type="text" tabIndex={-1} autoComplete="off" aria-hidden className="hidden" value={trap} onChange={(e) => setTrap(e.target.value)} name="company_website" />
            <p className="text-xs text-muted-foreground">
              {t.privacy}{" "}
              <Link href="/corrections" className="underline">{t.policy}</Link>
            </p>
            {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>{t.cancel}</Button>
              <Button type="submit" disabled={state === "busy"}>{state === "busy" ? t.sending : t.submit}</Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
