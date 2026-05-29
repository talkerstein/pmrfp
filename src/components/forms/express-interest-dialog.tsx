"use client";

import { useState } from "react";
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
import { COPY } from "@/lib/site";

export function ExpressInterestDialog({
  rfpId,
  rfpTitle,
}: {
  rfpId: string;
  rfpTitle: string;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [done, setDone] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!accepted) {
      toast.error("Please confirm you understand PMRFP does not guarantee the job.");
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
          acceptDisclaimer: true,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.status === 403) return toast.error("Trade Pro membership required to express interest.");
      if (res.status === 401) return toast.error("Please sign in to express interest.");
      if (res.status === 409) return toast.error(json.error ?? "You've already expressed interest.");
      if (!res.ok) throw new Error();
      setDone(true);
      toast.success("Interest submitted", {
        description: json.demo ? "Demo mode — connect Supabase to record this." : "We've notified the right people.",
      });
    } catch {
      toast.error("Could not submit. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button><Send className="size-4" /> Express Interest</Button>} />
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Express interest</DialogTitle>
          <DialogDescription>{rfpTitle}</DialogDescription>
        </DialogHeader>

        {done ? (
          <div className="py-4">
            <p className="font-medium text-success">Your interest has been submitted.</p>
            <p className="mt-1 text-sm text-muted-foreground">
              The property manager and PMRFP have been notified. PMRFP does not guarantee a response.
            </p>
            <DialogFooter className="mt-6">
              <Button onClick={() => setOpen(false)}>Close</Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4">
            <Field label="Message" hint="Introduce your company and why you're a fit.">
              <Textarea name="message" rows={4} required maxLength={2000} />
            </Field>
            <Field label="Relevant experience (optional)">
              <Textarea name="relevantExperience" rows={2} maxLength={2000} />
            </Field>
            <Field label="Estimated availability (optional)">
              <Input name="availability" />
            </Field>
            <label className="flex items-start gap-2 text-sm text-muted-foreground">
              <Checkbox checked={accepted} onCheckedChange={(v) => setAccepted(v === true)} className="mt-0.5" />
              <span>{COPY.interestDisclaimer}</span>
            </label>
            <DialogFooter>
              <Button type="submit" disabled={busy}>
                {busy ? "Submitting…" : "Submit interest"}
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
