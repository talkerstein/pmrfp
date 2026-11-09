"use client";

import { useActionState, useState } from "react";
import Link from "@/i18n/link";
import { ArrowRight } from "lucide-react";
import { saveListingStepAction } from "@/lib/dashboard/actions";
import type { ActionState } from "@/lib/auth/actions";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { LogoUploader } from "@/components/forms/logo-uploader";
import { useLang, useT } from "@/i18n/provider";
import { fmt } from "@/i18n/format";
import { FINISH_PATH, FULL_MAX, SHORT_MAX, TEAM_SIZES, type ListingStep } from "@/lib/organizations/listing-steps";

export interface ListingPreview {
  name: string;
  logoUrl: string | null;
  city: string | null;
  province: string | null;
  shortDescription: string | null;
  insurance: string | null;
  wsib: string | null;
  team: string | null;
}

/** The one question on screen, beside the listing as it stands. */
export function ListingFinishStep({
  step,
  initial,
  done,
  total,
  organizationId,
  preview,
}: {
  step: ListingStep;
  initial: string;
  done: number;
  total: number;
  organizationId: string;
  preview: ListingPreview;
}) {
  const [state, action, pending] = useActionState(saveListingStepAction, {} as ActionState);
  const t = useT("dashClient").finish;
  const c = useT("dashClient").company;
  const lang = useLang();
  const [value, setValue] = useState(initial);
  const q = t.steps[step];
  const pct = total ? Math.round((done / total) * 100) : 0;

  // What's being typed shows in the listing straight away.
  const live: ListingPreview = {
    ...preview,
    shortDescription: step === "short" ? value : preview.shortDescription,
    city: step === "city" ? value : preview.city,
    insurance: step === "insurance" ? value : preview.insurance,
    wsib: step === "wsib" ? value : preview.wsib,
    team: step === "team" ? value : preview.team,
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <form action={action} className="rounded-xl border border-border bg-card p-5 sm:p-6">
        <input type="hidden" name="lang" value={lang} />
        <input type="hidden" name="step" value={step} />
        <p className="text-sm text-muted-foreground">{fmt(t.progress, { done, total })}</p>
        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-secondary">
          <div className="h-full bg-indigo" style={{ width: `${pct}%` }} />
        </div>

        <h2 className="mt-6 text-xl font-semibold tracking-tight">{q.title}</h2>
        <p className="mt-1.5 max-w-prose text-sm leading-relaxed text-muted-foreground">{q.why}</p>

        <div className="mt-4">
          {step === "logo" && (
            <LogoUploader organizationId={organizationId} initialLogoUrl={initial || null} />
          )}
          {step === "short" && (
            <Textarea name="value" aria-label={q.title} rows={3} maxLength={SHORT_MAX} value={value} onChange={(e) => setValue(e.target.value)} placeholder={q.placeholder} />
          )}
          {step === "full" && (
            <Textarea name="value" aria-label={q.title} rows={6} maxLength={FULL_MAX} value={value} onChange={(e) => setValue(e.target.value)} placeholder={q.placeholder} />
          )}
          {step === "team" && (
            <>
              <Label htmlFor="listing-team" className="mb-1.5 block">{c.teamSize}</Label>
              <select
                id="listing-team"
                name="value"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                className="h-9 w-full max-w-xs rounded-md border border-input bg-transparent px-3 text-sm"
              >
                <option value="">{c.select}</option>
                {TEAM_SIZES.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </>
          )}
          {(step === "insurance" || step === "wsib" || step === "website" || step === "phone" || step === "city") && (
            <Input
              name="value"
              aria-label={q.title}
              type={step === "phone" ? "tel" : "text"}
              inputMode={step === "website" ? "url" : undefined}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={q.placeholder}
            />
          )}
        </div>

        {state.error && <p role="alert" className="mt-3 text-sm text-red-700">{state.error}</p>}

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Button type="submit" variant="accent" disabled={pending}>
            {pending ? c.saving : t.save} <ArrowRight className="size-4" />
          </Button>
          <Link href={`${FINISH_PATH}?after=${step}`} className={buttonVariants({ variant: "ghost" })}>
            {t.skip}
          </Link>
        </div>
      </form>

      <aside className="rounded-xl border border-border bg-card p-5" aria-label={t.previewTitle}>
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t.previewTitle}</p>
        <div className="mt-3 flex items-center gap-3">
          {live.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- the logo comes from our own storage at any size.
            <img src={live.logoUrl} alt="" className="size-12 rounded-md border border-border object-contain" />
          ) : (
            <span aria-hidden className="grid size-12 place-items-center rounded-md border border-dashed border-border text-lg font-semibold text-muted-foreground">
              {preview.name.slice(0, 1).toUpperCase()}
            </span>
          )}
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{live.name}</p>
            {(live.city || live.province) && <p className="truncate text-xs text-muted-foreground">{[live.city, live.province].filter(Boolean).join(", ")}</p>}
          </div>
        </div>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{live.shortDescription || t.previewEmpty}</p>
        {(live.insurance || live.wsib || live.team) && (
          <dl className="mt-3 space-y-1 border-t border-border pt-3 text-xs">
            {live.insurance && <div className="flex justify-between gap-3"><dt className="text-muted-foreground">{c.insurance}</dt><dd className="truncate font-medium">{live.insurance}</dd></div>}
            {live.wsib && <div className="flex justify-between gap-3"><dt className="text-muted-foreground">{c.wsib}</dt><dd className="truncate font-medium">{live.wsib}</dd></div>}
            {live.team && <div className="flex justify-between gap-3"><dt className="text-muted-foreground">{c.teamSize}</dt><dd className="truncate font-medium">{live.team}</dd></div>}
          </dl>
        )}
      </aside>
    </div>
  );
}
