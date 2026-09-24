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

export interface GcPackageDefaults {
  projectName?: string;
  regionSlug?: string;
  city?: string;
  province?: string;
  /** The award page link, when the GC came from a contract they won. */
  relatedContract?: string;
  /** "Roof replacement, 12 Main St — won by Metro Roofing ($1.2M)" */
  relatedContractLabel?: string;
}

/**
 * "Post a sub-trade package" — GC wording over the same createRfpAction the
 * PM form uses. kind=gc makes it a gc_package row titled "{Trade} package —
 * {Project}". One trade per package, so trades only see what fits them.
 */
export function GcPackageForm({
  categories,
  regions,
  defaults,
  organizationId,
}: {
  categories: Option[];
  regions: Option[];
  defaults?: GcPackageDefaults;
  organizationId: string | null;
}) {
  const [state, action, pending] = useActionState(createRfpAction, {} as ActionState);
  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="kind" value="gc" />
      {state.error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>}

      {defaults?.relatedContractLabel && (
        <div className="rounded-md border border-teal-300 bg-teal-100 px-4 py-3 text-sm text-teal-ink">
          <span className="font-semibold">Linked to the contract you won:</span> {defaults.relatedContractLabel}
        </div>
      )}

      <Section title="Project">
        <Field label="Project name" req hint="Trades see this. e.g. Etobicoke school renovation">
          <Input name="gcProjectName" required maxLength={160} defaultValue={defaults?.projectName ?? ""} />
        </Field>
        <Field
          label="Related public contract (optional)"
          hint="If you won this job as a public contract, paste its PMRFP page link. Trades will see it's real work."
        >
          <Input name="relatedContract" defaultValue={defaults?.relatedContract ?? ""} placeholder="https://pmrfp.com/rfps/…" />
        </Field>
      </Section>

      <Section title="Trade package">
        <Field label="Trade" req hint="One trade per package. Post another package for each trade you need.">
          <select name="categories" required defaultValue="" className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm">
            <option value="">Select…</option>
            {categories.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
          </select>
        </Field>
        <Field label="Short summary" req hint="Shown to everyone. Two sentences: the work and the one detail that shapes the price.">
          <Textarea name="summary" rows={2} required />
        </Field>
        <Field label="Scope of work" req hint="What this trade does on the job: quantities, specs, drawings to follow, what's excluded. Trade Pro members see this.">
          <Textarea name="scope" rows={6} required />
        </Field>
        <Field label="Requirements" hint="Insurance, WSIB/WCB (or U.S. workers' comp), licences, bonding, safety training.">
          <Textarea name="requirements" rows={3} />
        </Field>
      </Section>

      <Section title="Location">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Region" req>
            <select name="regionSlug" required defaultValue={defaults?.regionSlug ?? ""} className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm">
              <option value="">Select…</option>
              {regions.map((r) => <option key={r.slug} value={r.slug}>{r.name}</option>)}
            </select>
          </Field>
          <Field label="City"><Input name="city" defaultValue={defaults?.city ?? ""} /></Field>
          <Field label="Province / state"><Input name="province" defaultValue={defaults?.province ?? "Ontario"} /></Field>
        </div>
      </Section>

      <Section title="Site photos">
        <RfpPhotoUploader
          organizationId={organizationId}
          label="Site photos (optional)"
          helpText="Photos of the site or the work area. JPEG, PNG, or WebP. Max 8 photos, 5 MB each."
        />
      </Section>

      <Section title="Quotes">
        <Field label="Quotes due" req hint="Leave subs at least a week. Two if they need a site visit.">
          <Input name="deadline" type="date" required />
        </Field>
        <Field label="How to quote" hint="What to include, site-visit date, question cut-off, start date.">
          <Textarea
            name="submissionInstructions"
            rows={3}
            placeholder="e.g. Lump-sum price per the scope above, with a breakdown of labour and materials. Include your insurance certificate and WSIB clearance. Site visit Oct 3, 9 a.m. Work starts early November."
          />
        </Field>
      </Section>

      <Section title="Contact">
        <Field label="Contact visibility" req>
          <select name="contactVisibility" defaultValue="pmrfp_mediated" className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm">
            <option value="public_contact">Public — paid members see my contact details</option>
            <option value="pmrfp_mediated">Mediated — trades express interest through PMRFP</option>
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

      <Button type="submit" size="lg" disabled={pending}>{pending ? "Submitting…" : "Submit package for review"}</Button>
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
