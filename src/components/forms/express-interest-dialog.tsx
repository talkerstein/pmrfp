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

export function ExpressInterestDialog({
  rfpId,
  rfpTitle,
}: {
  rfpId: string;
  rfpTitle: string;
}) {
  const t = useT("boardClient").interest;
  const ta = useT("portfolioClient").attach;
  const lang = useLang();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [done, setDone] = useState(false);
  // The company's published projects, loaded when the dialog first opens.
  const [projects, setProjects] = useState<AttachOption[] | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [noAccount, setNoAccount] = useState(false);

  useEffect(() => {
    if (!open || projects !== null) return;
    let live = true;
    fetch("/api/projects", { headers: { Accept: "application/json" } })
      .then((r) => {
        // Not a company account (or signed out): no projects section at all.
        if (!r.ok) setNoAccount(true);
        return r.ok ? r.json() : { projects: [] };
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
          caseStudyIds: picked.length ? picked : undefined,
          acceptDisclaimer: true,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.status === 403) return toast.error(t.proRequired);
      if (res.status === 401) return toast.error(t.signIn);
      // The API's message is English; other languages use their own copy.
      if (res.status === 409) return toast.error(lang === "en" ? (json.error ?? t.already) : t.already);
      if (!res.ok) throw new Error();
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

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button><Send className="size-4" /> {t.trigger}</Button>} />
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t.title}</DialogTitle>
          <DialogDescription>{rfpTitle}</DialogDescription>
        </DialogHeader>

        {done ? (
          <div className="py-4">
            <p className="font-medium text-success">{t.doneTitle}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {t.doneBody}
            </p>
            <DialogFooter className="mt-6">
              <Button onClick={() => setOpen(false)}>{t.close}</Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4">
            <Field label={t.message} hint={t.messageHint}>
              <Textarea name="message" rows={4} required maxLength={2000} />
            </Field>
            <Field label={t.experience}>
              <Textarea name="relevantExperience" rows={2} maxLength={2000} />
            </Field>
            <Field label={t.availability}>
              <Input name="availability" />
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
