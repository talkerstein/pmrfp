"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "@/i18n/link";
import { Briefcase, Building2, ClipboardList, Landmark, Lock, Radio, Users } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { SearchableSelect, type SearchableOption } from "@/components/ui/searchable-select";
import { Snippet } from "@/components/public/badge-embed";
import { cn } from "@/lib/utils";
import { useLang, useT } from "@/i18n/provider";
import { fmt } from "@/i18n/format";
import {
  DEFAULT_LIMIT,
  MAX_ITEMS,
  WIDGET_KINDS,
  iframeSnippet,
  isWidgetLang,
  scriptSnippet,
  widgetPath,
  type WidgetConfig,
  type WidgetKind,
  type WidgetTheme,
} from "@/lib/embed/widgets";
import { BUYER_DASHBOARD_PATH, claimSignUpHref } from "@/lib/towns/paths";

/** What the signed-in member can embed; null = not available to them yet. */
export interface WidgetAccess {
  bids: { slug: string; key: string } | null;
  jobs: { slug: string } | null;
  company: { slug: string; ready: boolean } | null;
  trusted: { handle: string } | null;
  /** A public buyer page: the signed-in buyer's own, or the one a town page linked to (?town=). */
  townBids?: { province: string; slug: string } | null;
  signedIn: boolean;
}

/** Tab icons; labels, audiences and blurbs are in partnersClient.widgets.tabs. */
const TAB_ICONS: Record<WidgetKind, React.ReactNode> = {
  feed: <Radio className="size-4" />,
  bids: <ClipboardList className="size-4" />,
  jobs: <Briefcase className="size-4" />,
  company: <Building2 className="size-4" />,
  trusted: <Users className="size-4" />,
  "town-bids": <Landmark className="size-4" />,
};

function sign(next: string) {
  return `/sign-in?next=${encodeURIComponent(next)}`;
}

export function WidgetBuilder({
  base,
  initialKind,
  categories,
  regions,
  access,
}: {
  base: string;
  initialKind: WidgetKind;
  categories: SearchableOption[];
  regions: SearchableOption[];
  access: WidgetAccess;
}) {
  const t = useT("partnersClient").widgets;
  const pageLang = useLang();
  const [kind, setKind] = useState<WidgetKind>(initialKind);
  const [trade, setTrade] = useState<string | null>(null);
  const [region, setRegion] = useState<string | null>(null);
  const [theme, setTheme] = useState<WidgetTheme>("light");
  const [limit, setLimit] = useState(DEFAULT_LIMIT);
  const [height, setHeight] = useState(420);
  const frame = useRef<HTMLIFrameElement>(null);

  const config: WidgetConfig | null = useMemo(() => {
    switch (kind) {
      case "feed":
        return { kind, trade, region };
      case "bids":
        return access.bids ? { kind, ...access.bids } : null;
      case "jobs":
        return access.jobs ? { kind, slug: access.jobs.slug } : null;
      case "company":
        return access.company ? { kind, slug: access.company.slug } : null;
      case "trusted":
        return access.trusted ? { kind, handle: access.trusted.handle } : null;
      case "town-bids":
        // The widget speaks the language of the page it was copied from.
        return access.townBids ? { kind, ...access.townBids, lang: isWidgetLang(pageLang) ? pageLang : "en" } : null;
    }
  }, [kind, trade, region, access, pageLang]);

  const options = { theme, limit };
  // Relative src so the preview works on preview deploys too; the copied code uses the real site.
  const previewSrc = config ? `/embed/${widgetPath(config)}#theme=${theme}${kind === "company" ? "" : `&limit=${limit}`}` : null;

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.origin !== window.location.origin || e.source !== frame.current?.contentWindow) return;
      const d = e.data as { type?: string; height?: number } | null;
      if (d?.type === "pmrfp:height" && typeof d.height === "number" && d.height > 40) setHeight(Math.min(d.height, 2000));
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <div>
        <div role="tablist" aria-label={t.tablist} className="grid gap-2">
          {WIDGET_KINDS.map((k) => (
            <button
              key={k}
              role="tab"
              type="button"
              aria-selected={kind === k}
              onClick={() => setKind(k)}
              className={cn(
                "flex items-start gap-3 rounded-xl border p-4 text-left transition-colors",
                kind === k ? "border-teal-500 bg-accent/60 ring-1 ring-teal-500" : "border-border bg-card hover:border-teal-400",
              )}
            >
              <span
                className={cn(
                  "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg",
                  kind === k ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground",
                )}
              >
                {TAB_ICONS[k]}
              </span>
              <span className="min-w-0">
                <span className="block font-semibold">{t.tabs[k].label}</span>
                <span className="block text-xs text-muted-foreground">{t.tabs[k].for}</span>
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="min-w-0 space-y-6">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">{t.tabs[kind].label}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t.tabs[kind].blurb}</p>
        </div>

        {config ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              {kind === "feed" && (
                <>
                  <Field label={t.trade}>
                    <SearchableSelect options={categories} value={trade} onChange={setTrade} allLabel={t.allTrades} placeholder={t.allTrades} />
                  </Field>
                  <Field label={t.region}>
                    <SearchableSelect options={regions} value={region} onChange={setRegion} allLabel={t.allRegions} placeholder={t.allRegions} />
                  </Field>
                </>
              )}
              <Field label={t.style}>
                <div className="grid grid-cols-2 gap-1 rounded-lg border border-border bg-secondary/40 p-1">
                  {(["light", "dark"] as const).map((th) => (
                    <button
                      key={th}
                      type="button"
                      onClick={() => setTheme(th)}
                      className={cn(
                        "rounded-md px-3 py-1.5 text-sm font-medium capitalize",
                        theme === th ? "bg-card shadow-sm" : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {t.themes[th]}
                    </button>
                  ))}
                </div>
              </Field>
              {kind !== "company" && (
                <Field label={fmt(t.showUpTo, { n: limit })}>
                  <input
                    type="range"
                    min={1}
                    max={MAX_ITEMS}
                    value={limit}
                    onChange={(e) => setLimit(Number(e.target.value))}
                    className="h-9 w-full accent-[#0c7a5a]"
                    aria-label={t.howMany}
                  />
                </Field>
              )}
            </div>

            <div className={cn("rounded-xl border border-dashed border-border p-4 sm:p-6", theme === "dark" ? "bg-[#161834]" : "bg-secondary/40")}>
              <p className={cn("mb-3 text-xs font-medium", theme === "dark" ? "text-[#a9adce]" : "text-muted-foreground")}>
                {t.preview}
              </p>
              {previewSrc && (
                <iframe
                  key={previewSrc}
                  ref={frame}
                  src={previewSrc}
                  title={t.previewTitle}
                  style={{ height }}
                  className="block w-full max-w-[640px] border-0"
                />
              )}
            </div>

            <Snippet label={t.paste} code={scriptSnippet(base, config, options)} />
            <details className="rounded-lg border border-border bg-card p-4">
              <summary className="cursor-pointer text-sm font-semibold">{t.iframeSummary}</summary>
              <div className="mt-4">
                <Snippet label={t.iframeLabel} code={iframeSnippet(base, config, options)} />
              </div>
            </details>
            {kind === "bids" && (
              <p className="text-xs text-muted-foreground">
                {t.bidsNote}
              </p>
            )}
            {kind === "company" && access.company && !access.company.ready && (
              <p className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
                {t.companyPending}
              </p>
            )}
          </>
        ) : (
          <Locked kind={kind} signedIn={access.signedIn} />
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

/** What to do to unlock a widget that needs an account, listing or published page. */
function Locked({ kind, signedIn }: { kind: WidgetKind; signedIn: boolean }) {
  const t = useT("partnersClient").widgets;
  const l = t.locked;
  const next = `/widgets?w=${kind}`;
  const copy: Record<Exclude<WidgetKind, "feed">, { text: string; cta: string; href: string }> = {
    bids: signedIn
      ? { text: l.bids.in, cta: l.bids.inCta, href: "/pm-dashboard/rfps/new" }
      : { text: l.bids.out, cta: t.signIn, href: sign(next) },
    jobs: signedIn
      ? { text: l.jobs.in, cta: l.jobs.inCta, href: "/jobs/post" }
      : { text: l.jobs.out, cta: t.signIn, href: sign(next) },
    company: signedIn
      ? { text: l.company.in, cta: l.company.inCta, href: "/dashboard/company" }
      : { text: l.company.out, cta: l.company.outCta, href: "/sign-up" },
    trusted: signedIn
      ? { text: l.trusted.in, cta: l.trusted.inCta, href: "/pm-dashboard/saved-vendors" }
      : { text: l.trusted.out, cta: t.signIn, href: sign(next) },
    "town-bids": signedIn
      ? { text: l["town-bids"].in, cta: l["town-bids"].inCta, href: BUYER_DASHBOARD_PATH }
      : { text: l["town-bids"].out, cta: l["town-bids"].inCta, href: claimSignUpHref(null) },
  };
  if (kind === "feed") return null;
  const c = copy[kind];
  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <span className="flex size-10 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
        <Lock className="size-4" />
      </span>
      <p className="mt-3 text-sm">{c.text}</p>
      <Link href={c.href} className={cn(buttonVariants(), "mt-4")}>
        {c.cta}
      </Link>
    </div>
  );
}
