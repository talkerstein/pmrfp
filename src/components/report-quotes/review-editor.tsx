"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ExternalLink, FileText, Loader2, Plus, RotateCcw, Save, Send, Trash2 } from "lucide-react";
import Link from "@/i18n/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { deleteReportAction, saveReviewAction, sendQuoteRequestsAction } from "@/lib/report-quotes/actions";
import {
  MAX_ITEMS,
  MAX_QUOTE_RECIPIENTS,
  REPORT_TYPES,
  URGENCIES,
  buildQuoteMessage,
  groupItems,
  type ReportCountry,
  type ReportType,
  type TradeGroup,
  type TradeOption,
  type Urgency,
} from "@/lib/report-quotes/rules";
import type { Messages } from "@/i18n/dictionaries";
import { useLang } from "@/i18n/provider";
import { localizePath } from "@/i18n/config";
import { fmt, plural } from "@/i18n/format";

type R = Messages["reportQuotes"];

export interface ReviewStrings {
  review: R["review"];
  urgency: R["urgency"];
  reportTypes: R["reportTypes"];
  reportTypeInline: R["reportTypeInline"];
  unassigned: string;
  page: string;
  quote: Omit<R["quote"], "attach">;
}

export interface EditorItem {
  key: string;
  trade_slug: string | null;
  item: string;
  location: string;
  urgency: Urgency;
  source_page: number | null;
  origin: "ai" | "manual";
}

export interface ReportDetails {
  title: string;
  reportType: ReportType;
  buildingName: string;
  streetAddress: string;
  city: string;
  region: string;
}

export interface TrustedOption {
  organizationId: string;
  name: string;
  city: string | null;
  /** Trade slugs the company is listed under. */
  tradeSlugs: string[];
}

export interface SendSummary {
  tradeSlug: string;
  date: string;
  count: number;
  attached: boolean;
}

const selectClass = "h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm";
const URGENCY_CHIP: Record<Urgency, string> = {
  safety: "border-red-200 bg-red-50 text-red-700",
  soon: "border-amber-200 bg-amber-50 text-amber-800",
  monitor: "border-slate-200 bg-slate-100 text-slate-700",
};
const DASH = "/pm-dashboard/report-to-quotes";

let keySeq = 0;
const newKey = () => `n${Date.now().toString(36)}${(keySeq++).toString(36)}`;

function snapshot(details: ReportDetails, items: EditorItem[]): string {
  // The React key is not content: leave it out of the dirty check.
  return JSON.stringify({ details, items }, (k, v) => (k === "key" ? undefined : v));
}

/**
 * The review screen: every extracted (or typed) item, grouped by trade, with
 * its urgency, location and the report page it came from. The user edits,
 * deletes, reassigns and saves; only a saved list unlocks the group actions
 * (a draft RFP for everyone, quote requests to trusted trades for realtors).
 */
export function ReviewEditor({
  reportId,
  country,
  initialDetails,
  initialItems,
  initialReviewedAt,
  trades,
  regions,
  fileAvailable,
  fileNote,
  isRealtor,
  trusted,
  sends,
  signature,
  readNotice,
  canRetry,
  s,
}: {
  reportId: string;
  country: ReportCountry;
  initialDetails: ReportDetails;
  initialItems: EditorItem[];
  initialReviewedAt: string | null;
  trades: TradeOption[];
  regions: readonly string[];
  fileAvailable: boolean;
  /** "The PDF is kept until …" / "The PDF was deleted …", or null for a typed list. */
  fileNote: string | null;
  isRealtor: boolean;
  trusted: TrustedOption[];
  sends: SendSummary[];
  signature: string;
  readNotice: "failed" | "unavailable" | "running" | "quota" | null;
  canRetry: boolean;
  s: ReviewStrings;
}) {
  const t = s.review;
  const router = useRouter();
  const lang = useLang();
  const [details, setDetails] = useState<ReportDetails>(initialDetails);
  const [items, setItems] = useState<EditorItem[]>(initialItems);
  const [saved, setSaved] = useState(() => snapshot(initialDetails, initialItems));
  const [savedDetails, setSavedDetails] = useState<ReportDetails>(initialDetails);
  const [reviewedAt, setReviewedAt] = useState(initialReviewedAt);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [saving, startSave] = useTransition();
  const [retrying, setRetrying] = useState(false);
  const [deleting, startDelete] = useTransition();

  const tradeName = useMemo(() => new Map(trades.map((x) => [x.slug, x.name])), [trades]);
  const sortedTrades = useMemo(() => [...trades].sort((a, b) => a.name.localeCompare(b.name)), [trades]);
  const groups = useMemo(() => groupItems(items), [items]);
  const dirty = snapshot(details, items) !== saved;
  const ready = Boolean(reviewedAt) && !dirty;
  const err = (key: string) => (t.errors as Record<string, string>)[key] ?? t.errors.failed;

  const update = (key: string, patch: Partial<EditorItem>) => setItems((list) => list.map((i) => (i.key === key ? { ...i, ...patch } : i)));
  const remove = (key: string) => setItems((list) => list.filter((i) => i.key !== key));
  const add = (trade: string | null) =>
    setItems((list) =>
      list.length >= MAX_ITEMS ? list : [...list, { key: newKey(), trade_slug: trade, item: "", location: "", urgency: "soon", source_page: null, origin: "manual" }],
    );

  function save() {
    setMessage(null);
    const kept = items.filter((i) => i.item.trim());
    startSave(async () => {
      const result = await saveReviewAction(reportId, {
        ...details,
        items: kept.map((i) => ({
          trade_slug: i.trade_slug,
          item: i.item.trim(),
          location: i.location.trim(),
          urgency: i.urgency,
          source_page: i.source_page,
          origin: i.origin,
        })),
      });
      if (!result.ok) return setMessage({ kind: "error", text: err(result.error) });
      setItems(kept);
      setSaved(snapshot(details, kept));
      setSavedDetails(details);
      setReviewedAt(result.reviewedAt);
      setMessage({ kind: "ok", text: t.saved });
    });
  }

  async function retry() {
    setRetrying(true);
    setMessage(null);
    try {
      const res = await fetch("/api/report-quotes/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: reportId }),
      });
      const json = (await res.json().catch(() => ({}))) as { status?: string; count?: number; reason?: string };
      if (res.ok && json.status === "done") {
        setMessage({ kind: "ok", text: plural(json.count ?? 0, t.retryDone) });
        router.refresh();
      } else {
        setMessage({ kind: "error", text: json.reason === "quota" ? t.readNotice.quota : t.readNotice.failed });
      }
    } catch {
      setMessage({ kind: "error", text: t.readNotice.failed });
    } finally {
      setRetrying(false);
    }
  }

  function removeReport() {
    if (!window.confirm(t.deleteConfirm)) return;
    startDelete(async () => {
      const result = await deleteReportAction(reportId);
      if (!result.ok) return setMessage({ kind: "error", text: err(result.error) });
      router.push(localizePath(DASH, lang));
    });
  }

  const tradeLabel = (slug: string | null) => (slug ? tradeName.get(slug) ?? slug : s.unassigned);
  const pageHref = (n: number) => `/api/report-quotes/file?id=${reportId}#page=${n}`;

  return (
    <div className="space-y-8">
      {readNotice && items.length === 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <span>{t.readNotice[readNotice]}</span>
          {canRetry && (
            <Button type="button" variant="outline" size="sm" onClick={() => void retry()} disabled={retrying || dirty}>
              {retrying ? <Loader2 className="size-4 animate-spin" /> : <RotateCcw className="size-4" />}
              {retrying ? t.retrying : t.retry}
            </Button>
          )}
        </div>
      )}

      <section className="rounded-2xl border border-border bg-card p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold">{t.detailsTitle}</h2>
          {fileAvailable ? (
            <a href={`/api/report-quotes/file?id=${reportId}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm font-medium text-teal-700 hover:underline">
              <FileText className="size-4" /> {t.openReport}
            </a>
          ) : null}
        </div>
        {fileNote && <p className="mt-1 text-xs text-muted-foreground">{fileNote}</p>}
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="rq-title">{t.titleLabel}</Label>
            <Input id="rq-title" value={details.title} maxLength={160} onChange={(e) => setDetails({ ...details, title: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rq-type">{t.typeLabel}</Label>
            <select id="rq-type" className={selectClass} value={details.reportType} onChange={(e) => setDetails({ ...details, reportType: e.target.value as ReportType })}>
              {REPORT_TYPES.map((x) => (
                <option key={x} value={x}>
                  {s.reportTypes[x]}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rq-city">{t.cityLabel}</Label>
            <Input id="rq-city" value={details.city} maxLength={120} onChange={(e) => setDetails({ ...details, city: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rq-region">{t.regionLabel[country]}</Label>
            <select id="rq-region" className={selectClass} value={details.region} onChange={(e) => setDetails({ ...details, region: e.target.value })}>
              <option value="">{t.regionPlaceholder}</option>
              {details.region && !regions.includes(details.region) && <option value={details.region}>{details.region}</option>}
              {regions.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rq-building">{t.buildingLabel}</Label>
            <Input id="rq-building" value={details.buildingName} maxLength={160} onChange={(e) => setDetails({ ...details, buildingName: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rq-street">{t.streetLabel}</Label>
            <Input id="rq-street" value={details.streetAddress} maxLength={200} autoComplete="off" onChange={(e) => setDetails({ ...details, streetAddress: e.target.value })} />
            <p className="text-xs text-muted-foreground">{t.streetHint}</p>
          </div>
        </div>
      </section>

      <section>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">{t.itemsTitle}</h2>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{t.itemsIntro}</p>
            {items.length > 0 && <p className="mt-1 text-xs text-muted-foreground">{fmt(t.countLine, { n: items.length, groups: groups.length })}</p>}
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => add(null)} disabled={items.length >= MAX_ITEMS}>
            <Plus className="size-4" /> {t.add}
          </Button>
        </div>
        <p className="mt-3 rounded-lg bg-secondary/50 p-3 text-xs leading-relaxed text-muted-foreground">{t.disclaimer}</p>

        {items.length === 0 ? (
          <p className="mt-6 rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">{t.emptyItems}</p>
        ) : (
          <div className="mt-6 space-y-6">
            {groups.map((g) => (
              <GroupCard
                key={g.tradeSlug ?? "__unassigned"}
                group={g}
                label={tradeLabel(g.tradeSlug)}
                reportId={reportId}
                ready={ready}
                dirty={dirty}
                details={savedDetails}
                isRealtor={isRealtor}
                trusted={trusted}
                sends={sends.filter((x) => x.tradeSlug === g.tradeSlug)}
                signature={signature}
                fileAvailable={fileAvailable}
                s={s}
                onAdd={() => add(g.tradeSlug)}
              >
                {g.items.map((i) => (
                  <div key={i.key} className="space-y-2 rounded-lg border border-border bg-background p-3">
                    {i.urgency === "safety" && (
                      <p className="flex items-center gap-2 rounded-md bg-red-50 px-2.5 py-1.5 text-xs font-medium text-red-700">
                        <AlertTriangle className="size-3.5 shrink-0" /> {t.safetyBanner}
                      </p>
                    )}
                    <Textarea
                      aria-label={t.itemLabel}
                      value={i.item}
                      maxLength={500}
                      rows={2}
                      placeholder={t.itemPlaceholder}
                      onChange={(e) => update(i.key, { item: e.target.value })}
                    />
                    <div className="grid gap-2 sm:grid-cols-[2fr_1.3fr_2fr_0.8fr_auto] sm:items-end">
                      <div className="space-y-1">
                        <Label className="text-xs" htmlFor={`${i.key}-loc`}>{t.locationLabel}</Label>
                        <Input id={`${i.key}-loc`} value={i.location} maxLength={160} placeholder={t.locationPlaceholder} onChange={(e) => update(i.key, { location: e.target.value })} />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs" htmlFor={`${i.key}-urg`}>{t.urgencyLabel}</Label>
                        <select id={`${i.key}-urg`} className={selectClass} value={i.urgency} onChange={(e) => update(i.key, { urgency: e.target.value as Urgency })}>
                          {URGENCIES.map((u) => (
                            <option key={u} value={u}>
                              {s.urgency[u]}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs" htmlFor={`${i.key}-trade`}>{t.tradeLabel}</Label>
                        <select id={`${i.key}-trade`} className={selectClass} value={i.trade_slug ?? ""} onChange={(e) => update(i.key, { trade_slug: e.target.value || null })}>
                          <option value="">{t.chooseTrade}</option>
                          {sortedTrades.map((x) => (
                            <option key={x.slug} value={x.slug}>
                              {x.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs" htmlFor={`${i.key}-page`}>{t.pageLabel}</Label>
                        <Input
                          id={`${i.key}-page`}
                          type="number"
                          inputMode="numeric"
                          min={1}
                          max={2000}
                          value={i.source_page ?? ""}
                          onChange={(e) => {
                            const n = Number.parseInt(e.target.value, 10);
                            update(i.key, { source_page: Number.isFinite(n) && n >= 1 && n <= 2000 ? n : null });
                          }}
                        />
                      </div>
                      <Button type="button" variant="ghost" size="icon-sm" aria-label={t.delete} title={t.delete} onClick={() => remove(i.key)}>
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className={`rounded-full border px-2 py-0.5 font-medium ${URGENCY_CHIP[i.urgency]}`}>{s.urgency[i.urgency]}</span>
                      {i.source_page && fileAvailable ? (
                        <a href={pageHref(i.source_page)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-teal-700 hover:underline">
                          {fmt(t.pageLink, { n: i.source_page })} <ExternalLink className="size-3" />
                        </a>
                      ) : i.source_page ? (
                        <span className="text-muted-foreground">{fmt(t.pageLink, { n: i.source_page })}</span>
                      ) : i.origin === "ai" ? (
                        <span className="font-medium text-amber-800">{t.pageMissing}</span>
                      ) : (
                        <span className="text-muted-foreground">{t.manualItem}</span>
                      )}
                    </div>
                  </div>
                ))}
              </GroupCard>
            ))}
          </div>
        )}
      </section>

      <div className="sticky bottom-3 z-10 flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card/95 p-3 shadow-sm backdrop-blur">
        <Button type="button" onClick={save} disabled={saving || (!dirty && Boolean(reviewedAt))}>
          {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          {saving ? t.saving : t.save}
        </Button>
        <span className={`text-sm ${message?.kind === "error" ? "font-medium text-destructive" : "text-muted-foreground"}`} role={message?.kind === "error" ? "alert" : undefined}>
          {message?.text ?? (dirty && reviewedAt ? t.unsaved : !reviewedAt ? t.needsReview : "")}
        </span>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-6">
        <Link href={DASH} className="text-sm font-medium text-teal-700 hover:underline">
          ← {t.back}
        </Link>
        <Button type="button" variant="destructive" size="sm" onClick={removeReport} disabled={deleting}>
          <Trash2 className="size-4" /> {t.deleteReport}
        </Button>
      </div>
    </div>
  );
}

function GroupCard({
  group,
  label,
  reportId,
  ready,
  dirty,
  details,
  isRealtor,
  trusted,
  sends,
  signature,
  fileAvailable,
  s,
  onAdd,
  children,
}: {
  group: TradeGroup<EditorItem>;
  label: string;
  reportId: string;
  ready: boolean;
  dirty: boolean;
  details: ReportDetails;
  isRealtor: boolean;
  trusted: TrustedOption[];
  sends: SendSummary[];
  signature: string;
  fileAvailable: boolean;
  s: ReviewStrings;
  onAdd: () => void;
  children: React.ReactNode;
}) {
  const t = s.review;
  const [includeAddress, setIncludeAddress] = useState(false);
  const hasAddress = Boolean(details.streetAddress.trim() || details.buildingName.trim());
  const slug = group.tradeSlug;
  const rfpHref = slug ? `/pm-dashboard/rfps/new?report=${reportId}&trade=${encodeURIComponent(slug)}${includeAddress ? "&address=1" : ""}` : null;

  return (
    <div className="rounded-2xl border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3 sm:px-5">
        <h3 className="font-semibold">
          {label} <span className="ml-1 text-sm font-normal text-muted-foreground">({group.items.length})</span>
        </h3>
        <div className="flex flex-wrap gap-1.5 text-xs">
          {URGENCIES.filter((u) => group.counts[u]).map((u) => (
            <span key={u} className={`rounded-full border px-2 py-0.5 font-medium ${URGENCY_CHIP[u]}`}>
              {group.counts[u]} {s.urgency[u]}
            </span>
          ))}
        </div>
      </div>
      <div className="space-y-3 p-4 sm:p-5">
        {children}
        <Button type="button" variant="ghost" size="sm" onClick={onAdd}>
          <Plus className="size-4" /> {t.addToGroup}
        </Button>
      </div>
      <div className="border-t border-border bg-secondary/30 px-4 py-4 sm:px-5">
        {!slug ? (
          <p className="text-sm text-muted-foreground">{t.unassignedHint}</p>
        ) : !ready ? (
          <p className="text-sm text-muted-foreground">{dirty ? t.unsaved : t.needsReview}</p>
        ) : (
          <div className="space-y-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t.groupNext}</p>
            {hasAddress && (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" className="size-4 accent-indigo-700" checked={includeAddress} onChange={(e) => setIncludeAddress(e.target.checked)} />
                {t.includeAddress}
              </label>
            )}
            <div className="flex flex-wrap items-center gap-3">
              {rfpHref && (
                <Link href={rfpHref} className={buttonVariants({ variant: isRealtor ? "outline" : "default", size: "sm" })}>
                  {t.rfpCta}
                </Link>
              )}
              <span className="text-xs text-muted-foreground">{t.rfpHint}</span>
            </div>
            {isRealtor && (
              <QuotePanel
                reportId={reportId}
                slug={slug}
                tradeLabel={label}
                items={group.items}
                details={details}
                includeAddress={includeAddress}
                trusted={trusted}
                sends={sends}
                signature={signature}
                fileAvailable={fileAvailable}
                s={s}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function QuotePanel({
  reportId,
  slug,
  tradeLabel,
  items,
  details,
  includeAddress,
  trusted,
  sends,
  signature,
  fileAvailable,
  s,
}: {
  reportId: string;
  slug: string;
  tradeLabel: string;
  items: EditorItem[];
  details: ReportDetails;
  includeAddress: boolean;
  trusted: TrustedOption[];
  sends: SendSummary[];
  signature: string;
  fileAvailable: boolean;
  s: ReviewStrings;
}) {
  const t = s.review;
  const router = useRouter();
  const lang = useLang();
  const [selected, setSelected] = useState<string[]>([]);
  const [attach, setAttach] = useState(false);
  const [custom, setCustom] = useState<string | null>(null);
  const [result, setResult] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [sending, startSend] = useTransition();

  const generated = buildQuoteMessage(
    items,
    tradeLabel,
    details,
    includeAddress,
    { ...s.quote, urgency: s.urgency, page: s.page, reportType: s.reportTypeInline[details.reportType] },
    signature,
  );
  const message = custom ?? generated;
  const matching = trusted.filter((x) => x.tradeSlugs.includes(slug));
  const others = trusted.filter((x) => !x.tradeSlugs.includes(slug));
  const toggle = (id: string) =>
    setSelected((list) => (list.includes(id) ? list.filter((x) => x !== id) : list.length >= MAX_QUOTE_RECIPIENTS ? list : [...list, id]));

  function send() {
    setResult(null);
    startSend(async () => {
      const r = await sendQuoteRequestsAction({
        reportId,
        tradeSlug: slug,
        recipientIds: selected,
        message,
        includeAddress,
        attachReport: attach && fileAvailable,
        lang,
      });
      if (!r.ok) return setResult({ kind: "error", text: (t.errors as Record<string, string>)[r.error] ?? t.errors.failed });
      const parts = [plural(r.sent, t.sentResult)];
      if (r.skipped) parts.push(fmt(t.skippedResult, { n: r.skipped }));
      if (r.suppressed) parts.push(fmt(t.suppressedResult, { n: r.suppressed }));
      setResult({ kind: "ok", text: parts.join(" ") });
      setSelected([]);
      router.refresh();
    });
  }

  const row = (x: TrustedOption) => (
    <label key={x.organizationId} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted">
      <input type="checkbox" className="size-4 accent-indigo-700" checked={selected.includes(x.organizationId)} onChange={() => toggle(x.organizationId)} />
      <span className="font-medium">{x.name}</span>
      {x.city && <span className="text-xs text-muted-foreground">{x.city}</span>}
    </label>
  );

  return (
    <div className="space-y-3 rounded-xl border border-border bg-card p-4">
      <div>
        <h4 className="font-semibold">{t.quoteTitle}</h4>
        <p className="mt-0.5 text-xs text-muted-foreground">{t.quoteIntro}</p>
      </div>
      {trusted.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {t.noTrusted}{" "}
          <Link href="/directory" className="font-medium text-teal-700 hover:underline">
            {t.addTrusted}
          </Link>
        </p>
      ) : (
        <>
          {matching.length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground">{fmt(t.matching, { trade: tradeLabel })}</p>
              <div className="mt-1">{matching.map(row)}</div>
            </div>
          )}
          {others.length > 0 && (
            <details open={matching.length === 0}>
              <summary className="cursor-pointer text-xs font-medium text-muted-foreground">{t.others}</summary>
              <div className="mt-1">{others.map(row)}</div>
            </details>
          )}
          <p className="text-xs text-muted-foreground">{fmt(t.recipientsMax, { n: MAX_QUOTE_RECIPIENTS })}</p>
          {fileAvailable ? (
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-0.5 size-4 accent-indigo-700" checked={attach} onChange={(e) => setAttach(e.target.checked)} />
              {t.attachReport}
            </label>
          ) : (
            <p className="text-xs text-muted-foreground">{t.attachUnavailable}</p>
          )}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor={`msg-${slug}`}>{t.messageLabel}</Label>
              {custom !== null && (
                <button type="button" className="text-xs font-medium text-teal-700 hover:underline" onClick={() => setCustom(null)}>
                  {t.resetMessage}
                </button>
              )}
            </div>
            <Textarea id={`msg-${slug}`} rows={9} maxLength={4000} value={message} onChange={(e) => setCustom(e.target.value)} />
            <p className="text-xs text-muted-foreground">{t.messageHint}</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" onClick={send} disabled={sending || selected.length === 0 || !message.trim()}>
              {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
              {sending ? t.sending : t.send}
            </Button>
            {result && (
              <span className={`text-sm ${result.kind === "error" ? "font-medium text-destructive" : "text-teal-800"}`} role={result.kind === "error" ? "alert" : "status"}>
                {result.text}
              </span>
            )}
          </div>
        </>
      )}
      {sends.length > 0 && (
        <div className="border-t border-border pt-3">
          <p className="text-xs font-semibold text-muted-foreground">{t.history}</p>
          <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
            {sends.map((x, i) => (
              <li key={`${x.date}-${i}`}>
                {fmt(t.historyLine, { date: x.date, n: x.count })}
                {x.attached ? ` · ${t.historyAttached}` : ""}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
