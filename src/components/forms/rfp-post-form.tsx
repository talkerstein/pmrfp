"use client";

import { useActionState } from "react";
import { createRfpAction } from "@/lib/dashboard/actions";
import type { ActionState } from "@/lib/auth/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { COPY } from "@/lib/site";
import { RfpPhotoUploader } from "@/components/forms/rfp-photo-uploader";

type Option = { slug: string; name: string };

export interface RfpPostDefaults {
  title?: string;
  summary?: string;
  scope?: string;
  requirements?: string;
  categories?: string[];
  templateSlug?: string;
  templateName?: string;
}

export function RfpPostForm({
  categories,
  regions,
  propertyTypes,
  defaults,
  organizationId,
}: {
  categories: Option[];
  regions: Option[];
  propertyTypes: Option[];
  defaults?: RfpPostDefaults;
  organizationId: string | null;
}) {
  const [state, action, pending] = useActionState(createRfpAction, {} as ActionState);
  const preselected = new Set(defaults?.categories ?? []);
  return (
    <form action={action} className="space-y-6">
      {state.error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>}

      {defaults?.templateName && (
        <div className="rounded-md border border-teal-300 bg-teal-100 px-4 py-3 text-sm text-teal-ink">
          <span className="font-semibold">Pre-filled from template:</span> {defaults.templateName}.
          Edit anything before submitting.
        </div>
      )}

      <p className="rounded-md border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
        Clear requests get more — and more comparable — bids.{" "}
        <a href="/resources/how-to-post-a-quality-rfp" target="_blank" rel="noopener" className="font-medium text-teal-700 underline">
          The 7-step guide to posting a quality RFP
        </a>
      </p>

      <Section title="Project">
        <Field label="RFP title" req hint="Name the work, the property type and the city.">
          <Input name="title" required defaultValue={defaults?.title ?? ""} placeholder="e.g. Condominium Electrical Maintenance Contract" />
        </Field>
        <Field label="Short summary" req hint="Two sentences: what you need, plus the one detail that shapes the price.">
          <Textarea name="summary" rows={2} required defaultValue={defaults?.summary ?? ""} />
        </Field>
        <Field label="Full scope" req hint="Cover the building and access, the work, what's included, what's excluded, and any add-alternates to price separately.">
          <Textarea name="scope" rows={defaults?.scope ? 12 : 5} required defaultValue={defaults?.scope ?? ""} />
        </Field>
        <Field label="Requirements" hint="Insurance (and who's named as additional insured), WSIB/WCB clearance, licences for the trade, and references.">
          <Textarea name="requirements" rows={defaults?.requirements ? 8 : 3} defaultValue={defaults?.requirements ?? ""} placeholder="Insurance, licensing, references, etc." />
        </Field>
      </Section>

      <Section title="Classification">
        <CheckboxGroup label="Categories" name="categories" options={categories} req preselected={preselected} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Property type">
            <select name="propertyType" className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm">
              <option value="">Select…</option>
              {propertyTypes.map((p) => <option key={p.slug} value={p.slug}>{p.name}</option>)}
            </select>
          </Field>
          <Field label="Region" req>
            <select name="regionSlug" required className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm">
              <option value="">Select…</option>
              {regions.map((r) => <option key={r.slug} value={r.slug}>{r.name}</option>)}
            </select>
          </Field>
          <Field label="City"><Input name="city" /></Field>
          <Field label="Province"><Input name="province" defaultValue="Ontario" /></Field>
        </div>
      </Section>

      <Section title="Photos">
        <RfpPhotoUploader organizationId={organizationId} />
      </Section>

      <Section title="Budget & timeline">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Budget min (CAD)"><Input name="budgetMin" type="number" /></Field>
          <Field label="Budget max (CAD)"><Input name="budgetMax" type="number" /></Field>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="budgetPublic" className="size-4" /> Show budget publicly
        </label>
        <Field label="Submission deadline" req hint="Allow three weeks for capital work or multi-year contracts, and one to two weeks for small jobs."><Input name="deadline" type="date" required /></Field>
        <Field label="Submission instructions" hint="What to send, the site-walk date, the question cut-off, and how you'll score bids.">
          <Textarea
            name="submissionInstructions"
            rows={3}
            placeholder="e.g. Lump-sum price for the base scope, add-alternates priced separately. Include insurance certificate, WSIB clearance, schedule and 3 references. Site walk May 12, 10 a.m. Evaluation: price 40%, experience 30%, scope coverage 20%, schedule 10%."
          />
        </Field>
      </Section>

      <Section title="Contact">
        <Field label="Contact visibility" req>
          <select name="contactVisibility" defaultValue="pmrfp_mediated" className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm">
            <option value="public_contact">Public — paid members see my contact details</option>
            <option value="pmrfp_mediated">Mediated — vendors express interest through PMRFP</option>
            <option value="anonymous_until_interest_approved">Anonymous until I approve interest</option>
          </select>
        </Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Contact name"><Input name="contactName" /></Field>
          <Field label="Contact email"><Input name="contactEmail" type="email" /></Field>
          <Field label="Contact phone"><Input name="contactPhone" /></Field>
        </div>
      </Section>

      <label className="flex items-start gap-2 text-sm text-muted-foreground">
        <input type="checkbox" name="acceptTerms" required className="mt-0.5 size-4" />
        <span>{COPY.pmPostingDisclaimer}</span>
      </label>

      <Button type="submit" size="lg" disabled={pending}>{pending ? "Submitting…" : "Submit RFP for review"}</Button>
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
function Field({ label, req, hint, children }: { label: string; req?: boolean; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <Label className="mb-1.5 block">{label}{req && <span className="text-red-600"> *</span>}</Label>
      {children}
      {hint && <span className="mt-1.5 block text-xs text-muted-foreground">{hint}</span>}
    </label>
  );
}
function CheckboxGroup({
  label,
  name,
  options,
  req,
  preselected,
}: {
  label: string;
  name: string;
  options: Option[];
  req?: boolean;
  preselected?: Set<string>;
}) {
  return (
    <div>
      <Label className="mb-2 block">{label}{req && <span className="text-red-600"> *</span>}</Label>
      <div className="grid max-h-48 grid-cols-2 gap-1.5 overflow-y-auto rounded-md border border-border p-3 sm:grid-cols-3">
        {options.map((o) => (
          <label key={o.slug} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name={name}
              value={o.slug}
              defaultChecked={preselected?.has(o.slug) ?? false}
              className="size-4"
            />
            {o.name}
          </label>
        ))}
      </div>
    </div>
  );
}
