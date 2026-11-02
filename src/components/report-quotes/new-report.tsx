"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileUp, ListPlus, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createManualReportAction } from "@/lib/report-quotes/actions";
import { MAX_REPORT_BYTES, REPORT_TYPES, type ReportCountry, type ReportType } from "@/lib/report-quotes/rules";
import { useLang } from "@/i18n/provider";
import { localizePath } from "@/i18n/config";
import { fmt } from "@/i18n/format";

export interface NewReportStrings {
  fileLabel: string;
  fileHint: string;
  typeLabel: string;
  cityLabel: string;
  regionLabel: string;
  regionPlaceholder: string;
  areaHint: string;
  submit: string;
  uploading: string;
  reading: string;
  privacy: string;
  capReached: string;
  manualTitle: string;
  manualBody: string;
  manualNameLabel: string;
  manualNameDefault: string;
  manualCta: string;
  errors: Record<string, string>;
  reportTypes: Record<ReportType, string>;
}

const selectClass = "h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm";
const DASH = "/pm-dashboard/report-to-quotes";

/**
 * Start a report: upload a PDF (the server stores it privately, then the AI
 * reads it) or type a list by hand. Either way the user lands in the same
 * review editor; a failed read never blocks them.
 */
export function NewReport({
  s,
  regions,
  country,
  uploadsLeft,
  limit,
  defaultRegion,
}: {
  s: NewReportStrings;
  /** Provinces (CA) or states (US): the organization's country only. */
  regions: readonly string[];
  country: ReportCountry;
  uploadsLeft: number;
  limit: number;
  defaultRegion: string;
}) {
  const router = useRouter();
  const lang = useLang();
  const fileRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<"idle" | "uploading" | "reading">("idle");
  const [error, setError] = useState<string | null>(null);
  const [manualError, setManualError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const capped = uploadsLeft <= 0;
  const busy = phase !== "idle";
  const err = (key: string) => s.errors[key] ?? s.errors.failed;

  async function upload(form: HTMLFormElement) {
    setError(null);
    const file = fileRef.current?.files?.[0];
    if (!file) return setError(err("empty"));
    if (file.size > MAX_REPORT_BYTES) return setError(err("tooBig"));
    const data = new FormData(form);
    setPhase("uploading");
    let id: string | null = null;
    try {
      const res = await fetch("/api/report-quotes/upload", { method: "POST", body: data });
      const json = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
      if (res.status === 429 && !json.error) throw new Error("rate");
      if (!res.ok || !json.id) throw new Error(json.error || "upload");
      id = json.id;
    } catch (e) {
      setPhase("idle");
      return setError(err(e instanceof Error ? e.message : "upload"));
    }
    setPhase("reading");
    let failed = false;
    try {
      const res = await fetch("/api/report-quotes/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const json = (await res.json().catch(() => ({}))) as { status?: string };
      failed = !res.ok || json.status !== "done";
    } catch {
      failed = true;
    }
    // Never a dead end: the editor opens either way, with a note when the read failed.
    router.push(localizePath(`${DASH}/${id}${failed ? "?read=failed" : ""}`, lang));
  }

  function startManual(form: HTMLFormElement) {
    setManualError(null);
    const data = new FormData(form);
    startTransition(async () => {
      const result = await createManualReportAction({
        title: String(data.get("title") ?? "").trim() || s.manualNameDefault,
        reportType: (String(data.get("reportType") ?? "home_inspection") as ReportType),
        city: String(data.get("city") ?? ""),
        region: String(data.get("region") ?? ""),
      });
      if (!result.ok) return setManualError(err(result.error));
      router.push(localizePath(`${DASH}/${result.id}`, lang));
    });
  }

  const placeFields = (prefix: string) => (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="space-y-1.5">
        <Label htmlFor={`${prefix}-city`}>{s.cityLabel}</Label>
        <Input id={`${prefix}-city`} name="city" maxLength={120} autoComplete="address-level2" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${prefix}-region`}>{s.regionLabel}</Label>
        <select id={`${prefix}-region`} name="region" defaultValue={defaultRegion} className={selectClass} data-country={country}>
          <option value="">{s.regionPlaceholder}</option>
          {regions.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </div>
    </div>
  );

  const typeField = (prefix: string) => (
    <div className="space-y-1.5">
      <Label htmlFor={`${prefix}-type`}>{s.typeLabel}</Label>
      <select id={`${prefix}-type`} name="reportType" defaultValue="home_inspection" className={selectClass}>
        {REPORT_TYPES.map((t) => (
          <option key={t} value={t}>
            {s.reportTypes[t]}
          </option>
        ))}
      </select>
    </div>
  );

  return (
    <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
      <form
        className="space-y-4 rounded-2xl border border-border bg-card p-5 sm:p-6"
        onSubmit={(e) => {
          e.preventDefault();
          if (!busy && !capped) void upload(e.currentTarget);
        }}
      >
        <div className="space-y-1.5">
          <Label htmlFor="rq-file">{s.fileLabel}</Label>
          <Input id="rq-file" ref={fileRef} name="file" type="file" accept="application/pdf,.pdf" disabled={busy || capped} required />
          <p className="text-xs text-muted-foreground">{s.fileHint}</p>
        </div>
        {typeField("up")}
        {placeFields("up")}
        <p className="text-xs text-muted-foreground">{s.areaHint}</p>
        <p className="flex gap-2 rounded-lg bg-secondary/50 p-3 text-xs leading-relaxed text-muted-foreground">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-teal-700" />
          {s.privacy}
        </p>
        {capped && <p className="text-sm font-medium text-amber-800">{fmt(s.capReached, { limit })}</p>}
        {error && (
          <p role="alert" className="text-sm font-medium text-destructive">
            {error}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={busy || capped}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <FileUp className="size-4" />}
            {phase === "uploading" ? s.uploading : phase === "reading" ? s.reading : s.submit}
          </Button>
        </div>
      </form>

      <form
        className="space-y-4 rounded-2xl border border-dashed border-border bg-card/50 p-5 sm:p-6"
        onSubmit={(e) => {
          e.preventDefault();
          if (!pending) startManual(e.currentTarget);
        }}
      >
        <div>
          <h3 className="font-semibold">{s.manualTitle}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{s.manualBody}</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="mn-title">{s.manualNameLabel}</Label>
          <Input id="mn-title" name="title" maxLength={160} placeholder={s.manualNameDefault} />
        </div>
        {typeField("mn")}
        {placeFields("mn")}
        {manualError && (
          <p role="alert" className="text-sm font-medium text-destructive">
            {manualError}
          </p>
        )}
        <Button type="submit" variant="outline" disabled={pending}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : <ListPlus className="size-4" />}
          {s.manualCta}
        </Button>
      </form>
    </div>
  );
}
