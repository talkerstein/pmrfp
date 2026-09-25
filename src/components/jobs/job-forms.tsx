"use client";

import { useActionState, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createJobAction, setJobStatusAction, type JobFormState } from "@/lib/jobs/actions";
import { EMPLOYMENT_LABEL, EMPLOYMENT_TYPES } from "@/lib/jobs/rules";

type Option = { slug: string; name: string };

const SELECT =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function Field({ label, hint, children, className }: { label: string; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <Label className="mb-1.5 flex items-center justify-between">
        {label}
        {hint && <span className="text-xs font-normal text-muted-foreground">{hint}</span>}
      </Label>
      {children}
    </div>
  );
}

/** Post a job. Trade and region come from the directory taxonomy. */
export function JobPostForm({ trades, regions }: { trades: Option[]; regions: Option[] }) {
  const [state, action, pending] = useActionState<JobFormState, FormData>(createJobAction, {});
  return (
    <form action={action} className="grid gap-5 sm:grid-cols-2">
      <Field label="Job title" className="sm:col-span-2">
        <Input name="title" required minLength={4} maxLength={120} placeholder="Licensed electrician (309A)" />
      </Field>
      <Field label="Trade">
        <select name="category" required defaultValue="" className={SELECT}>
          <option value="" disabled>
            Pick the trade
          </option>
          {trades.map((t) => (
            <option key={t.slug} value={t.slug}>
              {t.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Type of job">
        <select name="employmentType" required defaultValue="full_time" className={SELECT}>
          {EMPLOYMENT_TYPES.map((t) => (
            <option key={t} value={t}>
              {EMPLOYMENT_LABEL[t]}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Region">
        <select name="region" required defaultValue="" className={SELECT}>
          <option value="" disabled>
            Pick the region
          </option>
          {regions.map((r) => (
            <option key={r.slug} value={r.slug}>
              {r.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="City or area">
        <Input name="city" required minLength={2} maxLength={80} placeholder="Vaughan" />
      </Field>
      <Field label="Pay" hint="Optional, but jobs with pay get more applicants" className="sm:col-span-2">
        <div className="grid grid-cols-[1fr_auto_1fr_auto] items-center gap-2">
          <Input name="payMin" type="number" min={0} step="0.01" placeholder="From" aria-label="Pay from" />
          <span className="text-sm text-muted-foreground">to</span>
          <Input name="payMax" type="number" min={0} step="0.01" placeholder="To" aria-label="Pay to" />
          <select name="payUnit" defaultValue="hour" className={SELECT} aria-label="Pay per">
            <option value="hour">an hour</option>
            <option value="day">a day</option>
            <option value="year">a year</option>
            <option value="project">for the job</option>
          </select>
        </div>
      </Field>
      <Field label="About the job" className="sm:col-span-2">
        <Textarea
          name="description"
          required
          minLength={40}
          maxLength={5000}
          rows={6}
          placeholder="What the work is, the sites you work on, hours, what a normal day looks like, and what you offer (benefits, truck, tools, overtime)."
        />
      </Field>
      <Field label="Requirements" hint="Optional" className="sm:col-span-2">
        <Textarea
          name="requirements"
          maxLength={3000}
          rows={3}
          placeholder="Licences and tickets (309A, Working at Heights, WHMIS), years of experience, driver's licence…"
        />
      </Field>
      <div className="flex flex-wrap items-center gap-4 sm:col-span-2">
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? "Posting…" : "Post the job"}
        </Button>
        {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      </div>
    </form>
  );
}

/** Apply without an account; the employer gets it by email. */
export function JobApplyForm({ slug, company }: { slug: string; company: string }) {
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setState("sending");
    setError(null);
    try {
      const years = fd.get("experienceYears")?.toString().trim();
      const res = await fetch("/api/jobs/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug,
          name: fd.get("name"),
          email: fd.get("email"),
          phone: fd.get("phone") ?? "",
          experienceYears: years ? Number(years) : undefined,
          certifications: fd.get("certifications") ?? "",
          message: fd.get("message") ?? "",
          company_website: fd.get("company_website") ?? "",
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Something went wrong. Please try again.");
      setState("sent");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
      setState("idle");
    }
  }

  if (state === "sent") {
    return (
      <div className="rounded-xl border border-teal-300 bg-teal-50/60 p-5">
        <p className="font-semibold">Application sent.</p>
        <p className="mt-1 text-sm text-muted-foreground">{company} has your details and will reply to you by email or phone.</p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <Input name="name" placeholder="Your name" required maxLength={80} />
      <Input name="email" type="email" placeholder="Your email" required maxLength={120} />
      <Input name="phone" type="tel" placeholder="Phone (optional)" maxLength={30} />
      <Input name="experienceYears" type="number" min={0} max={60} placeholder="Years of experience (optional)" />
      <Input name="certifications" placeholder="Licences and tickets (optional)" maxLength={500} />
      <Textarea name="message" placeholder="A few lines about you and your experience (optional)" rows={4} maxLength={2000} />
      <input type="text" name="company_website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" size="lg" className="w-full" disabled={state === "sending"}>
        {state === "sending" ? "Sending…" : "Apply now"}
      </Button>
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        No account needed. Your details go to {company} only.
      </p>
    </form>
  );
}

/** Close a job, or renew it for another 30 days. */
export function JobStatusButton({ jobId, action }: { jobId: string; action: "close" | "renew" }) {
  const [pending, start] = useTransition();
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const res = await setJobStatusAction(jobId, action);
          if (res.error) toast.error(res.error);
          else toast.success(action === "close" ? "Job closed." : "Job renewed for 30 days.");
        })
      }
    >
      {pending ? "…" : action === "close" ? "Close job" : "Renew 30 days"}
    </Button>
  );
}
