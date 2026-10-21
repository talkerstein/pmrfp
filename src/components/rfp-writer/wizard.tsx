"use client";

import { useEffect, useMemo, useState } from "react";
import { CA_PROVINCES, US_STATE_NAMES, isUsState } from "@/lib/geo";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Check, Copy, FileText, Mail, Printer, Sparkles, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { RfpDraft } from "@/lib/rfp-writer/schema";
import { useLang, useT } from "@/i18n/provider";
import { localizePath } from "@/i18n/config";
import { fmt } from "@/i18n/format";
import { propertyTypeName, regionName, tradeName } from "@/i18n/terms";
import { orderTrades } from "@/lib/trades/order";
import { rememberAudience } from "@/lib/audience/pm";
import { countBlanks, defaultDeadlineDays } from "@/lib/rfp-writer/postprocess";

type Option = { slug: string; name: string };
type TemplateOption = { slug: string; name: string; tradeSlug: string };

export const DRAFT_KEY = "pmrfp:rfp-draft";
/** Last wizard answers — so a visitor who signs up comes back to an AI-tailored version. */
const ANSWERS_KEY = "pmrfp:rfp-answers";

type Payload = Record<string, unknown>;
interface SavedAnswers {
  payload: Payload;
  tradeSlug: string;
  propertyTypeSlug: string;
  city: string;
  province: string;
  bidDeadline: string;
  budgetMin: string;
  budgetMax: string;
}

/** What the post form reads back after sign-up (localStorage, same browser). */
export interface StoredDraft {
  rfp: RfpDraft;
  tradeSlug: string;
  propertyTypeSlug?: string;
  city?: string;
  province?: string;
  budgetMin?: number;
  budgetMax?: number;
  deadline: string;
  savedAt: string;
}

/** Wizard timing values (labels come from the "writer" messages). */
const TIMING = ["asap", "1-month", "1-3-months", "3-6-months", "next-season"] as const;

/** Section headings for the plain-text copy ("writer" messages, plainText). */
type PlainTextHeadings = { scope: string; requirements: string; submission: string; evaluation: string; questions: string };

/** Accent- and case-insensitive match for the trade search. */
const fold = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

function plusDays(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

export function fullText(r: RfpDraft, h: PlainTextHeadings): string {
  return [
    r.title,
    "",
    r.summary,
    "",
    h.scope,
    r.scope,
    "",
    h.requirements,
    r.requirements,
    "",
    h.submission,
    r.submissionInstructions,
    "",
    h.evaluation,
    ...r.evaluationCriteria.map((c) => `- ${c}`),
    "",
    h.questions,
    ...r.questionsForBidders.map((q) => `- ${q}`),
  ].join("\n");
}

export function RfpWizard({
  categories,
  propertyTypes,
  templates,
  postHref,
  defaultProvince,
}: {
  categories: Option[];
  propertyTypes: Option[];
  templates: TemplateOption[];
  /** Where "Post it free" goes: the PM form if signed in as a PM, else sign-up. */
  postHref: string;
  /** The visitor's province/state from IP geolocation, when we serve it. */
  defaultProvince?: string;
}) {
  const t = useT("writer");
  const w = t.wizard;
  const r = t.result;
  const lang = useLang();
  const [step, setStep] = useState(0);
  const [tradeSlug, setTradeSlug] = useState("");
  const [tradeQuery, setTradeQuery] = useState("");
  const [templateSlug, setTemplateSlug] = useState("");
  const [description, setDescription] = useState("");
  const [propertyTypeSlug, setPropertyTypeSlug] = useState("");
  const [city, setCity] = useState("");
  const [province, setProvince] = useState(defaultProvince ?? "Ontario");
  const [size, setSize] = useState("");
  const [occupied, setOccupied] = useState<"yes" | "no" | "">("");
  const [contractType, setContractType] = useState<"project" | "service-contract">("project");
  const [timing, setTiming] = useState("1-3-months");
  const [bidDeadline, setBidDeadline] = useState(plusDays(defaultDeadlineDays("1-3-months")));
  // Until the manager picks a date, the deadline follows the urgency.
  const [deadlineTouched, setDeadlineTouched] = useState(false);
  const [budgetMin, setBudgetMin] = useState("");
  const [budgetMax, setBudgetMax] = useState("");
  const [insurance, setInsurance] = useState<"2m" | "5m">("5m");
  const [siteVisit, setSiteVisit] = useState(true);
  const [siteVisitDate, setSiteVisitDate] = useState("");
  const [priority, setPriority] = useState<"balanced" | "price" | "quality">("balanced");

  const [loading, setLoading] = useState(false);
  const [rfp, setRfp] = useState<RfpDraft | null>(null);
  const [source, setSource] = useState<"ai" | "template" | null>(null);
  const [aiLocked, setAiLocked] = useState(false);
  const [email, setEmail] = useState("");
  const [emailing, setEmailing] = useState(false);
  const [emailed, setEmailed] = useState(false);

  // Someone writing an RFP is on the property-manager side: no trade popups for them.
  useEffect(() => rememberAudience("pm"), []);

  // Back from sign-up (?tailor=1): re-run the saved answers, now AI-tailored.
  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has("tailor")) return;
    try {
      const raw = window.localStorage.getItem(ANSWERS_KEY);
      if (!raw) return;
      const a = JSON.parse(raw) as SavedAnswers;
      // Browser storage only exists client-side, so this can't be initial state.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTradeSlug(a.tradeSlug);
      setPropertyTypeSlug(a.propertyTypeSlug);
      setCity(a.city);
      setProvince(a.province);
      setBidDeadline(a.bidDeadline);
      setDeadlineTouched(true);
      setBudgetMin(a.budgetMin);
      setBudgetMax(a.budgetMax);
      void generate(a.payload);
    } catch {
      /* storage unavailable — show the wizard */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Coming back from the "Post this RFP" email link: resume the saved draft.
  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has("post")) return;
    try {
      const raw = window.localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as StoredDraft;
        // Browser storage only exists client-side, so this can't be initial state.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setRfp(saved.rfp);
        setTradeSlug(saved.tradeSlug);
      }
    } catch {
      /* storage unavailable — start fresh */
    }
  }, []);

  const trade = categories.find((c) => c.slug === tradeSlug);
  const tradeTemplates = templates.filter((t) => t.tradeSlug === tradeSlug);
  const filteredTrades = useMemo(() => {
    // Search the page-language and the English name; list the trades property
    // managers hire most first, then A–Z in the page language (lib/trades/order).
    const q = fold(tradeQuery.trim());
    const shown = q
      ? categories.filter((c) => fold(tradeName(c.name, lang)).includes(q) || fold(c.name).includes(q))
      : categories;
    return orderTrades(shown, (c) => tradeName(c.name, lang), lang);
  }, [categories, tradeQuery, lang]);

  const canNext = [
    Boolean(tradeSlug) && description.trim().length >= 15,
    true,
    Boolean(bidDeadline),
    true,
  ][step];

  function currentPayload(): Payload {
    return {
      tradeSlug,
      tradeName: trade?.name ?? tradeSlug,
      templateSlug: templateSlug || undefined,
      description: description.trim(),
      propertyType: propertyTypes.find((p) => p.slug === propertyTypeSlug)?.name,
      city: city.trim() || undefined,
      province: province || undefined,
      size: size.trim() || undefined,
      occupied: occupied === "" ? undefined : occupied === "yes",
      contractType,
      timing,
      bidDeadline,
      budgetMin: budgetMin ? Number(budgetMin) : undefined,
      budgetMax: budgetMax ? Number(budgetMax) : undefined,
      insurance,
      siteVisit,
      siteVisitDate: siteVisit && siteVisitDate ? siteVisitDate : undefined,
      priority,
    };
  }

  /** `resume` = saved answers being re-run after sign-up (don't overwrite them). */
  async function generate(resume?: Payload) {
    const payload = resume ?? currentPayload();
    setLoading(true);
    try {
      if (!resume) {
        try {
          const saved: SavedAnswers = { payload, tradeSlug, propertyTypeSlug, city, province, bidDeadline, budgetMin, budgetMax };
          window.localStorage.setItem(ANSWERS_KEY, JSON.stringify(saved));
        } catch {
          /* private mode — the sign-up round trip just won't auto-resume */
        }
      }
      const res = await fetch("/api/rfp-writer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // The RFP is written in the page's language (saved answers may come from another visit).
        body: JSON.stringify({ ...payload, lang }),
      });
      if (res.status === 429) {
        toast.error(t.toast.tooMany);
        return;
      }
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { rfp: RfpDraft; source: "ai" | "template"; aiLocked?: boolean };
      setRfp(data.rfp);
      setSource(data.source);
      setAiLocked(Boolean(data.aiLocked));
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      toast.error(t.toast.error);
    } finally {
      setLoading(false);
    }
  }

  function saveDraft(current: RfpDraft) {
    const stored: StoredDraft = {
      rfp: current,
      tradeSlug,
      propertyTypeSlug: propertyTypeSlug || undefined,
      city: city.trim() || undefined,
      province: province || undefined,
      budgetMin: budgetMin ? Number(budgetMin) : undefined,
      budgetMax: budgetMax ? Number(budgetMax) : undefined,
      deadline: bidDeadline,
      savedAt: new Date().toISOString(),
    };
    try {
      window.localStorage.setItem(DRAFT_KEY, JSON.stringify(stored));
    } catch {
      /* private mode — the post form will just start empty */
    }
  }

  async function copy(text: string, label = t.toast.copied) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(label);
    } catch {
      toast.error(t.toast.copyFailed);
    }
  }

  async function emailMe() {
    if (!rfp) return;
    setEmailing(true);
    try {
      saveDraft(rfp);
      const res = await fetch("/api/rfp-writer/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, rfp, tradeName: trade?.name, lang }),
      });
      if (!res.ok) throw new Error();
      setEmailed(true);
      toast.success(t.toast.sent);
    } catch {
      toast.error(t.toast.sendFailed);
    } finally {
      setEmailing(false);
    }
  }

  // ─────────────────────────── Result ───────────────────────────
  if (rfp) {
    const update = (patch: Partial<RfpDraft>) => setRfp({ ...rfp, ...patch });
    const blanks = countBlanks(rfp);
    // Phones: every action is a 44px tap target.
    const tap = "h-11 sm:h-8";
    return (
      <div>
        <style>{`@media print { body * { visibility: hidden; } .rfp-print, .rfp-print * { visibility: visible; } .rfp-print { position: absolute; inset: 0 auto auto 0; width: 100%; } .rfp-noprint { display: none !important; } }`}</style>

        <div className="rfp-noprint flex flex-wrap items-center justify-between gap-3 rounded-xl border border-teal-300 bg-teal-50/70 p-4">
          <div className="min-w-0 flex-1 basis-64">
            <p className="flex items-start gap-2 text-sm font-medium text-teal-900">
              <Check className="mt-0.5 size-4 shrink-0" />
              <span>
                {r.ready}{" "}
                <span className="font-normal text-teal-900/80">
                  {source === "ai" ? r.sourceAi : r.sourceTemplate} {r.editAnything}
                </span>
              </span>
            </p>
            {blanks > 0 && <p className="mt-1.5 pl-6 text-xs text-teal-900/80">{fmt(r.blanks, { n: String(blanks) })}</p>}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" className={tap} onClick={() => copy(fullText(rfp, t.plainText), t.toast.fullCopied)}>
              <Copy className="size-3.5" /> {r.copyAll}
            </Button>
            <Button variant="outline" size="sm" className={tap} onClick={() => window.print()}>
              <Printer className="size-3.5" /> {r.print}
            </Button>
            <Button
              size="sm"
              className={tap}
              onClick={() => {
                saveDraft(rfp);
                window.location.href = postHref;
              }}
            >
              {r.postOnPmrfp} <ArrowRight className="size-3.5" />
            </Button>
          </div>
        </div>

        {aiLocked && (
          <div className="rfp-noprint mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-indigo/20 bg-indigo p-4 text-white">
            <p className="flex items-start gap-2 text-sm">
              <Sparkles className="mt-0.5 size-4 shrink-0 text-teal-300" />
              <span>
                <strong>{r.aiTitle}</strong>{" "}
                <span className="text-indigo-100/80">
                  {r.aiBody}
                </span>
              </span>
            </p>
            <Button
              variant="accent"
              size="sm"
              onClick={() => {
                window.location.href = localizePath(
                  `/sign-up?role=property_manager&next=${encodeURIComponent(localizePath("/rfp-writer?tailor=1", lang))}`,
                  lang,
                );
              }}
            >
              {r.aiCta} <ArrowRight className="size-3.5" />
            </Button>
          </div>
        )}

        <div className="rfp-print mt-6 space-y-6">
          <Field label={r.title}>
            {/* Wraps instead of cutting a long title off on a phone. */}
            <Textarea rows={1} value={rfp.title} onChange={(e) => update({ title: e.target.value.replace(/\n/g, " ") })} className="min-h-0 resize-none text-base font-semibold md:text-base" />
          </Field>
          <Field label={r.summary}>
            <Textarea value={rfp.summary} onChange={(e) => update({ summary: e.target.value })} rows={3} />
          </Field>
          <Section title={r.scope} copyLabel={r.copy} onCopy={() => copy(rfp.scope)}>
            <Textarea value={rfp.scope} onChange={(e) => update({ scope: e.target.value })} rows={16} className="font-[inherit] leading-relaxed" />
          </Section>
          <Section title={r.requirements} copyLabel={r.copy} onCopy={() => copy(rfp.requirements)}>
            <Textarea value={rfp.requirements} onChange={(e) => update({ requirements: e.target.value })} rows={8} />
          </Section>
          <Section title={r.submission} copyLabel={r.copy} onCopy={() => copy(rfp.submissionInstructions)}>
            <Textarea value={rfp.submissionInstructions} onChange={(e) => update({ submissionInstructions: e.target.value })} rows={8} />
          </Section>
          <div className="grid gap-6 md:grid-cols-2">
            <Section title={r.evaluation} copyLabel={r.copy}>
              <ul className="list-disc space-y-1 pl-5 text-sm">{rfp.evaluationCriteria.map((c) => <li key={c}>{c}</li>)}</ul>
            </Section>
            <Section title={r.questions} copyLabel={r.copy} onCopy={() => copy(rfp.questionsForBidders.map((q) => `- ${q}`).join("\n"))}>
              <ul className="list-disc space-y-1 pl-5 text-sm">{rfp.questionsForBidders.map((q) => <li key={q}>{q}</li>)}</ul>
            </Section>
          </div>
        </div>

        <div className="rfp-noprint mt-8 grid gap-4 md:grid-cols-2">
          <div className="rounded-xl bg-indigo p-6 text-white">
            <h3 className="text-lg font-semibold">{r.bidsTitle}</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-indigo-100/80">
              {r.bidsBody}
            </p>
            <Button
              variant="accent"
              className="mt-4"
              onClick={() => {
                saveDraft(rfp);
                window.location.href = postHref;
              }}
            >
              {r.bidsCta} <ArrowRight className="size-4" />
            </Button>
          </div>
          <div className="rounded-xl border border-border bg-card p-6">
            <h3 className="flex items-center gap-2 text-lg font-semibold"><Mail className="size-4" /> {r.emailTitle}</h3>
            {emailed ? (
              <p className="mt-2 text-sm text-teal-800">{fmt(r.emailSent, { email })}</p>
            ) : (
              <form
                className="mt-3 flex flex-col gap-2 sm:flex-row"
                onSubmit={(e) => {
                  e.preventDefault();
                  emailMe();
                }}
              >
                <Input type="email" required placeholder={r.emailPlaceholder} value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
                <Button type="submit" variant="outline" disabled={emailing}>{emailing ? r.sending : r.send}</Button>
              </form>
            )}
            <p className="mt-2 text-xs text-muted-foreground">{r.emailNote}</p>
          </div>
        </div>

        <div className="rfp-noprint mt-6 flex flex-wrap items-center justify-between gap-3 text-sm">
          <button
            type="button"
            className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
            onClick={() => {
              setRfp(null);
              setStep(3);
            }}
          >
            <ArrowLeft className="size-3.5" /> {r.changeAnswers}
          </button>
          <p className="text-xs text-muted-foreground">{r.disclaimer}</p>
        </div>
      </div>
    );
  }

  // ─────────────────────────── Wizard ───────────────────────────
  return (
    <div className="rounded-2xl border border-border bg-card shadow-sm">
      <ol className="flex border-b border-border">
        {w.steps.map((s, i) => (
          <li
            key={s}
            className={cn(
              "flex flex-1 items-center justify-center gap-2 px-2 py-3 text-xs font-medium sm:text-sm",
              i === step ? "text-indigo" : i < step ? "text-teal-700" : "text-muted-foreground",
            )}
          >
            <span
              className={cn(
                "flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold",
                i === step ? "bg-indigo text-white" : i < step ? "bg-teal-100 text-teal-800" : "bg-secondary",
              )}
            >
              {i < step ? <Check className="size-3.5" /> : i + 1}
            </span>
            <span className="hidden sm:inline">{s}</span>
          </li>
        ))}
      </ol>

      <div className="p-5 sm:p-8">
        {step === 0 && (
          <div className="space-y-6">
            <Field label={w.tradeLabel}>
              <Input placeholder={w.tradeSearch} value={tradeQuery} onChange={(e) => setTradeQuery(e.target.value)} />
              <div className="mt-3 flex max-h-56 flex-wrap gap-2 overflow-y-auto">
                {filteredTrades.map((c) => (
                  <button
                    key={c.slug}
                    type="button"
                    onClick={() => {
                      setTradeSlug(c.slug);
                      setTemplateSlug("");
                    }}
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-sm transition-colors",
                      tradeSlug === c.slug ? "border-indigo bg-indigo text-white" : "border-border hover:border-teal-400 hover:bg-teal-50",
                    )}
                  >
                    {tradeName(c.name, lang)}
                  </button>
                ))}
              </div>
            </Field>

            {tradeTemplates.length > 1 && (
              <Field label={w.closestMatch}>
                <div className="flex flex-wrap gap-2">
                  {tradeTemplates.map((t) => (
                    <button
                      key={t.slug}
                      type="button"
                      onClick={() => setTemplateSlug(templateSlug === t.slug ? "" : t.slug)}
                      className={cn(
                        "rounded-lg border px-3 py-1.5 text-sm",
                        templateSlug === t.slug ? "border-teal-500 bg-teal-50 text-teal-900" : "border-border hover:bg-secondary",
                      )}
                    >
                      {t.name.replace(/ RFP Template$/, "")}
                    </button>
                  ))}
                </div>
              </Field>
            )}

            <Field label={w.describeLabel} hint={w.describeHint}>
              <Textarea rows={4} value={description} onChange={(e) => setDescription(e.target.value)} placeholder={w.examples[0]} maxLength={1500} />
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span>{w.tryExample}</span>
                {w.examples.map((ex, i) => (
                  <button key={i} type="button" onClick={() => setDescription(ex)} className="rounded-full bg-secondary px-2.5 py-1 hover:bg-teal-50 hover:text-teal-800">
                    {w.exampleLabels[i]}
                  </button>
                ))}
              </div>
            </Field>
          </div>
        )}

        {step === 1 && (
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label={w.propertyType}>
              <select value={propertyTypeSlug} onChange={(e) => setPropertyTypeSlug(e.target.value)} className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm">
                <option value="">{w.select}</option>
                {propertyTypes.map((p) => <option key={p.slug} value={p.slug}>{propertyTypeName(p.name, lang)}</option>)}
              </select>
            </Field>
            <Field label={w.size} hint={w.sizeHint}>
              <Input value={size} onChange={(e) => setSize(e.target.value)} placeholder={w.sizePlaceholder} />
            </Field>
            <Field label={w.city}>
              <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder={w.cityPlaceholder} autoComplete="address-level2" />
            </Field>
            <Field label={w.province}>
              <select value={province} onChange={(e) => setProvince(e.target.value)} className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm">
                <optgroup label={w.canada}>
                  {CA_PROVINCES.map((p) => <option key={p} value={p}>{regionName(p, lang)}</option>)}
                </optgroup>
                <optgroup label={w.unitedStates}>
                  {US_STATE_NAMES.map((p) => <option key={p} value={p}>{regionName(p, lang)}</option>)}
                </optgroup>
              </select>
            </Field>
            <Field label={w.occupied}>
              <Toggle options={[["yes", w.yes], ["no", w.no], ["", w.notSure]]} value={occupied} onChange={(v) => setOccupied(v as "yes" | "no" | "")} />
            </Field>
          </div>
        )}

        {step === 2 && (
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label={w.workKind} className="sm:col-span-2">
              <Toggle options={[["project", w.project], ["service-contract", w.serviceContract]]} value={contractType} onChange={(v) => setContractType(v as "project" | "service-contract")} />
            </Field>
            <Field label={w.when} className="sm:col-span-2">
              <Toggle
                options={TIMING.map((v) => [v, w.timing[v]])}
                value={timing}
                onChange={(v) => {
                  setTiming(v);
                  // Urgent work gets a short bid window unless a date was already picked.
                  if (!deadlineTouched) setBidDeadline(plusDays(defaultDeadlineDays(v)));
                }}
              />
            </Field>
            <Field label={w.deadline} hint={timing === "asap" ? w.deadlineHintUrgent : w.deadlineHint}>
              <Input
                type="date"
                value={bidDeadline}
                min={plusDays(3)}
                onChange={(e) => {
                  setDeadlineTouched(true);
                  setBidDeadline(e.target.value);
                }}
              />
            </Field>
            <Field label={fmt(w.budget, { currency: isUsState(province) ? "USD" : "CAD" })} hint={w.budgetHint}>
              <div className="flex items-center gap-2">
                <Input inputMode="numeric" placeholder={w.min} value={budgetMin} onChange={(e) => setBudgetMin(e.target.value.replace(/\D/g, ""))} />
                <span className="text-muted-foreground">–</span>
                <Input inputMode="numeric" placeholder={w.max} value={budgetMax} onChange={(e) => setBudgetMax(e.target.value.replace(/\D/g, ""))} />
              </div>
            </Field>
          </div>
        )}

        {step === 3 && (
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label={w.insurance} hint={w.insuranceHint}>
              <Toggle options={[["5m", w.insurance5m], ["2m", w.insurance2m]]} value={insurance} onChange={(v) => setInsurance(v as "2m" | "5m")} />
            </Field>
            <Field label={w.siteVisit}>
              <Toggle options={[["yes", w.yes], ["no", w.no]]} value={siteVisit ? "yes" : "no"} onChange={(v) => setSiteVisit(v === "yes")} />
              {siteVisit && (
                <Input type="date" className="mt-2" value={siteVisitDate} min={plusDays(1)} onChange={(e) => setSiteVisitDate(e.target.value)} aria-label={w.siteVisitDate} />
              )}
            </Field>
            <Field label={w.priority} className="sm:col-span-2">
              <Toggle options={[["balanced", w.balanced], ["price", w.lowestPrice], ["quality", w.bestQuality]]} value={priority} onChange={(v) => setPriority(v as "balanced" | "price" | "quality")} />
            </Field>
          </div>
        )}

        <div className="mt-8 flex items-center justify-between gap-3 border-t border-border pt-5">
          <Button variant="ghost" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0 || loading}>
            <ArrowLeft className="size-4" /> {w.back}
          </Button>
          {step < w.steps.length - 1 ? (
            <Button onClick={() => setStep((s) => s + 1)} disabled={!canNext}>
              {w.next} <ArrowRight className="size-4" />
            </Button>
          ) : (
            <Button size="lg" onClick={() => generate()} disabled={loading}>
              {loading ? (
                <><Sparkles className="size-4 animate-pulse" /> {w.writing}</>
              ) : (
                <><Wand2 className="size-4" /> {w.write}</>
              )}
            </Button>
          )}
        </div>
        {loading && (
          <p className="mt-3 text-right text-xs text-muted-foreground">
            <FileText className="mr-1 inline size-3" /> {w.drafting}
          </p>
        )}
      </div>
    </div>
  );
}

function Field({ label, hint, className, children }: { label: string; hint?: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={className}>
      <div className="mb-1.5 text-sm font-medium">{label}</div>
      {children}
      {hint && <p className="mt-1.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Section({ title, copyLabel, onCopy, children }: { title: string; copyLabel: string; onCopy?: () => void; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
        {onCopy && (
          // 44px tap target on phones (the label stays small).
          <button type="button" onClick={onCopy} className="rfp-noprint -my-2 -mr-2 inline-flex min-h-11 min-w-11 items-center justify-center gap-1 rounded-md px-2 text-xs text-teal-700 hover:underline sm:min-h-8 sm:min-w-0">
            <Copy className="size-3" /> {copyLabel}
          </button>
        )}
      </div>
      {children}
    </div>
  );
}

function Toggle({ options, value, onChange }: { options: [string, string][]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map(([v, label]) => (
        <button
          key={v || "none"}
          type="button"
          onClick={() => onChange(v)}
          className={cn(
            "rounded-lg border px-3 py-1.5 text-sm transition-colors",
            value === v ? "border-indigo bg-indigo text-white" : "border-border hover:border-teal-400 hover:bg-teal-50",
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
