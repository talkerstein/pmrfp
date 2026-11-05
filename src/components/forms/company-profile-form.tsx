"use client";

import { useActionState } from "react";
import { updateCompanyProfileAction } from "@/lib/dashboard/actions";
import type { ActionState } from "@/lib/auth/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { LogoUploader } from "@/components/forms/logo-uploader";
import { PortfolioUploader } from "@/components/forms/portfolio-uploader";
import { useLang, useT } from "@/i18n/provider";
import { fmt } from "@/i18n/format";
import { POLICY_NUMBER_MAX } from "@/lib/organizations/insurance";
import { propertyTypeName, regionName, tradeName } from "@/i18n/terms";

type Option = { slug: string; name: string };

export interface CompanyDefaults {
  name?: string; website?: string; phone?: string; email?: string;
  addressLine1?: string; city?: string; province?: string; postalCode?: string;
  shortDescription?: string; fullDescription?: string; yearsInBusiness?: number | null;
  employeeCountRange?: string; insurancePolicyNumber?: string; insuranceLine?: string; wsibStatus?: string;
  emergencyService?: boolean; publicContactVisibility?: string;
  logoUrl?: string | null;
}

export function CompanyProfileForm({
  defaults,
  organizationId,
  categories,
  regions,
  propertyTypes,
  selectedCategories = [],
  selectedRegions = [],
  selectedPropertyTypes = [],
  portfolioMaxPhotos = 1,
}: {
  defaults: CompanyDefaults;
  organizationId: string | null;
  categories: Option[];
  regions: Option[];
  propertyTypes: Option[];
  selectedCategories?: string[];
  selectedRegions?: string[];
  selectedPropertyTypes?: string[];
  /** 1 on the free tier, unlimited (12 — the upload cap) on any paid tier. */
  portfolioMaxPhotos?: number;
}) {
  const [state, action, pending] = useActionState(updateCompanyProfileAction, {} as ActionState);
  const t = useT("dashClient").company;
  const lang = useLang();
  // Only what's shown is translated; the checkbox values stay slugs.
  const shown = (names: Option[], tr: (name: string, l: typeof lang) => string) =>
    names.map((o) => ({ slug: o.slug, name: tr(o.name, lang) }));

  return (
    <form action={action} className="space-y-6">
      {/* Lets the server action answer in the page's language. */}
      <input type="hidden" name="lang" value={lang} />
      {state.error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>}
      {state.success && <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">{state.success}</p>}

      <Section title={t.logo}>
        <LogoUploader
          organizationId={organizationId}
          initialLogoUrl={defaults.logoUrl ?? null}
        />
      </Section>

      <Section title={t.portfolio}>
        <PortfolioUploader organizationId={organizationId} maxPhotos={portfolioMaxPhotos} />
      </Section>

      <Section title={t.basics}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t.name} req><Input name="name" defaultValue={defaults.name} required /></Field>
          <Field label={t.website}><Input name="website" defaultValue={defaults.website} placeholder="https://" /></Field>
          <Field label={t.email} req><Input name="email" type="email" defaultValue={defaults.email} required /></Field>
          <Field label={t.phone}><Input name="phone" defaultValue={defaults.phone} /></Field>
          <Field label={t.address}><Input name="addressLine1" defaultValue={defaults.addressLine1} /></Field>
          <Field label={t.city}><Input name="city" defaultValue={defaults.city} /></Field>
          <Field label={t.province}><Input name="province" defaultValue={defaults.province} /></Field>
          <Field label={t.postalCode}><Input name="postalCode" defaultValue={defaults.postalCode} /></Field>
        </div>
      </Section>

      <Section title={t.about}>
        <Field label={t.shortDescription}>
          <Textarea name="shortDescription" rows={2} maxLength={300} defaultValue={defaults.shortDescription} />
        </Field>
        <Field label={t.fullDescription}>
          <Textarea name="fullDescription" rows={5} maxLength={2500} defaultValue={defaults.fullDescription} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t.years}><Input name="yearsInBusiness" type="number" defaultValue={defaults.yearsInBusiness ?? ""} /></Field>
          <Field label={t.teamSize}>
            <select name="employeeCountRange" defaultValue={defaults.employeeCountRange ?? ""} className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm">
              <option value="">{t.select}</option>
              {["1-10", "11-50", "51-200", "200+"].map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </Field>
          <div>
            <Field label={t.insurance}>
              <Input name="insurancePolicyNumber" defaultValue={defaults.insurancePolicyNumber} placeholder={t.insurancePlaceholder} maxLength={POLICY_NUMBER_MAX} autoComplete="off" />
            </Field>
            <p className="mt-1.5 text-xs text-muted-foreground">{t.insuranceHint}</p>
            {defaults.insuranceLine && (
              <label className="mt-1.5 flex items-start gap-2 text-xs text-muted-foreground">
                <input type="checkbox" name="removeInsuranceLine" className="mt-0.5 size-3.5" />
                {fmt(t.insuranceLine, { line: defaults.insuranceLine })}
              </label>
            )}
          </div>
          <Field label={t.wsib}><Input name="wsibStatus" defaultValue={defaults.wsibStatus} placeholder={t.wsibPlaceholder} /></Field>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="emergencyService" defaultChecked={defaults.emergencyService} className="size-4" />
          {t.emergency}
        </label>
      </Section>

      <Section title={t.services}>
        <CheckboxGroup label={t.categories} name="categories" options={shown(categories, tradeName)} selected={selectedCategories} req />
        <CheckboxGroup label={t.regions} name="regions" options={shown(regions, regionName)} selected={selectedRegions} req />
        <CheckboxGroup label={t.propertyTypes} name="propertyTypes" options={shown(propertyTypes, propertyTypeName)} selected={selectedPropertyTypes} />
      </Section>

      <Section title={t.visibility}>
        <Field label={t.visibilityLabel}>
          <select name="publicContactVisibility" defaultValue={defaults.publicContactVisibility ?? "request_intro"} className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm">
            <option value="show_contact">{t.showContact}</option>
            <option value="request_intro">{t.requestIntro}</option>
            <option value="hide_contact">{t.hideContact}</option>
          </select>
        </Field>
      </Section>

      <Button type="submit" size="lg" disabled={pending}>{pending ? t.saving : t.save}</Button>
    </form>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-card p-6">
      <h2 className="mb-4 text-base font-semibold">{title}</h2>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

function Field({ label, req, children }: { label: string; req?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <Label className="mb-1.5 block">{label}{req && <span className="text-red-600"> *</span>}</Label>
      {children}
    </label>
  );
}

function CheckboxGroup({ label, name, options, selected, req }: { label: string; name: string; options: Option[]; selected: string[]; req?: boolean }) {
  return (
    <div>
      <Label className="mb-2 block">{label}{req && <span className="text-red-600"> *</span>}</Label>
      <div className="grid max-h-56 grid-cols-2 gap-1.5 overflow-y-auto rounded-md border border-border p-3 sm:grid-cols-3">
        {options.map((o) => (
          <label key={o.slug} className="flex items-center gap-2 text-sm">
            <input type="checkbox" name={name} value={o.slug} defaultChecked={selected.includes(o.slug)} className="size-4" />
            {o.name}
          </label>
        ))}
      </div>
    </div>
  );
}
