"use client";

import { useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, ArrowLeft, ArrowRight, Check, Copy, Landmark, Printer, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { countBlanks } from "@/lib/rfp-writer/postprocess";
import { track } from "@/lib/tracking/client";
import { MUNI_PROVINCES, PROVINCE_NAME, THRESHOLDS, NWPTA, localPreferenceAllowed, money, type MuniProvince } from "@/lib/rfp-writer/municipal/clauses";
import { FACILITY_SERVICES, MUNI_TEMPLATES, type FacilityService, type MuniTemplate } from "@/lib/rfp-writer/municipal/schema";
import type { MunicipalDraft } from "@/lib/rfp-writer/municipal/compose";
import { useLang, useT } from "@/i18n/provider";
import { fmt, plural } from "@/i18n/format";
import { DRAFT_KEY, fullText } from "./wizard";

function plusDays(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * The municipal RFP writer (/rfp-writer?for=town, or any public-buyer
 * account): pick what the town is buying (in the research's order), answer
 * plain questions, get a document with the province's dated clause pack.
 * No local preference unless asked, never in Ontario. Quebec documents come
 * out in French; New Brunswick can ask for both languages. "Post it on
 * PMRFP" saves the draft for the town's post form (same browser).
 */
export function MunicipalWizard({ buyerName: initialBuyer, province: initialProvince, postHref }: { buyerName: string; province: MuniProvince; postHref: string }) {
  const t = useT("townJobsClient").writer;
  const lang = useLang();
  const [step, setStep] = useState(0);
  const [template, setTemplate] = useState<MuniTemplate>("facility-services");
  const [services, setServices] = useState<FacilityService[]>(["grass-cutting"]);
  const [docType, setDocType] = useState<"rfq" | "rft">("rfq");
  const [projectName, setProjectName] = useState("");
  const [trades, setTrades] = useState("");
  const [description, setDescription] = useState("");
  const [buyerName, setBuyerName] = useState(initialBuyer);
  const [province, setProvince] = useState<MuniProvince>(initialProvince);
  const [sites, setSites] = useState("");
  const [termYears, setTermYears] = useState(1);
  const [extensionYears, setExtensionYears] = useState(0);
  const [startDate, setStartDate] = useState("");
  const [bidDeadline, setBidDeadline] = useState(plusDays(14));
  const [questionDeadline, setQuestionDeadline] = useState("");
  const [estimatedValue, setEstimatedValue] = useState("");
  const [siteVisit, setSiteVisit] = useState(false);
  const [siteVisitDate, setSiteVisitDate] = useState("");
  const [insurance, setInsurance] = useState(2_000_000);
  const [bidSecurity, setBidSecurity] = useState(false);
  const [localPreference, setLocalPreference] = useState(false);
  const [bylawRef, setBylawRef] = useState("");
  const [bilingual, setBilingual] = useState(false);
  const [loading, setLoading] = useState(false);
  const [rfp, setRfp] = useState<MunicipalDraft | null>(null);

  // Construction asks for more insurance by default; the town confirms the amount either way.
  function chooseTemplate(k: MuniTemplate) {
    setTemplate(k);
    setInsurance(k === "small-works" ? 5_000_000 : 2_000_000);
    setTermYears(k === "standing-offer" ? 3 : 1);
  }
  // Never a local preference where it's prohibited; both languages only in New Brunswick.
  function chooseProvince(p: MuniProvince) {
    setProvince(p);
    if (!localPreferenceAllowed(p)) setLocalPreference(false);
    if (p !== "NB") setBilingual(false);
  }

  const canNext = [
    description.trim().length >= 15 && (template !== "facility-services" || services.length > 0),
    buyerName.trim().length >= 2,
    Boolean(bidDeadline) && (!questionDeadline || questionDeadline <= bidDeadline),
    true,
  ][step];

  async function generate() {
    setLoading(true);
    try {
      const res = await fetch("/api/rfp-writer/municipal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          template,
          services: template === "facility-services" ? services : undefined,
          docType: template === "small-works" ? docType : undefined,
          trades: template === "standing-offer" ? trades.trim() || undefined : undefined,
          projectName: projectName.trim() || undefined,
          buyerName: buyerName.trim(),
          province,
          description: description.trim(),
          sites: sites.trim() || undefined,
          termYears: template === "small-works" || template === "consultant" ? undefined : termYears,
          extensionYears: template === "facility-services" ? extensionYears : undefined,
          startDate: startDate || undefined,
          bidDeadline,
          questionDeadline: questionDeadline || undefined,
          estimatedValue: estimatedValue ? Number(estimatedValue) : undefined,
          siteVisit,
          siteVisitDate: siteVisit && siteVisitDate ? siteVisitDate : undefined,
          insurance,
          bidSecurity,
          localPreference,
          bylawRef: bylawRef.trim() || undefined,
          bilingual,
          lang,
        }),
      });
      if (res.status === 429) {
        toast.error(t.toast.tooMany);
        return;
      }
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { rfp: MunicipalDraft };
      setRfp(data.rfp);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      toast.error(t.toast.error);
    } finally {
      setLoading(false);
    }
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(t.toast.copied);
    } catch {
      toast.error(t.toast.copyFailed);
    }
  }

  function post(current: MunicipalDraft) {
    try {
      window.localStorage.setItem(
        DRAFT_KEY,
        JSON.stringify({
          rfp: current,
          tradeSlug: "",
          deadline: bidDeadline,
          savedAt: new Date().toISOString(),
          municipal: { postKind: "quote_request", questionDeadline: questionDeadline || undefined, province },
        }),
      );
    } catch {
      /* private mode: the post form starts empty */
    }
    window.location.href = postHref;
  }

  const gs = money((NWPTA.has(province) ? THRESHOLDS.nwpta : THRESHOLDS.cfta).goodsServices, lang === "fr" ? "fr" : "en");
  const cn2 = money((NWPTA.has(province) ? THRESHOLDS.nwpta : THRESHOLDS.cfta).construction, lang === "fr" ? "fr" : "en");

  // ─────────────────────────── Result ───────────────────────────
  if (rfp) {
    const r = t.result;
    const update = (patch: Partial<MunicipalDraft>) => setRfp({ ...rfp, ...patch });
    const blanks = countBlanks(rfp);
    const tap = "h-11 sm:h-8";
    return (
      <div>
        <style>{`@media print { body * { visibility: hidden; } .rfp-print, .rfp-print * { visibility: visible; } .rfp-print { position: absolute; inset: 0 auto auto 0; width: 100%; } .rfp-noprint { display: none !important; } }`}</style>
        <div className="rfp-noprint flex flex-wrap items-center justify-between gap-3 rounded-xl border border-teal-300 bg-teal-50/70 p-4">
          <div className="min-w-0 flex-1 basis-64 text-sm text-teal-900">
            <p className="flex items-start gap-2 font-medium">
              <Check className="mt-0.5 size-4 shrink-0" />
              <span>{r.ready} <span className="font-normal text-teal-900/80">{r.edit}</span></span>
            </p>
            {blanks > 0 && <p className="mt-1.5 pl-6 text-xs" data-blanks={blanks}>{fmt(r.blanks, { n: String(blanks) })}</p>}
            <p className="mt-1 pl-6 text-xs text-teal-900/80" data-as-of={rfp.clausesAsOf}>
              {fmt(r.asOf, { date: rfp.clausesAsOf })}
              {rfp.bilingual ? ` ${r.langBilingual}` : rfp.lang === "fr" && province === "QC" ? ` ${r.langFr}` : ""}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" className={tap} onClick={() => copy(fullText(rfp, t.plainText))}>
              <Copy className="size-3.5" /> {r.copyAll}
            </Button>
            <Button variant="outline" size="sm" className={tap} onClick={() => window.print()}>
              <Printer className="size-3.5" /> {r.print}
            </Button>
            <Button size="sm" className={tap} onClick={() => post(rfp)}>
              {r.post} <ArrowRight className="size-3.5" />
            </Button>
          </div>
        </div>
        {rfp.threshold.over && rfp.threshold.threshold && (
          <p className="rfp-noprint mt-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900" data-threshold={rfp.threshold.agreement ?? ""}>
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            {fmt(r.threshold, { agreement: rfp.threshold.agreement ?? "CFTA", threshold: money(rfp.threshold.threshold, lang === "fr" ? "fr" : "en"), system: rfp.threshold.system ?? r.thresholdBylaw })}
          </p>
        )}
        {rfp.localPreferenceRefused && <p className="rfp-noprint mt-3 text-sm text-muted-foreground">{r.localRefused}</p>}

        <div className="rfp-print mt-6 space-y-6">
          <Field label={r.title}>
            <Textarea rows={1} value={rfp.title} onChange={(e) => update({ title: e.target.value.replace(/\n/g, " ") })} className="min-h-0 resize-none text-base font-semibold md:text-base" />
          </Field>
          <Field label={r.summary}>
            <Textarea value={rfp.summary} onChange={(e) => update({ summary: e.target.value })} rows={3} />
          </Field>
          <Section title={r.scope} copyLabel={r.copy} onCopy={() => copy(rfp.scope)}>
            <Textarea value={rfp.scope} onChange={(e) => update({ scope: e.target.value })} rows={18} className="leading-relaxed" />
          </Section>
          <Section title={r.requirements} copyLabel={r.copy} onCopy={() => copy(rfp.requirements)}>
            <Textarea value={rfp.requirements} onChange={(e) => update({ requirements: e.target.value })} rows={10} />
          </Section>
          <Section title={r.submission} copyLabel={r.copy} onCopy={() => copy(rfp.submissionInstructions)}>
            <Textarea value={rfp.submissionInstructions} onChange={(e) => update({ submissionInstructions: e.target.value })} rows={12} />
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

        <div className="rfp-noprint mt-8 rounded-xl bg-indigo p-6 text-white">
          <h3 className="flex items-center gap-2 text-lg font-semibold"><Landmark className="size-5 text-teal-300" /> {r.post}</h3>
          <p className="mt-1.5 text-sm leading-relaxed text-indigo-100/80">{r.postNote}</p>
          <Button variant="accent" className="mt-4" onClick={() => post(rfp)}>
            {r.post} <ArrowRight className="size-4" />
          </Button>
        </div>

        <div className="rfp-noprint mt-6 flex flex-wrap items-center justify-between gap-3 text-sm">
          <button type="button" className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground" onClick={() => { setRfp(null); setStep(3); }}>
            <ArrowLeft className="size-3.5" /> {r.change}
          </button>
          <p className="text-xs text-muted-foreground">{r.disclaimer}</p>
        </div>
      </div>
    );
  }

  // ─────────────────────────── Wizard ───────────────────────────
  return (
    <div className="rounded-2xl border border-border bg-card shadow-sm" data-writer="municipal">
      <ol className="flex border-b border-border">
        {t.steps.map((s, i) => (
          <li key={s} className={cn("flex flex-1 items-center justify-center gap-2 px-2 py-3 text-xs font-medium sm:text-sm", i === step ? "text-indigo" : i < step ? "text-teal-700" : "text-muted-foreground")}>
            <span className={cn("flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold", i === step ? "bg-indigo text-white" : i < step ? "bg-teal-100 text-teal-800" : "bg-secondary")}>
              {i < step ? <Check className="size-3.5" /> : i + 1}
            </span>
            <span className="hidden sm:inline">{s}</span>
          </li>
        ))}
      </ol>

      <div className="p-5 sm:p-8">
        {step === 0 && (
          <div className="space-y-6">
            <Field label={t.template.label}>
              <div className="grid gap-3 sm:grid-cols-2">
                {MUNI_TEMPLATES.map((k, i) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => chooseTemplate(k)}
                    aria-pressed={template === k}
                    data-template={k}
                    className={cn("rounded-lg border p-4 text-left transition-colors", template === k ? "border-indigo bg-indigo/5 ring-1 ring-indigo" : "border-border hover:border-teal-400")}
                  >
                    <span className="block text-sm font-semibold">{i + 1}. {t.template.items[k].name}</span>
                    <span className="mt-1 block text-xs text-muted-foreground">{t.template.items[k].body}</span>
                  </button>
                ))}
              </div>
            </Field>
            {template === "facility-services" && (
              <Field label={t.services.label}>
                <div className="flex flex-wrap gap-2">
                  {FACILITY_SERVICES.map((s) => (
                    <label key={s} className={cn("flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 text-sm", services.includes(s) ? "border-indigo bg-indigo text-white" : "border-border")}>
                      <input
                        type="checkbox"
                        className="sr-only"
                        checked={services.includes(s)}
                        onChange={(e) => setServices(e.target.checked ? [...services, s] : services.filter((x) => x !== s))}
                      />
                      {t.services[s]}
                    </label>
                  ))}
                </div>
              </Field>
            )}
            {template === "small-works" && (
              <Field label={t.docType.label} hint={t.docType.hint}>
                <Toggle options={[["rfq", t.docType.rfq], ["rft", t.docType.rft]]} value={docType} onChange={(v) => setDocType(v as "rfq" | "rft")} />
              </Field>
            )}
            {template === "standing-offer" ? (
              <Field label={t.trades.label}>
                <Input value={trades} onChange={(e) => setTrades(e.target.value)} placeholder={t.trades.placeholder} maxLength={200} />
              </Field>
            ) : template !== "facility-services" ? (
              <Field label={t.projectName.label}>
                <Input value={projectName} onChange={(e) => setProjectName(e.target.value)} placeholder={t.projectName.placeholder} maxLength={120} />
              </Field>
            ) : null}
            <Field label={t.describe.label} hint={t.describe.hint}>
              <Textarea rows={4} value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t.describe.placeholder[template]} maxLength={1500} />
            </Field>
          </div>
        )}

        {step === 1 && (
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label={t.buyerName}>
              <Input value={buyerName} onChange={(e) => setBuyerName(e.target.value)} placeholder={t.buyerPlaceholder} maxLength={200} />
            </Field>
            <Field label={t.province} hint={province === "QC" ? t.provinceQc : province === "ON" ? t.provinceOn : undefined}>
              <select value={province} onChange={(e) => chooseProvince(e.target.value as MuniProvince)} className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm">
                {MUNI_PROVINCES.map((p) => <option key={p} value={p}>{PROVINCE_NAME[p][lang]}</option>)}
              </select>
            </Field>
            <Field label={t.sites} className="sm:col-span-2">
              <Textarea rows={2} value={sites} onChange={(e) => setSites(e.target.value)} placeholder={t.sitesPlaceholder} maxLength={600} />
            </Field>
          </div>
        )}

        {step === 2 && (
          <div className="grid gap-5 sm:grid-cols-2">
            {(template === "facility-services" || template === "standing-offer") && (
              <Field label={t.term}>
                <select value={termYears} onChange={(e) => setTermYears(Number(e.target.value))} className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm">
                  {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{plural(n, t.years)}</option>)}
                </select>
              </Field>
            )}
            {template === "facility-services" && (
              <Field label={t.extension}>
                <select value={extensionYears} onChange={(e) => setExtensionYears(Number(e.target.value))} className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm">
                  <option value={0}>{t.extensionNone}</option>
                  {[1, 2, 3].map((n) => <option key={n} value={n}>{plural(n, t.years)}</option>)}
                </select>
              </Field>
            )}
            {template !== "consultant" && (
              <Field label={t.start}>
                <Input type="date" value={startDate} min={plusDays(1)} onChange={(e) => setStartDate(e.target.value)} />
              </Field>
            )}
            <Field label={t.deadline} hint={t.deadlineHint}>
              <Input type="date" value={bidDeadline} min={plusDays(3)} onChange={(e) => setBidDeadline(e.target.value)} />
            </Field>
            <Field label={t.questionDeadline} hint={t.questionHint}>
              <Input type="date" value={questionDeadline} min={plusDays(1)} max={bidDeadline} onChange={(e) => setQuestionDeadline(e.target.value)} />
            </Field>
            <Field label={t.value} hint={t.valueHint}>
              <Input inputMode="numeric" value={estimatedValue} onChange={(e) => setEstimatedValue(e.target.value.replace(/\D/g, ""))} placeholder="45000" />
            </Field>
            <Field label={t.siteVisit}>
              <Toggle options={[["yes", t.yes], ["no", t.no]]} value={siteVisit ? "yes" : "no"} onChange={(v) => setSiteVisit(v === "yes")} />
              {siteVisit && <Input type="date" className="mt-2" value={siteVisitDate} min={plusDays(1)} max={bidDeadline} onChange={(e) => setSiteVisitDate(e.target.value)} aria-label={t.siteVisitDate} />}
            </Field>
          </div>
        )}

        {step === 3 && (
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label={t.insurance} hint={t.insuranceHint}>
              <Toggle
                options={[[String(2_000_000), money(2_000_000, lang === "fr" ? "fr" : "en")], [String(5_000_000), money(5_000_000, lang === "fr" ? "fr" : "en")]]}
                value={String(insurance)}
                onChange={(v) => setInsurance(Number(v))}
              />
            </Field>
            <Field label={t.bidSecurity} hint={t.bidSecurityHint}>
              <Toggle options={[["yes", t.yes], ["no", t.no]]} value={bidSecurity ? "yes" : "no"} onChange={(v) => setBidSecurity(v === "yes")} />
            </Field>
            <Field label={t.localPreference} hint={localPreferenceAllowed(province) ? fmt(t.localPreferenceHint, { gs, cn: cn2 }) : t.localPreferenceProhibited} className="sm:col-span-2">
              {localPreferenceAllowed(province) ? (
                <Toggle options={[["no", t.no], ["yes", t.yes]]} value={localPreference ? "yes" : "no"} onChange={(v) => setLocalPreference(v === "yes")} />
              ) : (
                <p className="text-sm text-muted-foreground" data-local-preference="prohibited">—</p>
              )}
            </Field>
            <Field label={t.bylaw} hint={t.bylawHint}>
              <Input value={bylawRef} onChange={(e) => setBylawRef(e.target.value)} placeholder={t.bylawPlaceholder} maxLength={160} />
            </Field>
            {province === "NB" && (
              <Field label={t.bilingual} hint={t.bilingualHint}>
                <Toggle options={[["no", t.no], ["yes", t.yes]]} value={bilingual ? "yes" : "no"} onChange={(v) => setBilingual(v === "yes")} />
              </Field>
            )}
          </div>
        )}

        <div className="mt-8 flex items-center justify-between gap-3 border-t border-border pt-5">
          <Button variant="ghost" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0 || loading}>
            <ArrowLeft className="size-4" /> {t.back}
          </Button>
          {step < t.steps.length - 1 ? (
            <Button
              onClick={() => {
                // First-party funnel: past the first question = started writing.
                if (step === 0) track("writer_started", { kind: "municipal" });
                setStep((s) => s + 1);
              }}
              disabled={!canNext}
            >
              {t.next} <ArrowRight className="size-4" />
            </Button>
          ) : (
            <Button size="lg" onClick={() => generate()} disabled={loading}>
              <Wand2 className="size-4" /> {loading ? t.writing : t.write}
            </Button>
          )}
        </div>
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
          key={v}
          type="button"
          onClick={() => onChange(v)}
          aria-pressed={value === v}
          className={cn("rounded-lg border px-3 py-1.5 text-sm transition-colors", value === v ? "border-indigo bg-indigo text-white" : "border-border hover:border-teal-400 hover:bg-teal-50")}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
