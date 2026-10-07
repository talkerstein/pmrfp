"use client";

import { useActionState, useState } from "react";
import { completeOnboardingAction, type ActionState } from "@/lib/auth/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useLang, useT } from "@/i18n/provider";
import { regionName, tradeName } from "@/i18n/terms";

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
  orgKind?: "property_manager" | "builder" | "landlord";
  /** Award notice a GC came from — their first package gets it prefilled. */
  award?: string | null;
}) {
  const t = useT("auth").onboarding;
  const lang = useLang();
  const [state, action, pending] = useActionState(completeOnboardingAction, {} as ActionState);
  const isListing = role === "trade" || role === "supplier";
  // Landlords may be individuals: company name optional (we use their name).
  const [kind, setKind] = useState(orgKind);
  const landlord = role === "property_manager" && kind === "landlord";

  if (role === "visitor") {
    return (
      <form action={action} className="space-y-4">
        <input type="hidden" name="intent" value="browsing" />
        <input type="hidden" name="lang" value={lang} />
        {next && <input type="hidden" name="next" value={next} />}
        <p className="text-sm text-muted-foreground">
          {t.browseReady}
        </p>
        <Button type="submit" disabled={pending}>{t.startBrowsing}</Button>
      </form>
    );
  }

  return (
    <form action={action} className="space-y-6">
      {state.error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>}
      <input type="hidden" name="lang" value={lang} />
      {next && <input type="hidden" name="next" value={next} />}
      {award && <input type="hidden" name="award" value={award} />}

      {role === "property_manager" && (
        <fieldset>
          <Label className="mb-2 block">{t.describes}</Label>
          <div className="grid gap-2 sm:grid-cols-3">
            {(["property_manager", "landlord", "builder"] as const).map((value) => (
              <label
                key={value}
                className="flex cursor-pointer items-start gap-2 rounded-lg border border-border p-3 text-sm has-[:checked]:border-teal-500 has-[:checked]:bg-teal-50"
              >
                <input type="radio" name="orgKind" value={value} defaultChecked={orgKind === value} onChange={() => setKind(value)} className="mt-0.5 size-4" />
                <span>
                  <span className="block font-medium">{t.orgKinds[value].label}</span>
                  <span className="block text-xs text-muted-foreground">{t.orgKinds[value].hint}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {landlord ? (
          <Field label={t.landlordName}><Input name="name" placeholder={t.landlordNamePlaceholder} /></Field>
        ) : (
          <Field label={t.companyName} required><Input name="name" required /></Field>
        )}
        <Field label={t.website}><Input name="website" placeholder="https://" /></Field>
        <Field label={t.phone}><Input name="phone" /></Field>
        <Field label={t.email}><Input name="email" type="email" /></Field>
        <Field label={t.city}><Input name="city" /></Field>
        <Field label={t.province}><Input name="province" defaultValue="Ontario" /></Field>
      </div>

      <Field label={t.shortDescription}>
        <Textarea name="shortDescription" rows={2} maxLength={300} placeholder={landlord ? t.landlordDescriptionPlaceholder : t.shortDescriptionPlaceholder} />
      </Field>

      {isListing && (
        <>
          <CheckboxGroup
            label={t.categories}
            name="categories"
            options={categories.map((o) => ({ ...o, name: tradeName(o.name, lang) }))}
            required
          />
          <CheckboxGroup
            label={t.regions}
            name="regions"
            options={regions.map((o) => ({ ...o, name: regionName(o.name, lang) }))}
            required
            preselected={preselectedRegions}
          />
          <Field label={t.contact}>
            <select
              name="publicContactVisibility"
              defaultValue="request_intro"
              className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
            >
              <option value="show_contact">{t.contactShow}</option>
              <option value="request_intro">{t.contactIntro}</option>
              <option value="hide_contact">{t.contactHide}</option>
            </select>
          </Field>
        </>
      )}

      <Button type="submit" size="lg" disabled={pending}>
        {pending ? t.saving : isListing ? t.finish : t.createOrg}
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
