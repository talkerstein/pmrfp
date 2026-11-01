"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BadgeCheck, Check, Copy, ExternalLink, Link2, Pencil, Phone, Plus, Search, Siren, Trash2, UserPlus, X } from "lucide-react";
import { toast } from "sonner";
import Link from "@/i18n/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useLang } from "@/i18n/provider";
import { fmt, formatDate, plural } from "@/i18n/format";
import { localizePath } from "@/i18n/config";
import type { Messages } from "@/i18n/dictionaries";
import type { CertStatus } from "@/lib/vendor-certs/rules";
import { onCallRfpDraft, sharePath, type BuildingGap, type Gap, type RosterCountry, type Slot } from "@/lib/roster/rules";
import {
  addCustomRowAction,
  addDirectoryVendorAction,
  createShareLinkAction,
  deleteEntryAction,
  deleteRosterAction,
  findVendorsAction,
  inviteVendorAction,
  revokeShareLinkAction,
  saveEntryAction,
  saveRosterAction,
  setNotNeededAction,
  type EntryState,
  type FormState,
  type MatchView,
} from "@/lib/roster/actions";

type R = Messages["roster"];

export interface EditorCopy {
  editor: R["editor"];
  gaps: R["gaps"];
  insurance: R["insurance"];
  buildingGaps: R["buildingGaps"];
  rfp: R["rfp"]["CA"];
}

export interface SlotView {
  name: string | null;
  phone: string | null;
  email: string | null;
  tel: string | null;
  /** The PM's own Vendor Insurance Tracker status for this vendor (null: not tracked). */
  insurance: CertStatus | null;
  /** The linked PMRFP company, when its profile is live. */
  profile: { slug: string; name: string } | null;
  /** This company already sent this vendor the PMRFP invite. */
  invited: boolean;
}

export interface RowView {
  key: string;
  entryId: string | null;
  category: string;
  label: string;
  customLabel: string | null;
  tradeSlug: string | null;
  notNeeded: boolean;
  available247: boolean;
  notes: string | null;
  gaps: Gap[];
  primary: SlotView | null;
  backup: SlotView | null;
  /** "a 24/7 plumber" for "Find {who} near {place}". */
  findWho: string;
  /** "plumbing" for the on-call contract RFP (null: no RFP for this row). */
  rfpTrade: string | null;
}

export interface RosterFields {
  id: string;
  building_name: string;
  address: string | null;
  city: string | null;
  province: string | null;
  on_call_name: string | null;
  on_call_phone: string | null;
  on_call_notes: string | null;
  shutoff_water: string | null;
  shutoff_gas: string | null;
  shutoff_electric: string | null;
  shutoff_notes: string | null;
  emergency_line: string;
  non_emergency_line: string | null;
  other_numbers: string | null;
}

export interface LinkView {
  id: string;
  token: string;
  label: string | null;
  createdAt: string;
  viewCount: number;
  lastViewedAt: string | null;
}

const GAP_CHIP: Record<Gap, string> = {
  no_vendor: "border-red-200 bg-red-50 text-red-700",
  no_phone: "border-red-200 bg-red-50 text-red-700",
  no_backup: "border-amber-200 bg-amber-50 text-amber-800",
  not_24_7: "border-amber-200 bg-amber-50 text-amber-800",
};

const INS_CHIP: Record<CertStatus, string> = {
  valid: "border-teal-200 bg-teal-50 text-teal-800",
  expiring: "border-amber-200 bg-amber-50 text-amber-800",
  expired: "border-red-200 bg-red-50 text-red-700",
  missing: "border-slate-200 bg-slate-100 text-slate-700",
};

const selectClass = "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm";
const chip = "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium";

/** Gaps a directory company could fill (a missing phone number is the PM's to add). */
const FINDABLE: readonly Gap[] = ["no_vendor", "no_backup", "not_24_7"];

/**
 * The roster editor for one building: the trade rows (primary, backup,
 * 24/7, notes, gap chips), filling a gap from the PMRFP directory or an
 * on-call RFP, inviting a current vendor, custom rows, the building's
 * after-hours basics, share links and delete. Mutations are server actions
 * (lib/roster/actions); the page re-renders from the server after each.
 */
export function RosterEditor({
  roster,
  rows,
  links,
  country,
  provinces,
  trades,
  place,
  buildingGapList,
  copy,
}: {
  roster: RosterFields;
  rows: RowView[];
  links: LinkView[];
  country: RosterCountry;
  provinces: string[];
  trades: { slug: string; name: string }[];
  place: string | null;
  buildingGapList: BuildingGap[];
  copy: EditorCopy;
}) {
  const e = copy.editor;
  return (
    <div className="space-y-8">
      <section aria-labelledby="rows-title">
        <h2 id="rows-title" className="text-lg font-semibold">{e.rows.title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{e.rows.body}</p>
        <ul className="mt-4 space-y-3">
          {rows.map((r) => (
            <RowCard key={r.key} row={r} roster={roster} trades={trades} place={place} copy={copy} />
          ))}
        </ul>
        <CustomRowForm rosterId={roster.id} trades={trades} copy={copy} />
      </section>

      <BuildingForm roster={roster} country={country} provinces={provinces} gaps={buildingGapList} copy={copy} />
      <SharePanel rosterId={roster.id} links={links} copy={copy} />
      <DeleteBuilding roster={roster} copy={copy} />
    </div>
  );
}

// ── One trade row ────────────────────────────────────────────────────

function RowCard({ row, roster, trades, place, copy }: { row: RowView; roster: RosterFields; trades: { slug: string; name: string }[]; place: string | null; copy: EditorCopy }) {
  const e = copy.editor;
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [finding, setFinding] = useState(false);
  const [pending, start] = useTransition();
  const findable = !row.notNeeded && row.gaps.some((g) => FINDABLE.includes(g));

  const toggleNeeded = () =>
    start(async () => {
      const res = await setNotNeededAction({ rosterId: roster.id, category: row.category, entryId: row.entryId, notNeeded: !row.notNeeded });
      if (res.error) toast.error(e.errors[res.error]);
      else router.refresh();
    });

  const clear = () => {
    if (!row.entryId || !window.confirm(fmt(e.rows.confirmClear, { row: row.label }))) return;
    start(async () => {
      const res = await deleteEntryAction(row.entryId!);
      if (res.error) toast.error(e.errors[res.error]);
      else {
        toast.success(e.rows.cleared);
        setEditing(false);
        router.refresh();
      }
    });
  };

  return (
    <li className={`rounded-lg border bg-card p-4 ${row.notNeeded ? "border-dashed border-border opacity-75" : row.gaps.includes("no_vendor") ? "border-red-200" : "border-border"}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-semibold">{row.label}</h3>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {row.notNeeded ? (
              <span className={`${chip} border-slate-200 bg-slate-100 text-slate-600`}>{e.rows.notNeeded}</span>
            ) : (
              <>
                {row.gaps.map((g) => (
                  <span key={g} className={`${chip} ${GAP_CHIP[g]}`}>{copy.gaps[g]}</span>
                ))}
                {row.available247 && (
                  <span className={`${chip} border-teal-200 bg-teal-50 text-teal-800`}>
                    <Check className="mr-1 size-3" /> {e.rows.available247}
                  </span>
                )}
              </>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {!editing && !row.notNeeded && (
            <Button type="button" size="sm" variant="outline" onClick={() => setEditing(true)}>
              <Pencil className="size-3.5" /> {e.rows.edit}
            </Button>
          )}
          <Button type="button" size="sm" variant="ghost" onClick={toggleNeeded} disabled={pending}>
            {row.notNeeded ? e.rows.markNeeded : e.rows.markNotNeeded}
          </Button>
        </div>
      </div>

      {!row.notNeeded && !editing && (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <SlotSummary label={e.rows.primary} slot={row.primary} copy={copy} />
          <SlotSummary label={e.rows.backup} slot={row.backup} copy={copy} />
          {row.notes && <p className="text-sm text-muted-foreground sm:col-span-2 whitespace-pre-line">{row.notes}</p>}
        </div>
      )}

      {editing && (
        <EntryForm
          row={row}
          rosterId={roster.id}
          trades={trades}
          copy={copy}
          onDone={() => setEditing(false)}
          onClear={row.entryId ? clear : undefined}
          clearing={pending}
        />
      )}

      {findable && !editing && (
        <div className="mt-3">
          {!finding ? (
            <Button type="button" size="sm" variant={row.gaps.includes("no_vendor") ? "default" : "outline"} onClick={() => setFinding(true)}>
              {row.tradeSlug ? <Search className="size-3.5" /> : <UserPlus className="size-3.5" />}
              {row.tradeSlug ? fmt(e.rows.find, { who: row.findWho, place: place || e.rows.yourArea }) : e.find.inviteTitle}
            </Button>
          ) : (
            <FindPanel row={row} roster={roster} place={place || e.rows.yourArea} copy={copy} onClose={() => setFinding(false)} />
          )}
        </div>
      )}
    </li>
  );
}

function SlotSummary({ label, slot, copy }: { label: string; slot: SlotView | null; copy: EditorCopy }) {
  const e = copy.editor;
  return (
    <div className="rounded-md bg-secondary/40 px-3 py-2 text-sm">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      {slot && (slot.name || slot.phone) ? (
        <div className="mt-1 space-y-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-medium">{slot.name || slot.phone}</span>
            {slot.profile && (
              <Link href={`/directory/${slot.profile.slug}`} target="_blank" className={`${chip} border-indigo-200 bg-indigo-50 text-indigo-700 hover:underline`}>
                <BadgeCheck className="mr-1 size-3" /> {e.rows.onPmrfp}
              </Link>
            )}
            {slot.insurance && <span className={`${chip} ${INS_CHIP[slot.insurance]}`}>{fmt(copy.insurance.label, { status: copy.insurance[slot.insurance] })}</span>}
          </div>
          {slot.phone && (
            <div>
              {slot.tel ? (
                <a href={slot.tel} className="inline-flex items-center gap-1 text-teal-700 hover:underline">
                  <Phone className="size-3.5" /> {slot.phone}
                </a>
              ) : (
                slot.phone
              )}
            </div>
          )}
          {slot.email && <div className="truncate text-muted-foreground">{slot.email}</div>}
        </div>
      ) : (
        <div className="mt-1 text-muted-foreground">{e.rows.nobody}</div>
      )}
    </div>
  );
}

function EntryForm({
  row,
  rosterId,
  trades,
  copy,
  onDone,
  onClear,
  clearing,
}: {
  row: RowView;
  rosterId: string;
  trades: { slug: string; name: string }[];
  copy: EditorCopy;
  onDone: () => void;
  onClear?: () => void;
  clearing: boolean;
}) {
  const e = copy.editor;
  const router = useRouter();
  const [state, action, pending] = useActionState<EntryState, FormData>(saveEntryAction, {});
  useEffect(() => {
    if (state.ok) {
      toast.success(e.rows.saved);
      router.refresh();
      onDone();
    } else if (state.error) toast.error(e.errors[state.error]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);
  const custom = row.category === "custom";
  const id = (s: string) => `${row.key}-${s}`;

  return (
    <form action={action} className="mt-4 space-y-4">
      <input type="hidden" name="roster_id" value={rosterId} />
      <input type="hidden" name="entry_id" value={row.entryId ?? ""} />
      <input type="hidden" name="category" value={row.category} />
      {custom && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor={id("label")}>{e.rows.customLabel}</Label>
            <Input id={id("label")} name="custom_label" defaultValue={row.customLabel ?? ""} maxLength={80} required className="mt-1" />
          </div>
          <div>
            <Label htmlFor={id("trade")}>{e.rows.trade}</Label>
            <select id={id("trade")} name="trade_slug" defaultValue={row.tradeSlug ?? ""} className={`${selectClass} mt-1`}>
              <option value="">{e.rows.tradeNone}</option>
              {trades.map((t) => (
                <option key={t.slug} value={t.slug}>{t.name}</option>
              ))}
            </select>
          </div>
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        {(["primary", "backup"] as const).map((s) => {
          const v = row[s];
          return (
            <fieldset key={s} className="space-y-2 rounded-md border border-border p-3">
              <legend className="px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">{s === "primary" ? e.rows.primary : e.rows.backup}</legend>
              <div>
                <Label htmlFor={id(`${s}-name`)}>{e.rows.company}</Label>
                <Input id={id(`${s}-name`)} name={`${s}_name`} defaultValue={v?.name ?? ""} maxLength={160} className="mt-1" />
              </div>
              <div>
                <Label htmlFor={id(`${s}-phone`)}>{e.rows.phone}</Label>
                <Input id={id(`${s}-phone`)} name={`${s}_phone`} type="tel" inputMode="tel" autoComplete="off" defaultValue={v?.phone ?? ""} maxLength={40} className="mt-1" />
              </div>
              <div>
                <Label htmlFor={id(`${s}-email`)}>{e.rows.email}</Label>
                <Input id={id(`${s}-email`)} name={`${s}_email`} type="email" autoComplete="off" defaultValue={v?.email ?? ""} maxLength={254} className="mt-1" />
              </div>
            </fieldset>
          );
        })}
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="available_24_7" defaultChecked={row.available247} className="size-4 rounded border-input" />
        {e.rows.available247}
      </label>
      <div>
        <Label htmlFor={id("notes")}>{e.rows.notes}</Label>
        <Textarea id={id("notes")} name="notes" defaultValue={row.notes ?? ""} maxLength={500} rows={2} className="mt-1" />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={pending}>{pending ? e.rows.saving : e.rows.save}</Button>
        <Button type="button" variant="ghost" onClick={onDone}>{e.rows.cancel}</Button>
        {onClear && (
          <Button type="button" variant="destructive" className="ml-auto" onClick={onClear} disabled={clearing}>
            <Trash2 className="size-3.5" /> {e.rows.clear}
          </Button>
        )}
      </div>
    </form>
  );
}

// ── Fill a gap from PMRFP ────────────────────────────────────────────

function FindPanel({ row, roster, place, copy, onClose }: { row: RowView; roster: RosterFields; place: string; copy: EditorCopy; onClose: () => void }) {
  const e = copy.editor;
  const f = e.find;
  const lang = useLang();
  const router = useRouter();
  const [matches, setMatches] = useState<MatchView[] | null>(row.tradeSlug ? null : []);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (!row.tradeSlug) return;
    let live = true;
    findVendorsAction(roster.id, row.tradeSlug).then((res) => {
      if (!live) return;
      if (res.error) {
        toast.error(e.errors[res.error]);
        setMatches([]);
      } else setMatches(res.matches ?? []);
    });
    return () => {
      live = false;
    };
  }, [roster.id, row.tradeSlug, e.errors]);

  const use = (m: MatchView, slot: Slot) => {
    const current = row[slot]?.name;
    if (current && current.trim().toLowerCase() !== m.name.trim().toLowerCase() && !window.confirm(fmt(f.confirmReplace, { old: current, new: m.name }))) return;
    start(async () => {
      const res = await addDirectoryVendorAction({ rosterId: roster.id, category: row.category, entryId: row.entryId, slot, orgId: m.orgId });
      if (res.error) toast.error(e.errors[res.error]);
      else {
        toast.success(fmt(f.added, { name: m.name }));
        if (!m.phone) toast.info(f.noPhone);
        router.refresh();
        onClose();
      }
    });
  };

  const postRfp = () => {
    if (!row.tradeSlug || !row.rfpTrade) return;
    const draft = onCallRfpDraft(copy.rfp, { trade: row.rfpTrade, tradeSlug: row.tradeSlug, building: roster.building_name, city: roster.city, province: roster.province, now: new Date() });
    try {
      window.localStorage.setItem("pmrfp:rfp-draft", JSON.stringify(draft));
    } catch {
      /* private mode: the form opens empty */
    }
    router.push(localizePath("/pm-dashboard/rfps/new?draft=1", lang));
  };

  const canPost = Boolean(row.tradeSlug && row.rfpTrade);
  const trade = row.rfpTrade ?? row.label;

  return (
    <div className="rounded-lg border border-teal-200 bg-teal-50/40 p-4">
      <div className="flex items-start justify-between gap-3">
        <h4 className="text-sm font-semibold">{row.tradeSlug ? fmt(f.title, { place }) : f.inviteTitle}</h4>
        <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground" aria-label={f.close}>
          <X className="size-4" />
        </button>
      </div>

      {row.tradeSlug && matches === null && <p className="mt-2 text-sm text-muted-foreground">{f.loading}</p>}

      {matches && matches.length > 0 && (
        <ul className="mt-3 divide-y divide-border rounded-md border border-border bg-card">
          {matches.map((m) => (
            <li key={m.orgId} className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-medium">{m.name}</span>
                  {m.verified && (
                    <span className={`${chip} border-indigo-200 bg-indigo-50 text-indigo-700`}>
                      <BadgeCheck className="mr-1 size-3" /> {f.verified}
                    </span>
                  )}
                  {m.emergency && (
                    <span className={`${chip} border-teal-200 bg-teal-50 text-teal-800`}>
                      <Siren className="mr-1 size-3" /> {f.emergency}
                    </span>
                  )}
                </div>
                <div className="text-xs text-muted-foreground">{[m.city, m.province].filter(Boolean).join(", ")}</div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" onClick={() => use(m, "primary")} disabled={pending}>{f.usePrimary}</Button>
                <Button type="button" size="sm" variant="outline" onClick={() => use(m, "backup")} disabled={pending}>{f.useBackup}</Button>
                <Link href={`/directory/${m.slug}`} target="_blank" className="inline-flex items-center gap-1 text-xs text-teal-700 hover:underline">
                  {f.viewProfile} <ExternalLink className="size-3" />
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}

      {row.tradeSlug && matches && matches.length === 0 && <p className="mt-2 text-sm">{fmt(f.none, { place })}</p>}

      {canPost && matches !== null && (
        matches.length === 0 ? (
          <div className="mt-3">
            <Button type="button" onClick={postRfp}>{fmt(f.postRfp, { trade })}</Button>
            <p className="mt-1 text-xs text-muted-foreground">{f.postNote}</p>
          </div>
        ) : (
          <button type="button" onClick={postRfp} className="mt-3 text-sm font-medium text-teal-700 hover:underline">
            {fmt(f.orPost, { trade })}
          </button>
        )
      )}

      {matches !== null && <InviteBox row={row} copy={copy} />}
    </div>
  );
}

function InviteBox({ row, copy }: { row: RowView; copy: EditorCopy }) {
  const e = copy.editor;
  const f = e.find;
  const lang = useLang();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [sent, setSent] = useState<Partial<Record<Slot, boolean>>>({});
  // "Your current vendor": someone on the row who isn't on PMRFP yet.
  const slots = (["primary", "backup"] as const).filter((s) => row[s] && (row[s]!.name || row[s]!.email) && !row[s]!.profile);
  if (!slots.length) return null;

  const invite = (s: Slot) =>
    start(async () => {
      if (!row.entryId) return;
      const res = await inviteVendorAction(row.entryId, s, lang);
      if (res.error) toast.error(e.errors[res.error]);
      else if (res.result === "sent") {
        toast.success(e.invite.sent);
        setSent((x) => ({ ...x, [s]: true }));
        router.refresh();
      } else if (res.result) toast.error(e.invite[res.result]);
    });

  return (
    <div className="mt-4 border-t border-teal-200 pt-3">
      <h5 className="text-sm font-semibold">{f.inviteTitle}</h5>
      <p className="mt-1 text-xs text-muted-foreground">{f.inviteBody}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {slots.map((s) => {
          const v = row[s]!;
          const name = v.name || v.email || "";
          if (v.invited || sent[s]) {
            return (
              <span key={s} className={`${chip} border-teal-200 bg-teal-50 text-teal-800`}>
                <Check className="mr-1 size-3" /> {f.invited}: {name}
              </span>
            );
          }
          if (!v.email || !row.entryId) {
            return (
              <span key={s} className="text-xs text-muted-foreground">
                {name}: {f.needEmail}
              </span>
            );
          }
          return (
            <Button key={s} type="button" size="sm" variant="outline" onClick={() => invite(s)} disabled={pending}>
              <UserPlus className="size-3.5" /> {pending ? f.inviting : fmt(f.invite, { name })}
            </Button>
          );
        })}
      </div>
    </div>
  );
}

// ── Custom rows ──────────────────────────────────────────────────────

function CustomRowForm({ rosterId, trades, copy }: { rosterId: string; trades: { slug: string; name: string }[]; copy: EditorCopy }) {
  const e = copy.editor;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [, action, pending] = useActionState<EntryState, FormData>(async (prev, fd) => {
    const res = await addCustomRowAction(prev, fd);
    if (res.ok) {
      toast.success(e.rows.added);
      setOpen(false);
      router.refresh();
    } else if (res.error) toast.error(e.errors[res.error]);
    return res;
  }, {});

  if (!open) {
    return (
      <Button type="button" variant="outline" className="mt-4" onClick={() => setOpen(true)}>
        <Plus className="size-4" /> {e.rows.customTitle}
      </Button>
    );
  }
  return (
    <form action={action} className="mt-4 grid gap-3 rounded-lg border border-border bg-card p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
      <input type="hidden" name="roster_id" value={rosterId} />
      <div>
        <Label htmlFor="custom-label">{e.rows.customLabel}</Label>
        <Input id="custom-label" name="custom_label" placeholder={e.rows.customPh} maxLength={80} required className="mt-1" />
      </div>
      <div>
        <Label htmlFor="custom-trade">{e.rows.trade}</Label>
        <select id="custom-trade" name="trade_slug" defaultValue="" className={`${selectClass} mt-1`}>
          <option value="">{e.rows.tradeNone}</option>
          {trades.map((t) => (
            <option key={t.slug} value={t.slug}>{t.name}</option>
          ))}
        </select>
      </div>
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>{pending ? e.rows.adding : e.rows.addRow}</Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>{e.rows.cancel}</Button>
      </div>
    </form>
  );
}

// ── The building's after-hours basics ────────────────────────────────

function BuildingForm({ roster, country, provinces, gaps, copy }: { roster: RosterFields; country: RosterCountry; provinces: string[]; gaps: BuildingGap[]; copy: EditorCopy }) {
  const b = copy.editor.building;
  const e = copy.editor;
  const lang = useLang();
  const router = useRouter();
  const [state, action, pending] = useActionState<FormState, FormData>(saveRosterAction, {});
  useEffect(() => {
    if (state.ok) {
      toast.success(b.saved);
      router.refresh();
    } else if (state.error) toast.error(e.errors[state.error]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const field = (name: keyof RosterFields, label: string, opts: { type?: string; max: number; ph?: string; area?: boolean } = { max: 120 }) => (
    <div>
      <Label htmlFor={`b-${name}`}>{label}</Label>
      {opts.area ? (
        <Textarea id={`b-${name}`} name={name} defaultValue={(roster[name] as string | null) ?? ""} maxLength={opts.max} rows={2} placeholder={opts.ph} className="mt-1" />
      ) : (
        <Input id={`b-${name}`} name={name} type={opts.type ?? "text"} defaultValue={(roster[name] as string | null) ?? ""} maxLength={opts.max} placeholder={opts.ph} className="mt-1" />
      )}
    </div>
  );

  return (
    <details open={gaps.length > 0} className="group rounded-lg border border-border bg-card">
      <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 p-4">
        <span className="text-lg font-semibold">{b.title}</span>
        <span className="flex flex-wrap gap-1.5">
          {gaps.map((g) => (
            <span key={g} className={`${chip} border-red-200 bg-red-50 text-red-700`}>{copy.buildingGaps[g]}</span>
          ))}
        </span>
      </summary>
      <form action={action} className="space-y-6 border-t border-border p-4">
        <input type="hidden" name="id" value={roster.id} />
        <input type="hidden" name="lang" value={lang} />
        <div className="grid gap-3 sm:grid-cols-2">
          {field("building_name", b.name, { max: 160 })}
          {field("address", b.address, { max: 240 })}
          {field("city", b.city, { max: 80 })}
          <div>
            <Label htmlFor="b-province">{b.province[country]}</Label>
            <select id="b-province" name="province" defaultValue={roster.province ?? ""} className={`${selectClass} mt-1`}>
              <option value="">{b.pick}</option>
              {provinces.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>
        </div>

        <fieldset className="space-y-3">
          <legend className="text-sm font-semibold">{b.onCallTitle}</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            {field("on_call_name", b.onCallName, { max: 120 })}
            {field("on_call_phone", b.onCallPhone, { type: "tel", max: 40 })}
          </div>
          {field("on_call_notes", b.onCallNotes, { max: 300, ph: b.onCallNotesPh, area: true })}
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="text-sm font-semibold">{b.shutoffTitle}</legend>
          <div className="grid gap-3 sm:grid-cols-3">
            {field("shutoff_water", b.water, { max: 300, ph: b.locationPh, area: true })}
            {field("shutoff_gas", b.gas, { max: 300, area: true })}
            {field("shutoff_electric", b.electric[country], { max: 300, area: true })}
          </div>
          {field("shutoff_notes", b.shutoffNotes, { max: 600, area: true })}
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="text-sm font-semibold">{b.numbersTitle}</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            {field("emergency_line", b.emergencyLine, { type: "tel", max: 40 })}
            {field("non_emergency_line", b.nonEmergency, { type: "tel", max: 40 })}
          </div>
          {field("other_numbers", b.otherNumbers, { max: 600, ph: b.otherNumbersPh, area: true })}
        </fieldset>

        <Button type="submit" disabled={pending}>{pending ? b.saving : b.save}</Button>
      </form>
    </details>
  );
}

// ── Share links ──────────────────────────────────────────────────────

function SharePanel({ rosterId, links, copy }: { rosterId: string; links: LinkView[]; copy: EditorCopy }) {
  const s = copy.editor.share;
  const e = copy.editor;
  const lang = useLang();
  const router = useRouter();
  const [label, setLabel] = useState("");
  const [pending, start] = useTransition();
  const url = (token: string) => `${window.location.origin}${localizePath(sharePath(token), lang)}`;

  const copyLink = async (token: string) => {
    try {
      await navigator.clipboard.writeText(url(token));
      toast.success(s.copied);
    } catch {
      window.prompt(s.copy, url(token));
    }
  };

  const create = () =>
    start(async () => {
      const res = await createShareLinkAction(rosterId, label);
      if (res.error) toast.error(res.error === "limit" ? s.limit : e.errors[res.error]);
      else if (res.token) {
        setLabel("");
        toast.success(s.created);
        await copyLink(res.token);
        router.refresh();
      }
    });

  const revoke = (id: string) => {
    if (!window.confirm(s.confirmRevoke)) return;
    start(async () => {
      const res = await revokeShareLinkAction(id);
      if (res.error) toast.error(e.errors[res.error]);
      else {
        toast.success(s.revoked);
        router.refresh();
      }
    });
  };

  return (
    <section id="share" aria-labelledby="share-title" className="scroll-mt-20 rounded-lg border border-border bg-card p-4">
      <h2 id="share-title" className="flex items-center gap-2 text-lg font-semibold">
        <Link2 className="size-5" /> {s.title}
      </h2>
      <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{s.body}</p>
      {links.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">{s.none}</p>
      ) : (
        <ul className="mt-3 divide-y divide-border rounded-md border border-border">
          {links.map((l) => (
            <li key={l.id} className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5">
              <div className="min-w-0 text-sm">
                <div className="font-medium">{l.label || s.untitled}</div>
                <div className="text-xs text-muted-foreground">
                  {fmt(s.createdOn, { date: formatDate(l.createdAt, lang) })} · {l.viewCount ? plural(l.viewCount, s.views, { n: l.viewCount }) : s.never}
                </div>
              </div>
              <div className="flex gap-2">
                <Button type="button" size="sm" variant="outline" onClick={() => copyLink(l.token)}>
                  <Copy className="size-3.5" /> {s.copy}
                </Button>
                <Button type="button" size="sm" variant="destructive" onClick={() => revoke(l.id)} disabled={pending}>
                  {s.revoke}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <div className="min-w-[14rem] flex-1">
          <Label htmlFor="share-label">{s.label}</Label>
          <Input id="share-label" value={label} onChange={(ev) => setLabel(ev.target.value)} placeholder={s.labelPh} maxLength={80} className="mt-1" />
        </div>
        <Button type="button" onClick={create} disabled={pending}>
          <Link2 className="size-4" /> {pending ? s.creating : s.create}
        </Button>
      </div>
    </section>
  );
}

function DeleteBuilding({ roster, copy }: { roster: RosterFields; copy: EditorCopy }) {
  const d = copy.editor.danger;
  const e = copy.editor;
  const lang = useLang();
  const router = useRouter();
  const [pending, start] = useTransition();
  const remove = () => {
    if (!window.confirm(fmt(d.confirm, { building: roster.building_name }))) return;
    start(async () => {
      const res = await deleteRosterAction(roster.id);
      if (res.error) toast.error(e.errors[res.error]);
      else {
        toast.success(d.deleted);
        router.push(localizePath("/pm-dashboard/roster", lang));
        router.refresh();
      }
    });
  };
  return (
    <div className="flex justify-end">
      <Button type="button" variant="destructive" onClick={remove} disabled={pending}>
        <Trash2 className="size-4" /> {d.delete}
      </Button>
    </div>
  );
}
