"use client";

import { useActionState, useMemo, useState } from "react";
import { Check, ChevronLeft, ChevronRight, MapPin, Briefcase, DollarSign, CalendarClock, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createJobAction, type JobFormState } from "@/lib/jobs/actions";
import { EMPLOYMENT_LABEL, EMPLOYMENT_TYPES, PAY_UNITS, payLabel, type PayUnit } from "@/lib/jobs/rules";
import {
  BENEFIT_OPTIONS,
  EXPERIENCE_LEVELS,
  LICENCE_OPTIONS,
  ROLE_TEMPLATES,
  SCHEDULE_OPTIONS,
  composeJob,
  jobQuality,
  pickTrade,
  type JobDraft,
  type RoleTemplate,
} from "@/lib/jobs/templates";
import { useLang } from "@/i18n/provider";
import { cn } from "@/lib/utils";

type Option = { slug: string; name: string };

const SELECT =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const STEPS = ["Role", "Basics", "Details", "Review"] as const;

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1.5 text-sm transition-colors",
        on ? "border-teal-600 bg-teal-50 text-teal-900" : "border-border bg-background text-muted-foreground hover:border-foreground/30 hover:text-foreground",
      )}
    >
      {on && <Check className="mr-1 inline size-3.5" />}
      {children}
    </button>
  );
}

function Field({ label, hint, children, className }: { label: string; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <Label className="mb-1.5 flex items-center justify-between">
        {label}
        {hint && <span className="text-xs font-normal text-muted-foreground">{hint}</span>}
      </Label>
      {children}
    </div>
  );
}

/**
 * Post a job in four steps: pick a starter for the role, fill the basics, add
 * licences and perks, then review a live preview with a quality score. It
 * submits through the same server action as the plain form; the wizard only
 * composes the description and requirements text.
 */
export function JobWizard({ trades, regions }: { trades: Option[]; regions: Option[] }) {
  const [state, action, pending] = useActionState<JobFormState, FormData>(createJobAction, {});
  const lang = useLang();
  const [step, setStep] = useState(0);
  const [roleId, setRoleId] = useState<string | null>(null);
  const [category, setCategory] = useState("");
  const [region, setRegion] = useState("");
  const [payUnit, setPayUnit] = useState<PayUnit>("hour");
  const [draft, setDraft] = useState<JobDraft>({
    title: "",
    employmentType: "full_time",
    city: "",
    payMin: "",
    payMax: "",
    schedule: "",
    startDate: "",
    intro: "",
    duties: "",
    licences: [],
    experience: "",
    requirementsExtra: "",
    benefits: [],
    howToApply: "Apply in a minute below. No account needed.",
  });
  const set = <K extends keyof JobDraft>(k: K, v: JobDraft[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const toggle = (k: "licences" | "benefits", v: string) =>
    setDraft((d) => ({ ...d, [k]: d[k].includes(v) ? d[k].filter((x) => x !== v) : [...d[k], v] }));

  function chooseRole(t: RoleTemplate) {
    setRoleId(t.id);
    setCategory((c) => pickTrade(t.tradeHint, trades) || c);
    setDraft((d) => ({
      ...d,
      title: t.title,
      employmentType: t.employmentType,
      intro: t.intro,
      duties: t.duties.join("\n"),
      licences: [...t.licences],
      requirementsExtra: t.requirementsExtra,
    }));
    setStep(1);
  }

  const composed = useMemo(() => composeJob(draft), [draft]);
  const quality = useMemo(() => jobQuality(draft), [draft]);
  const min = draft.payMin ? Number(draft.payMin) : null;
  const max = draft.payMax ? Number(draft.payMax) : null;
  const pay = payLabel(min, max, min != null || max != null ? payUnit : null);
  const tradeName = trades.find((t) => t.slug === category)?.name ?? "";
  const regionName = regions.find((r) => r.slug === region)?.name ?? "";

  const basicsOk = draft.title.trim().length >= 4 && category !== "" && region !== "" && draft.city.trim().length >= 2;
  const detailsOk = composed.description.length >= 40;
  const canNext = step === 1 ? basicsOk : step === 2 ? detailsOk : true;

  return (
    <form
      action={action}
      className="grid gap-8 lg:grid-cols-[1fr_340px]"
      onKeyDown={(e) => {
        // Enter in a text box moves on; it never posts the job by accident.
        if (e.key === "Enter" && e.target instanceof HTMLInputElement) e.preventDefault();
      }}
    >
      <input type="hidden" name="lang" value={lang} />
      <input type="hidden" name="title" value={draft.title} />
      <input type="hidden" name="category" value={category} />
      <input type="hidden" name="region" value={region} />
      <input type="hidden" name="city" value={draft.city} />
      <input type="hidden" name="employmentType" value={draft.employmentType} />
      <input type="hidden" name="payMin" value={draft.payMin} />
      <input type="hidden" name="payMax" value={draft.payMax} />
      <input type="hidden" name="payUnit" value={payUnit} />
      <input type="hidden" name="description" value={composed.description} />
      <input type="hidden" name="requirements" value={composed.requirements} />

      <div>
        <ol className="mb-6 flex items-center gap-2 text-sm" aria-label="Progress">
          {STEPS.map((s, i) => (
            <li key={s} className="flex items-center gap-2">
              <span
                className={cn(
                  "flex size-6 items-center justify-center rounded-full text-xs font-semibold",
                  i < step ? "bg-teal-600 text-white" : i === step ? "bg-foreground text-background" : "bg-secondary text-muted-foreground",
                )}
              >
                {i < step ? <Check className="size-3.5" /> : i + 1}
              </span>
              <span className={cn("hidden sm:inline", i === step ? "font-medium" : "text-muted-foreground")}>{s}</span>
              {i < STEPS.length - 1 && <span className="mx-1 h-px w-4 bg-border" />}
            </li>
          ))}
        </ol>

        {step === 0 && (
          <section>
            <h2 className="text-xl font-semibold tracking-tight">Who are you hiring?</h2>
            <p className="mt-1 text-sm text-muted-foreground">Pick a starting point. We fill in a solid draft and you change anything.</p>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {ROLE_TEMPLATES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => chooseRole(t)}
                  className={cn(
                    "rounded-xl border bg-card p-4 text-left transition-colors hover:border-teal-600",
                    roleId === t.id ? "border-teal-600 ring-1 ring-teal-600" : "border-border",
                  )}
                >
                  <span className="block font-medium">{t.label}</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {t.id === "custom" ? "Start from a blank page" : `${EMPLOYMENT_LABEL[t.employmentType]} · ready-to-edit draft`}
                  </span>
                </button>
              ))}
            </div>
          </section>
        )}

        {step === 1 && (
          <section className="grid gap-5 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <h2 className="text-xl font-semibold tracking-tight">The basics</h2>
              <p className="mt-1 text-sm text-muted-foreground">Where, what and how much. Jobs with pay get more applications.</p>
            </div>
            <Field label="Job title" className="sm:col-span-2">
              <Input value={draft.title} onChange={(e) => set("title", e.target.value)} maxLength={120} placeholder="Licensed Plumber" />
            </Field>
            <Field label="Trade">
              <select value={category} onChange={(e) => setCategory(e.target.value)} className={SELECT}>
                <option value="" disabled>
                  Pick the trade
                </option>
                {trades.map((c) => (
                  <option key={c.slug} value={c.slug}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Type of job">
              <select value={draft.employmentType} onChange={(e) => set("employmentType", e.target.value as JobDraft["employmentType"])} className={SELECT}>
                {EMPLOYMENT_TYPES.map((e) => (
                  <option key={e} value={e}>
                    {EMPLOYMENT_LABEL[e]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Region">
              <select value={region} onChange={(e) => setRegion(e.target.value)} className={SELECT}>
                <option value="" disabled>
                  Pick the region
                </option>
                {regions.map((r) => (
                  <option key={r.slug} value={r.slug}>
                    {r.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="City or area">
              <Input value={draft.city} onChange={(e) => set("city", e.target.value)} maxLength={80} placeholder="North York" />
            </Field>
            <Field label="Pay" hint="Optional, but it helps a lot" className="sm:col-span-2">
              <div className="grid grid-cols-[1fr_auto_1fr_auto] items-center gap-2">
                <Input type="number" min={0} step="0.01" inputMode="decimal" value={draft.payMin} onChange={(e) => set("payMin", e.target.value)} placeholder="From" aria-label="Pay from" />
                <span className="text-sm text-muted-foreground">to</span>
                <Input type="number" min={0} step="0.01" inputMode="decimal" value={draft.payMax} onChange={(e) => set("payMax", e.target.value)} placeholder="Up to" aria-label="Pay up to" />
                <select value={payUnit} onChange={(e) => setPayUnit(e.target.value as PayUnit)} className={SELECT} aria-label="Per">
                  {PAY_UNITS.map((u) => (
                    <option key={u} value={u}>
                      per {u}
                    </option>
                  ))}
                </select>
              </div>
            </Field>
            <Field label="Schedule">
              <select value={draft.schedule} onChange={(e) => set("schedule", e.target.value)} className={SELECT}>
                <option value="">Not specified</option>
                {SCHEDULE_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Start date" hint="e.g. Immediately, Nov 15">
              <Input value={draft.startDate} onChange={(e) => set("startDate", e.target.value)} maxLength={40} placeholder="Immediately" />
            </Field>
          </section>
        )}

        {step === 2 && (
          <section className="grid gap-6">
            <div>
              <h2 className="text-xl font-semibold tracking-tight">What the job is</h2>
              <p className="mt-1 text-sm text-muted-foreground">Edit the draft, then tick the tickets you need and the perks you offer.</p>
            </div>
            <Field label="About the job and your company">
              <Textarea rows={5} value={draft.intro} onChange={(e) => set("intro", e.target.value)} maxLength={1200} placeholder="Who you are, the work, and who you want." />
            </Field>
            <Field label="What you will do" hint="One per line">
              <Textarea rows={5} value={draft.duties} onChange={(e) => set("duties", e.target.value)} maxLength={1200} />
            </Field>
            <div>
              <Label className="mb-2 block">Licences and tickets required</Label>
              <div className="flex flex-wrap gap-2">
                {LICENCE_OPTIONS.map((l) => (
                  <Chip key={l} on={draft.licences.includes(l)} onClick={() => toggle("licences", l)}>
                    {l}
                  </Chip>
                ))}
              </div>
            </div>
            <Field label="Experience">
              <select value={draft.experience} onChange={(e) => set("experience", e.target.value)} className={SELECT}>
                {EXPERIENCE_LEVELS.map((x) => (
                  <option key={x.value} value={x.value}>
                    {x.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Anything else you require" hint="Optional">
              <Textarea rows={2} value={draft.requirementsExtra} onChange={(e) => set("requirementsExtra", e.target.value)} maxLength={800} />
            </Field>
            <div>
              <Label className="mb-2 block">What you offer</Label>
              <div className="flex flex-wrap gap-2">
                {BENEFIT_OPTIONS.map((b) => (
                  <Chip key={b} on={draft.benefits.includes(b)} onClick={() => toggle("benefits", b)}>
                    {b}
                  </Chip>
                ))}
              </div>
            </div>
          </section>
        )}

        {step === 3 && (
          <section>
            <h2 className="text-xl font-semibold tracking-tight">Check it and post</h2>
            <p className="mt-1 text-sm text-muted-foreground">This is how it will look. Your job is live for 30 days. Applicants apply with no account and you get each one by email.</p>
            <ul className="mt-5 grid gap-2">
              {quality.checks.map((c) => (
                <li key={c.id} className="flex items-start gap-2 text-sm">
                  <span className={cn("mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full text-white", c.ok ? "bg-teal-600" : "bg-amber-500")}>
                    {c.ok ? <Check className="size-3" /> : <span className="text-[10px] font-bold">!</span>}
                  </span>
                  <span>
                    <span className={c.ok ? "" : "font-medium"}>{c.label}</span>
                    {!c.ok && <span className="block text-xs text-muted-foreground">{c.tip}</span>}
                  </span>
                </li>
              ))}
            </ul>
            {state.error && <p className="mt-4 text-sm text-destructive">{state.error}</p>}
          </section>
        )}

        <div className="mt-8 flex items-center justify-between gap-3">
          <Button type="button" variant="ghost" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
            <ChevronLeft /> Back
          </Button>
          {step > 0 && step < 3 && (
            <Button type="button" size="lg" onClick={() => setStep((s) => s + 1)} disabled={!canNext}>
              Next <ChevronRight />
            </Button>
          )}
          {step === 3 && (
            <Button type="submit" size="lg" disabled={pending || !basicsOk || !detailsOk}>
              {pending ? "Posting…" : "Post the job"}
            </Button>
          )}
        </div>
      </div>

      <aside className="lg:sticky lg:top-6 lg:self-start">
        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="mb-3 flex items-center justify-between text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Sparkles className="size-3.5" /> Live preview
            </span>
            <span className={cn("font-medium", quality.score >= 6 ? "text-teal-700" : quality.score >= 4 ? "text-amber-600" : "text-muted-foreground")}>
              Strength {quality.score}/{quality.max}
            </span>
          </div>
          <div className="mb-4 h-1.5 overflow-hidden rounded-full bg-secondary">
            <div className="h-full rounded-full bg-teal-600 transition-all" style={{ width: `${(quality.score / quality.max) * 100}%` }} />
          </div>
          <h3 className="text-lg font-semibold leading-snug">{draft.title || "Your job title"}</h3>
          <ul className="mt-2 grid gap-1 text-sm text-muted-foreground">
            <li className="flex items-center gap-2">
              <Briefcase className="size-3.5" /> {EMPLOYMENT_LABEL[draft.employmentType]}
              {tradeName && ` · ${tradeName}`}
            </li>
            <li className="flex items-center gap-2">
              <MapPin className="size-3.5" /> {[draft.city, regionName].filter(Boolean).join(", ") || "City, region"}
            </li>
            {pay && (
              <li className="flex items-center gap-2">
                <DollarSign className="size-3.5" /> {pay}
              </li>
            )}
            {(draft.schedule || draft.startDate) && (
              <li className="flex items-center gap-2">
                <CalendarClock className="size-3.5" /> {[draft.schedule, draft.startDate && `Starts ${draft.startDate}`].filter(Boolean).join(" · ")}
              </li>
            )}
          </ul>
          {draft.licences.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {draft.licences.slice(0, 5).map((l) => (
                <span key={l} className="rounded-full bg-secondary px-2 py-0.5 text-xs">
                  {l}
                </span>
              ))}
              {draft.licences.length > 5 && <span className="text-xs text-muted-foreground">+{draft.licences.length - 5}</span>}
            </div>
          )}
          <p className="mt-4 line-clamp-[12] whitespace-pre-line text-sm leading-relaxed text-foreground/85">{composed.description || "Your description appears here as you write."}</p>
        </div>
      </aside>
    </form>
  );
}
