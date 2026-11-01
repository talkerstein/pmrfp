"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, CalendarRange, ExternalLink, FileUp, List, Pencil, Plus, RefreshCw, Sparkles, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import Link from "@/i18n/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  addStartersAction,
  deleteContractAction,
  importContractsAction,
  renewContractAction,
  saveContractAction,
  type ImportState,
  type SaveState,
} from "@/lib/contracts/actions";
import type { ContractCountry, ContractStatus, StarterKey } from "@/lib/contracts/rules";
import { useLang, useT } from "@/i18n/provider";
import { fmt, formatDate, formatNumber, plural } from "@/i18n/format";

export interface CalendarRfp {
  id: string;
  title: string;
  status: string;
}

export interface CalendarRow {
  id: string;
  building: string | null;
  address: string | null;
  tradeSlug: string | null;
  /** The trade's name in the viewer's language, else the PM's description. */
  service: string;
  detail: string | null;
  vendorName: string | null;
  vendorEmail: string | null;
  /** The vendor's own PMRFP company (matched by email); slug only when its profile is public. */
  linked: { name: string; slug: string | null } | null;
  /** The dates the PM typed. */
  startDate: string | null;
  endDate: string | null;
  /** The term running today (an auto-renewing contract rolls forward). */
  termStart: string | null;
  termEnd: string | null;
  rolled: boolean;
  annualValue: number | null;
  currency: "CAD" | "USD";
  noticeDays: number;
  autoRenews: boolean;
  notes: string | null;
  sourceRfp: CalendarRfp | null;
  retenderRfp: CalendarRfp | null;
  hasFile: boolean;
  fileName: string | null;
  status: ContractStatus;
  days: number | null;
  windowOpens: string | null;
  nextTerm: { start: string; end: string } | null;
}

const CHIP: Record<ContractStatus, string> = {
  active: "bg-teal-50 text-teal-800 border-teal-200",
  window: "bg-sky-50 text-sky-800 border-sky-200",
  ending: "bg-amber-50 text-amber-800 border-amber-200",
  expired: "bg-red-50 text-red-700 border-red-200",
  no_dates: "bg-slate-100 text-slate-700 border-slate-200",
};

const NEEDS_ACTION: ContractStatus[] = ["window", "ending", "expired", "no_dates"];
const selectClass = "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm";
const linkButton = "inline-flex h-8 items-center gap-1 rounded-lg border border-border px-3 text-[0.8rem] hover:bg-muted";

/**
 * The renewal calendar: list or 12-month timeline, add/edit form, seasonal
 * starters, CSV import, and the per-row actions (re-tender on PMRFP,
 * upload/view the contract, next term, edit, delete). Mutations are server
 * actions (lib/contracts/actions) or the upload route; the page re-renders
 * from the server after each one.
 */
export function RenewalCalendar({
  rows,
  country,
  trades,
  rfps,
  starters,
  timeline,
  today,
}: {
  rows: CalendarRow[];
  country: ContractCountry;
  trades: { slug: string; name: string }[];
  rfps: CalendarRfp[];
  starters: StarterKey[];
  timeline: { from: string; to: string; months: string[] };
  today: string;
}) {
  const t = useT("contractsClient");
  const attention = rows.filter((r) => NEEDS_ACTION.includes(r.status));
  const [filter, setFilter] = useState<"all" | "attention">(attention.length ? "attention" : "all");
  const [view, setView] = useState<"list" | "timeline">("list");
  const [editing, setEditing] = useState<CalendarRow | "new" | null>(null);
  const shown = filter === "attention" && attention.length ? attention : rows;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <div className="flex gap-1 rounded-lg border border-border bg-card p-1 text-sm" role="tablist">
            {(["list", "timeline"] as const).map((v) => (
              <button
                key={v}
                type="button"
                role="tab"
                aria-selected={view === v}
                onClick={() => setView(v)}
                className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium ${view === v ? "bg-indigo text-white" : "text-muted-foreground hover:text-foreground"}`}
              >
                {v === "list" ? <List className="size-3.5" /> : <CalendarRange className="size-3.5" />} {t.view[v]}
              </button>
            ))}
          </div>
          {view === "list" && rows.length > 0 && (
            <div className="flex gap-1 rounded-lg border border-border bg-card p-1 text-sm" role="tablist">
              {(["attention", "all"] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  role="tab"
                  aria-selected={filter === f}
                  onClick={() => setFilter(f)}
                  className={`rounded-md px-3 py-1.5 font-medium ${filter === f ? "bg-indigo text-white" : "text-muted-foreground hover:text-foreground"}`}
                >
                  {fmt(t.filter[f], { n: f === "all" ? rows.length : attention.length })}
                </button>
              ))}
            </div>
          )}
        </div>
        <Button type="button" onClick={() => setEditing("new")}>
          <Plus className="size-4" /> {t.form.add}
        </Button>
      </div>

      {editing && (
        <ContractForm
          key={editing === "new" ? "new" : editing.id}
          row={editing === "new" ? null : editing}
          country={country}
          trades={trades}
          rfps={rfps}
          onDone={() => setEditing(null)}
        />
      )}

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-card/50 px-6 py-10 text-center">
          <h3 className="text-base font-semibold">{t.empty.title}</h3>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">{t.empty.body}</p>
        </div>
      ) : view === "timeline" ? (
        <Timeline rows={rows} timeline={timeline} today={today} />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full min-w-[920px] text-left text-sm">
            <thead className="border-b border-border bg-secondary/40 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">{t.cols.service}</th>
                <th className="px-4 py-3 font-medium">{t.cols.vendor}</th>
                <th className="px-4 py-3 font-medium">{t.cols.term}</th>
                <th className="px-4 py-3 font-medium">{t.cols.value}</th>
                <th className="px-4 py-3 font-medium">{t.cols.status}</th>
                <th className="px-4 py-3 font-medium">{t.cols.actions}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {shown.map((r) => (
                <ContractRowView key={r.id} row={r} country={country} onEdit={() => setEditing(r)} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {starters.length > 0 && rows.length === 0 && <StartersPanel starters={starters} />}
      <ImportPanel />
    </div>
  );
}

function daysText(t: ReturnType<typeof useT<"contractsClient">>, days: number | null): string | null {
  if (days == null) return null;
  if (days === 0) return t.days.today;
  return days > 0 ? plural(days, t.days.left) : plural(-days, t.days.ago);
}

function ContractRowView({ row, country, onEdit }: { row: CalendarRow; country: ContractCountry; onEdit: () => void }) {
  const t = useT("contractsClient");
  const lang = useLang();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const remove = () => {
    if (!window.confirm(fmt(t.actions.confirmDelete, { service: row.service }))) return;
    start(async () => {
      const res = await deleteContractAction(row.id);
      if (res.error) toast.error(t.errors[res.error]);
      else toast.success(t.actions.deleted);
    });
  };

  const renew = () => {
    if (!row.nextTerm) return;
    const ask = fmt(t.actions.confirmRenew, { service: row.service, start: formatDate(row.nextTerm.start, lang), end: formatDate(row.nextTerm.end, lang) });
    if (!window.confirm(ask)) return;
    start(async () => {
      const res = await renewContractAction(row.id);
      if (res.error) toast.error(t.errors[res.error]);
      else toast.success(t.actions.renewed);
    });
  };

  const upload = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    try {
      const body = new FormData();
      body.set("id", row.id);
      body.set("file", file);
      const res = await fetch("/api/contracts/upload", { method: "POST", body });
      const json = (await res.json().catch(() => ({}))) as { error?: keyof typeof t.errors };
      if (!res.ok) toast.error(t.errors[json.error ?? "upload"] ?? t.errors.upload);
      else {
        toast.success(t.actions.uploaded);
        router.refresh();
      }
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const urgent = row.status === "window" || row.status === "ending" || row.status === "expired";
  const value =
    row.annualValue == null ? "—" : formatNumber(row.annualValue, lang, { style: "currency", currency: row.currency, maximumFractionDigits: 0 });

  return (
    <tr className="align-top">
      <td className="px-4 py-3">
        <div className="font-medium">{row.service}</div>
        {row.detail && row.detail !== row.service && <div className="text-xs text-muted-foreground">{row.detail}</div>}
        <div className="mt-0.5 text-xs text-muted-foreground">{row.building ?? t.noBuilding}</div>
        {row.sourceRfp && (
          <Link href={`/pm-dashboard/rfps/${row.sourceRfp.id}/interests`} className="mt-1 block text-xs text-primary hover:underline">
            {fmt(t.actions.fromRfp, { title: row.sourceRfp.title })}
          </Link>
        )}
      </td>
      <td className="px-4 py-3">
        <div>{row.vendorName ?? "—"}</div>
        {row.vendorEmail && <div className="text-xs text-muted-foreground">{row.vendorEmail}</div>}
        {row.linked && (
          <div className="mt-1 text-xs">
            {row.linked.slug ? (
              <Link href={`/directory/${row.linked.slug}`} className="rounded-full bg-indigo px-2 py-0.5 font-medium text-white hover:opacity-90">
                {t.linked}
              </Link>
            ) : (
              <span className="rounded-full bg-indigo px-2 py-0.5 font-medium text-white">{t.linked}</span>
            )}
          </div>
        )}
      </td>
      <td className="px-4 py-3 whitespace-nowrap">
        <div>
          {row.termStart ? formatDate(row.termStart, lang) : "—"} → {row.termEnd ? formatDate(row.termEnd, lang) : "—"}
        </div>
        {row.autoRenews && <div className="text-xs text-muted-foreground">{t.autoRenews}</div>}
        {row.rolled && row.termEnd && <div className="max-w-56 whitespace-normal text-xs text-muted-foreground">{fmt(t.autoRenewed, { date: formatDate(row.termEnd, lang) })}</div>}
        {row.status === "active" && row.windowOpens && <div className="text-xs text-muted-foreground">{fmt(t.windowOpens, { date: formatDate(row.windowOpens, lang) })}</div>}
      </td>
      <td className="px-4 py-3 whitespace-nowrap">{value}</td>
      <td className="px-4 py-3">
        <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium ${CHIP[row.status]}`}>{t.status[row.status]}</span>
        {daysText(t, row.days) && <div className="mt-1 text-xs text-muted-foreground">{daysText(t, row.days)}</div>}
        <div className="mt-0.5 text-xs text-muted-foreground">{plural(row.noticeDays, t.noticeDays)}</div>
      </td>
      <td className="px-4 py-3">
        <div className="flex flex-wrap gap-1.5">
          {row.retenderRfp ? (
            <>
              <Link href={`/pm-dashboard/rfps/${row.retenderRfp.id}/interests`} className={`${linkButton} max-w-64 border-teal-300 bg-teal-50 text-teal-900`}>
                <span className="truncate">{fmt(t.actions.retendered[country], { title: row.retenderRfp.title })}</span>
                <span className="shrink-0 text-teal-700">· {t.rfpStatus[row.retenderRfp.status as keyof typeof t.rfpStatus] ?? row.retenderRfp.status}</span>
              </Link>
              <Link href={`/pm-dashboard/rfps/new?contract=${row.id}`} className={buttonVariants({ size: "sm", variant: "outline" })}>
                <CalendarClock className="size-3.5" /> {t.actions.retenderAgain[country]}
              </Link>
            </>
          ) : (
            <Link href={`/pm-dashboard/rfps/new?contract=${row.id}`} className={buttonVariants({ size: "sm", variant: urgent ? "default" : "outline" })}>
              <CalendarClock className="size-3.5" /> {t.actions.retender[country]}
            </Link>
          )}
          {row.hasFile && (
            <a href={`/api/contracts/file?id=${row.id}`} target="_blank" rel="noopener" className={linkButton} title={row.fileName ?? undefined}>
              <ExternalLink className="size-3.5" /> {t.actions.viewFile}
            </a>
          )}
          <Button type="button" size="sm" variant="outline" disabled={uploading} onClick={() => fileRef.current?.click()}>
            <Upload className="size-3.5" /> {uploading ? t.actions.uploading : t.actions.upload}
          </Button>
          <input ref={fileRef} type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => upload(e.target.files?.[0])} />
          {row.nextTerm && (
            <Button type="button" size="icon-sm" variant="ghost" disabled={pending} onClick={renew} aria-label={t.actions.renew} title={t.actions.renewTitle}>
              <RefreshCw className="size-3.5" />
            </Button>
          )}
          <Button type="button" size="icon-sm" variant="ghost" onClick={onEdit} aria-label={t.actions.edit} title={t.actions.edit}>
            <Pencil className="size-3.5" />
          </Button>
          <Button type="button" size="icon-sm" variant="ghost" disabled={pending} onClick={remove} aria-label={t.actions.delete} title={t.actions.delete}>
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      </td>
    </tr>
  );
}

/** The next 12 months: each contract's renewal window (shaded) up to its end date, with today marked. */
function Timeline({ rows, timeline, today }: { rows: CalendarRow[]; timeline: { from: string; to: string; months: string[] }; today: string }) {
  const t = useT("contractsClient");
  const lang = useLang();
  const span = dayDiff(timeline.from, timeline.to);
  const pos = (day: string) => Math.min(100, Math.max(0, (dayDiff(timeline.from, day) / span) * 100));
  const inRange = rows
    .filter((r) => r.termEnd && r.termEnd >= timeline.from && r.termEnd < timeline.to)
    .sort((a, b) => (a.termEnd! < b.termEnd! ? -1 : 1));
  const undated = rows.filter((r) => !r.termEnd).length;

  return (
    <div className="space-y-2 rounded-lg border border-border bg-card p-4">
      <div className="overflow-x-auto">
        <div className="min-w-[760px]">
          <div className="flex text-xs text-muted-foreground">
            <div className="w-56 shrink-0" />
            <div className="relative flex flex-1">
              {timeline.months.map((m) => (
                <div key={m} className="flex-1 border-l border-border pl-1">
                  {formatDate(m, lang, { month: "short" })}
                  {m.endsWith("-01-01") || m === timeline.months[0] ? ` ${m.slice(0, 4)}` : ""}
                </div>
              ))}
            </div>
          </div>
          {inRange.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">{t.timeline.none}</p>
          ) : (
            <ul className="mt-2 space-y-1.5">
              {inRange.map((r) => {
                const end = pos(r.termEnd!);
                const open = pos(r.windowOpens ?? r.termEnd!);
                return (
                  <li key={r.id} className="flex items-center">
                    <div className="w-56 shrink-0 truncate pr-3 text-sm">
                      <span className="font-medium">{r.service}</span>
                      <span className="text-muted-foreground"> · {r.building ?? t.noBuilding}</span>
                    </div>
                    <div className="relative h-7 flex-1 rounded bg-secondary/40">
                      <div
                        className={`absolute inset-y-1 rounded ${r.status === "expired" ? "bg-red-200" : r.status === "ending" ? "bg-amber-200" : "bg-sky-200"}`}
                        style={{ left: `${open}%`, width: `${Math.max(0.6, end - open)}%` }}
                        title={`${t.timeline.window}: ${formatDate(r.windowOpens ?? r.termEnd!, lang)} → ${formatDate(r.termEnd!, lang)}`}
                      />
                      <div
                        className="absolute inset-y-0 w-1 -translate-x-1/2 rounded bg-indigo"
                        style={{ left: `${end}%` }}
                        title={`${t.timeline.end}: ${formatDate(r.termEnd!, lang)}`}
                      />
                      <div className="absolute inset-y-0 w-px bg-red-500/70" style={{ left: `${pos(today)}%` }} aria-hidden />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-4 pt-1 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-5 rounded bg-sky-200" /> {t.timeline.window}</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-3 w-1 rounded bg-indigo" /> {t.timeline.end}</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-3 w-px bg-red-500/70" /> {t.timeline.today}</span>
        {undated > 0 && <span>{plural(undated, t.timeline.noDates)}</span>}
      </div>
    </div>
  );
}

function dayDiff(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) || 1;
}

function ContractForm({
  row,
  country,
  trades,
  rfps,
  onDone,
}: {
  row: CalendarRow | null;
  country: ContractCountry;
  trades: { slug: string; name: string }[];
  rfps: CalendarRfp[];
  onDone: () => void;
}) {
  const t = useT("contractsClient");
  const [state, action, pending] = useActionState<SaveState, FormData>(saveContractAction, {});
  const handled = useRef<number | undefined>(undefined);
  useEffect(() => {
    // Once per save (the parent re-renders while this one closes).
    if (!state.ok || handled.current === state.savedAt) return;
    handled.current = state.savedAt;
    toast.success(t.form.saved);
    onDone();
  }, [state.ok, state.savedAt, onDone, t.form.saved]);
  const f = t.form;
  const currency = country === "US" ? "USD" : "CAD";
  const sourceOptions = row?.sourceRfp && !rfps.some((r) => r.id === row.sourceRfp!.id) ? [row.sourceRfp, ...rfps] : rfps;
  return (
    <form action={action} className="grid gap-4 rounded-lg border border-border bg-card p-5 sm:grid-cols-2 lg:grid-cols-4">
      <h2 className="text-base font-semibold sm:col-span-2 lg:col-span-4">{row ? f.edit : f.add}</h2>
      {row && <input type="hidden" name="id" value={row.id} />}
      <Field label={f.building} className="sm:col-span-2">
        <Input name="building_name" maxLength={160} placeholder={f.buildingPlaceholder} defaultValue={row?.building ?? ""} />
      </Field>
      <Field label={f.address} className="sm:col-span-2">
        <Input name="building_address" maxLength={240} defaultValue={row?.address ?? ""} />
      </Field>
      <Field label={f.trade}>
        <select name="trade_slug" className={selectClass} defaultValue={row?.tradeSlug ?? ""}>
          <option value="">{f.tradeNone}</option>
          {trades.map((tr) => (
            <option key={tr.slug} value={tr.slug}>
              {tr.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label={f.detail} hint={f.detailHint}>
        <Input name="service_detail" maxLength={160} defaultValue={row?.detail ?? ""} />
      </Field>
      <Field label={f.vendor}>
        <Input name="vendor_name" maxLength={160} defaultValue={row?.vendorName ?? ""} />
      </Field>
      <Field label={f.vendorEmail} hint={f.vendorEmailHint}>
        <Input name="vendor_email" type="email" maxLength={254} defaultValue={row?.vendorEmail ?? ""} />
      </Field>
      <Field label={f.start}>
        <Input name="start_date" type="date" defaultValue={row?.startDate ?? ""} />
      </Field>
      <Field label={f.end}>
        <Input name="end_date" type="date" defaultValue={row?.endDate ?? ""} />
      </Field>
      <Field label={fmt(f.value, { currency })} hint={f.valueHint}>
        <Input name="annual_value" inputMode="decimal" defaultValue={row?.annualValue ?? ""} />
      </Field>
      <Field label={f.notice} hint={f.noticeHint}>
        <Input name="notice_days" type="number" min={0} max={365} defaultValue={row?.noticeDays ?? 60} />
      </Field>
      <Field label={f.notes} hint={f.notesHint} className="sm:col-span-2 lg:col-span-4">
        <Textarea name="notes" rows={3} maxLength={2000} defaultValue={row?.notes ?? ""} />
      </Field>
      {sourceOptions.length > 0 && (
        <Field label={f.sourceRfp} className="sm:col-span-2">
          <select name="source_rfp_id" className={selectClass} defaultValue={row?.sourceRfp?.id ?? ""}>
            <option value="">{f.sourceNone}</option>
            {sourceOptions.map((r) => (
              <option key={r.id} value={r.id}>
                {r.title}
              </option>
            ))}
          </select>
        </Field>
      )}
      <label className="flex items-start gap-2 text-sm sm:col-span-2 lg:col-span-4">
        <input type="checkbox" name="auto_renews" defaultChecked={row?.autoRenews ?? false} className="mt-0.5 size-4" />
        <span>{f.autoRenews}</span>
      </label>
      {state.error && <p className="text-sm font-medium text-destructive sm:col-span-2 lg:col-span-4">{t.errors[state.error]}</p>}
      <div className="flex gap-2 sm:col-span-2 lg:col-span-4">
        <Button type="submit" disabled={pending}>{pending ? f.saving : f.save}</Button>
        <Button type="button" variant="outline" onClick={onDone}>{f.cancel}</Button>
      </div>
    </form>
  );
}

function Field({ label, hint, className, children }: { label: string; hint?: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={`space-y-1.5 ${className ?? ""}`}>
      <Label>
        <span className="text-sm font-medium">{label}</span>
      </Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** One-click starter rows for a company with no contracts: trade and notice days only, no dates, no prices. */
function StartersPanel({ starters }: { starters: StarterKey[] }) {
  const t = useT("contractsClient");
  const lang = useLang();
  const [pending, start] = useTransition();
  const add = (keys: StarterKey[]) =>
    start(async () => {
      const res = await addStartersAction(keys, lang);
      if (res.error) toast.error(t.errors[res.error]);
      else if (res.added) toast.success(plural(res.added, t.starters.added));
    });
  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <Sparkles className="mt-0.5 size-4 text-teal-700" />
          <div>
            <h2 className="font-semibold">{t.starters.title}</h2>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{t.starters.body}</p>
          </div>
        </div>
        <Button type="button" disabled={pending} onClick={() => add(starters)}>
          {pending ? t.starters.adding : t.starters.addAll}
        </Button>
      </div>
      <ul className="mt-4 grid gap-3 sm:grid-cols-2">
        {starters.map((k) => (
          <li key={k} className="flex items-start justify-between gap-3 rounded-md border border-border p-3">
            <div>
              <div className="text-sm font-medium">{t.starters.items[k].detail}</div>
              <p className="mt-0.5 text-xs text-muted-foreground">{t.starters.items[k].hint}</p>
            </div>
            <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => add([k])}>
              <Plus className="size-3.5" /> {t.starters.add}
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ImportPanel() {
  const t = useT("contractsClient").import;
  const errors = useT("contractsClient").errors;
  const [state, action, pending] = useActionState<ImportState, FormData>(importContractsAction, {});
  return (
    <details className="rounded-lg border border-border bg-card p-5" open={Boolean(state.error)}>
      <summary className="flex cursor-pointer list-none items-center gap-2 font-medium">
        <FileUp className="size-4 text-teal-700" /> {t.title}
      </summary>
      <form action={action} className="mt-4 space-y-3">
        <p className="text-sm text-muted-foreground">{t.body}</p>
        <div className="space-y-1.5">
          <Label><span className="text-sm font-medium">{t.file}</span></Label>
          <Input name="file" type="file" accept=".csv,text/csv,text/plain" />
        </div>
        <div className="space-y-1.5">
          <Label><span className="text-sm font-medium">{t.paste}</span></Label>
          <Textarea
            name="csv"
            rows={4}
            placeholder={"Building,Service,Vendor,Vendor email,Start,End,Annual value,Notice days,Auto-renews,Notes\nMaple Court,Snow removal,Northline Grounds,office@example.com,2026-11-01,2027-04-30,,90,no,Lot and walkways"}
          />
        </div>
        <Button type="submit" disabled={pending}>{pending ? t.submitting : t.submit}</Button>
        {state.ok && <p className="text-sm font-medium text-teal-800">{plural(state.added ?? 0, t.done)}</p>}
        {state.error && <p className="text-sm font-medium text-destructive">{errors[state.error]}</p>}
        {!!state.skipped?.length && <p className="text-sm text-muted-foreground">{fmt(t.skipped, { lines: state.skipped.slice(0, 30).join(", ") })}</p>}
        {state.truncated && <p className="text-sm text-muted-foreground">{t.truncated}</p>}
      </form>
    </details>
  );
}
