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
}: {
  role: "trade" | "property_manager" | "visitor" | "admin" | "super_admin";
  categories: Option[];
  regions: Option[];
}) {
  const [state, action, pending] = useActionState(completeOnboardingAction, {} as ActionState);
  const isTrade = role === "trade";

  if (role === "visitor") {
    return (
      <form action={action} className="space-y-4">
        <input type="hidden" name="intent" value="browsing" />
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

      {isTrade && (
        <>
          <CheckboxGroup label="Service categories (select all that apply)" name="categories" options={categories} required />
          <CheckboxGroup label="Service regions" name="regions" options={regions} required />
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
        {pending ? "Saving…" : isTrade ? "Finish & go to dashboard" : "Create organization"}
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

function CheckboxGroup({ label, name, options, required }: { label: string; name: string; options: Option[]; required?: boolean }) {
  return (
    <div>
      <Label className="mb-2 block">{label}{required && <span className="text-red-600"> *</span>}</Label>
      <div className="grid max-h-56 grid-cols-2 gap-1.5 overflow-y-auto rounded-md border border-border p-3 sm:grid-cols-3">
        {options.map((o) => (
          <label key={o.slug} className="flex items-center gap-2 text-sm">
            <input type="checkbox" name={name} value={o.slug} className="size-4 rounded border-input" />
            {o.name}
          </label>
        ))}
      </div>
    </div>
  );
}
