"use client";

import { useActionState, useEffect, useState } from "react";
import { createRfpAction } from "@/lib/dashboard/actions";
import type { ActionState } from "@/lib/auth/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useLang, useT } from "@/i18n/provider";
import { regionName, tradeName } from "@/i18n/terms";
import type { PostKind } from "@/lib/town-jobs/rules";

type Option = { slug: string; name: string };

/** Same key the writers save to (components/rfp-writer). */
const WRITER_DRAFT_KEY = "pmrfp:rfp-draft";

interface Defaults {
  title?: string;
  summary?: string;
  scope?: string;
  requirements?: string;
  submissionInstructions?: string;
  categories?: string[];
  deadline?: string;
  questionDeadline?: string;
  budgetMin?: number;
  budgetMax?: number;
  fromWriter?: boolean;
}

function readWriterDraft(headings: { evaluation: string; questions: string }): Defaults | undefined {
  try {
    const raw = window.localStorage.getItem(WRITER_DRAFT_KEY);
    if (!raw) return undefined;
    const d = JSON.parse(raw);
    const r = d.rfp;
    if (!r?.title) return undefined;
    const bullets = (items: unknown) => (Array.isArray(items) ? items.map((i: string) => `- ${i}`).join("\n") : "");
    const evaluation = bullets(r.evaluationCriteria) ? `\n\n${headings.evaluation}\n${bullets(r.evaluationCriteria)}` : "";
    const questions = bullets(r.questionsForBidders) ? `\n\n${headings.questions}\n${bullets(r.questionsForBidders)}` : "";
    return {
      title: r.title,
      summary: r.summary,
      scope: r.scope,
      requirements: r.requirements,
      submissionInstructions: `${r.submissionInstructions ?? ""}${evaluation}${questions}`.trim(),
      categories: d.tradeSlug ? [d.tradeSlug] : [],
      deadline: d.deadline,
      questionDeadline: d.municipal?.questionDeadline,
      budgetMin: d.budgetMin,
      budgetMax: d.budgetMax,
      fromWriter: true,
    };
  } catch {
    return undefined;
  }
}

/**
 * A town posts a job (/buyer-dashboard/jobs/new): a quote request (trades
 * respond on PMRFP) or a formal tender mirror (summary and official link
 * only). It posts to the PM job flow's own action (lib/dashboard/actions
 * createRfpAction), which sees the public-buyer account and adds the town's
 * fields (lib/town-jobs). Plain language for a department head.
 */
export function TownJobForm({
  kind,
  categories,
  regions,
  defaultRegion,
  province,
  city,
  loadWriterDraft,
}: {
  kind: PostKind;
  categories: Option[];
  regions: Option[];
  defaultRegion: string | null;
  province: string;
  city: string;
  loadWriterDraft?: boolean;
}) {
  const t = useT("townJobsClient").form;
  const pm = useT("pmClient").form;
  const lang = useLang();
  const [state, action, pending] = useActionState(createRfpAction, {} as ActionState);
  const [draft, setDraft] = useState<Defaults | undefined>(undefined);
  const [showContact, setShowContact] = useState(false);
  useEffect(() => {
    // localStorage only exists in the browser, so this can't be a server default.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (loadWriterDraft) setDraft(readWriterDraft({ evaluation: pm.draftEvaluation, questions: pm.draftQuestions }));
  }, [loadWriterDraft, pm.draftEvaluation, pm.draftQuestions]);
  const mirror = kind === "tender_mirror";
  const preselected = new Set(draft?.categories ?? []);

  return (
    <form key={draft ? "writer" : "blank"} action={action} className="space-y-6" data-kind={kind}>
      <input type="hidden" name="lang" value={lang} />
      <input type="hidden" name="postKind" value={kind} />
      <input type="hidden" name="contactVisibility" value={showContact ? "public_contact" : "pmrfp_mediated"} />
      {state.error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{state.error}</p>}
      {draft?.fromWriter && <div className="rounded-md border border-teal-300 bg-teal-100 px-4 py-3 text-sm text-teal-ink">{t.fromWriter}</div>}

      <p className="rounded-lg border border-border bg-card px-4 py-3 text-sm" data-post-kind={kind}>
        <span className="font-semibold">{t.kind[kind]}.</span> <span className="text-muted-foreground">{t.kind[`${kind}Hint`]}</span>
      </p>

      <Section title={t.sections.job}>
        <Field label={t.title} req hint={t.titleHint}>
          <Input name="title" required maxLength={200} defaultValue={draft?.title ?? ""} placeholder={t.titlePlaceholder} />
        </Field>
        <Field label={t.summary} req hint={mirror ? t.summaryMirrorHint : t.summaryHint}>
          <Textarea name="summary" rows={2} required defaultValue={draft?.summary ?? ""} />
        </Field>
        {mirror ? (
          <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
            <Field label={t.officialUrl} req hint={t.officialUrlHint}>
              <Input name="officialUrl" type="url" inputMode="url" required placeholder="https://" />
            </Field>
            <Field label={t.officialPortal}>
              <Input name="officialPortal" maxLength={120} placeholder={t.officialPortalPlaceholder} />
            </Field>
          </div>
        ) : (
          <>
            <Field label={t.scope} req hint={t.scopeHint}>
              <Textarea name="scope" rows={draft?.scope ? 14 : 6} required defaultValue={draft?.scope ?? ""} />
            </Field>
            <Field label={t.requirements} hint={t.requirementsHint}>
              <Textarea name="requirements" rows={draft?.requirements ? 8 : 3} defaultValue={draft?.requirements ?? ""} />
            </Field>
            <Field label={t.instructions} hint={t.instructionsHint}>
              <Textarea name="submissionInstructions" rows={draft?.submissionInstructions ? 10 : 3} defaultValue={draft?.submissionInstructions ?? ""} />
            </Field>
          </>
        )}
      </Section>

      <Section title={t.sections.where}>
        <div>
          <Label className="mb-1 block">{t.trades}<span className="text-red-600"> *</span></Label>
          <p className="mb-2 text-xs text-muted-foreground">{t.tradesHint}</p>
          <div className="grid max-h-48 grid-cols-2 gap-1.5 overflow-y-auto rounded-md border border-border p-3 sm:grid-cols-3">
            {categories.map((c) => (
              <label key={c.slug} className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="categories" value={c.slug} defaultChecked={preselected.has(c.slug)} className="size-4" />
                {tradeName(c.name, lang)}
              </label>
            ))}
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label={t.region} req>
            <select name="regionSlug" required defaultValue={defaultRegion ?? ""} className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm">
              <option value="">{t.select}</option>
              {regions.map((r) => <option key={r.slug} value={r.slug}>{regionName(r.name, lang)}</option>)}
            </select>
          </Field>
          <Field label={t.city}><Input name="city" defaultValue={city} /></Field>
          <Field label={t.province}><Input name="province" defaultValue={province} readOnly className="bg-secondary/40" /></Field>
        </div>
      </Section>

      <Section title={t.sections.dates}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={mirror ? t.deadlineMirror : t.deadline} req>
            <Input name="deadline" type="date" required defaultValue={draft?.deadline ?? ""} />
          </Field>
          {!mirror && (
            <Field label={t.questionDeadline} hint={t.questionDeadlineHint}>
              <Input name="questionDeadline" type="date" defaultValue={draft?.questionDeadline ?? ""} />
            </Field>
          )}
        </div>
        {!mirror && (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t.budgetMin}><Input name="budgetMin" type="number" min={0} defaultValue={draft?.budgetMin ?? ""} /></Field>
              <Field label={t.budgetMax}><Input name="budgetMax" type="number" min={0} defaultValue={draft?.budgetMax ?? ""} /></Field>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="budgetPublic" className="size-4" /> {t.budgetPublic}
            </label>
          </>
        )}
      </Section>

      <Section title={t.sections.contact}>
        <p className="text-xs text-muted-foreground">{t.contactHint}</p>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={showContact} onChange={(e) => setShowContact(e.target.checked)} className="size-4" /> {t.showContact}
        </label>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label={t.contactName}><Input name="contactName" /></Field>
          <Field label={t.contactEmail}><Input name="contactEmail" type="email" /></Field>
          <Field label={t.contactPhone}><Input name="contactPhone" /></Field>
        </div>
      </Section>

      <label className="flex items-start gap-2 text-sm text-muted-foreground">
        <input type="checkbox" name="acceptTerms" required className="mt-0.5 size-4" />
        <span>{t.terms}</span>
      </label>

      <Button type="submit" size="lg" disabled={pending}>{pending ? t.submitting : mirror ? t.submitMirror : t.submit}</Button>
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
