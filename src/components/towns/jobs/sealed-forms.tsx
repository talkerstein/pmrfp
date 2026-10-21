"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Lock, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  breakGlassAction,
  cancelOpeningAction,
  confirmOpeningAction,
  publishAwardAction,
  requestOpeningAction,
  resendWitnessAction,
  saveRecommendationAction,
  witnessConfirmAction,
  type BreakGlassState,
  type PartCState,
} from "@/lib/town-jobs/part-c-actions";
import type { OwnSealedQuote } from "@/lib/town-jobs/sealed";
import { useLang, useT } from "@/i18n/provider";
import { fmt, formatDate } from "@/i18n/format";
import type { ClientMessages } from "@/i18n/dictionaries";

/**
 * PMRFP for Towns, Part C, in the browser: the sealed box's opening buttons
 * (ask, confirm, cancel, resend the witness link), the recommendation and
 * award forms, a trade's sealed quote (send, replace, withdraw), the
 * witness's confirmation, the print button and the admin's break-glass.
 * Each posts to lib/town-jobs/part-c-actions (or /api/town-jobs/sealed-quote)
 * and shows its answer in the page's language.
 */

type T = ClientMessages["townResultsClient"];

const errorOf = (t: T, code: string | undefined) => (code ? (t.errors[code] ?? t.errors.failed) : null);
const spin = <Loader2 className="size-3.5 animate-spin" />;

function useToast(state: PartCState, ok: (s: PartCState) => string | null, t: T) {
  const seen = useRef<PartCState | null>(null);
  useEffect(() => {
    if (seen.current === state || (!state.done && !state.error)) return;
    seen.current = state;
    if (state.error) toast.error(errorOf(t, state.error));
    else {
      const m = ok(state);
      if (m) toast.success(m);
    }
  }, [state, ok, t]);
}

const Hidden = ({ rfpId }: { rfpId: string }) => {
  const lang = useLang();
  return (
    <>
      <input type="hidden" name="rfpId" value={rfpId} />
      <input type="hidden" name="lang" value={lang} />
    </>
  );
};

function doneText(t: T, s: PartCState): string | null {
  const off = s.emailsOn === false ? ` ${t.open.done.emailsOff}` : "";
  if (s.done === "requested") return `${s.mode === "witness" ? t.open.done.requestedWitness : t.open.done.requested}${off}`;
  if (s.done === "opened") return t.open.done.opened;
  if (s.done === "cancelled") return t.open.done.cancelled;
  if (s.done === "resent") return `${t.open.done.resent}${off}`;
  return null;
}

/** "Open quotes" (after closing). A one-person town names its witness here. */
export function OpenQuotesForm({ rfpId, witness }: { rfpId: string; witness: boolean }) {
  const t = useT("townResultsClient");
  const [state, action, busy] = useActionState(requestOpeningAction, {} as PartCState);
  useToast(state, (s) => doneText(t, s), t);
  return (
    <form action={action} className="space-y-3" data-form="open-quotes">
      <Hidden rfpId={rfpId} />
      {witness && (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="mb-1 block font-medium">{t.open.witnessName}</span>
            <Input name="witnessName" required minLength={2} maxLength={120} autoComplete="off" />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">{t.open.witnessEmail}</span>
            <Input name="witnessEmail" type="email" required maxLength={254} autoComplete="off" />
          </label>
          <p className="text-xs text-muted-foreground sm:col-span-2">{t.open.witnessHint}</p>
        </div>
      )}
      {state.error && <p className="text-sm text-red-700" role="alert">{errorOf(t, state.error)}</p>}
      <Button type="submit" disabled={busy}>
        {busy ? spin : <Lock className="size-4" />} {t.open.button}
      </Button>
    </form>
  );
}

/** A second person confirms (or the requester cancels / resends the witness link). */
export function OpeningButton({ rfpId, kind }: { rfpId: string; kind: "confirm" | "cancel" | "resend" }) {
  const t = useT("townResultsClient");
  const fn = kind === "confirm" ? confirmOpeningAction : kind === "cancel" ? cancelOpeningAction : resendWitnessAction;
  const [state, action, busy] = useActionState(fn, {} as PartCState);
  useToast(state, (s) => doneText(t, s), t);
  const label = kind === "confirm" ? t.open.confirm : kind === "cancel" ? t.open.cancel : t.open.resend;
  return (
    <form action={action} className="inline-block" data-form={`opening-${kind}`}>
      <Hidden rfpId={rfpId} />
      <Button type="submit" size={kind === "confirm" ? "default" : "sm"} variant={kind === "confirm" ? "default" : "outline"} disabled={busy}>
        {busy && spin} {label}
      </Button>
      {state.error && <p className="mt-1 text-sm text-red-700" role="alert">{errorOf(t, state.error)}</p>}
    </form>
  );
}

export interface ChoiceOption {
  id: string;
  label: string;
}

/** The town's recommendation and reason. */
export function RecommendForm({ rfpId, options, current, rationale }: { rfpId: string; options: ChoiceOption[]; current: string | null; rationale: string | null }) {
  const t = useT("townResultsClient");
  const [state, action, busy] = useActionState(saveRecommendationAction, {} as PartCState);
  useToast(state, () => t.recommend.saved, t);
  return (
    <form action={action} className="space-y-3" data-form="recommend">
      <Hidden rfpId={rfpId} />
      <label className="block text-sm">
        <span className="mb-1 block font-medium">{t.recommend.label}</span>
        <select name="interestId" required defaultValue={current ?? ""} className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm">
          <option value="">{t.recommend.choose}</option>
          {options.map((o) => (
            <option key={o.id} value={o.id}>{o.label}</option>
          ))}
        </select>
      </label>
      <label className="block text-sm">
        <span className="mb-1 block font-medium">{t.recommend.rationale}</span>
        <Textarea name="rationale" rows={3} required minLength={3} maxLength={2000} defaultValue={rationale ?? ""} placeholder={t.recommend.rationaleHint} />
      </label>
      {state.error && <p className="text-sm text-red-700" role="alert">{errorOf(t, state.error)}</p>}
      <Button type="submit" size="sm" disabled={busy}>{busy && spin} {t.recommend.save}</Button>
    </form>
  );
}

/** "Publish award" after the pick: winner, amount (optional), whether to show it, the date. */
export function AwardForm({ rfpId, winner, amount, amountPublic, date, today, published }: { rfpId: string; winner: string; amount: number | null; amountPublic: boolean; date: string; today: string; published: boolean }) {
  const t = useT("townResultsClient");
  const [state, action, busy] = useActionState(publishAwardAction, {} as PartCState);
  useToast(state, () => t.award.done, t);
  return (
    <form action={action} className="space-y-3" data-form="award">
      <Hidden rfpId={rfpId} />
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm sm:col-span-2">
          <span className="mb-1 block font-medium">{t.award.winner}</span>
          <Input name="winnerName" required minLength={2} maxLength={300} defaultValue={winner} />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">{t.award.amount}</span>
          <Input name="amount" inputMode="decimal" defaultValue={amount != null ? String(amount) : ""} />
          <span className="mt-1 block text-xs text-muted-foreground">{t.award.amountHint}</span>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">{t.award.date}</span>
          <Input name="awardDate" type="date" required max={today} defaultValue={date} />
        </label>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="amountPublic" defaultChecked={amountPublic} className="size-4" /> {t.award.showAmount}
      </label>
      {state.error && <p className="text-sm text-red-700" role="alert">{errorOf(t, state.error)}</p>}
      <Button type="submit" size="sm" disabled={busy}>{busy && spin} {published ? t.award.update : t.award.publish}</Button>
    </form>
  );
}

/** The witness's confirmation (the one-time link's page). */
export function WitnessConfirmForm({ rfpId, token, defaultName }: { rfpId: string; token: string; defaultName: string | null }) {
  const t = useT("townResultsClient");
  const [state, action, busy] = useActionState(witnessConfirmAction, {} as PartCState);
  if (state.done === "opened") return <p className="rounded-md border border-teal-300 bg-teal-50 p-4 text-sm text-teal-900" data-state="witnessed">{t.witness.done}</p>;
  return (
    <form action={action} className="space-y-3" data-form="witness">
      <input type="hidden" name="rfpId" value={rfpId} />
      <input type="hidden" name="token" value={token} />
      <label className="block text-sm">
        <span className="mb-1 block font-medium">{t.witness.name}</span>
        <Input name="name" required minLength={2} maxLength={120} defaultValue={defaultName ?? ""} autoComplete="name" />
        <span className="mt-1 block text-xs text-muted-foreground">{t.witness.nameHint}</span>
      </label>
      {state.error && <p className="text-sm text-red-700" role="alert">{errorOf(t, state.error)}</p>}
      <Button type="submit" disabled={busy}>{busy && spin} {t.witness.confirm}</Button>
    </form>
  );
}

/** The council summary's "Print or save as PDF". */
export function PrintButton() {
  const t = useT("townResultsClient");
  return (
    <span className="print:hidden">
      <Button type="button" onClick={() => window.print()}>
        <Printer className="size-4" /> {t.print.button}
      </Button>
      <span className="ml-2 text-xs text-muted-foreground">{t.print.hint}</span>
    </span>
  );
}

/**
 * A trade's sealed quote on the listing: send it, replace it, withdraw it
 * until closing. Posts to /api/town-jobs/sealed-quote; the database decides
 * (closing time, membership) and the page refreshes.
 */
export function SealedQuoteBox({ rfpId, own, closed, closesLabel, timeZone }: { rfpId: string; own: OwnSealedQuote | null; closed: boolean; closesLabel: string; timeZone: string }) {
  const t = useT("townResultsClient");
  const lang = useLang();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const active = own?.status === "active";
  const [editing, setEditing] = useState(!active);
  const day = (d: string | null | undefined) => (d ? formatDate(d, lang, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZone, timeZoneName: "short" }) : "—");

  async function send(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setBusy(true);
    try {
      const res = await fetch("/api/town-jobs/sealed-quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rfpId,
          message: String(fd.get("message") ?? ""),
          quoteAmount: String(fd.get("quoteAmount") ?? "") || undefined,
          quoteKind: fd.get("quoteKind") === "estimate" ? "estimate" : "firm",
          quoteNotes: String(fd.get("quoteNotes") ?? "") || undefined,
          startDate: String(fd.get("startDate") ?? ""),
          lang,
          acceptDisclaimer: fd.get("accept") === "on",
        }),
      });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; action?: "received" | "replaced"; reason?: string };
      if (!res.ok || !body.ok) {
        toast.error(errorOf(t, body.reason ?? "failed"));
        return;
      }
      toast.success(t.quote.done[body.action ?? "received"]);
      setEditing(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function withdraw() {
    if (!window.confirm(t.quote.withdrawConfirm)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/town-jobs/sealed-quote?rfpId=${encodeURIComponent(rfpId)}&lang=${lang}`, { method: "DELETE" });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; reason?: string };
      if (!res.ok || !body.ok) {
        toast.error(errorOf(t, body.reason ?? "failed"));
        return;
      }
      toast.success(t.quote.done.withdrawn);
      setEditing(true);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (own?.status === "opened") return <p className="small" data-sealed-quote="opened">{t.quote.opened}</p>;
  return (
    <div data-sealed-quote={own?.status ?? "none"}>
      <p className="small muted">{t.quote.intro} {closesLabel}</p>
      {active && own ? (
        <div style={{ margin: "10px 0" }}>
          <p>
            <b>{own.quote_amount != null ? Number(own.quote_amount).toLocaleString(lang === "fr" ? "fr-CA" : lang === "es" ? "es-US" : "en-CA", { style: "currency", currency: "CAD" }) : "—"}</b>
            {own.quote_kind ? ` (${own.quote_kind === "firm" ? t.quote.firm : t.quote.estimate})` : ""}
          </p>
          <p className="small muted">{fmt(t.quote.yours, { date: day(own.updated_at), v: own.version })} {t.quote.latest}</p>
        </div>
      ) : own?.status === "withdrawn" ? (
        <p className="small muted">{fmt(t.quote.withdrawn, { date: day(own.withdrawn_at) })}</p>
      ) : (
        <p className="small muted">{t.quote.none}</p>
      )}
      {closed ? (
        <p className="small">{t.quote.closed}</p>
      ) : editing ? (
        <form onSubmit={send} className="space-y-3" style={{ marginTop: 10 }}>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1 block font-medium">{t.quote.price}</span>
              <Input name="quoteAmount" inputMode="decimal" placeholder={t.quote.pricePlaceholder} defaultValue={active && own?.quote_amount != null ? String(own.quote_amount) : ""} />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium">{t.quote.kind}</span>
              <select name="quoteKind" defaultValue={own?.quote_kind ?? "firm"} className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm">
                <option value="firm">{t.quote.firm}</option>
                <option value="estimate">{t.quote.estimate}</option>
              </select>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium">{t.quote.start}</span>
              <Input name="startDate" type="date" defaultValue={active ? (own?.start_date ?? "") : ""} />
            </label>
          </div>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">{t.quote.notes}</span>
            <Textarea name="quoteNotes" rows={2} maxLength={2000} defaultValue={active ? (own?.quote_notes ?? "") : ""} />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">{t.quote.message}</span>
            <Textarea name="message" rows={4} required maxLength={2000} defaultValue={active ? (own?.message ?? "") : ""} placeholder={t.quote.messageHint} />
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="accept" required className="mt-0.5 size-4" /> <span>{t.quote.disclaimer}</span>
          </label>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={busy}>{busy ? spin : <Lock className="size-4" />} {active ? t.quote.replace : t.quote.send}</Button>
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap gap-2" style={{ marginTop: 10 }}>
          <Button type="button" variant="outline" onClick={() => setEditing(true)} disabled={busy}>{t.quote.change}</Button>
          <Button type="button" variant="outline" onClick={withdraw} disabled={busy}>{busy && spin} {t.quote.withdraw}</Button>
        </div>
      )}
      {editing && active && !closed && (
        <p className="small" style={{ marginTop: 8 }}>
          <button type="button" className="underline" onClick={withdraw} disabled={busy}>{t.quote.withdraw}</button>
        </p>
      )}
    </div>
  );
}

/** Admin break-glass (English: admin-only screen): a reason, then the box's contents, logged and told to the town. */
export function BreakGlassForm({ rfpId }: { rfpId: string }) {
  const [state, action, busy] = useActionState(breakGlassAction, {} as BreakGlassState);
  return (
    <div className="space-y-3" data-form="break-glass">
      <form action={action} className="space-y-2">
        <input type="hidden" name="rfpId" value={rfpId} />
        <Textarea name="reason" rows={2} required minLength={10} maxLength={1000} placeholder="Why you need to look before the town opens it (logged in the town's record, and the town is told)" />
        <Button type="submit" size="sm" variant="destructive" disabled={busy}>{busy && spin} Break the seal (audited)</Button>
      </form>
      {state.error && <p className="text-sm text-red-700" role="alert">{state.error === "reason" ? "Write the reason (at least 10 characters)." : state.error === "not_admin" ? "Admins only." : "Couldn't open it."}</p>}
      {state.quotes && (
        <table className="w-full text-sm" data-list="break-glass">
          <thead>
            <tr className="text-left text-xs text-muted-foreground"><th>Company</th><th>Quote</th><th>Kind</th><th>Start</th><th>Notes</th><th>Updated</th></tr>
          </thead>
          <tbody>
            {state.quotes.length === 0 ? (
              <tr><td colSpan={6} className="text-muted-foreground">No quotes in the box.</td></tr>
            ) : (
              state.quotes.map((q) => (
                <tr key={q.quote} className="border-t border-border align-top">
                  <td>{q.company ?? "—"}</td>
                  <td>{q.quote_amount != null ? `$${Number(q.quote_amount).toLocaleString("en-CA")}` : "—"}</td>
                  <td>{q.quote_kind ?? "—"}</td>
                  <td>{q.start_date ?? "—"}</td>
                  <td className="whitespace-pre-line">{q.quote_notes ?? ""}</td>
                  <td>{new Date(q.updated_at).toISOString().slice(0, 16).replace("T", " ")}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}
