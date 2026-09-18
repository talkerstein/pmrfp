"use client";

import { useActionState } from "react";
import { submitReferralAction, type ReferralActionState } from "@/lib/refer/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { REFERRAL } from "@/lib/site";

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

export function ReferProjectForm() {
  const [state, action, pending] = useActionState(
    submitReferralAction,
    {} as ReferralActionState,
  );

  if (state.success) {
    return (
      <div className="rounded-xl border border-teal-300 bg-teal-100/40 p-8 text-center">
        <h3 className="text-lg font-semibold text-teal-ink">Referral received.</h3>
        <p className="mt-2 text-sm leading-relaxed text-foreground/80">{state.success}</p>
        <p className="mt-6 text-xs text-muted-foreground">
          Want to refer another? Refresh the page.
        </p>
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
        title="The project"
        sub="Tell us what needs doing. The more specific, the faster we can structure the RFP."
      >
        <Field label="What's the project?" required>
          <Textarea
            name="projectDescription"
            rows={5}
            required
            placeholder="e.g. Pre-listing repairs at a 25-unit condo in midtown Toronto — roof patch, lobby paint, two failed HVAC units."
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="City" required>
            <Input name="projectCity" required placeholder="Toronto" />
          </Field>
          <Field label="Province" required>
            <select
              name="projectProvince"
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
            <Input
              name="projectCategory"
              placeholder="e.g. Roofing, HVAC, General Contracting"
            />
          </Field>
          <Field label="Property type (if known)">
            <Input
              name="projectPropertyType"
              placeholder="e.g. Condo, Office, Retail, Multi-unit residential"
            />
          </Field>
        </div>
      </Section>

      <Section
        title="The property contact"
        sub="Optional — if you don't have their permission to share, leave blank and we'll work with you to introduce."
      >
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Name">
            <Input name="ownerName" />
          </Field>
          <Field label="Email">
            <Input name="ownerEmail" type="email" />
          </Field>
          <Field label="Phone">
            <Input name="ownerPhone" />
          </Field>
        </div>
      </Section>

      <Section
        title="You"
        sub="So we can pay your finder's fee + send you monthly updates."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Your name" required>
            <Input name="referrerName" required />
          </Field>
          <Field label="Your email" required>
            <Input name="referrerEmail" type="email" required />
          </Field>
          <Field label="Phone">
            <Input name="referrerPhone" />
          </Field>
          <Field label="Affiliation (optional)">
            <Input
              name="referrerAffiliation"
              placeholder="e.g. Realtor at Royal LePage, Mortgage broker at TD"
            />
          </Field>
        </div>
      </Section>

      <label className="flex items-start gap-2 text-sm text-foreground/85">
        <input type="checkbox" name="permission" required className="mt-0.5 size-4 shrink-0" />
        <span>
          I confirm I have the property contact&apos;s permission to share their information,
          OR I&apos;m introducing them to {`PMRFP`} myself.
        </span>
      </label>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? "Submitting…" : `Submit referral`}
        </Button>
        <p className="text-xs leading-relaxed text-muted-foreground">
          What you get: public credit on the live RFP + a spot on the Top Connectors leaderboard.
          Know a trade instead? Refer them to Trade Pro for up to ${REFERRAL.tradeFee} cash.
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
