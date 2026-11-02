"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, Link2, Loader2, Printer, Unlink } from "lucide-react";
import Link from "@/i18n/link";
import { Button } from "@/components/ui/button";
import { CopyField } from "@/components/report-quotes/copy-field";
import { linkGroupRfpAction, setSummaryAddressAction, shareSummaryAction, unlinkGroupRfpAction } from "@/lib/report-quotes/summary-actions";
import type { Messages } from "@/i18n/dictionaries";
import { fmt, plural } from "@/i18n/format";

type Controls = Messages["reportQuotes"]["summary"]["controls"];

/**
 * The owner's panel above the Repair Cost Summary (never printed): print,
 * the read-only share link (on / replace / off; the link is shown once,
 * only its hash is stored), the street-address opt-in, and the attach hint
 * for the report's country.
 */
export function SummaryControls({
  reportId,
  sharePrefix,
  includeAddress,
  shareSince,
  openCount,
  attachHint,
  s,
}: {
  reportId: string;
  /** "/repair-summary" with the page's language prefix. */
  sharePrefix: string;
  includeAddress: boolean;
  /** The current link's start date, formatted; null = sharing off. */
  shareSince: string | null;
  openCount: number;
  attachHint: string;
  s: Controls;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [link, setLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function share(mode: "on" | "off") {
    setError(null);
    start(async () => {
      const res = await shareSummaryAction(reportId, mode);
      if (!res.ok) return setError(s.errors[res.error]);
      setLink(res.token ? `${window.location.origin}${sharePrefix}/${res.token}` : null);
      router.refresh();
    });
  }

  function toggleAddress(next: boolean) {
    setError(null);
    start(async () => {
      const res = await setSummaryAddressAction(reportId, next);
      if (!res.ok) return setError(s.errors[res.error]);
      router.refresh();
    });
  }

  const on = Boolean(shareSince) || Boolean(link);
  return (
    <section className="mx-auto mb-6 max-w-3xl space-y-4 rounded-2xl border border-border bg-card p-5 print:hidden">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold">{s.heading}</h2>
        <Button type="button" onClick={() => window.print()}>
          <Printer className="size-4" /> {s.print}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">{s.printHint}</p>

      <div className="rounded-lg border border-border p-4">
        <p className="text-sm font-semibold">{s.shareTitle}</p>
        {!on ? (
          <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">{s.shareOff}</p>
            <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => share("on")}>
              {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Link2 className="size-3.5" />} {s.shareOn}
            </Button>
          </div>
        ) : (
          <div className="mt-2 space-y-3">
            {link ? (
              <>
                <CopyField value={link} label={s.shareTitle} copy={s.copy} copied={s.copied} />
                <p className="text-xs text-muted-foreground">{s.copyOnce}</p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                {shareSince ? fmt(s.shareSince, { date: shareSince }) : null} {plural(openCount, s.opened)}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => share("on")}>
                {s.replace}
              </Button>
              <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => share("off")}>
                {s.turnOff}
              </Button>
            </div>
          </div>
        )}
        <p className="mt-3 text-xs text-muted-foreground">{s.shows}</p>
      </div>

      <label className="flex items-start gap-3 text-sm">
        <input type="checkbox" className="mt-1 size-4" checked={includeAddress} disabled={pending} onChange={(e) => toggleAddress(e.target.checked)} />
        <span>
          <span className="font-medium">{s.addressLabel}</span>
          <span className="block text-xs text-muted-foreground">{s.addressHint}</span>
        </span>
      </label>

      <p className="text-xs text-muted-foreground">{s.nameHint}</p>
      <p className="rounded-md bg-secondary/50 px-3 py-2 text-xs text-secondary-foreground">{attachHint}</p>
      {error && <p className="text-sm text-red-700">{error}</p>}
    </section>
  );
}

export interface GroupLink {
  linkId: string;
  rfpId: string;
  title: string;
}

/** Under each trade group on the owner's page: the RFPs it's linked to, and linking one by hand. */
export function GroupLinks({
  reportId,
  tradeSlug,
  linked,
  candidates,
  s,
}: {
  reportId: string;
  tradeSlug: string;
  linked: GroupLink[];
  candidates: { id: string; title: string }[];
  s: Controls;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [pick, setPick] = useState("");
  const [error, setError] = useState<string | null>(null);

  function run(fn: () => Promise<{ ok: true } | { ok: false; error: keyof Controls["errors"] }>) {
    setError(null);
    start(async () => {
      const res = await fn();
      if (!res.ok) return setError(s.errors[res.error]);
      setPick("");
      router.refresh();
    });
  }

  return (
    <div className="mt-4 rounded-lg border border-dashed border-border p-3 print:hidden">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{s.linkedTitle}</p>
      {linked.length > 0 && (
        <ul className="mt-2 space-y-1.5">
          {linked.map((l) => (
            <li key={l.linkId} className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="min-w-0 truncate">{l.title}</span>
              <span className="flex items-center gap-3">
                <Link href={`/pm-dashboard/rfps/${l.rfpId}/interests`} className="inline-flex items-center gap-1 text-xs font-medium text-teal-700 hover:underline">
                  {s.viewResponses} <ExternalLink className="size-3" />
                </Link>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => run(() => unlinkGroupRfpAction(reportId, l.linkId))}
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  <Unlink className="size-3" /> {s.unlink}
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
      {candidates.length > 0 ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <select
            value={pick}
            onChange={(e) => setPick(e.target.value)}
            aria-label={s.linkPick}
            className="h-8 min-w-0 flex-1 rounded-md border border-input bg-transparent px-2 text-sm"
          >
            <option value="">{s.linkPick}</option>
            {candidates.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
          <Button type="button" size="sm" variant="outline" disabled={!pick || pending} onClick={() => run(() => linkGroupRfpAction(reportId, tradeSlug, pick))}>
            {pending ? <Loader2 className="size-3.5 animate-spin" /> : null} {s.linkCta}
          </Button>
        </div>
      ) : (
        linked.length === 0 && <p className="mt-1 text-xs text-muted-foreground">{s.noCandidates}</p>
      )}
      {error && <p className="mt-2 text-xs text-red-700">{error}</p>}
    </div>
  );
}
