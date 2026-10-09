"use client";

/**
 * The case-study builder: one existing project, seven short steps (the job,
 * scope, story, numbers, photos, review, who sees it). Everything is the
 * trade's own words. "Tidy my wording" sends only what they typed to the
 * AI, the server throws away any field where the AI added a fact, and the
 * rest comes back marked as an AI draft that must be read and confirmed
 * before the save goes through.
 */
import { useMemo, useRef, useState, useTransition } from "react";
import { AlertTriangle, Camera, Check, Circle, ImagePlus, Loader2, Plus, Sparkles, Star, Trash2, X } from "lucide-react";
import { saveCaseStudyAction } from "@/lib/projects/actions";
import {
  BUILDER_STEPS,
  CLIENT_TYPES,
  MAX_RESULTS,
  VALUE_BANDS,
  caseStudyProgress,
  stepDone,
  type BuilderStep,
  type CaseStudyInput,
  type CaseStudyResult,
} from "@/lib/projects/case-study";
import { PHOTO_KINDS, type PhotoKind, type ProjectPhoto } from "@/lib/projects/photos";
import { POLISH_FIELDS, type PolishField } from "@/lib/projects/polish-fields";
import { VISIBILITIES, type Visibility } from "@/lib/projects/visibility";
import { shrink, upload } from "@/components/projects/project-capture";
import { useProjectMessage } from "@/components/projects/server-messages";
import { cn } from "@/lib/utils";
import { useLang, useT } from "@/i18n/provider";
import { localizePath } from "@/i18n/config";
import { fmt, plural } from "@/i18n/format";
import { propertyTypeName, regionName, tradeName } from "@/i18n/terms";

interface Option {
  slug: string;
  name: string;
}
interface RegionOption extends Option {
  country: string;
}

export interface BuilderProject {
  id: string;
  status: string;
  title: string;
  summary: string;
  visibility: Visibility;
  clientType: string;
  scope: string;
  challenge: string;
  approach: string;
  outcome: string;
  results: CaseStudyResult[];
  categorySlug: string;
  regionSlug: string;
  propertyTypeSlug: string;
  city: string;
  startedOn: string;
  completedOn: string;
  valueBand: string;
  legacyBudget: string | null;
  photos: ProjectPhoto[];
  heroUrl: string | null;
}

export function CaseStudyBuilder({
  project,
  categories,
  propertyTypes,
  regions,
  paid,
  autoPublish,
  photoLimit,
  reviewCount,
}: {
  project: BuilderProject;
  categories: Option[];
  propertyTypes: Option[];
  regions: RegionOption[];
  paid: boolean;
  autoPublish: boolean;
  photoLimit: number;
  reviewCount: number;
}) {
  const t = useT("portfolioClient");
  const b = t.builder;
  const capture = useT("dashClient").capture;
  const say = useProjectMessage();
  const lang = useLang();
  const published = project.status === "published";

  const [step, setStep] = useState<BuilderStep>("job");
  const [title, setTitle] = useState(project.title);
  const [summary, setSummary] = useState(project.summary);
  const [clientType, setClientType] = useState(project.clientType);
  const [scope, setScope] = useState(project.scope);
  const [challenge, setChallenge] = useState(project.challenge);
  const [approach, setApproach] = useState(project.approach);
  const [outcome, setOutcome] = useState(project.outcome);
  const [results, setResults] = useState<CaseStudyResult[]>(project.results);
  const [categorySlug, setCategorySlug] = useState(project.categorySlug);
  const [propertyTypeSlug, setPropertyTypeSlug] = useState(project.propertyTypeSlug);
  const [regionSlug, setRegionSlug] = useState(project.regionSlug);
  const [city, setCity] = useState(project.city);
  const [startedOn, setStartedOn] = useState(project.startedOn);
  const [completedOn, setCompletedOn] = useState(project.completedOn);
  const [valueBand, setValueBand] = useState(project.valueBand);
  const [photos, setPhotos] = useState<ProjectPhoto[]>(project.photos);
  const [heroUrl, setHeroUrl] = useState<string | null>(project.heroUrl);
  const [visibility, setVisibility] = useState<Visibility>(project.visibility);

  const [uploading, setUploading] = useState(0);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const fileRefs = useRef<Record<PhotoKind, HTMLInputElement | null>>({ before: null, during: null, after: null });

  const [aiFields, setAiFields] = useState<Set<PolishField>>(new Set());
  const [aiUsed, setAiUsed] = useState(false);
  const [aiChecked, setAiChecked] = useState(false);
  const [polishing, setPolishing] = useState(false);
  const [aiMsg, setAiMsg] = useState<{ tone: "ok" | "warn"; text: string } | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [saving, startSave] = useTransition();

  const progressInput = {
    clientType,
    categorySlug,
    city,
    regionSlug,
    completedOn,
    scope,
    challenge,
    approach,
    outcome,
    results: results.filter((r) => r.value.trim() && r.label.trim()),
    photos,
    reviewCount,
  };
  const progress = caseStudyProgress(progressInput);
  const idx = BUILDER_STEPS.indexOf(step);
  const regionGroups = useMemo(() => groupByCountry(regions), [regions]);

  const field =
    "mt-1 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-base sm:text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20";
  const label = "block text-sm font-medium";
  const fieldLabel: Record<PolishField, string> = {
    summary: b.summary,
    scope: b.scope,
    challenge: b.challenge,
    approach: b.approach,
    outcome: b.outcome,
  };
  const setters: Record<PolishField, (v: string) => void> = {
    summary: setSummary,
    scope: setScope,
    challenge: setChallenge,
    approach: setApproach,
    outcome: setOutcome,
  };
  const values: Record<PolishField, string> = { summary, scope, challenge, approach, outcome };

  async function tidy() {
    setAiMsg(null);
    setPolishing(true);
    try {
      const res = await fetch("/api/projects/polish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const body = (await res.json().catch(() => ({}))) as {
        fields?: Partial<Record<PolishField, string>>;
        kept?: PolishField[];
      };
      if (!res.ok || !body.fields) {
        setAiMsg({ tone: "warn", text: b.tidyFailed });
        return;
      }
      const changed = POLISH_FIELDS.filter((f) => typeof body.fields![f] === "string");
      for (const f of changed) setters[f](body.fields[f]!);
      if (changed.length) {
        setAiFields((prev) => new Set([...prev, ...changed]));
        setAiUsed(true);
        setAiChecked(false);
      }
      const kept = (body.kept ?? []).filter((f) => POLISH_FIELDS.includes(f));
      const parts = [changed.length ? b.tidyDone : b.tidyNothing];
      if (kept.length) parts.push(fmt(b.tidyKept, { fields: kept.map((f) => fieldLabel[f].toLowerCase()).join(", ") }));
      setAiMsg({ tone: kept.length ? "warn" : "ok", text: parts.join(" ") });
    } catch {
      setAiMsg({ tone: "warn", text: b.tidyFailed });
    } finally {
      setPolishing(false);
    }
  }

  async function addPhotos(kind: PhotoKind, list: FileList | null) {
    if (!list?.length) return;
    setPhotoError(null);
    const room = Math.max(0, photoLimit - photos.length - uploading);
    const files = Array.from(list).filter((f) => f.type.startsWith("image/") || f.type === "").slice(0, room);
    if (files.length < list.length) {
      setPhotoError(fmt(paid ? capture.limitPaid : capture.limitFree, { limit: photoLimit, room }));
    }
    setUploading((n) => n + files.length);
    await Promise.all(
      files.map(async (f) => {
        try {
          const r = await upload(await shrink(f), () => undefined, capture);
          setPhotos((prev) => [...prev, { ...r, kind }]);
        } catch (err) {
          setPhotoError(err instanceof Error ? say(err.message) : capture.uploadFailed);
        } finally {
          setUploading((n) => n - 1);
        }
      }),
    );
  }

  function save() {
    setError(null);
    if (uploading > 0) return setError(capture.waitUploads);
    startSave(async () => {
      const res = await saveCaseStudyAction({
        id: project.id,
        title,
        summary,
        clientType: clientType as CaseStudyInput["clientType"],
        scope,
        challenge,
        approach,
        outcome,
        results: results.filter((r) => r.value.trim() || r.label.trim()),
        categorySlug,
        propertyTypeSlug,
        regionSlug,
        city,
        startedOn,
        completedOn,
        valueBand: valueBand as CaseStudyInput["valueBand"],
        photos,
        heroUrl: heroUrl ?? "",
        visibility,
        aiUsed,
        aiChecked,
      });
      if (res?.error) setError(say(res.error));
    });
  }

  const AiBadge = ({ f }: { f: PolishField }) =>
    aiFields.has(f) ? (
      <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-indigo/10 px-2 py-0.5 text-[11px] font-semibold text-indigo">
        <Sparkles className="size-3" /> {b.aiBadge}
      </span>
    ) : null;

  const textArea = (f: PolishField, rows: number, max: number, placeholder?: string) => (
    <div>
      <label htmlFor={`cs-${f}`} className={label}>
        {fieldLabel[f]}
        {f === "summary" && <span className="font-normal text-muted-foreground"> {b.optional}</span>}
        <AiBadge f={f} />
      </label>
      <textarea
        id={`cs-${f}`}
        value={values[f]}
        onChange={(e) => setters[f](e.target.value)}
        rows={rows}
        maxLength={max}
        placeholder={placeholder}
        className={cn(field, aiFields.has(f) && "border-indigo/40 bg-indigo/[0.03]")}
      />
    </div>
  );

  return (
    <div className="max-w-3xl pb-4">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {fmt(b.progress, { done: progress.done, total: progress.total })}
      </p>
      {/* Step tabs: scroll sideways on phones. */}
      <nav aria-label={b.title} className="-mx-1 mb-6 overflow-x-auto pb-1">
        <ol className="flex min-w-max gap-1.5 px-1">
          {BUILDER_STEPS.map((s, i) => {
            const done = s !== "visibility" && stepDone(s, progressInput);
            return (
              <li key={s}>
                <button
                  type="button"
                  onClick={() => setStep(s)}
                  aria-current={s === step ? "step" : undefined}
                  className={cn(
                    "flex h-9 items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition-colors",
                    s === step ? "border-indigo bg-indigo text-white" : "border-border bg-card hover:border-teal-400",
                  )}
                >
                  {done ? (
                    <Check className={cn("size-3.5", s === step ? "text-teal-300" : "text-teal-600")} aria-label={b.stepDone} />
                  ) : (
                    <span className="text-xs opacity-70">{i + 1}</span>
                  )}
                  {b.steps[s]}
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      <section aria-labelledby="step-h" className="rounded-xl border border-border bg-card p-4 sm:p-6">
        <h2 id="step-h" className="text-lg font-semibold tracking-tight">
          {b.steps[step]}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">{b.intro[step]}</p>

        <div className="mt-5 space-y-4">
          {step === "job" && (
            <>
              <div>
                <label htmlFor="cs-title" className={label}>{b.title}</label>
                <input id="cs-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={140} className={field} />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="cs-client" className={label}>{b.clientType}</label>
                  <select id="cs-client" value={clientType} onChange={(e) => setClientType(e.target.value)} className={field}>
                    <option value="">{b.select}</option>
                    {CLIENT_TYPES.map((c) => (
                      <option key={c} value={c}>{t.clientTypes[c]}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="cs-trade" className={label}>{b.trade}</label>
                  <select id="cs-trade" value={categorySlug} onChange={(e) => setCategorySlug(e.target.value)} className={field}>
                    <option value="">{b.select}</option>
                    {categories.map((c) => (
                      <option key={c.slug} value={c.slug}>{tradeName(c.name, lang)}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="cs-ptype" className={label}>{b.propertyType}</label>
                  <select id="cs-ptype" value={propertyTypeSlug} onChange={(e) => setPropertyTypeSlug(e.target.value)} className={field}>
                    <option value="">{b.select}</option>
                    {propertyTypes.map((p) => (
                      <option key={p.slug} value={p.slug}>{propertyTypeName(p.name, lang)}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="cs-city" className={label}>{b.city}</label>
                  <input id="cs-city" value={city} onChange={(e) => setCity(e.target.value)} maxLength={80} className={field} autoComplete="address-level2" />
                </div>
                <div>
                  <label htmlFor="cs-region" className={label}>{b.region}</label>
                  <select id="cs-region" value={regionSlug} onChange={(e) => setRegionSlug(e.target.value)} className={field}>
                    <option value="">{b.select}</option>
                    {regionGroups.map((g) =>
                      regionGroups.length > 1 ? (
                        <optgroup key={g.country} label={regionName(g.country, lang)}>
                          {g.regions.map((r) => (
                            <option key={r.slug} value={r.slug}>{regionName(r.name, lang)}</option>
                          ))}
                        </optgroup>
                      ) : (
                        g.regions.map((r) => (
                          <option key={r.slug} value={r.slug}>{regionName(r.name, lang)}</option>
                        ))
                      ),
                    )}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="cs-start" className={label}>{b.started}</label>
                    <input id="cs-start" type="month" value={startedOn} onChange={(e) => setStartedOn(e.target.value)} placeholder="2026-05" pattern="\d{4}-\d{2}" className={field} />
                  </div>
                  <div>
                    <label htmlFor="cs-end" className={label}>{b.finished}</label>
                    <input id="cs-end" type="month" value={completedOn} onChange={(e) => setCompletedOn(e.target.value)} placeholder="2026-06" pattern="\d{4}-\d{2}" className={field} />
                  </div>
                </div>
              </div>
              <div>
                <label htmlFor="cs-value" className={label}>{b.valueBand}</label>
                <select id="cs-value" value={valueBand} onChange={(e) => setValueBand(e.target.value)} className={cn(field, "sm:max-w-xs")}>
                  <option value="">{b.none}</option>
                  {VALUE_BANDS.map((v) => (
                    <option key={v} value={v}>{t.valueBands[v]}</option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-muted-foreground">
                  {b.valueHint}
                  {project.legacyBudget && !valueBand && <> {fmt(b.legacyBudget, { value: project.legacyBudget })}</>}
                </p>
              </div>
            </>
          )}

          {step === "scope" && textArea("scope", 5, 1500, b.scopePlaceholder)}

          {step === "story" && (
            <>
              {textArea("summary", 2, 400)}
              {textArea("challenge", 4, 3000)}
              {textArea("approach", 4, 3000)}
              {textArea("outcome", 4, 3000)}
            </>
          )}

          {(step === "scope" || step === "story") && (
            <div className="rounded-lg border border-dashed border-border p-3">
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={tidy}
                  disabled={polishing}
                  className="inline-flex h-10 items-center gap-2 rounded-full bg-indigo px-4 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-40"
                >
                  {polishing ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4 text-teal-300" />}
                  {polishing ? b.tidying : b.tidy}
                </button>
                <span className="text-xs text-muted-foreground">{b.tidyHint}</span>
              </div>
              {aiMsg && (
                <p
                  role="status"
                  className={cn(
                    "mt-3 flex items-start gap-2 rounded-lg px-3 py-2 text-sm",
                    aiMsg.tone === "ok" ? "bg-teal-50 text-teal-ink" : "bg-amber-50 text-amber-800",
                  )}
                >
                  {aiMsg.tone === "ok" ? <Check className="mt-0.5 size-4 shrink-0" /> : <AlertTriangle className="mt-0.5 size-4 shrink-0" />}
                  {aiMsg.text}
                </p>
              )}
            </div>
          )}

          {step === "results" && (
            <>
              {results.map((r, i) => (
                <div key={i} className="grid grid-cols-[1fr_auto] items-end gap-2 sm:grid-cols-[10rem_1fr_auto]">
                  <div className="col-span-2 sm:col-span-1">
                    <label htmlFor={`cs-rv-${i}`} className={label}>{b.resultValue}</label>
                    <input
                      id={`cs-rv-${i}`}
                      value={r.value}
                      maxLength={24}
                      placeholder={b.resultValuePlaceholder}
                      onChange={(e) => setResults((prev) => prev.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))}
                      className={field}
                    />
                  </div>
                  <div>
                    <label htmlFor={`cs-rl-${i}`} className={label}>{b.resultLabel}</label>
                    <input
                      id={`cs-rl-${i}`}
                      value={r.label}
                      maxLength={60}
                      placeholder={b.resultLabelPlaceholder}
                      onChange={(e) => setResults((prev) => prev.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
                      className={field}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => setResults((prev) => prev.filter((_, j) => j !== i))}
                    aria-label={b.removeResult}
                    className="mb-1 inline-flex size-10 items-center justify-center rounded-full border border-border hover:border-red-300 hover:text-red-700"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              ))}
              {results.length < MAX_RESULTS ? (
                <button
                  type="button"
                  onClick={() => setResults((prev) => [...prev, { value: "", label: "" }])}
                  className="inline-flex h-10 items-center gap-2 rounded-full border border-border px-4 text-sm font-semibold hover:border-teal-400 hover:text-teal-ink"
                >
                  <Plus className="size-4" /> {b.addResult}
                </button>
              ) : (
                <p className="text-xs text-muted-foreground">{fmt(b.resultsMax, { limit: MAX_RESULTS })}</p>
              )}
            </>
          )}

          {step === "photos" && (
            <>
              <p className="text-xs text-muted-foreground">{fmt(b.photoCount, { n: photos.length, limit: photoLimit })}</p>
              {photos.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">{b.noPhotos}</p>
              ) : (
                <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {photos.map((p) => (
                    <li key={p.url} className="overflow-hidden rounded-lg border border-border bg-background">
                      <div className="relative aspect-[4/3] bg-secondary">
                        {/* eslint-disable-next-line @next/next/no-img-element -- dashboard preview of our own bucket */}
                        <img src={p.url} alt="" className="size-full object-cover" loading="lazy" />
                        {heroUrl === p.url && (
                          <span className="absolute left-1.5 top-1.5 inline-flex items-center gap-1 rounded-full bg-teal-600 px-2 py-0.5 text-[11px] font-semibold text-white">
                            <Star className="size-3" /> {b.cover}
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            setPhotos((prev) => prev.filter((x) => x.url !== p.url));
                            if (heroUrl === p.url) setHeroUrl(null);
                          }}
                          aria-label={b.removePhoto}
                          className="absolute right-1.5 top-1.5 rounded-full bg-black/70 p-1 text-white hover:bg-black/85"
                        >
                          <X className="size-3.5" />
                        </button>
                      </div>
                      <div className="flex flex-col gap-1.5 p-2">
                        <select
                          aria-label={b.kinds[p.kind]}
                          value={p.kind}
                          onChange={(e) =>
                            setPhotos((prev) => prev.map((x) => (x.url === p.url ? { ...x, kind: e.target.value as PhotoKind } : x)))
                          }
                          className="h-8 rounded-md border border-border bg-background px-2 text-xs font-medium"
                        >
                          {PHOTO_KINDS.map((k) => (
                            <option key={k} value={k}>{b.kinds[k]}</option>
                          ))}
                        </select>
                        {heroUrl !== p.url && (
                          <button type="button" onClick={() => setHeroUrl(p.url)} className="text-left text-xs font-medium text-teal-ink hover:underline">
                            {b.makeCover}
                          </button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              {!stepDone("photos", progressInput) && photos.length > 0 && (
                <p className="text-xs text-amber-800">{b.needBeforeAfter}</p>
              )}
              <div className="flex flex-wrap gap-2">
                {PHOTO_KINDS.map((k) => (
                  <span key={k}>
                    <input
                      ref={(el) => {
                        fileRefs.current[k] = el;
                      }}
                      type="file"
                      accept="image/*"
                      multiple
                      className="sr-only"
                      tabIndex={-1}
                      aria-hidden
                      onChange={(e) => {
                        void addPhotos(k, e.target.files);
                        e.target.value = "";
                      }}
                    />
                    <button
                      type="button"
                      disabled={photos.length + uploading >= photoLimit}
                      onClick={() => fileRefs.current[k]?.click()}
                      className="inline-flex h-10 items-center gap-2 rounded-full border border-border px-4 text-sm font-semibold hover:border-teal-400 hover:text-teal-ink disabled:opacity-40"
                    >
                      {k === "after" ? <Camera className="size-4" /> : <ImagePlus className="size-4" />}
                      {b.addPhotos} · {b.kinds[k]}
                    </button>
                  </span>
                ))}
              </div>
              {uploading > 0 && (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" /> {b.uploading}
                </p>
              )}
              {photoError && <p role="alert" className="text-sm text-amber-800">{photoError}</p>}
              {photos.length >= photoLimit && !paid && (
                <p className="text-sm text-muted-foreground">
                  {capture.freeLimit}{" "}
                  <a href={localizePath("/pricing", lang)} className="font-medium text-teal-ink hover:underline">Trade Pro</a>{" "}
                  {capture.freeLimitAfter}
                </p>
              )}
            </>
          )}

          {step === "proof" && (
            <>
              <p className="flex items-center gap-2 text-sm font-medium">
                {reviewCount > 0 ? <Check className="size-4 text-teal-600" /> : <Circle className="size-4 text-muted-foreground" />}
                {reviewCount > 0 ? plural(reviewCount, b.reviews) : b.noReviews}
              </p>
              <p className="text-sm text-muted-foreground">{b.reviewWhy}</p>
              {paid ? (
                published && (
                  <a
                    href={localizePath(`/dashboard/projects#p-${project.id}`, lang)}
                    className="inline-flex h-10 items-center gap-2 rounded-full border border-border px-4 text-sm font-semibold hover:border-teal-400 hover:text-teal-ink"
                  >
                    {b.askReview}
                  </a>
                )
              ) : (
                <p className="text-sm text-muted-foreground">
                  {b.reviewUpsell}{" "}
                  <a href={localizePath("/pricing", lang)} className="font-medium text-teal-ink hover:underline">Trade Pro</a>
                </p>
              )}
            </>
          )}

          {step === "visibility" && (
            <fieldset className="space-y-2">
              <legend className="sr-only">{t.visibility.label}</legend>
              {VISIBILITIES.map((v) => {
                const locked = v === "private" && !paid && project.visibility !== "private";
                const hint = { public: t.visibility.publicHint, unlisted: t.visibility.unlistedHint, private: t.visibility.privateHint }[v];
                return (
                  <label
                    key={v}
                    className={cn(
                      "flex cursor-pointer items-start gap-3 rounded-lg border p-3",
                      visibility === v ? "border-teal-500 bg-teal-50/60" : "border-border",
                      locked && "cursor-not-allowed opacity-60",
                    )}
                  >
                    <input
                      type="radio"
                      name="visibility"
                      value={v}
                      checked={visibility === v}
                      disabled={locked}
                      onChange={() => setVisibility(v)}
                      className="mt-1 size-4 accent-teal-700"
                    />
                    <span>
                      <span className="block text-sm font-semibold">
                        {t.visibility[v]}
                        {v === "private" && !paid && <span className="ml-2 text-xs font-medium text-muted-foreground">{t.visibility.proOnly}</span>}
                      </span>
                      <span className="block text-xs text-muted-foreground">{hint}</span>
                    </span>
                  </label>
                );
              })}
            </fieldset>
          )}
        </div>
      </section>

      {/* Footer: confirm AI wording, step through, save. Sticky on phones. */}
      <div className="sticky bottom-0 z-10 -mx-5 mt-6 border-t border-border bg-background/95 px-5 py-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none">
        {aiUsed && (
          <label className="mb-3 flex items-start gap-2.5 rounded-lg border border-indigo/30 bg-indigo/[0.04] p-3 text-sm font-medium">
            <input type="checkbox" checked={aiChecked} onChange={(e) => setAiChecked(e.target.checked)} className="mt-0.5 size-5 accent-teal-700" />
            {b.aiCheck}
          </label>
        )}
        {error && (
          <p role="alert" className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setStep(BUILDER_STEPS[Math.max(0, idx - 1)])}
            disabled={idx === 0}
            className="inline-flex h-11 items-center rounded-full border border-border px-4 text-sm font-semibold disabled:opacity-40"
          >
            {b.back}
          </button>
          {idx < BUILDER_STEPS.length - 1 && (
            <button
              type="button"
              onClick={() => setStep(BUILDER_STEPS[idx + 1])}
              className="inline-flex h-11 items-center rounded-full border border-indigo px-5 text-sm font-semibold text-indigo"
            >
              {b.next}
            </button>
          )}
          <button
            type="button"
            onClick={save}
            disabled={saving || uploading > 0 || (aiUsed && !aiChecked)}
            className="ml-auto inline-flex h-11 items-center gap-2 rounded-full bg-primary px-6 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-40"
          >
            {saving && <Loader2 className="size-4 animate-spin" />}
            {saving ? b.saving : b.save}
          </button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {published && !autoPublish ? b.reReview : autoPublish ? b.autoLive : b.pending}
        </p>
      </div>
    </div>
  );
}

function groupByCountry(regions: RegionOption[]): { country: string; regions: RegionOption[] }[] {
  const map = new Map<string, RegionOption[]>();
  for (const r of regions) {
    const key = r.country || "";
    map.set(key, [...(map.get(key) ?? []), r]);
  }
  return [...map.entries()].map(([country, list]) => ({ country, regions: list }));
}
