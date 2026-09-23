"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Check, Copy, FileText, Mail, Printer, Sparkles, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { RfpDraft } from "@/lib/rfp-writer/schema";

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

const PROVINCES = ["Ontario", "Quebec", "British Columbia", "Alberta", "Manitoba", "Saskatchewan", "Nova Scotia", "New Brunswick", "Newfoundland and Labrador", "Prince Edward Island", "Yukon", "Northwest Territories", "Nunavut"];

const TIMING: [string, string][] = [
  ["asap", "As soon as possible"],
  ["1-month", "Within a month"],
  ["1-3-months", "1–3 months"],
  ["3-6-months", "3–6 months"],
  ["next-season", "Next season"],
];

const EXAMPLES = [
  "Flat roof over the east wing leaks in heavy rain. About 18,000 sq ft, 20+ years old. Looking at full replacement.",
  "Seasonal snow clearing and salting for a 120-unit condo: driveway, 60-space lot and sidewalks. 24/7 response.",
  "Replace the 2 original boilers (natural gas, hot water) in a 9-storey apartment building. Keep heat downtime minimal.",
];

const STEPS = ["The job", "The property", "Timing & budget", "Bidder rules"] as const;

function plusDays(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

export function fullText(r: RfpDraft): string {
  return [
    r.title,
    "",
    r.summary,
    "",
    "SCOPE",
    r.scope,
    "",
    "REQUIREMENTS",
    r.requirements,
    "",
    "SUBMISSION INSTRUCTIONS",
    r.submissionInstructions,
    "",
    "HOW BIDS WILL BE EVALUATED",
    ...r.evaluationCriteria.map((c) => `- ${c}`),
    "",
    "QUESTIONS FOR BIDDERS",
    ...r.questionsForBidders.map((q) => `- ${q}`),
  ].join("\n");
}

export function RfpWizard({
  categories,
  propertyTypes,
  templates,
  postHref,
}: {
  categories: Option[];
  propertyTypes: Option[];
  templates: TemplateOption[];
  /** Where "Post it free" goes: the PM form if signed in as a PM, else sign-up. */
  postHref: string;
}) {
  const [step, setStep] = useState(0);
  const [tradeSlug, setTradeSlug] = useState("");
  const [tradeQuery, setTradeQuery] = useState("");
  const [templateSlug, setTemplateSlug] = useState("");
  const [description, setDescription] = useState("");
  const [propertyTypeSlug, setPropertyTypeSlug] = useState("");
  const [city, setCity] = useState("");
  const [province, setProvince] = useState("Ontario");
  const [size, setSize] = useState("");
  const [occupied, setOccupied] = useState<"yes" | "no" | "">("");
  const [contractType, setContractType] = useState<"project" | "service-contract">("project");
  const [timing, setTiming] = useState("1-3-months");
  const [bidDeadline, setBidDeadline] = useState(plusDays(21));
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
    const q = tradeQuery.trim().toLowerCase();
    return q ? categories.filter((c) => c.name.toLowerCase().includes(q)) : categories;
  }, [categories, tradeQuery]);

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
        body: JSON.stringify(payload),
      });
      if (res.status === 429) {
        toast.error("You've written a few RFPs in a row — try again in a few minutes.");
        return;
      }
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { rfp: RfpDraft; source: "ai" | "template"; aiLocked?: boolean };
      setRfp(data.rfp);
      setSource(data.source);
      setAiLocked(Boolean(data.aiLocked));
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      toast.error("Something went wrong writing your RFP. Please try again.");
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

  async function copy(text: string, label = "Copied") {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(label);
    } catch {
      toast.error("Couldn't copy — select the text instead.");
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
        body: JSON.stringify({ email, rfp, tradeName: trade?.name }),
      });
      if (!res.ok) throw new Error();
      setEmailed(true);
      toast.success("Sent — check your inbox.");
    } catch {
      toast.error("Couldn't send. Check the email address and try again.");
    } finally {
      setEmailing(false);
    }
  }

  // ─────────────────────────── Result ───────────────────────────
  if (rfp) {
    const update = (patch: Partial<RfpDraft>) => setRfp({ ...rfp, ...patch });
    return (
      <div>
        <style>{`@media print { body * { visibility: hidden; } .rfp-print, .rfp-print * { visibility: visible; } .rfp-print { position: absolute; inset: 0 auto auto 0; width: 100%; } .rfp-noprint { display: none !important; } }`}</style>

        <div className="rfp-noprint flex flex-wrap items-center justify-between gap-3 rounded-xl border border-teal-300 bg-teal-50/70 p-4">
          <p className="flex items-center gap-2 text-sm font-medium text-teal-900">
            <Check className="size-4" /> Your RFP is ready.{" "}
            <span className="font-normal text-teal-900/80">
              {source === "ai" ? "Tailored to your job by AI." : "Built from our expert template for this trade."} Edit anything below.
            </span>
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => copy(fullText(rfp), "Full RFP copied")}>
              <Copy className="size-3.5" /> Copy all
            </Button>
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              <Printer className="size-3.5" /> Print / PDF
            </Button>
            <Button
              size="sm"
              onClick={() => {
                saveDraft(rfp);
                window.location.href = postHref;
              }}
            >
              Post it free on PMRFP <ArrowRight className="size-3.5" />
            </Button>
          </div>
        </div>

        {aiLocked && (
          <div className="rfp-noprint mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-indigo/20 bg-indigo p-4 text-white">
            <p className="flex items-start gap-2 text-sm">
              <Sparkles className="mt-0.5 size-4 shrink-0 text-teal-300" />
              <span>
                <strong>Want it written around your exact job?</strong>{" "}
                <span className="text-indigo-100/80">
                  Our AI tailors the scope, requirements and bidder questions to your building — free
                  with a property manager account.
                </span>
              </span>
            </p>
            <Button
              variant="accent"
              size="sm"
              onClick={() => {
                window.location.href = `/sign-up?role=property_manager&next=${encodeURIComponent("/rfp-writer?tailor=1")}`;
              }}
            >
              Tailor it free <ArrowRight className="size-3.5" />
            </Button>
          </div>
        )}

        <div className="rfp-print mt-6 space-y-6">
          <Field label="Title">
            <Input value={rfp.title} onChange={(e) => update({ title: e.target.value })} className="text-base font-semibold" />
          </Field>
          <Field label="Summary">
            <Textarea value={rfp.summary} onChange={(e) => update({ summary: e.target.value })} rows={3} />
          </Field>
          <Section title="Scope" onCopy={() => copy(rfp.scope)}>
            <Textarea value={rfp.scope} onChange={(e) => update({ scope: e.target.value })} rows={16} className="font-[inherit] leading-relaxed" />
          </Section>
          <Section title="Requirements" onCopy={() => copy(rfp.requirements)}>
            <Textarea value={rfp.requirements} onChange={(e) => update({ requirements: e.target.value })} rows={8} />
          </Section>
          <Section title="Submission instructions" onCopy={() => copy(rfp.submissionInstructions)}>
            <Textarea value={rfp.submissionInstructions} onChange={(e) => update({ submissionInstructions: e.target.value })} rows={8} />
          </Section>
          <div className="grid gap-6 md:grid-cols-2">
            <Section title="How bids will be evaluated">
              <ul className="list-disc space-y-1 pl-5 text-sm">{rfp.evaluationCriteria.map((c) => <li key={c}>{c}</li>)}</ul>
            </Section>
            <Section title="Questions for bidders" onCopy={() => copy(rfp.questionsForBidders.map((q) => `- ${q}`).join("\n"))}>
              <ul className="list-disc space-y-1 pl-5 text-sm">{rfp.questionsForBidders.map((q) => <li key={q}>{q}</li>)}</ul>
            </Section>
          </div>
        </div>

        <div className="rfp-noprint mt-8 grid gap-4 md:grid-cols-2">
          <div className="rounded-xl bg-indigo p-6 text-white">
            <h3 className="text-lg font-semibold">Get bids on it — free</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-indigo-100/80">
              Post it on PMRFP and qualified trades in your region see it. You stay anonymous until you
              choose to engage. Your draft carries over — no retyping.
            </p>
            <Button
              variant="accent"
              className="mt-4"
              onClick={() => {
                saveDraft(rfp);
                window.location.href = postHref;
              }}
            >
              Post it free <ArrowRight className="size-4" />
            </Button>
          </div>
          <div className="rounded-xl border border-border bg-card p-6">
            <h3 className="flex items-center gap-2 text-lg font-semibold"><Mail className="size-4" /> Email me a copy</h3>
            {emailed ? (
              <p className="mt-2 text-sm text-teal-800">Sent to {email}. It includes a link to post it when you&apos;re ready.</p>
            ) : (
              <form
                className="mt-3 flex flex-col gap-2 sm:flex-row"
                onSubmit={(e) => {
                  e.preventDefault();
                  emailMe();
                }}
              >
                <Input type="email" required placeholder="you@company.ca" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
                <Button type="submit" variant="outline" disabled={emailing}>{emailing ? "Sending…" : "Send"}</Button>
              </form>
            )}
            <p className="mt-2 text-xs text-muted-foreground">One email with your RFP. No newsletter.</p>
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
            <ArrowLeft className="size-3.5" /> Change my answers
          </button>
          <p className="text-xs text-muted-foreground">A starting draft, not legal advice. Review before sending to bidders.</p>
        </div>
      </div>
    );
  }

  // ─────────────────────────── Wizard ───────────────────────────
  return (
    <div className="rounded-2xl border border-border bg-card shadow-sm">
      <ol className="flex border-b border-border">
        {STEPS.map((s, i) => (
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
            <Field label="Which trade is this for?">
              <Input placeholder="Search trades — roofing, snow, HVAC…" value={tradeQuery} onChange={(e) => setTradeQuery(e.target.value)} />
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
                    {c.name}
                  </button>
                ))}
              </div>
            </Field>

            {tradeTemplates.length > 1 && (
              <Field label="Closest match (optional)">
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

            <Field label="Describe the job in a sentence or two" hint="Plain words are fine. What's wrong, what you want done, anything a contractor must know.">
              <Textarea rows={4} value={description} onChange={(e) => setDescription(e.target.value)} placeholder={EXAMPLES[0]} maxLength={1500} />
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span>Try an example:</span>
                {EXAMPLES.map((ex, i) => (
                  <button key={i} type="button" onClick={() => setDescription(ex)} className="rounded-full bg-secondary px-2.5 py-1 hover:bg-teal-50 hover:text-teal-800">
                    {["Roof", "Snow", "Boilers"][i]}
                  </button>
                ))}
              </div>
            </Field>
          </div>
        )}

        {step === 1 && (
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Property type">
              <select value={propertyTypeSlug} onChange={(e) => setPropertyTypeSlug(e.target.value)} className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm">
                <option value="">Select…</option>
                {propertyTypes.map((p) => <option key={p.slug} value={p.slug}>{p.name}</option>)}
              </select>
            </Field>
            <Field label="Size (optional)" hint="Sq ft, units, storeys, lot size — whatever fits.">
              <Input value={size} onChange={(e) => setSize(e.target.value)} placeholder="e.g. 18,000 sq ft roof, 9 storeys" />
            </Field>
            <Field label="City">
              <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="e.g. Mississauga" autoComplete="address-level2" />
            </Field>
            <Field label="Province">
              <select value={province} onChange={(e) => setProvince(e.target.value)} className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm">
                {PROVINCES.map((p) => <option key={p}>{p}</option>)}
              </select>
            </Field>
            <Field label="Is the building occupied during the work?">
              <Toggle options={[["yes", "Yes"], ["no", "No"], ["", "Not sure"]]} value={occupied} onChange={(v) => setOccupied(v as "yes" | "no" | "")} />
            </Field>
          </div>
        )}

        {step === 2 && (
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="What kind of work is it?" className="sm:col-span-2">
              <Toggle options={[["project", "One-time project"], ["service-contract", "Ongoing service contract"]]} value={contractType} onChange={(v) => setContractType(v as "project" | "service-contract")} />
            </Field>
            <Field label="When should the work happen?" className="sm:col-span-2">
              <Toggle options={TIMING} value={timing} onChange={setTiming} />
            </Field>
            <Field label="Bid deadline" hint="Three weeks is right for capital work; 1–2 weeks for small jobs.">
              <Input type="date" value={bidDeadline} min={plusDays(3)} onChange={(e) => setBidDeadline(e.target.value)} />
            </Field>
            <Field label="Budget range (optional, CAD)" hint="Shared with bidders only if you choose to when posting.">
              <div className="flex items-center gap-2">
                <Input inputMode="numeric" placeholder="Min" value={budgetMin} onChange={(e) => setBudgetMin(e.target.value.replace(/\D/g, ""))} />
                <span className="text-muted-foreground">–</span>
                <Input inputMode="numeric" placeholder="Max" value={budgetMax} onChange={(e) => setBudgetMax(e.target.value.replace(/\D/g, ""))} />
              </div>
            </Field>
          </div>
        )}

        {step === 3 && (
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Liability insurance required" hint="$5M is standard for capital work; $2M for lower-risk service contracts.">
              <Toggle options={[["5m", "$5 million"], ["2m", "$2 million"]]} value={insurance} onChange={(v) => setInsurance(v as "2m" | "5m")} />
            </Field>
            <Field label="Site visit before pricing?">
              <Toggle options={[["yes", "Yes"], ["no", "No"]]} value={siteVisit ? "yes" : "no"} onChange={(v) => setSiteVisit(v === "yes")} />
              {siteVisit && (
                <Input type="date" className="mt-2" value={siteVisitDate} min={plusDays(1)} onChange={(e) => setSiteVisitDate(e.target.value)} aria-label="Site visit date (optional)" />
              )}
            </Field>
            <Field label="What matters most when you pick a winner?" className="sm:col-span-2">
              <Toggle options={[["balanced", "Balanced"], ["price", "Lowest price"], ["quality", "Best quality & experience"]]} value={priority} onChange={(v) => setPriority(v as "balanced" | "price" | "quality")} />
            </Field>
          </div>
        )}

        <div className="mt-8 flex items-center justify-between gap-3 border-t border-border pt-5">
          <Button variant="ghost" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0 || loading}>
            <ArrowLeft className="size-4" /> Back
          </Button>
          {step < STEPS.length - 1 ? (
            <Button onClick={() => setStep((s) => s + 1)} disabled={!canNext}>
              Next <ArrowRight className="size-4" />
            </Button>
          ) : (
            <Button size="lg" onClick={() => generate()} disabled={loading}>
              {loading ? (
                <><Sparkles className="size-4 animate-pulse" /> Writing your RFP…</>
              ) : (
                <><Wand2 className="size-4" /> Write my RFP</>
              )}
            </Button>
          )}
        </div>
        {loading && (
          <p className="mt-3 text-right text-xs text-muted-foreground">
            <FileText className="mr-1 inline size-3" /> Drafting scope, requirements and bidder questions — usually under a minute.
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

function Section({ title, onCopy, children }: { title: string; onCopy?: () => void; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
        {onCopy && (
          <button type="button" onClick={onCopy} className="rfp-noprint inline-flex items-center gap-1 text-xs text-teal-700 hover:underline">
            <Copy className="size-3" /> Copy
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
