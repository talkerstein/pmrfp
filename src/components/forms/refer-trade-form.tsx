"use client";

/**
 * Trade-referral form. Direct-revenue lane — fee triggers when the referred
 * trade activates Trade Pro ($249/yr). Sister to the project-referral form,
 * intentionally same structure for visual consistency.
 */
import { useActionState } from "react";
import { submitTradeReferralAction, type ReferralActionState } from "@/lib/refer/actions";
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

export function ReferTradeForm() {
  const [state, action, pending] = useActionState(
    submitTradeReferralAction,
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

      <input
        type="text"
        name="company_website"
        tabIndex={-1}
        autoComplete="off"
        className="hidden"
        aria-hidden
      />

      <Section
        title="The trade company"
        sub="Tell us about the contractor or service company you're recommending."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Company name" required>
            <Input name="tradeCompanyName" required placeholder="e.g. Northline Electrical Ltd." />
          </Field>
          <Field label="Trade category">
            <Input name="tradeCategory" placeholder="e.g. Electrical, HVAC, Roofing" />
          </Field>
          <Field label="City" required>
            <Input name="tradeCity" required placeholder="Toronto" />
          </Field>
          <Field label="Province" required>
            <select
              name="tradeProvince"
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
          <Field label="Website">
            <Input name="tradeWebsite" type="url" placeholder="https://" />
          </Field>
        </div>
        <Field label="Why this trade? (optional)">
          <Textarea
            name="whyThemNote"
            rows={3}
            placeholder="A line or two about why they'd be a fit for PMRFP — commercial focus, reputation, capacity, etc."
          />
        </Field>
      </Section>

      <Section
        title="Trade contact"
        sub="Optional — if you don't have their permission to share, leave blank and we'll work with you to introduce."
      >
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Name">
            <Input name="tradeContactName" />
          </Field>
          <Field label="Email">
            <Input name="tradeContactEmail" type="email" />
          </Field>
          <Field label="Phone">
            <Input name="tradeContactPhone" />
          </Field>
        </div>
      </Section>

      <Section
        title="You"
        sub="So we can pay your $75 finder's fee + send you monthly updates."
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
              placeholder="e.g. PM at FirstService Residential, REA at Royal LePage"
            />
          </Field>
        </div>
      </Section>

      <label className="flex items-start gap-2 text-sm text-foreground/85">
        <input type="checkbox" name="permission" required className="mt-0.5 size-4 shrink-0" />
        <span>
          I confirm I have the trade contact&apos;s permission to share their information,
          OR I&apos;m introducing them to {`PMRFP`} myself.
        </span>
      </label>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? "Submitting…" : `Submit referral`}
        </Button>
        <p className="text-xs leading-relaxed text-muted-foreground">
          Finder&apos;s fee: ${REFERRAL.tradeFee} {REFERRAL.currency} when the trade activates
          annual Trade Pro ($249/yr). Monthly plans qualify after 3 paid months. Paid by
          e-transfer within 7 days of qualifying activation.
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
