"use client";

import { useActionState, useState, useTransition } from "react";
import Link from "next/link";
import { Check, Copy, ExternalLink, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  toggleTrustedTradeAction,
  updateTrustedNoteAction,
  updateTrustedPageAction,
  type PageFormState,
} from "@/lib/trusted/actions";

/** The public link with Copy and View buttons. */
export function ShareLink({ url, path }: { url: string; path: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error("Couldn't copy. Select the link and copy it instead.");
    }
  };
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <code className="min-w-0 flex-1 truncate rounded-lg border border-border bg-background px-3 py-2.5 font-mono text-sm">{url}</code>
      <div className="flex gap-2">
        <Button type="button" onClick={copy} className="flex-1 sm:flex-none">
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />} {copied ? "Copied" : "Copy link"}
        </Button>
        <Link href={path} target="_blank" className={buttonVariants({ variant: "outline", className: "flex-1 sm:flex-none" })}>
          <ExternalLink className="size-4" /> View
        </Link>
      </div>
    </div>
  );
}

/** One saved trade: name, the owner's note (saved on blur), remove. */
export function TrustedTradeRow({
  organizationId,
  name,
  slug,
  detail,
  note,
}: {
  organizationId: string;
  name: string;
  slug: string;
  detail: string;
  note: string | null;
}) {
  const [value, setValue] = useState(note ?? "");
  const [saved, setSaved] = useState(note ?? "");
  const [removed, setRemoved] = useState(false);
  const [pending, start] = useTransition();
  if (removed) return null;

  const saveNote = () => {
    if (value.trim() === saved.trim()) return;
    start(async () => {
      const res = await updateTrustedNoteAction(organizationId, value);
      if (res.error) toast.error(res.error);
      else {
        setSaved(value);
        toast.success("Note saved.");
      }
    });
  };
  const remove = () =>
    start(async () => {
      const res = await toggleTrustedTradeAction(organizationId);
      if (res.error) toast.error(res.error);
      else setRemoved(true);
    });

  return (
    <li className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href={`/directory/${slug}`} className="font-semibold hover:text-teal-700">
            {name}
          </Link>
          <p className="mt-0.5 truncate text-sm text-muted-foreground">{detail}</p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={remove} disabled={pending} aria-label={`Remove ${name}`}>
          <Trash2 className="size-4" />
        </Button>
      </div>
      <Input
        className="mt-3"
        value={value}
        maxLength={280}
        placeholder="Why you trust them, e.g. “Did the roof on my last three listings”"
        onChange={(e) => setValue(e.target.value)}
        onBlur={saveNote}
      />
    </li>
  );
}

/** Link, name, brokerage and headline; contact details unlock with Realtor Pro. */
export function TrustedPageForm({
  defaults,
  pro,
}: {
  defaults: {
    handle: string;
    displayName: string;
    brokerage: string;
    headline: string;
    contactPhone: string;
    contactEmail: string;
    published: boolean;
  };
  pro: boolean;
}) {
  const [state, action, pending] = useActionState<PageFormState, FormData>(updateTrustedPageAction, {});
  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2">
      <Field label="Your link" hint="pmrfp.com/trusted/…" className="sm:col-span-2">
        <Input name="handle" defaultValue={defaults.handle} required minLength={3} maxLength={40} />
      </Field>
      <Field label="Your name">
        <Input name="displayName" defaultValue={defaults.displayName} required maxLength={80} />
      </Field>
      <Field label="Brokerage or company">
        <Input name="brokerage" defaultValue={defaults.brokerage} maxLength={80} />
      </Field>
      <Field label="Headline" className="sm:col-span-2">
        <Input
          name="headline"
          defaultValue={defaults.headline}
          maxLength={160}
          placeholder="The trades I trust with my clients' homes in Toronto"
        />
      </Field>
      <Field label="Phone on your page" hint={pro ? undefined : "Realtor Pro"}>
        <Input name="contactPhone" defaultValue={defaults.contactPhone} maxLength={30} disabled={!pro} />
      </Field>
      <Field label="Email on your page" hint={pro ? undefined : "Realtor Pro"}>
        <Input name="contactEmail" type="email" defaultValue={defaults.contactEmail} maxLength={120} disabled={!pro} />
      </Field>
      <label className="flex items-center gap-2 text-sm sm:col-span-2">
        <input type="checkbox" name="published" defaultChecked={defaults.published} className="size-4 accent-[var(--color-indigo)]" />
        Page is public (anyone with the link can see it)
      </label>
      <div className="flex items-center gap-3 sm:col-span-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save page"}
        </Button>
        {state.error && <p className="text-sm text-destructive">{state.error}</p>}
        {state.success && <p className="text-sm text-teal-700">{state.success}</p>}
      </div>
    </form>
  );
}

function Field({
  label,
  hint,
  className,
  children,
}: {
  label: string;
  hint?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <Label className="mb-1.5 flex items-center justify-between">
        {label}
        {hint && <span className="text-xs font-normal text-muted-foreground">{hint}</span>}
      </Label>
      {children}
    </div>
  );
}
