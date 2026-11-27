"use client";

import { useState, useTransition } from "react";
import { Loader2, Mail, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CopyField } from "@/components/report-quotes/copy-field";
import { rotateInboxAction } from "@/lib/report-quotes/inbound-actions";

export interface ForwardingStrings {
  title: string;
  body: string;
  addressLabel: string;
  copy: string;
  copied: string;
  steps: string[];
  private: string;
  rotate: string;
  rotateNote: string;
  rotated: string;
  errors: { failed: string; unavailable: string };
}

/** The user's private forwarding address on the Report → Quotes dashboard, with copy and replace. */
export function ForwardingCard({ address: initial, s, children }: { address: string; s: ForwardingStrings; children?: React.ReactNode }) {
  const [address, setAddress] = useState(initial);
  const [note, setNote] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function rotate() {
    setNote(null);
    start(async () => {
      const res = await rotateInboxAction();
      if (!res.ok) return setNote(s.errors[res.error]);
      setAddress(res.address);
      setNote(s.rotated);
    });
  }

  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
          <Mail className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold">{s.title}</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">{s.body}</p>
        </div>
      </div>
      <div className="mt-4">
        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{s.addressLabel}</p>
        <CopyField value={address} label={s.addressLabel} copy={s.copy} copied={s.copied} />
      </div>
      <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
        {s.steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ul>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
        <p className="max-w-xl text-xs text-muted-foreground">{s.private}</p>
        <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={rotate} title={s.rotateNote}>
          {pending ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />} {s.rotate}
        </Button>
      </div>
      {note && <p className="mt-2 text-xs font-medium text-foreground">{note}</p>}
      {children}
    </section>
  );
}
