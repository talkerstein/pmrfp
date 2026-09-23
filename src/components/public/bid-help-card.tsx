"use client";

import { useState } from "react";
import { toast } from "sonner";
import { FileSignature } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

/**
 * "Need help bidding on this?" — shown on open public tenders. Most small
 * trades have never bid on a government tender (supplier registration, the
 * bid forms, the evaluation grid), so this offers a free call with our bid
 * support affiliate. Leads go to /api/bid-help → admin email + GHL.
 */
export function BidHelpCard({
  rfpSlug,
  rfpTitle,
  trade,
  portal,
}: {
  rfpSlug: string;
  rfpTitle: string;
  trade?: string;
  portal: string;
}) {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setSubmitting(true);
    try {
      const res = await fetch("/api/bid-help", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: fd.get("name"),
          email: fd.get("email"),
          phone: fd.get("phone") || undefined,
          company: fd.get("company") || undefined,
          message: fd.get("message") || undefined,
          rfpSlug,
          rfpTitle,
          trade,
          company_website: fd.get("company_website") ?? "",
        }),
      });
      if (!res.ok) throw new Error();
      setDone(true);
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="rounded-xl border border-indigo/20 bg-card p-5">
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-indigo text-teal-300">
          <FileSignature className="size-4.5" />
        </span>
        <div className="min-w-0">
          <h2 className="text-base font-semibold">Need help bidding on this?</h2>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            Never bid on a government tender? We&apos;ll get you registered on {portal}, walk
            through what this one asks for, and help you put the bid together. Start with a free
            15-minute call — we&apos;ll tell you honestly whether it&apos;s worth bidding.
          </p>
        </div>
      </div>

      {done ? (
        <p className="mt-4 rounded-md bg-teal-50 px-3 py-2 text-sm text-teal-800">
          Got it — we&apos;ll email you within one business day to book the call.
        </p>
      ) : !open ? (
        <Button className="mt-4" onClick={() => setOpen(true)}>
          Get bid help
        </Button>
      ) : (
        <form onSubmit={onSubmit} className="mt-4 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Input name="name" placeholder="Your name" required autoComplete="name" />
            <Input name="email" type="email" placeholder="Email" required autoComplete="email" />
            <Input name="phone" type="tel" placeholder="Phone (optional)" autoComplete="tel" />
            <Input name="company" placeholder="Company (optional)" autoComplete="organization" />
          </div>
          <Textarea
            name="message"
            rows={2}
            placeholder="Anything we should know? (optional) — e.g. first government bid, already registered, need insurance docs"
          />
          <input type="text" name="company_website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />
          <Button type="submit" disabled={submitting}>
            {submitting ? "Sending…" : "Book my free call"}
          </Button>
        </form>
      )}
      <p className="mt-3 text-xs text-muted-foreground">
        Bid support is provided by Talkerstein Consulting Group, an affiliate of PMRFP. No one can
        guarantee an award.
      </p>
    </div>
  );
}
