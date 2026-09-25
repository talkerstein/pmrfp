"use client";

import { useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { CircleCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SPONSOR_PACKAGES, cad } from "@/components/advertise/packages";
import { submitSponsorEnquiry, type SponsorEnquiryState } from "./actions";

const CHOICES = [
  ...SPONSOR_PACKAGES.map((p) => ({ value: p.id as string, label: `${p.name}, ${cad(p.monthly)}/mo` })),
  { value: "unsure", label: "Not sure yet" },
];

const choice = (v: string | null | undefined) => (CHOICES.some((c) => c.value === v) ? (v as string) : "unsure");

/**
 * The package cards link to /advertise?package=<id>#enquire; this picks the
 * package from the URL. Uses useSearchParams, so render it inside <Suspense>
 * with <SponsorEnquiryForm /> as the fallback.
 */
export function SponsorEnquiryFromUrl() {
  return <SponsorEnquiryForm initialPackage={useSearchParams().get("package")} />;
}

export function SponsorEnquiryForm({ initialPackage = null }: { initialPackage?: string | null }) {
  const [state, action, pending] = useActionState(submitSponsorEnquiry, {} as SponsorEnquiryState);

  if (state.success) {
    return (
      <div role="status" className="flex gap-3 rounded-xl border border-teal-300 bg-teal-50 p-5">
        <CircleCheck className="mt-0.5 size-5 shrink-0 text-teal-600" />
        <div>
          <p className="font-semibold text-foreground">Enquiry sent</p>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{state.success}</p>
        </div>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4">
      {state.error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="sponsor-name" label="Your name" req>
          <Input id="sponsor-name" name="name" required maxLength={120} autoComplete="name" className="h-10" />
        </Field>
        <Field id="sponsor-email" label="Work email" req>
          <Input id="sponsor-email" name="email" type="email" required autoComplete="email" className="h-10" />
        </Field>
        <Field id="sponsor-company" label="Company" req>
          <Input id="sponsor-company" name="company" required maxLength={160} autoComplete="organization" className="h-10" />
        </Field>
        <Field id="sponsor-website" label="Website" optional>
          <Input
            id="sponsor-website"
            name="website"
            inputMode="url"
            maxLength={300}
            autoComplete="url"
            placeholder="yourcompany.ca"
            className="h-10"
          />
        </Field>
        <Field id="sponsor-package" label="Package">
          {/* Keyed on the URL's package so a later package click re-selects it
              without clearing what's already typed in the other fields. */}
          <select
            key={initialPackage ?? "none"}
            id="sponsor-package"
            name="package"
            defaultValue={choice(initialPackage)}
            className="h-10 w-full rounded-lg border border-input bg-transparent px-2.5 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm"
          >
            {CHOICES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </Field>
        <Field id="sponsor-phone" label="Phone" optional>
          <Input id="sponsor-phone" name="phone" type="tel" maxLength={40} autoComplete="tel" className="h-10" />
        </Field>
      </div>
      <Field id="sponsor-focus" label="Which trades?" optional>
        <Input
          id="sponsor-focus"
          name="focus"
          maxLength={300}
          placeholder="e.g. Electrical across Ontario, or every trade in the GTA"
          className="h-10"
        />
      </Field>
      <Field id="sponsor-message" label="Anything else" optional>
        <Textarea
          id="sponsor-message"
          name="message"
          rows={4}
          maxLength={2000}
          placeholder="What you sell, who you want to reach, when you'd like to start."
        />
      </Field>
      <input type="text" name="company_website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />
      <Button type="submit" size="lg" disabled={pending} className="w-full sm:w-auto">
        {pending ? "Sending…" : "Send enquiry"}
      </Button>
    </form>
  );
}

function Field({
  id,
  label,
  req,
  optional,
  children,
}: {
  id: string;
  label: string;
  req?: boolean;
  optional?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <Label htmlFor={id} className="mb-1.5">
        {label}
        {req && <span className="text-red-600">*</span>}
        {optional && <span className="font-normal text-muted-foreground">(optional)</span>}
      </Label>
      {children}
    </div>
  );
}
