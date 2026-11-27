"use client";

import { useMemo, useRef, useState } from "react";
import Link from "@/i18n/link";
import { ArrowRight } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useLang } from "@/i18n/provider";
import { fmt, formatDate, plural } from "@/i18n/format";
import type { Locale } from "@/i18n/config";
import type { Messages } from "@/i18n/dictionaries";
import { VENDOR_LIST_DRAFT_KEY, checkVendorList, sampleVendorList, type CertCountry, type CheckedVendor } from "@/lib/vendor-certs/rules";
import { CERT_CHIP } from "./chip";

type DemoCopy = Messages["certs"]["demo"];

function detail(v: CheckedVendor, t: DemoCopy["detail"], lang: Locale): string {
  if (v.status === "missing" || v.days == null || !v.expiresOn) return t.missing;
  if (v.status === "valid") return fmt(t.valid, { date: formatDate(v.expiresOn, lang) });
  if (v.status === "expired") return plural(-v.days, t.expired);
  return v.days === 0 ? t.expiresToday : plural(v.days, t.expiring);
}

/**
 * The landing page's try-it box: paste a vendor list and see each vendor's
 * status, worked out by the tracker's own import and status rules. Nothing
 * goes to the server. Pressing the button leaves a pasted list in this
 * browser so the tracker's import panel can offer it after sign-up.
 */
export function TrackerDemo({ t, country, today, ctaHref }: { t: DemoCopy; country: CertCountry; today: string; ctaHref: string }) {
  const lang = useLang();
  const sample = useMemo(() => sampleVendorList(t.sampleHeader, t.sampleRows, today), [t, today]);
  const [csv, setCsv] = useState(sample);
  const box = useRef<HTMLTextAreaElement>(null);
  const check = useMemo(() => checkVendorList(csv, country, today), [csv, country, today]);
  const isSample = csv === sample;
  const total = check.vendors.length;

  const keep = () => {
    try {
      if (!isSample && total > 0) window.localStorage.setItem(VENDOR_LIST_DRAFT_KEY, csv);
      else window.localStorage.removeItem(VENDOR_LIST_DRAFT_KEY);
    } catch {
      // Private mode or a full store: they can paste it again after sign-up.
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm sm:p-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <label htmlFor="tracker-demo-list" className="text-sm font-medium">
            {t.label}
          </label>
          <Textarea
            ref={box}
            id="tracker-demo-list"
            rows={7}
            spellCheck={false}
            value={csv}
            onChange={(e) => setCsv(e.target.value)}
            onFocus={(e) => {
              if (isSample) e.currentTarget.select();
            }}
            className="mt-1.5 font-mono text-xs"
          />
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{t.hint}</p>
          {isSample && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium">{t.sampleNote}</span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setCsv("");
                  box.current?.focus();
                }}
              >
                {t.clear}
              </Button>
            </div>
          )}
        </div>

        <div>
          <h3 className="text-sm font-medium">{t.resultsTitle}</h3>
          <p className="mt-1.5 text-base font-semibold" aria-live="polite">
            {total === 0 ? (
              <span className="text-sm font-normal text-muted-foreground">{t.empty}</span>
            ) : check.attention > 0 ? (
              plural(check.attention, t.summary, { total })
            ) : (
              fmt(t.allGood, { total })
            )}
          </p>
          {total > 0 && (
            <ul className="mt-3 max-h-72 divide-y divide-border overflow-y-auto rounded-lg border border-border">
              {check.vendors.map((v, i) => (
                <li key={`${v.name}-${i}`} className="flex items-center justify-between gap-3 px-3 py-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{v.name}</div>
                    <div className="text-xs text-muted-foreground">{detail(v, t.detail, lang)}</div>
                  </div>
                  <span className={`inline-flex shrink-0 rounded-full border px-2.5 py-0.5 text-xs font-medium ${CERT_CHIP[v.status]}`}>{t.status[v.status]}</span>
                </li>
              ))}
            </ul>
          )}
          {check.skipped.length > 0 && <p className="mt-2 text-xs text-muted-foreground">{fmt(t.skipped, { lines: check.skipped.slice(0, 30).join(", ") })}</p>}
          {check.truncated && <p className="mt-2 text-xs text-muted-foreground">{t.truncated}</p>}
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border pt-5">
        <Link href={ctaHref} onClick={keep} className={buttonVariants({ variant: "accent" })}>
          {t.keep} <ArrowRight className="size-4" />
        </Link>
        <p className="max-w-xl text-xs leading-relaxed text-muted-foreground">{t.keepNote}</p>
      </div>
    </div>
  );
}
