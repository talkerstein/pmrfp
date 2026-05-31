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

type Option = { slug: string; name: string };

export interface CompanyDefaults {
  name?: string; website?: string; phone?: string; email?: string;
  addressLine1?: string; city?: string; province?: string; postalCode?: string;
  shortDescription?: string; fullDescription?: string; yearsInBusiness?: number | null;
  employeeCountRange?: string; insuranceStatus?: string; wsibStatus?: string;
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
}: {
  defaults: CompanyDefaults;
  organizationId: string | null;
  categories: Option[];
  regions: Option[];
  propertyTypes: Option[];
  selectedCategories?: string[];
  selectedRegions?: string[];
  selectedPropertyTypes?: string[];
}) {
  const [state, action, pending] = useActionState(updateCompanyProfileAction, {} as ActionState);

  return (
    <form action={action} className="space-y-6">
      {state.error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>}
      {state.success && <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">{state.success}</p>}

      <Section title="Logo">
        <LogoUploader
          organizationId={organizationId}
          initialLogoUrl={defaults.logoUrl ?? null}
        />
      </Section>

      <Section title="Portfolio">
        <PortfolioUploader organizationId={organizationId} />
      </Section>

      <Section title="Company basics">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Company name" req><Input name="name" defaultValue={defaults.name} required /></Field>
          <Field label="Website"><Input name="website" defaultValue={defaults.website} placeholder="https://" /></Field>
          <Field label="Email" req><Input name="email" type="email" defaultValue={defaults.email} required /></Field>
          <Field label="Phone"><Input name="phone" defaultValue={defaults.phone} /></Field>
          <Field label="Address"><Input name="addressLine1" defaultValue={defaults.addressLine1} /></Field>
          <Field label="City"><Input name="city" defaultValue={defaults.city} /></Field>
          <Field label="Province"><Input name="province" defaultValue={defaults.province} /></Field>
          <Field label="Postal code"><Input name="postalCode" defaultValue={defaults.postalCode} /></Field>
        </div>
      </Section>

      <Section title="About">
        <Field label="Short description (max 300 chars)">
          <Textarea name="shortDescription" rows={2} maxLength={300} defaultValue={defaults.shortDescription} />
        </Field>
        <Field label="Full description (max 2500 chars)">
          <Textarea name="fullDescription" rows={5} maxLength={2500} defaultValue={defaults.fullDescription} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Years in business"><Input name="yearsInBusiness" type="number" defaultValue={defaults.yearsInBusiness ?? ""} /></Field>
          <Field label="Team size">
            <select name="employeeCountRange" defaultValue={defaults.employeeCountRange ?? ""} className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm">
              <option value="">Select…</option>
              {["1-10", "11-50", "51-200", "200+"].map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </Field>
          <Field label="Insurance"><Input name="insuranceStatus" defaultValue={defaults.insuranceStatus} placeholder="e.g. Fully insured ($5M)" /></Field>
          <Field label="WSIB status"><Input name="wsibStatus" defaultValue={defaults.wsibStatus} placeholder="e.g. Active" /></Field>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="emergencyService" defaultChecked={defaults.emergencyService} className="size-4" />
          We offer emergency / 24-7 service
        </label>
      </Section>

      <Section title="Services & coverage">
        <CheckboxGroup label="Service categories" name="categories" options={categories} selected={selectedCategories} req />
        <CheckboxGroup label="Service regions" name="regions" options={regions} selected={selectedRegions} req />
        <CheckboxGroup label="Property types served" name="propertyTypes" options={propertyTypes} selected={selectedPropertyTypes} />
      </Section>

      <Section title="Contact visibility">
        <Field label="How buyers see your contact details">
          <select name="publicContactVisibility" defaultValue={defaults.publicContactVisibility ?? "request_intro"} className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm">
            <option value="show_contact">Show contact details publicly</option>
            <option value="request_intro">Let buyers request an introduction</option>
            <option value="hide_contact">Hide contact details</option>
          </select>
        </Field>
      </Section>

      <Button type="submit" size="lg" disabled={pending}>{pending ? "Saving…" : "Save profile"}</Button>
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
