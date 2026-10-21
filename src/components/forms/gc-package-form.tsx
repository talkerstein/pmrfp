"use client";

import { useActionState } from "react";
import { createRfpAction } from "@/lib/dashboard/actions";
import type { ActionState } from "@/lib/auth/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RfpPhotoUploader } from "@/components/forms/rfp-photo-uploader";
import { useLang, useT } from "@/i18n/provider";
import { defaultProvinceFor } from "@/lib/geo-defaults";
import { regionName, tradeName } from "@/i18n/terms";
import type { ClientMessages } from "@/i18n/dictionaries";

type Option = { slug: string; name: string };

type PmActionKey = keyof ClientMessages["pmClient"]["actions"];
type GcActionKey = keyof ClientMessages["partnersClient"]["gcForm"]["actions"];

/**
 * createRfpAction (lib/dashboard/actions) and rfpPostSchema answer in English.
 * Messages shared with the RFP form come from pmClient.actions, GC-only ones
 * from partnersClient.gcForm.actions; anything else is shown as-is.
 */
const ACTION_MESSAGE_KEYS: Record<string, { pm: PmActionKey } | { gc: GcActionKey }> = {
  "Demo mode: connect a Supabase project to save changes.": { pm: "demo" },
  "A short summary is required": { pm: "summaryRequired" },
  "Project scope is required": { pm: "scopeRequired" },
  "Select at least one category": { pm: "categoryRequired" },
  "Region is required": { pm: "regionRequired" },
  "Invalid input: expected date, received Date": { pm: "deadlineInvalid" },
  "Deadline cannot be in the past": { pm: "deadlinePast" },
  "Invalid email address": { pm: "emailInvalid" },
  "You must accept the terms": { pm: "termsRequired" },
  "Please complete the required fields.": { pm: "incomplete" },
  "Could not create the RFP.": { pm: "createFailed" },
  "Project name is required": { gc: "projectRequired" },
  "Pick the trade for this package": { gc: "tradeRequired" },
  "That link isn't a public contract award on PMRFP. Paste the award page link, or leave it blank.": { gc: "badLink" },
  "Sub-trade packages aren't switched on yet. We're turning them on shortly — please try again later, or post this as a regular RFP for now.":
    { gc: "unavailable" },
};

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
  const t = useT("partnersClient").gcForm;
  const pm = useT("pmClient").actions;
  const lang = useLang();
  const hit = state.error ? ACTION_MESSAGE_KEYS[state.error] : undefined;
  const error = (hit && ("pm" in hit ? pm[hit.pm] : t.actions[hit.gc])) || state.error;
  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="kind" value="gc" />
      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {defaults?.relatedContractLabel && (
        <div className="rounded-md border border-teal-300 bg-teal-100 px-4 py-3 text-sm text-teal-ink">
          <span className="font-semibold">{t.linked}</span> {defaults.relatedContractLabel}
        </div>
      )}

      <Section title={t.sections.project}>
        <Field label={t.projectName} req hint={t.projectNameHint}>
          <Input name="gcProjectName" required maxLength={160} defaultValue={defaults?.projectName ?? ""} />
        </Field>
        <Field
          label={t.related}
          hint={t.relatedHint}
        >
          <Input name="relatedContract" defaultValue={defaults?.relatedContract ?? ""} placeholder={t.relatedPlaceholder} />
        </Field>
      </Section>

      <Section title={t.sections.trade}>
        <Field label={t.trade} req hint={t.tradeHint}>
          <select name="categories" required defaultValue="" className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm">
            <option value="">{t.select}</option>
            {categories.map((c) => <option key={c.slug} value={c.slug}>{tradeName(c.name, lang)}</option>)}
          </select>
        </Field>
        <Field label={t.summary} req hint={t.summaryHint}>
          <Textarea name="summary" rows={2} required />
        </Field>
        <Field label={t.scope} req hint={t.scopeHint}>
          <Textarea name="scope" rows={6} required />
        </Field>
        <Field label={t.requirements} hint={t.requirementsHint}>
          <Textarea name="requirements" rows={3} />
        </Field>
      </Section>

      <Section title={t.sections.location}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t.region} req>
            <select name="regionSlug" required defaultValue={defaults?.regionSlug ?? ""} className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm">
              <option value="">{t.select}</option>
              {regions.map((r) => <option key={r.slug} value={r.slug}>{regionName(r.name, lang)}</option>)}
            </select>
          </Field>
          <Field label={t.city}><Input name="city" defaultValue={defaults?.city ?? ""} /></Field>
          <Field label={t.province}><Input name="province" defaultValue={defaults?.province ?? defaultProvinceFor(lang)} /></Field>
        </div>
      </Section>

      <Section title={t.sections.photos}>
        <RfpPhotoUploader
          organizationId={organizationId}
          label={t.photosLabel}
          helpText={t.photosHelp}
        />
      </Section>

      <Section title={t.sections.quotes}>
        <Field label={t.deadline} req hint={t.deadlineHint}>
          <Input name="deadline" type="date" required />
        </Field>
        <Field label={t.howTo} hint={t.howToHint}>
          <Textarea
            name="submissionInstructions"
            rows={3}
            placeholder={t.howToPlaceholder}
          />
        </Field>
      </Section>

      <Section title={t.sections.contact}>
        <Field label={t.visibility} req>
          <select name="contactVisibility" defaultValue="pmrfp_mediated" className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm">
            <option value="public_contact">{t.visibilityPublic}</option>
            <option value="pmrfp_mediated">{t.visibilityMediated}</option>
            <option value="anonymous_until_interest_approved">{t.visibilityAnonymous}</option>
          </select>
        </Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label={t.contactName}><Input name="contactName" /></Field>
          <Field label={t.contactEmail}><Input name="contactEmail" type="email" /></Field>
          <Field label={t.contactPhone}><Input name="contactPhone" /></Field>
        </div>
      </Section>

      <label className="flex items-start gap-2 text-sm text-muted-foreground">
        <input type="checkbox" name="acceptTerms" required className="mt-0.5 size-4" />
        <span>{t.disclaimer}</span>
      </label>

      <Button type="submit" size="lg" disabled={pending}>{pending ? t.submitting : t.submit}</Button>
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
