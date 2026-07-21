"use client";

import { useActionState } from "react";
import { submitPostForMeAction, type ConciergeActionState } from "@/lib/concierge/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const PROVINCES = [
  "Ontario",
  "Quebec",
  "British Columbia",
  "Alberta",
  "Manitoba",
  "Saskatchewan",
  "Nova Scotia",
  "New Brunswick",
  "Newfoundland and Labrador",
  "Prince Edward Island",
  "Yukon",
  "Northwest Territories",
  "Nunavut",
];

export function PostForMeForm() {
  const [state, action, pending] = useActionState(
    submitPostForMeAction,
    {} as ConciergeActionState,
  );

  if (state.success) {
    return (
      <div className="rounded-xl border border-teal-300 bg-teal-100/40 p-8 text-center">
        <h3 className="text-lg font-semibold text-teal-ink">Got it — we&apos;re on it.</h3>
        <p className="mt-2 text-sm leading-relaxed text-foreground/80">{state.success}</p>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-6">
      {state.error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>
      )}

      {/* honeypot — must stay empty */}
      <input
        type="text"
        name="company_website"
        tabIndex={-1}
        autoComplete="off"
        className="hidden"
        aria-hidden
      />

      <Section
        title="Your project"
        sub="Tell us what needs doing. The more specific, the faster we can draft the RFP."
      >
        <Field label="What's the project?" required>
          <Textarea
            name="projectDescription"
            rows={5}
            required
            placeholder="e.g. Roof replacement on a 40-unit condo in Mississauga — flat membrane roof, ~18,000 sq ft, some deck repair likely. Need it out to bid before winter."
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="City" required>
            <Input name="city" required placeholder="Mississauga" />
          </Field>
          <Field label="Province" required>
            <select
              name="province"
              required
              defaultValue="Ontario"
              className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
            >
              {PROVINCES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Trade category (if known)">
            <Input name="category" placeholder="e.g. Roofing, HVAC, General Contracting" />
          </Field>
          <Field label="Property type (if known)">
            <Input name="propertyType" placeholder="e.g. Condo, Office, Retail, Multi-unit residential" />
          </Field>
        </div>
      </Section>

      <Section title="Where we send the draft" sub="We'll email you the structured RFP to approve before it goes live.">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Your name" required>
            <Input name="contactName" required />
          </Field>
          <Field label="Your email" required>
            <Input name="contactEmail" type="email" required />
          </Field>
          <Field label="Phone (optional)">
            <Input name="contactPhone" />
          </Field>
        </div>
      </Section>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? "Sending…" : "Send it — we'll post it for you"}
        </Button>
        <p className="text-xs leading-relaxed text-muted-foreground">
          Free. No account needed to start. You approve the RFP before it goes live.
        </p>
      </div>
    </form>
  );
}

function Section({
  title,
  sub,
  children,
}: {
  title: string;
  sub?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <h2 className="text-base font-semibold">{title}</h2>
      {sub && <p className="mt-1 text-sm text-muted-foreground">{sub}</p>}
      <div className="mt-4 space-y-4">{children}</div>
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <Label className="mb-1.5 block">
        {label}
        {required && <span className="text-red-600"> *</span>}
      </Label>
      {children}
    </label>
  );
}
