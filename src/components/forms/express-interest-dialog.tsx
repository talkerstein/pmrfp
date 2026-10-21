"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Send } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { useLang, useT } from "@/i18n/provider";
import { localizePath } from "@/i18n/config";
import { fmt } from "@/i18n/format";

/** Projects a trade can attach to one expression of interest. */
const MAX_ATTACH = 3;

interface AttachOption {
  id: string;
  title: string;
  visibility: string;
}

/** Free accounts: responses left this month (lib/pm-jobs/rules). Null = Trade Pro (unlimited) or unknown. */
export interface DialogAllowance {
  unlimited: boolean;
  left: number;
  limit: number;
}

const REASON_KEY = {
  limit: "limit",
  not_approved: "notApproved",
  role: "role",
  own_job: "ownJob",
  not_open: "notOpen",
  public_tender: "publicTender",
  suspended: "suspended",
  org: "org",
} as const;

export function ExpressInterestDialog({
  rfpId,
  rfpTitle,
  allowance = null,
  currency = "CAD",
  upgradeHref = "/dashboard/billing?plan=pro&interval=monthly",
}: {
  rfpId: string;
  rfpTitle: string;
  /** Shown for free accounts on PM jobs: "2 of 3 free responses left this month". */
  allowance?: DialogAllowance | null;
  currency?: "CAD" | "USD";
  upgradeHref?: string;
}) {
  const t = useT("boardClient").interest;
  const r = useT("pmJobsClient").respond;
  const ta = useT("portfolioClient").attach;
  const lang = useLang();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [done, setDone] = useState(false);
  const [left, setLeft] = useState<DialogAllowance | null>(allowance);
  // The company's published projects, loaded when the dialog first opens.
  const [projects, setProjects] = useState<AttachOption[] | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [noAccount, setNoAccount] = useState(false);
  const free = left && !left.unlimited ? left : null;
  const outOfFree = Boolean(free && free.left <= 0);

  useEffect(() => {
    if (!open || projects !== null) return;
    let live = true;
    fetch("/api/projects", { headers: { Accept: "application/json" } })
      .then((res) => {
        // Not a company account (or signed out): no projects section at all.
        if (!res.ok) setNoAccount(true);
        return res.ok ? res.json() : { projects: [] };
      })
      .then((body: { projects?: { id: string; title: string; status: string; visibility?: string }[] }) => {
        if (!live) return;
        setProjects(
          (body.projects ?? [])
            .filter((p) => p.status === "published")
            .map((p) => ({ id: p.id, title: p.title, visibility: p.visibility ?? "public" })),
        );
      })
      .catch(() => live && setProjects([]));
    return () => {
      live = false;
    };
  }, [open, projects]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!accepted) {
      toast.error(t.mustAccept);
      return;
    }
    const fd = new FormData(e.currentTarget);
    const amount = String(fd.get("quoteAmount") ?? "").trim();
    setBusy(true);
    try {
      const res = await fetch("/api/rfp-interest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rfpId,
          message: fd.get("message"),
          relevantExperience: fd.get("relevantExperience") || undefined,
          availability: fd.get("availability") || undefined,
          quoteAmount: amount || undefined,
          quoteKind: amount ? fd.get("quoteKind") || "estimate" : undefined,
          quoteNotes: fd.get("quoteNotes") || undefined,
          startDate: fd.get("startDate") || undefined,
          caseStudyIds: picked.length ? picked : undefined,
          lang,
          acceptDisclaimer: true,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string; reason?: string; demo?: boolean; allowance?: DialogAllowance };
      if (res.status === 401) return toast.error(t.signIn);
      // The API's message is English; other languages use their own copy.
      if (res.status === 409) return toast.error(lang === "en" ? (json.error ?? t.already) : t.already);
      const key = json.reason ? REASON_KEY[json.reason as keyof typeof REASON_KEY] : undefined;
      if (!res.ok && key) {
        if (json.reason === "limit") setLeft({ unlimited: false, left: 0, limit: free?.limit ?? 3 });
        return toast.error(fmt(r.errors[key], { limit: free?.limit ?? 3 }));
      }
      if (res.status === 403) return toast.error(t.proRequired);
      if (!res.ok) throw new Error();
      if (json.allowance) setLeft(json.allowance.unlimited ? null : json.allowance);
      setDone(true);
      toast.success(t.submitted, {
        description: json.demo ? t.demo : t.notified,
      });
    } catch {
      toast.error(t.error);
    } finally {
      setBusy(false);
    }
  }

  const allowanceLine = free ? (
    <p className="rounded-md border border-teal-300/60 bg-teal-50/60 px-3 py-2 text-xs text-foreground" data-allowance={free.left}>
      {free.left > 0 ? fmt(r.left, { left: free.left, limit: free.limit }) : fmt(r.none, { limit: free.limit })}{" "}
      <a href={localizePath(upgradeHref, lang)} className="font-semibold text-teal-ink underline">
        {r.upgrade}
      </a>
    </p>
  ) : null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button><Send className="size-4" /> {allowance ? r.trigger : t.trigger}</Button>} />
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{allowance ? r.title : t.title}</DialogTitle>
          <DialogDescription>{rfpTitle}</DialogDescription>
        </DialogHeader>

        {done ? (
          <div className="py-4">
            <p className="font-medium text-success">{t.doneTitle}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {t.doneBody}
            </p>
            {free && <div className="mt-3">{allowanceLine}</div>}
            <DialogFooter className="mt-6">
              <Button onClick={() => setOpen(false)}>{t.close}</Button>
            </DialogFooter>
          </div>
        ) : outOfFree ? (
          <div className="space-y-4 py-2">
            {allowanceLine}
            <DialogFooter>
              <a href={localizePath(upgradeHref, lang)} className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground">
                {r.upgrade}
              </a>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4">
            {allowanceLine}
            <Field label={t.message} hint={t.messageHint}>
              <Textarea name="message" rows={4} required maxLength={2000} />
            </Field>
            <fieldset className="rounded-lg border border-border p-3">
              <legend className="px-1 text-sm font-medium">{r.quoteTitle}</legend>
              <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                <Field label={r.quoteAmount} hint={fmt(r.quoteAmountHint, { currency })}>
                  <Input name="quoteAmount" inputMode="decimal" placeholder={currency === "USD" ? "12,500" : lang === "fr" ? "12 500" : "12,500"} maxLength={20} pattern="[0-9$,. ]*" />
                </Field>
                <Field label={r.kind}>
                  <select name="quoteKind" defaultValue="estimate" className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm">
                    <option value="estimate">{r.estimate}</option>
                    <option value="firm">{r.firm}</option>
                  </select>
                </Field>
              </div>
              <div className="mt-3">
                <Field label={r.quoteNotes}>
                  <Textarea name="quoteNotes" rows={2} maxLength={2000} />
                </Field>
              </div>
            </fieldset>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={r.startDate}>
                <Input type="date" name="startDate" />
              </Field>
              <Field label={t.availability}>
                <Input name="availability" maxLength={500} />
              </Field>
            </div>
            <Field label={t.experience}>
              <Textarea name="relevantExperience" rows={2} maxLength={2000} />
            </Field>
            {!noAccount && <fieldset className="rounded-lg border border-border p-3">
              <legend className="px-1 text-sm font-medium">{ta.title}</legend>
              <p className="text-xs text-muted-foreground">{fmt(ta.hint, { limit: MAX_ATTACH })}</p>
              {projects === null ? (
                <p className="mt-2 text-xs text-muted-foreground">{ta.loading}</p>
              ) : projects.length === 0 ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  {ta.none}{" "}
                  <a href={localizePath("/dashboard/projects/new", lang)} className="font-medium text-teal-ink hover:underline">
                    {ta.add}
                  </a>
                </p>
              ) : (
                <ul className="mt-2 max-h-44 space-y-1.5 overflow-y-auto">
                  {projects.map((p) => {
                    const on = picked.includes(p.id);
                    return (
                      <li key={p.id}>
                        <label className="flex items-start gap-2 text-sm">
                          <Checkbox
                            checked={on}
                            disabled={!on && picked.length >= MAX_ATTACH}
                            onCheckedChange={(v) =>
                              setPicked((prev) => (v === true ? [...prev, p.id].slice(0, MAX_ATTACH) : prev.filter((x) => x !== p.id)))
                            }
                            className="mt-0.5"
                          />
                          <span>
                            {p.title}
                            {p.visibility === "private" && <span className="block text-xs text-muted-foreground">{ta.privateNote}</span>}
                            {p.visibility === "unlisted" && <span className="block text-xs text-muted-foreground">{ta.unlistedNote}</span>}
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              )}
            </fieldset>}
            <p className="text-xs text-muted-foreground">{r.contactNote}</p>
            <label className="flex items-start gap-2 text-sm text-muted-foreground">
              <Checkbox checked={accepted} onCheckedChange={(v) => setAccepted(v === true)} className="mt-0.5" />
              <span>{t.disclaimer}</span>
            </label>
            <DialogFooter>
              <Button type="submit" disabled={busy}>
                {busy ? t.submitting : t.submit}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium">{label}</span>
      {hint && <span className="mb-1 block text-xs text-muted-foreground">{hint}</span>}
      {children}
    </label>
  );
}
