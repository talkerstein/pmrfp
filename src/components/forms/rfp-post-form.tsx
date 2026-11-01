"use client";

import { useActionState, useEffect, useState } from "react";
import { createRfpAction } from "@/lib/dashboard/actions";
import type { ActionState } from "@/lib/auth/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RfpPhotoUploader } from "@/components/forms/rfp-photo-uploader";
import { useLang, useT } from "@/i18n/provider";
import { fmt } from "@/i18n/format";
import { propertyTypeName, regionName, tradeName } from "@/i18n/terms";
import type { ClientMessages } from "@/i18n/dictionaries";

type Option = { slug: string; name: string };

/**
 * createRfpAction (src/lib/dashboard/actions.ts) and rfpPostSchema answer in
 * English. Known messages are shown from pmClient.actions; anything else as-is.
 */
const ACTION_MESSAGE_KEYS: Record<string, keyof ClientMessages["pmClient"]["actions"]> = {
  "Demo mode: connect a Supabase project to save changes.": "demo",
  "Title is required": "titleRequired",
  "A short summary is required": "summaryRequired",
  "Project scope is required": "scopeRequired",
  "Select at least one category": "categoryRequired",
  "Region is required": "regionRequired",
  "Too small: expected number to be >=0": "budgetNegative",
  "Invalid input: expected date, received Date": "deadlineInvalid",
  "Deadline cannot be in the past": "deadlinePast",
  "Invalid email address": "emailInvalid",
  "You must accept the terms": "termsRequired",
  "Please complete the required fields.": "incomplete",
  "Could not create the RFP.": "createFailed",
};

export interface RfpPostDefaults {
  title?: string;
  summary?: string;
  scope?: string;
  requirements?: string;
  categories?: string[];
  templateSlug?: string;
  templateName?: string;
  submissionInstructions?: string;
  propertyType?: string;
  city?: string;
  province?: string;
  /** Region to preselect (from the visitor's location). */
  regionSlug?: string;
  budgetMin?: number;
  budgetMax?: number;
  deadline?: string;
  /** Set when the defaults came from the RFP Writer. */
  fromWriter?: boolean;
  /** Re-tendering a service contract (lib/contracts): posting links the new RFP to it. */
  contractId?: string;
  retenderNotice?: string;
}

/** Same key the RFP Writer saves to (components/rfp-writer/wizard.tsx). */
const WRITER_DRAFT_KEY = "pmrfp:rfp-draft";

function readWriterDraft(headings: { evaluation: string; questions: string }): RfpPostDefaults | undefined {
  try {
    const raw = window.localStorage.getItem(WRITER_DRAFT_KEY);
    if (!raw) return undefined;
    const d = JSON.parse(raw);
    const r = d.rfp;
    if (!r?.title) return undefined;
    const bullets = (items: unknown) =>
      Array.isArray(items) ? items.map((i: string) => `- ${i}`).join("\n") : "";
    const evaluation = bullets(r.evaluationCriteria)
      ? `\n\n${headings.evaluation}\n${bullets(r.evaluationCriteria)}`
      : "";
    const questions = bullets(r.questionsForBidders)
      ? `\n\n${headings.questions}\n${bullets(r.questionsForBidders)}`
      : "";
    return {
      title: r.title,
      summary: r.summary,
      scope: r.scope,
      requirements: r.requirements,
      submissionInstructions: `${r.submissionInstructions}${evaluation}${questions}`,
      categories: d.tradeSlug ? [d.tradeSlug] : [],
      propertyType: d.propertyTypeSlug,
      city: d.city,
      province: d.province,
      budgetMin: d.budgetMin,
      budgetMax: d.budgetMax,
      deadline: d.deadline,
      fromWriter: true,
    };
  } catch {
    return undefined;
  }
}

export function RfpPostForm({
  categories,
  regions,
  propertyTypes,
  defaults: serverDefaults,
  organizationId,
  loadWriterDraft,
}: {
  categories: Option[];
  regions: Option[];
  propertyTypes: Option[];
  defaults?: RfpPostDefaults;
  organizationId: string | null;
  /** ?draft=1 — prefill from the RFP Writer's saved draft (same browser). */
  loadWriterDraft?: boolean;
}) {
  const pm = useT("pmClient");
  const t = pm.form;
  const lang = useLang();
  const [state, action, pending] = useActionState(createRfpAction, {} as ActionState);
  const [writerDraft, setWriterDraft] = useState<RfpPostDefaults | undefined>(undefined);
  useEffect(() => {
    // localStorage only exists in the browser, so this can't be a server default.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (loadWriterDraft) setWriterDraft(readWriterDraft({ evaluation: t.draftEvaluation, questions: t.draftQuestions }));
  }, [loadWriterDraft, t.draftEvaluation, t.draftQuestions]);
  const defaults = writerDraft ?? serverDefaults;
  const preselected = new Set(defaults?.categories ?? []);
  const errorKey = state.error ? ACTION_MESSAGE_KEYS[state.error] : undefined;
  const error = (errorKey && pm.actions[errorKey]) || state.error;
  return (
    // Re-mount when the writer draft arrives so the uncontrolled inputs pick it up.
    <form key={writerDraft ? "writer" : "blank"} action={action} className="space-y-6">
      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {defaults?.fromWriter && (
        <div className="rounded-md border border-teal-300 bg-teal-100 px-4 py-3 text-sm text-teal-ink">
          <span className="font-semibold">{t.fromWriterStrong}</span> {t.fromWriterBody}
        </div>
      )}

      {defaults?.contractId && <input type="hidden" name="contractId" value={defaults.contractId} />}
      {defaults?.retenderNotice && <div className="rounded-md border border-teal-300 bg-teal-100 px-4 py-3 text-sm text-teal-ink">{defaults.retenderNotice}</div>}

      {defaults?.templateName && (
        <div className="rounded-md border border-teal-300 bg-teal-100 px-4 py-3 text-sm text-teal-ink">
          <span className="font-semibold">{t.templateStrong}</span> {fmt(t.templateBody, { name: defaults.templateName })}
        </div>
      )}

      <p className="rounded-md border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
        {t.guideIntro}{" "}
        <a href="/resources/how-to-post-a-quality-rfp" target="_blank" rel="noopener" className="font-medium text-teal-700 underline">
          {t.guideLink}
        </a>
      </p>

      <Section title={t.sections.project}>
        <Field label={t.title} req hint={t.titleHint}>
          <Input name="title" required defaultValue={defaults?.title ?? ""} placeholder={t.titlePlaceholder} />
        </Field>
        <Field label={t.summary} req hint={t.summaryHint}>
          <Textarea name="summary" rows={2} required defaultValue={defaults?.summary ?? ""} />
        </Field>
        <Field label={t.scope} req hint={t.scopeHint}>
          <Textarea name="scope" rows={defaults?.scope ? 12 : 5} required defaultValue={defaults?.scope ?? ""} />
        </Field>
        <Field label={t.requirements} hint={t.requirementsHint}>
          <Textarea name="requirements" rows={defaults?.requirements ? 8 : 3} defaultValue={defaults?.requirements ?? ""} placeholder={t.requirementsPlaceholder} />
        </Field>
      </Section>

      <Section title={t.sections.classification}>
        <CheckboxGroup
          label={t.categories}
          name="categories"
          options={categories.map((c) => ({ slug: c.slug, name: tradeName(c.name, lang) }))}
          req
          preselected={preselected}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t.propertyType}>
            <select name="propertyType" defaultValue={defaults?.propertyType ?? ""} className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm">
              <option value="">{t.select}</option>
              {propertyTypes.map((p) => <option key={p.slug} value={p.slug}>{propertyTypeName(p.name, lang)}</option>)}
            </select>
          </Field>
          <Field label={t.region} req>
            <select name="regionSlug" required defaultValue={defaults?.regionSlug ?? ""} className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm">
              <option value="">{t.select}</option>
              {regions.map((r) => <option key={r.slug} value={r.slug}>{regionName(r.name, lang)}</option>)}
            </select>
          </Field>
          <Field label={t.city}><Input name="city" defaultValue={defaults?.city ?? ""} /></Field>
          <Field label={t.province}><Input name="province" defaultValue={defaults?.province ?? "Ontario"} /></Field>
        </div>
      </Section>

      <Section title={t.sections.photos}>
        <RfpPhotoUploader organizationId={organizationId} />
      </Section>

      <Section title={t.sections.budget}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t.budgetMin} hint={t.budgetMinHint}><Input name="budgetMin" type="number" defaultValue={defaults?.budgetMin ?? ""} /></Field>
          <Field label={t.budgetMax}><Input name="budgetMax" type="number" defaultValue={defaults?.budgetMax ?? ""} /></Field>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="budgetPublic" className="size-4" /> {t.budgetPublic}
        </label>
        <Field label={t.deadline} req hint={t.deadlineHint}><Input name="deadline" type="date" required defaultValue={defaults?.deadline ?? ""} /></Field>
        <Field label={t.instructions} hint={t.instructionsHint}>
          <Textarea
            name="submissionInstructions"
            rows={defaults?.submissionInstructions ? 10 : 3}
            defaultValue={defaults?.submissionInstructions ?? ""}
            placeholder={t.instructionsPlaceholder}
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
