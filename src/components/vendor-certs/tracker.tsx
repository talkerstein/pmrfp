"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, FileUp, Mail, Pencil, Plus, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  deleteCertificateAction,
  importCertificatesAction,
  requestCertificateAction,
  saveCertificateAction,
  type ImportState,
  type SaveState,
} from "@/lib/vendor-certs/actions";
import type { CertCountry, CertStatus, CertType } from "@/lib/vendor-certs/rules";
import { useLang, useT } from "@/i18n/provider";
import { fmt, formatDate, formatNumber, plural } from "@/i18n/format";

export interface TrackerRow {
  id: string;
  vendorName: string;
  contactEmail: string | null;
  trade: string | null;
  certType: CertType;
  insurer: string | null;
  policyNumber: string | null;
  coverage: number | null;
  expiresOn: string | null;
  notes: string | null;
  remindVendor: boolean;
  hasFile: boolean;
  fileName: string | null;
  uploadedBy: "pm" | "vendor" | null;
  requestSentAt: string | null;
  status: CertStatus;
  days: number | null;
  /** The vendor's own PMRFP company, and what its profile says about cover. */
  linked: { name: string; slug: string | null; profileStatus: string | null } | null;
}

const CHIP: Record<CertStatus, string> = {
  valid: "bg-teal-50 text-teal-800 border-teal-200",
  expiring: "bg-amber-50 text-amber-800 border-amber-200",
  expired: "bg-red-50 text-red-700 border-red-200",
  missing: "bg-slate-100 text-slate-700 border-slate-200",
};

const selectClass = "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm";

/**
 * The tracker: filter, table, add/edit form, CSV import, and the per-row
 * actions (request certificate, upload, view, edit, delete). Mutations are
 * server actions (lib/vendor-certs/actions) or the upload route; the page
 * re-renders from the server after each one.
 */
export function VendorCertTracker({ rows, country, types }: { rows: TrackerRow[]; country: CertCountry; types: CertType[] }) {
  const t = useT("certsClient");
  const [filter, setFilter] = useState<"all" | "attention">(rows.some((r) => r.status !== "valid") ? "attention" : "all");
  const [editing, setEditing] = useState<TrackerRow | "new" | null>(null);
  const attention = rows.filter((r) => r.status !== "valid");
  const shown = filter === "attention" && attention.length ? attention : rows;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
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
        <Button type="button" onClick={() => setEditing("new")}>
          <Plus className="size-4" /> {t.form.add}
        </Button>
      </div>

      {editing && <VendorForm key={editing === "new" ? "new" : editing.id} row={editing === "new" ? null : editing} country={country} types={types} onDone={() => setEditing(null)} />}

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-card/50 px-6 py-12 text-center">
          <h3 className="text-base font-semibold">{t.empty.title}</h3>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">{t.empty.body}</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead className="border-b border-border bg-secondary/40 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">{t.cols.vendor}</th>
                <th className="px-4 py-3 font-medium">{t.cols.type}</th>
                <th className="px-4 py-3 font-medium">{t.cols.insurer}</th>
                <th className="px-4 py-3 font-medium">{t.cols.coverage}</th>
                <th className="px-4 py-3 font-medium">{t.cols.expiry}</th>
                <th className="px-4 py-3 font-medium">{t.cols.status}</th>
                <th className="px-4 py-3 font-medium">{t.cols.actions}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {shown.map((r) => (
                <TrackerRowView key={r.id} row={r} country={country} onEdit={() => setEditing(r)} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ImportPanel />
    </div>
  );
}

function TrackerRowView({ row, country, onEdit }: { row: TrackerRow; country: CertCountry; onEdit: () => void }) {
  const t = useT("certsClient");
  const lang = useLang();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const request = () =>
    start(async () => {
      const res = await requestCertificateAction(row.id, lang);
      if (res.error) toast.error(t.errors[res.error]);
      else if (res.result === "sent") toast.success(t.requestResult.sent);
      else if (res.result) toast.error(t.requestResult[res.result]);
    });

  const remove = () => {
    if (!window.confirm(fmt(t.actions.confirmDelete, { vendor: row.vendorName }))) return;
    start(async () => {
      const res = await deleteCertificateAction(row.id);
      if (res.error) toast.error(t.errors[res.error]);
      else toast.success(t.actions.deleted);
    });
  };

  const upload = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    try {
      const body = new FormData();
      body.set("id", row.id);
      body.set("file", file);
      const res = await fetch("/api/vendor-certs/upload", { method: "POST", body });
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

  const daysText =
    row.days == null ? null : row.days === 0 ? t.days.today : row.days > 0 ? plural(row.days, t.days.left) : plural(-row.days, t.days.ago);

  return (
    <tr className="align-top">
      <td className="px-4 py-3">
        <div className="font-medium">{row.vendorName}</div>
        <div className="mt-0.5 text-xs text-muted-foreground">{[row.trade, row.contactEmail].filter(Boolean).join(" · ")}</div>
        {row.linked && (
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
            <span className="rounded-full bg-indigo px-2 py-0.5 font-medium text-white">{t.linked}</span>
            {row.linked.profileStatus && <span className="text-muted-foreground">{fmt(t.profileSays, { status: row.linked.profileStatus })}</span>}
          </div>
        )}
      </td>
      <td className="px-4 py-3">{t.types[country][row.certType]}</td>
      <td className="px-4 py-3">
        <div>{row.insurer ?? "—"}</div>
        {row.policyNumber && <div className="text-xs text-muted-foreground">{row.policyNumber}</div>}
      </td>
      <td className="px-4 py-3 whitespace-nowrap">
        {row.coverage == null ? "—" : formatNumber(row.coverage, lang, { style: "currency", currency: country === "US" ? "USD" : "CAD", maximumFractionDigits: 0 })}
      </td>
      <td className="px-4 py-3 whitespace-nowrap">
        <div>{row.expiresOn ? formatDate(row.expiresOn, lang) : "—"}</div>
        {daysText && <div className="text-xs text-muted-foreground">{daysText}</div>}
      </td>
      <td className="px-4 py-3">
        <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium ${CHIP[row.status]}`}>{t.status[row.status]}</span>
        {row.hasFile && row.uploadedBy === "vendor" && <div className="mt-1 text-xs text-muted-foreground">{t.actions.byVendor}</div>}
        {row.requestSentAt && <div className="mt-1 text-xs text-muted-foreground">{fmt(t.actions.requestedOn, { date: formatDate(row.requestSentAt, lang, { month: "short", day: "numeric" }) })}</div>}
      </td>
      <td className="px-4 py-3">
        <div className="flex flex-wrap gap-1.5">
          <Button type="button" size="sm" variant={row.status === "valid" ? "outline" : "default"} disabled={pending || !row.contactEmail} onClick={request} title={row.contactEmail ? undefined : t.requestResult.no_email}>
            <Mail className="size-3.5" /> {pending ? t.actions.sending : row.requestSentAt ? t.actions.requestAgain : t.actions.request}
          </Button>
          {row.hasFile && (
            <a href={`/api/vendor-certs/file?id=${row.id}`} target="_blank" rel="noopener" className="inline-flex h-8 items-center gap-1 rounded-lg border border-border px-3 text-[0.8rem] hover:bg-muted" title={row.fileName ?? undefined}>
              <ExternalLink className="size-3.5" /> {t.actions.view}
            </a>
          )}
          <Button type="button" size="sm" variant="outline" disabled={uploading} onClick={() => fileRef.current?.click()}>
            <Upload className="size-3.5" /> {uploading ? t.actions.uploading : t.actions.upload}
          </Button>
          <input ref={fileRef} type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => upload(e.target.files?.[0])} />
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

function VendorForm({ row, country, types, onDone }: { row: TrackerRow | null; country: CertCountry; types: CertType[]; onDone: () => void }) {
  const t = useT("certsClient");
  const [state, action, pending] = useActionState<SaveState, FormData>(saveCertificateAction, {});
  const handled = useRef<number | undefined>(undefined);
  useEffect(() => {
    // Once per save (the parent re-renders while this one closes).
    if (!state.ok || handled.current === state.savedAt) return;
    handled.current = state.savedAt;
    toast.success(t.form.saved);
    onDone();
  }, [state.ok, state.savedAt, onDone, t.form.saved]);
  const f = t.form;
  return (
    <form action={action} className="grid gap-4 rounded-lg border border-border bg-card p-5 sm:grid-cols-2 lg:grid-cols-4">
      <h2 className="text-base font-semibold sm:col-span-2 lg:col-span-4">{row ? f.edit : f.add}</h2>
      {row && <input type="hidden" name="id" value={row.id} />}
      <Field label={f.vendor} className="sm:col-span-2">
        <Input name="vendor_name" required maxLength={160} defaultValue={row?.vendorName ?? ""} />
      </Field>
      <Field label={f.email} hint={f.emailHint} className="sm:col-span-2">
        <Input name="contact_email" type="email" maxLength={254} defaultValue={row?.contactEmail ?? ""} />
      </Field>
      <Field label={f.trade}>
        <Input name="trade" maxLength={80} placeholder={f.tradePlaceholder} defaultValue={row?.trade ?? ""} />
      </Field>
      <Field label={f.type}>
        <select name="cert_type" className={selectClass} defaultValue={row?.certType ?? types[0]}>
          {types.map((ty) => (
            <option key={ty} value={ty}>
              {t.types[country][ty]}
            </option>
          ))}
        </select>
      </Field>
      <Field label={f.insurer}>
        <Input name="insurer" maxLength={120} defaultValue={row?.insurer ?? ""} />
      </Field>
      <Field label={f.policy}>
        <Input name="policy_number" maxLength={80} defaultValue={row?.policyNumber ?? ""} />
      </Field>
      <Field label={f.coverage}>
        <Input name="coverage_amount" inputMode="numeric" placeholder="2000000" defaultValue={row?.coverage ?? ""} />
      </Field>
      <Field label={f.expiry}>
        <Input name="expires_on" type="date" defaultValue={row?.expiresOn ?? ""} />
      </Field>
      <Field label={f.notes} className="sm:col-span-2">
        <Input name="notes" maxLength={500} defaultValue={row?.notes ?? ""} />
      </Field>
      <label className="flex items-start gap-2 text-sm sm:col-span-2 lg:col-span-4">
        <input type="checkbox" name="remind_vendor" defaultChecked={row?.remindVendor ?? false} className="mt-0.5 size-4" />
        <span>{f.remindVendor}</span>
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

function ImportPanel() {
  const t = useT("certsClient").import;
  const errors = useT("certsClient").errors;
  const [state, action, pending] = useActionState<ImportState, FormData>(importCertificatesAction, {});
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
          <Textarea name="csv" rows={4} placeholder={"Vendor,Email,Trade,Type,Insurer,Policy,Coverage,Expiry\nAcme HVAC,office@acmehvac.ca,HVAC,CGL,Intact,P-123,2000000,2027-03-31"} />
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
