"use client";

import { useState } from "react";
import { MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

/**
 * "Request a quote" under a trade on a realtor's trusted-trades page. Goes
 * straight to the trade, with the realtor copied (see /api/trusted/quote).
 */
export function QuoteRequest({
  handle,
  organizationId,
  tradeName,
  recommender,
}: {
  handle: string;
  organizationId: string;
  tradeName: string;
  recommender: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setState("sending");
    setError(null);
    try {
      const res = await fetch("/api/trusted/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          handle,
          organizationId,
          name: fd.get("name"),
          email: fd.get("email"),
          phone: fd.get("phone") ?? "",
          message: fd.get("message"),
          company_website: fd.get("company_website") ?? "",
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Something went wrong. Please try again.");
      setState("sent");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
      setState("idle");
    }
  }

  if (state === "sent") {
    return (
      <p className="rounded-xl border border-teal-300 bg-teal-50/60 px-4 py-3 text-sm">
        Sent. {tradeName} will reply to you by email, and {recommender} is copied.
      </p>
    );
  }

  if (!open) {
    return (
      <Button type="button" variant="outline" className="w-full" onClick={() => setOpen(true)}>
        <MessageSquare className="size-4" /> Request a quote
      </Button>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-2.5 rounded-xl border border-border bg-card p-4">
      <p className="text-sm font-semibold">Request a quote from {tradeName}</p>
      <Input name="name" placeholder="Your name" required maxLength={80} />
      <Input name="email" type="email" placeholder="Your email" required maxLength={120} />
      <Input name="phone" type="tel" placeholder="Phone (optional)" maxLength={30} />
      <Textarea name="message" placeholder="What needs doing, and where? (the address or area helps)" rows={3} required minLength={10} maxLength={2000} />
      <input type="text" name="company_website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-2">
        <Button type="submit" className="flex-1" disabled={state === "sending"}>
          {state === "sending" ? "Sending…" : "Send request"}
        </Button>
        <Button type="button" variant="outline" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        Your details go to {tradeName} and {recommender} only.
      </p>
    </form>
  );
}
