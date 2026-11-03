"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Award, Copy, ExternalLink, FileUp, Link2, Pencil, Plus, Trash2, Users, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useLang } from "@/i18n/provider";
import { localizePath } from "@/i18n/config";
import { fmt, formatDate } from "@/i18n/format";
import type { Messages } from "@/i18n/dictionaries";
import {
  awardBidAction,
  createComparisonAction,
  deleteBidAction,
  deleteComparisonAction,
  importResponsesAction,
  inviteBiddersAction,
  saveBidAction,
  saveComparisonAction,
  saveRecommendationAction,
  saveScopeItemsAction,
  searchBidderOrgsAction,
  shareLinkAction,
  type BidErrorKey,
  type CreateState,
  type SaveState,
} from "@/lib/bid-compare/actions";
import { MAX_BIDS, newItemId, type BidCountry, type SheetItem } from "@/lib/bid-compare/rules";
import type { GridBid, SheetView } from "@/lib/bid-compare/view";
import type { OrgHit } from "@/lib/bid-compare/server";
import { SheetGrid, type SheetCopy } from "./sheet-grid";

/**
 * The Bid Comparison Sheet's interactive parts. Copy comes in as props from
 * the server page (bidCompare messages), so no client namespace is needed.
 * Mutations are server actions (lib/bid-compare/actions) or the upload
 * route; the page re-renders from the server after each one.
 */

type Copy = Messages["bidCompare"];
type Errors = SheetCopy["errors"];
type Rfp = { id: string; title: string };

const LIST = "/pm-dashboard/bid-comparisons";
const selectClass = "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm";

function errorText(errors: Errors, key: BidErrorKey | undefined): string {
  return (key && errors[key]) || errors.unavailable;
}

/** Runs once per new action result (never on re-renders, never on mount). */
function useOnResult<S>(state: S, fn: (s: S) => void) {
  const handled = useRef(state);
  const latest = useRef(fn);
  useEffect(() => {
    latest.current = fn;
  });
  useEffect(() => {
    if (handled.current === state) return;
    handled.current = state;
    latest.current(state);
  }, [state]);
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

// ── New comparison ───────────────────────────────────────────────────

export function NewComparisonForm({ t, errors, rfps, defaultRfp }: { t: Copy["newForm"]; errors: Errors; rfps: Rfp[]; defaultRfp: string | null }) {
  const lang = useLang();
  const router = useRouter();
  const [state, action, pending] = useActionState<CreateState, FormData>(createComparisonAction, {});
  const [rfp, setRfp] = useState(defaultRfp ?? "");
  const preset = rfps.find((r) => r.id === defaultRfp);

  useOnResult(state, (s) => {
    if (s.id) router.push(localizePath(`${LIST}/${s.id}`, lang));
    else if (s.error) toast.error(errorText(errors, s.error));
  });

  return (
    <form action={action} className="grid gap-4 rounded-lg border border-border bg-card p-5 sm:grid-cols-2">
      <Field label={t.title} className="sm:col-span-2">
        <Input name="title" required maxLength={160} placeholder={t.titlePlaceholder} defaultValue={preset?.title ?? ""} />
      </Field>
      <Field label={t.building}>
        <Input name="building_name" maxLength={160} placeholder={t.buildingPlaceholder} />
      </Field>
      <Field label={t.address}>
        <Input name="building_address" maxLength={240} />
      </Field>
      <Field label={t.trade}>
        <Input name="trade" maxLength={80} placeholder={t.tradePlaceholder} />
      </Field>
      {rfps.length > 0 && (
        <Field label={t.rfp}>
          <select name="rfp_id" className={selectClass} value={rfp} onChange={(e) => setRfp(e.target.value)}>
            <option value="">{t.rfpNone}</option>
            {rfps.map((r) => (
              <option key={r.id} value={r.id}>
                {r.title}
              </option>
            ))}
          </select>
        </Field>
      )}
      {rfp && (
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input type="checkbox" name="import" defaultChecked className="size-4 accent-teal-600" /> {t.importResponses}
        </label>
      )}
      <div className="sm:col-span-2">
        <Button type="submit" disabled={pending}>
          <Plus className="size-4" /> {pending ? t.creating : t.create}
        </Button>
      </div>
    </form>
  );
}

// ── Details (title, building, trade, RFP) ────────────────────────────

export function DetailsEditor({
  comparison,
  rfps,
  t,
  form,
}: {
  comparison: { id: string; title: string; building_name: string | null; building_address: string | null; trade: string | null; rfp_id: string | null };
  rfps: Rfp[];
  t: SheetCopy;
  form: Copy["newForm"];
}) {
  const lang = useLang();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<SaveState, FormData>(saveComparisonAction, {});
  const [busy, start] = useTransition();

  useOnResult(state, (s) => {
    if (s.ok) setOpen(false);
    else if (s.error) toast.error(errorText(t.errors, s.error));
  });

  const remove = () => {
    if (!window.confirm(fmt(t.confirmDeleteComparison, { title: comparison.title }))) return;
    start(async () => {
      const res = await deleteComparisonAction(comparison.id);
      if (res.error) toast.error(errorText(t.errors, res.error));
      else router.push(localizePath(LIST, lang));
    });
  };

  return (
    <div className="print:hidden">
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={() => setOpen((v) => !v)}>
          <Pencil className="size-3.5" /> {t.editDetails}
        </Button>
        <Button variant="destructive" size="sm" onClick={remove} disabled={busy}>
          <Trash2 className="size-3.5" /> {t.deleteComparison}
        </Button>
      </div>
      {open && (
        <form action={action} className="mt-3 grid gap-4 rounded-lg border border-border bg-card p-5 sm:grid-cols-2">
          <input type="hidden" name="id" value={comparison.id} />
          <Field label={form.title} className="sm:col-span-2">
            <Input name="title" required maxLength={160} defaultValue={comparison.title} />
          </Field>
          <Field label={form.building}>
            <Input name="building_name" maxLength={160} defaultValue={comparison.building_name ?? ""} />
          </Field>
          <Field label={form.address}>
            <Input name="building_address" maxLength={240} defaultValue={comparison.building_address ?? ""} />
          </Field>
          <Field label={form.trade}>
            <Input name="trade" maxLength={80} defaultValue={comparison.trade ?? ""} />
          </Field>
          {(rfps.length > 0 || comparison.rfp_id) && (
            <Field label={form.rfp}>
              <select name="rfp_id" className={selectClass} defaultValue={comparison.rfp_id ?? ""}>
                <option value="">{form.rfpNone}</option>
                {rfps.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.title}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <div className="flex gap-2 sm:col-span-2">
            <Button type="submit" size="sm" disabled={pending}>
              {pending ? t.form.saving : t.form.save}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
              {t.form.cancel}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

// ── Pull in the RFP's responses ──────────────────────────────────────

export function ImportResponses({ comparisonId, rfpTitle, t }: { comparisonId: string; rfpTitle: string; t: SheetCopy }) {
  const [busy, start] = useTransition();
  const run = () =>
    start(async () => {
      const res = await importResponsesAction(comparisonId);
      if (res.error) toast.error(errorText(t.errors, res.error));
      else if (res.added) toast.success(fmt(res.added === 1 ? t.import.done.one : t.import.done.other, { n: res.added }));
      else toast.message(res.full ? t.import.full : t.import.none);
    });
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-teal-200 bg-teal-50/60 p-4 print:hidden">
      <div>
        <h2 className="text-sm font-semibold">{t.import.title}</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">{fmt(t.import.body, { rfp: rfpTitle })}</p>
      </div>
      <Button size="sm" variant="outline" onClick={run} disabled={busy}>
        <Users className="size-3.5" /> {busy ? t.import.busy : t.import.button}
      </Button>
    </div>
  );
}

// ── Scope items ──────────────────────────────────────────────────────

export function ScopeEditor({ comparisonId, items, t, locked }: { comparisonId: string; items: SheetItem[]; t: SheetCopy; locked: boolean }) {
  const [rows, setRows] = useState<SheetItem[]>(items);
  const [open, setOpen] = useState(items.length > 0);
  const [busy, start] = useTransition();
  // The page keys this editor on the saved items, so a save starts it fresh.
  const dirty = JSON.stringify(rows) !== JSON.stringify(items);

  const save = () =>
    start(async () => {
      const res = await saveScopeItemsAction(comparisonId, rows);
      if (res.error) toast.error(errorText(t.errors, res.error));
      else toast.success(t.scope.saved);
    });

  return (
    <section className="rounded-lg border border-border bg-card p-5 print:hidden">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">{t.scope.title}</h2>
          <p className="mt-0.5 max-w-2xl text-sm text-muted-foreground">{t.scope.body}</p>
        </div>
        {!open && !locked && (
          <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
            <Plus className="size-3.5" /> {t.scope.add}
          </Button>
        )}
      </div>
      {open && (
        <div className="mt-4 space-y-2">
          {rows.map((r, i) => (
            <div key={r.id} className="flex items-center gap-2">
              <Input
                aria-label={t.scope.placeholder}
                value={r.label}
                maxLength={120}
                placeholder={t.scope.placeholder}
                disabled={locked}
                onChange={(e) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
              />
              {!locked && (
                <Button variant="ghost" size="icon-sm" aria-label={t.scope.remove} onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}>
                  <X className="size-4" />
                </Button>
              )}
            </div>
          ))}
          {!locked && (
            <div className="flex flex-wrap gap-2 pt-1">
              <Button size="sm" variant="outline" onClick={() => setRows((rs) => (rs.length >= 30 ? rs : [...rs, { id: newItemId(), label: "" }]))}>
                <Plus className="size-3.5" /> {t.scope.add}
              </Button>
              <Button size="sm" onClick={save} disabled={busy || !dirty}>
                {busy ? t.scope.saving : t.scope.save}
              </Button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

// ── Bids: the grid, the add/edit form and each bid's buttons ─────────

export function BidsPanel({
  comparisonId,
  country,
  t,
  view,
  recommendedId,
  awardedId,
  rfpLinked,
}: {
  comparisonId: string;
  country: BidCountry;
  t: SheetCopy;
  view: SheetView;
  recommendedId: string | null;
  awardedId: string | null;
  rfpLinked: boolean;
}) {
  const lang = useLang();
  const router = useRouter();
  const [editing, setEditing] = useState<GridBid | "new" | null>(view.bids.length === 0 ? "new" : null);
  const [awarding, setAwarding] = useState<GridBid | null>(null);
  const [busy, start] = useTransition();
  const [uploading, setUploading] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const uploadFor = useRef<string | null>(null);
  const awarded = Boolean(awardedId);
  const full = view.bids.length >= MAX_BIDS;

  const remove = (b: GridBid) => {
    if (!window.confirm(fmt(t.bids.confirmDelete, { company: b.company }))) return;
    start(async () => {
      const res = await deleteBidAction(comparisonId, b.id);
      if (res.error) toast.error(errorText(t.errors, res.error));
      else toast.success(t.bids.deleted);
    });
  };

  const pickFile = (bidId: string) => {
    uploadFor.current = bidId;
    fileRef.current?.click();
  };

  const upload = async (file: File | undefined) => {
    const id = uploadFor.current;
    if (!file || !id) return;
    setUploading(id);
    try {
      const body = new FormData();
      body.set("id", id);
      body.set("file", file);
      const res = await fetch("/api/bid-comparisons/upload", { method: "POST", body });
      const json = (await res.json().catch(() => ({}))) as { error?: keyof Errors };
      if (!res.ok) toast.error(t.errors[json.error ?? "upload"] ?? t.errors.upload);
      else {
        toast.success(t.file.uploaded);
        router.refresh();
      }
    } finally {
      setUploading(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const fileCell: Record<string, React.ReactNode> = {};
  const actionCell: Record<string, React.ReactNode> = {};
  for (const b of view.bids) {
    fileCell[b.id] = (
      <div className="flex flex-col items-start gap-1">
        {b.hasFile && (
          <a href={`/api/bid-comparisons/file?id=${b.id}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-teal-ink hover:underline">
            <ExternalLink className="size-3" /> {b.fileName ?? t.file.view}
          </a>
        )}
        <Button variant="ghost" size="xs" onClick={() => pickFile(b.id)} disabled={uploading === b.id}>
          <FileUp className="size-3" /> {uploading === b.id ? t.file.uploading : b.hasFile ? t.file.replace : t.file.upload}
        </Button>
      </div>
    );
    actionCell[b.id] = (
      <div className="flex flex-col items-start gap-1.5">
        {b.invitedAt && <span className="text-xs text-muted-foreground">{fmt(t.bids.invited, { date: formatDate(b.invitedAt, lang) })}</span>}
        {!awarded && (
          <Button size="sm" onClick={() => setAwarding(b)}>
            <Award className="size-3.5" /> {t.award.button}
          </Button>
        )}
        <div className="flex gap-1">
          <Button variant="outline" size="xs" onClick={() => setEditing(b)}>
            <Pencil className="size-3" /> {t.bids.edit}
          </Button>
          {b.id !== awardedId && (
            <Button variant="ghost" size="xs" onClick={() => remove(b)} disabled={busy} aria-label={t.bids.delete}>
              <Trash2 className="size-3" />
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div>
          <h2 className="text-base font-semibold">{t.bids.title}</h2>
          <p className="text-sm text-muted-foreground">{full ? t.bids.max : t.bids.hint}</p>
        </div>
        {!full && editing !== "new" && (
          <Button size="sm" variant="outline" onClick={() => setEditing("new")}>
            <Plus className="size-3.5" /> {t.bids.add}
          </Button>
        )}
      </div>

      <input ref={fileRef} type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => upload(e.target.files?.[0])} />

      {awarding && (
        <AwardConfirm
          key={awarding.id}
          comparisonId={comparisonId}
          bid={awarding}
          viaRfp={rfpLinked && awarding.fromRfp}
          outsideRfp={rfpLinked && !awarding.fromRfp}
          t={t}
          onClose={() => setAwarding(null)}
        />
      )}

      {editing && (
        <BidForm
          key={editing === "new" ? "new" : editing.id}
          comparisonId={comparisonId}
          bid={editing === "new" ? null : editing}
          items={view.items}
          country={country}
          t={t}
          onDone={() => setEditing(null)}
        />
      )}

      {view.bids.length > 0 && (
        <SheetGrid view={view} country={country} lang={lang} t={t} recommendedId={recommendedId} awardedId={awardedId} fileCell={fileCell} actionCell={actionCell} />
      )}
      {view.bids.length > 0 && <p className="text-xs text-muted-foreground print:hidden">{t.coverageNote}</p>}
    </section>
  );
}

function BidForm({
  comparisonId,
  bid,
  items,
  country,
  t,
  onDone,
}: {
  comparisonId: string;
  bid: GridBid | null;
  items: SheetItem[];
  country: BidCountry;
  t: SheetCopy;
  onDone: () => void;
}) {
  const f = t.form;
  const [state, action, pending] = useActionState<SaveState, FormData>(saveBidAction, {});
  const [org, setOrg] = useState<{ id: string; name: string } | null>(bid?.onPmrfp && bid.orgName ? { id: "", name: bid.orgName } : null);
  const [picked, setPicked] = useState<string>("");
  const [unlink, setUnlink] = useState(false);
  const [company, setCompany] = useState(bid?.company ?? "");
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<OrgHit[] | null>(null);
  const [searching, setSearching] = useState(false);

  useOnResult(state, (s) => {
    if (s.ok) {
      toast.success(t.bids.saved);
      onDone();
    } else if (s.error) toast.error(errorText(t.errors, s.error));
  });

  // Debounced company search, driven by typing (latest request wins).
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seq = useRef(0);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const search = (value: string) => {
    setQ(value);
    if (timer.current) clearTimeout(timer.current);
    const term = value.trim();
    const mine = ++seq.current;
    if (term.length < 2) {
      setHits(null);
      setSearching(false);
      return;
    }
    setSearching(true);
    timer.current = setTimeout(async () => {
      const res = await searchBidderOrgsAction(term).catch(() => ({ hits: [] as OrgHit[] }));
      if (mine !== seq.current) return;
      setHits(res.hits);
      setSearching(false);
    }, 300);
  };

  const choose = (h: OrgHit) => {
    setOrg({ id: h.id, name: h.name });
    setPicked(h.id);
    setUnlink(false);
    if (!company.trim()) setCompany(h.name);
    seq.current++;
    if (timer.current) clearTimeout(timer.current);
    setQ("");
    setHits(null);
    setSearching(false);
  };

  const fromRfp = Boolean(bid?.fromRfp);

  return (
    <form action={action} className="grid gap-4 rounded-lg border border-teal-200 bg-card p-5 shadow-sm sm:grid-cols-2 lg:grid-cols-3 print:hidden">
      <h3 className="text-base font-semibold sm:col-span-2 lg:col-span-3">{bid ? t.bids.editTitle : t.bids.addTitle}</h3>
      <input type="hidden" name="comparison_id" value={comparisonId} />
      {bid && <input type="hidden" name="id" value={bid.id} />}
      <input type="hidden" name="bidder_organization_id" value={picked} />
      <input type="hidden" name="unlink" value={unlink ? "1" : ""} />

      <Field label={f.company}>
        <Input name="company_name" required maxLength={160} value={company} onChange={(e) => setCompany(e.target.value)} />
      </Field>
      {!fromRfp && (
        <div className="space-y-1.5 sm:col-span-1 lg:col-span-2">
          <Label>
            <span className="text-sm font-medium">{f.search}</span>
          </Label>
          {org && !unlink ? (
            <p className="flex flex-wrap items-center gap-2 text-sm">
              <Link2 className="size-3.5 text-teal-700" /> {fmt(f.linked, { company: org.name })}
              <button
                type="button"
                className="text-xs text-muted-foreground underline"
                onClick={() => {
                  setUnlink(true);
                  setPicked("");
                  setOrg(null);
                }}
              >
                {f.unlink}
              </button>
            </p>
          ) : (
            <div className="relative">
              <Input value={q} onChange={(e) => search(e.target.value)} placeholder={f.searchPlaceholder} autoComplete="off" />
              {(searching || hits) && (
                <ul className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-border bg-popover text-sm shadow-md">
                  {searching && <li className="px-3 py-2 text-muted-foreground">{f.searching}</li>}
                  {!searching && hits?.length === 0 && <li className="px-3 py-2 text-muted-foreground">{f.noMatch}</li>}
                  {!searching &&
                    hits?.map((h) => (
                      <li key={h.id}>
                        <button type="button" className="w-full px-3 py-2 text-left hover:bg-muted" onClick={() => choose(h)}>
                          <span className="font-medium">{h.name}</span>
                          <span className="block text-xs text-muted-foreground">{[h.city, h.province].filter(Boolean).join(", ")}</span>
                        </button>
                      </li>
                    ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
      <Field label={f.email} hint={f.emailHint}>
        <Input name="contact_email" type="email" maxLength={254} defaultValue={bid?.contactEmail ?? ""} />
      </Field>
      <Field label={`${f.price} (${country === "US" ? "USD" : "CAD"})`}>
        <Input name="total_price" inputMode="decimal" placeholder="48500" defaultValue={bid?.price ?? ""} />
      </Field>
      <Field label={f.taxAmount[country]}>
        <Input name="tax_amount" inputMode="decimal" defaultValue={bid?.taxAmount ?? ""} />
      </Field>
      <Field label={f.taxPercent[country]}>
        <Input name="tax_percent" inputMode="decimal" placeholder={country === "US" ? "8.25" : "13"} defaultValue={bid?.taxAmount == null ? (bid?.taxPercent ?? "") : ""} />
      </Field>
      <Field label={f.start}>
        <Input name="start_date" type="date" defaultValue={bid?.startDate ?? ""} />
      </Field>
      <Field label={f.duration}>
        <Input name="duration" maxLength={80} placeholder={f.durationPlaceholder} defaultValue={bid?.duration ?? ""} />
      </Field>
      <Field label={f.warranty}>
        <Input name="warranty" maxLength={160} placeholder={f.warrantyPlaceholder} defaultValue={bid?.warranty ?? ""} />
      </Field>
      <Field label={f.terms} className="sm:col-span-2 lg:col-span-3">
        <Input name="payment_terms" maxLength={160} placeholder={f.termsPlaceholder} defaultValue={bid?.paymentTerms ?? ""} />
      </Field>
      <Field label={f.notes} className="sm:col-span-2 lg:col-span-3">
        <Textarea name="notes" rows={3} maxLength={2000} defaultValue={bid?.notes ?? ""} />
      </Field>
      {items.length > 0 && (
        <fieldset className="grid gap-3 sm:col-span-2 sm:grid-cols-2 lg:col-span-3 lg:grid-cols-3">
          <legend className="mb-1 text-sm font-medium">{f.lineItems}</legend>
          {items.map((it) => (
            <Field key={it.id} label={it.label}>
              <Input name={`line_${it.id}`} inputMode="decimal" defaultValue={bid?.linePrices[it.id] ?? ""} placeholder={t.cell.notQuoted} />
            </Field>
          ))}
        </fieldset>
      )}
      <div className="flex gap-2 sm:col-span-2 lg:col-span-3">
        <Button type="submit" disabled={pending}>
          {pending ? f.saving : f.save}
        </Button>
        <Button type="button" variant="ghost" onClick={onDone}>
          {f.cancel}
        </Button>
      </div>
    </form>
  );
}

function AwardConfirm({
  comparisonId,
  bid,
  viaRfp,
  outsideRfp,
  t,
  onClose,
}: {
  comparisonId: string;
  bid: GridBid;
  viaRfp: boolean;
  outsideRfp: boolean;
  t: SheetCopy;
  onClose: () => void;
}) {
  const lang = useLang();
  const [notify, setNotify] = useState(Boolean(bid.contactEmail));
  const [busy, start] = useTransition();
  const a = t.award;
  const go = () =>
    start(async () => {
      const res = await awardBidAction(comparisonId, bid.id, notify, lang);
      if (res.error) {
        toast.error(errorText(t.errors, res.error));
        return;
      }
      if (res.rfpClosed) toast.message(t.errors.rfpClosed);
      toast.success(a.done);
      onClose();
    });
  return (
    <div role="alertdialog" aria-label={fmt(a.confirm, { company: bid.company })} className="rounded-lg border border-indigo/30 bg-indigo/5 p-5 print:hidden">
      <h3 className="text-base font-semibold">{fmt(a.confirm, { company: bid.company })}</h3>
      {viaRfp && <p className="mt-1 text-sm text-muted-foreground">{fmt(a.confirmRfp, { company: bid.company })}</p>}
      {outsideRfp && <p className="mt-1 text-sm text-muted-foreground">{fmt(a.confirmOutsideRfp, { company: bid.company })}</p>}
      {!viaRfp &&
        (bid.contactEmail ? (
          <label className="mt-3 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} className="size-4 accent-teal-600" />
            {fmt(a.notify, { company: bid.company })}
          </label>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">{a.notifyNoEmail}</p>
        ))}
      <div className="mt-4 flex gap-2">
        <Button onClick={go} disabled={busy}>
          <Award className="size-4" /> {busy ? a.busy : a.yes}
        </Button>
        <Button variant="ghost" onClick={onClose} disabled={busy}>
          {a.cancel}
        </Button>
      </div>
    </div>
  );
}

// ── Recommendation ───────────────────────────────────────────────────

export function RecommendationForm({
  comparisonId,
  bids,
  recommendedId,
  recommendation,
  t,
}: {
  comparisonId: string;
  bids: { id: string; company: string }[];
  recommendedId: string | null;
  recommendation: string | null;
  t: SheetCopy;
}) {
  const [state, action, pending] = useActionState<SaveState, FormData>(saveRecommendationAction, {});
  useOnResult(state, (s) => {
    if (s.ok) toast.success(t.rec.saved);
    else if (s.error) toast.error(errorText(t.errors, s.error));
  });
  return (
    <form action={action} className="space-y-3 rounded-lg border border-border bg-card p-5 print:hidden">
      <h2 className="text-base font-semibold">{t.rec.title}</h2>
      <input type="hidden" name="id" value={comparisonId} />
      <Field label={t.rec.pick}>
        <select name="recommended_bid_id" className={selectClass} defaultValue={recommendedId ?? ""}>
          <option value="">{t.rec.none}</option>
          {bids.map((b) => (
            <option key={b.id} value={b.id}>
              {b.company}
            </option>
          ))}
        </select>
      </Field>
      <Field label={t.rec.rationale}>
        <Textarea name="recommendation" rows={4} maxLength={2000} placeholder={t.rec.placeholder} defaultValue={recommendation ?? ""} />
      </Field>
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? t.rec.saving : t.rec.save}
      </Button>
    </form>
  );
}

// ── Share with the board ─────────────────────────────────────────────

export function SharePanel({ comparisonId, shareCreatedAt, boardHref, t }: { comparisonId: string; shareCreatedAt: string | null; boardHref: string; t: SheetCopy }) {
  const lang = useLang();
  const [link, setLink] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const s = t.share;

  const set = (on: boolean) =>
    start(async () => {
      const res = await shareLinkAction(comparisonId, on);
      if (res.error) {
        toast.error(errorText(t.errors, res.error));
        return;
      }
      if (res.token) setLink(`${window.location.origin}${localizePath(`/bid-sheet/s/${res.token}`, lang)}`);
      else {
        setLink(null);
        toast.success(s.revoked);
      }
    });

  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      toast.success(s.copied);
    } catch {
      /* the field is selectable */
    }
  };

  return (
    <section className="space-y-3 rounded-lg border border-border bg-card p-5 print:hidden">
      <h2 className="text-base font-semibold">{s.title}</h2>
      <p className="text-sm text-muted-foreground">{s.body}</p>
      <a href={localizePath(boardHref, lang)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm font-medium text-teal-ink hover:underline">
        <ExternalLink className="size-3.5" /> {s.board}
      </a>
      {link ? (
        <div className="space-y-1.5">
          <p className="text-xs text-amber-800">{s.once}</p>
          <div className="flex gap-2">
            <Input readOnly value={link} onFocus={(e) => e.currentTarget.select()} aria-label={s.title} />
            <Button size="sm" variant="outline" onClick={copy}>
              <Copy className="size-3.5" /> {s.copy}
            </Button>
          </div>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">{shareCreatedAt ? fmt(s.active, { date: formatDate(shareCreatedAt, lang) }) : s.off}</p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => set(true)} disabled={busy}>
          <Link2 className="size-3.5" /> {busy ? s.creating : shareCreatedAt || link ? s.replace : s.create}
        </Button>
        {(shareCreatedAt || link) && (
          <Button size="sm" variant="ghost" onClick={() => set(false)} disabled={busy}>
            {s.revoke}
          </Button>
        )}
      </div>
    </section>
  );
}

// ── Invite these bidders to PMRFP ────────────────────────────────────

export function InviteButton({ comparisonId, t, eligible }: { comparisonId: string; t: SheetCopy; eligible: number }) {
  const lang = useLang();
  const [busy, start] = useTransition();
  if (eligible === 0) return <p className="text-sm text-muted-foreground">{t.next.inviteNone}</p>;
  const run = () =>
    start(async () => {
      const res = await inviteBiddersAction(comparisonId, lang);
      if (res.error || !res.result) {
        toast.error(errorText(t.errors, res.error));
        return;
      }
      const r = res.result;
      const sent = fmt(r.sent === 1 ? t.inviteResult.sent.one : t.inviteResult.sent.other, { n: r.sent });
      const skippedTotal = Object.values(r.skipped).reduce((a, b) => a + b, 0);
      toast.success(skippedTotal ? `${sent} ${fmt(t.inviteResult.skipped, r.skipped)}` : sent);
    });
  return (
    <Button onClick={run} disabled={busy}>
      <Users className="size-4" /> {busy ? t.next.inviteBusy : t.next.inviteCta}
    </Button>
  );
}
