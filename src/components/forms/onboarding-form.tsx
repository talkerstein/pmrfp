"use client";

import { useActionState } from "react";
import { completeOnboardingAction, type ActionState } from "@/lib/auth/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type Option = { slug: string; name: string };

export function OnboardingForm({
  role,
  categories,
  regions,
  next,
  preselectedRegions = [],
  orgKind = "property_manager",
  award,
}: {
  role: "trade" | "property_manager" | "visitor" | "admin" | "super_admin" | "supplier" | "real_estate_agent";
  categories: Option[];
  regions: Option[];
  next?: string | null;
  /** Ticked to start — the visitor's own province/state. */
  preselectedRegions?: string[];
  /** Buyers only: which choice starts selected ("builder" = general contractor). */
  orgKind?: "property_manager" | "builder";
  /** Award notice a GC came from — their first package gets it prefilled. */
  award?: string | null;
}) {
  const [state, action, pending] = useActionState(completeOnboardingAction, {} as ActionState);
  const isListing = role === "trade" || role === "supplier";

  if (role === "visitor") {
    return (
      <form action={action} className="space-y-4">
        <input type="hidden" name="intent" value="browsing" />
        {next && <input type="hidden" name="next" value={next} />}
        <p className="text-sm text-muted-foreground">
          You&apos;re all set to browse the vendor directory and RFP opportunities.
        </p>
        <Button type="submit" disabled={pending}>Start browsing</Button>
      </form>
    );
  }

  return (
    <form action={action} className="space-y-6">
      {state.error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>}
      {next && <input type="hidden" name="next" value={next} />}
      {award && <input type="hidden" name="award" value={award} />}

      {role === "property_manager" && (
        <fieldset>
          <Label className="mb-2 block">What best describes you?</Label>
          <div className="grid gap-2 sm:grid-cols-2">
            {[
              { value: "property_manager", label: "Property manager or owner", hint: "Post RFPs for your buildings" },
              { value: "builder", label: "General contractor — hiring subs", hint: "Post sub-trade packages for your jobs" },
            ].map((o) => (
              <label
                key={o.value}
                className="flex cursor-pointer items-start gap-2 rounded-lg border border-border p-3 text-sm has-[:checked]:border-teal-500 has-[:checked]:bg-teal-50"
              >
                <input type="radio" name="orgKind" value={o.value} defaultChecked={orgKind === o.value} className="mt-0.5 size-4" />
                <span>
                  <span className="block font-medium">{o.label}</span>
                  <span className="block text-xs text-muted-foreground">{o.hint}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Company name" required><Input name="name" required /></Field>
        <Field label="Website"><Input name="website" placeholder="https://" /></Field>
        <Field label="Phone"><Input name="phone" /></Field>
        <Field label="Email"><Input name="email" type="email" /></Field>
        <Field label="City"><Input name="city" /></Field>
        <Field label="Province"><Input name="province" defaultValue="Ontario" /></Field>
      </div>

      <Field label="Short description">
        <Textarea name="shortDescription" rows={2} maxLength={300} placeholder="One sentence about your company." />
      </Field>

      {isListing && (
        <>
          <CheckboxGroup label="Service categories (select all that apply)" name="categories" options={categories} required />
          <CheckboxGroup label="Service regions" name="regions" options={regions} required preselected={preselectedRegions} />
          <Field label="How should buyers contact you?">
            <select
              name="publicContactVisibility"
              defaultValue="request_intro"
              className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
            >
              <option value="show_contact">Show my contact details publicly</option>
              <option value="request_intro">Let buyers request an introduction</option>
              <option value="hide_contact">Hide contact details</option>
            </select>
          </Field>
        </>
      )}

      <Button type="submit" size="lg" disabled={pending}>
        {pending ? "Saving…" : isListing ? "Finish & go to dashboard" : "Create organization"}
      </Button>
    </form>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <Label className="mb-1.5 block">{label}{required && <span className="text-red-600"> *</span>}</Label>
      {children}
    </label>
  );
}

function CheckboxGroup({ label, name, options, required, preselected = [] }: { label: string; name: string; options: Option[]; required?: boolean; preselected?: string[] }) {
  return (
    <div>
      <Label className="mb-2 block">{label}{required && <span className="text-red-600"> *</span>}</Label>
      <div className="grid max-h-56 grid-cols-2 gap-1.5 overflow-y-auto rounded-md border border-border p-3 sm:grid-cols-3">
        {options.map((o) => (
          <label key={o.slug} className="flex items-center gap-2 text-sm">
            <input type="checkbox" name={name} value={o.slug} defaultChecked={preselected.includes(o.slug)} className="size-4 rounded border-input" />
            {o.name}
          </label>
        ))}
      </div>
    </div>
  );
}
