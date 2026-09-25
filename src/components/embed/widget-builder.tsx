"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Briefcase, Building2, ClipboardList, Lock, Radio, Users } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { SearchableSelect, type SearchableOption } from "@/components/ui/searchable-select";
import { Snippet } from "@/components/public/badge-embed";
import { cn } from "@/lib/utils";
import {
  DEFAULT_LIMIT,
  MAX_ITEMS,
  WIDGET_KINDS,
  iframeSnippet,
  scriptSnippet,
  widgetPath,
  type WidgetConfig,
  type WidgetKind,
  type WidgetTheme,
} from "@/lib/embed/widgets";

/** What the signed-in member can embed; null = not available to them yet. */
export interface WidgetAccess {
  bids: { slug: string; key: string } | null;
  jobs: { slug: string } | null;
  company: { slug: string; ready: boolean } | null;
  trusted: { handle: string } | null;
  signedIn: boolean;
}

const TABS: Record<WidgetKind, { label: string; who: string; icon: React.ReactNode; blurb: string }> = {
  feed: {
    label: "Live tender feed",
    who: "Associations, suppliers, trade blogs",
    icon: <Radio className="size-4" />,
    blurb: "Open tenders for a trade and region, updated every morning. Give your members or customers a reason to come back.",
  },
  bids: {
    label: "Your open bids",
    who: "Property managers",
    icon: <ClipboardList className="size-4" />,
    blurb: "Your open RFPs on your own \"Work with us\" page. Trades respond on PMRFP, and you compare them in one place.",
  },
  jobs: {
    label: "Your jobs",
    who: "Contractors hiring",
    icon: <Briefcase className="size-4" />,
    blurb: "Your open jobs on your careers page. People apply in a minute, and applications land in your inbox.",
  },
  company: {
    label: "Company card",
    who: "Trades and suppliers",
    icon: <Building2 className="size-4" />,
    blurb: "Your PMRFP profile as a card on your website, with a Request a quote button. Stronger than a badge.",
  },
  trusted: {
    label: "Trusted trades",
    who: "Realtors",
    icon: <Users className="size-4" />,
    blurb: "The contractors you recommend, on your own site. Clients stop texting you for phone numbers.",
  },
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
    }
  }, [kind, trade, region, access]);

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
        <div role="tablist" aria-label="Widget type" className="grid gap-2">
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
                {TABS[k].icon}
              </span>
              <span className="min-w-0">
                <span className="block font-semibold">{TABS[k].label}</span>
                <span className="block text-xs text-muted-foreground">For {TABS[k].who.toLowerCase()}</span>
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="min-w-0 space-y-6">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">{TABS[kind].label}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{TABS[kind].blurb}</p>
        </div>

        {config ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              {kind === "feed" && (
                <>
                  <Field label="Trade">
                    <SearchableSelect options={categories} value={trade} onChange={setTrade} allLabel="All trades" placeholder="All trades" />
                  </Field>
                  <Field label="Region">
                    <SearchableSelect options={regions} value={region} onChange={setRegion} allLabel="All regions" placeholder="All regions" />
                  </Field>
                </>
              )}
              <Field label="Style">
                <div className="grid grid-cols-2 gap-1 rounded-lg border border-border bg-secondary/40 p-1">
                  {(["light", "dark"] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setTheme(t)}
                      className={cn(
                        "rounded-md px-3 py-1.5 text-sm font-medium capitalize",
                        theme === t ? "bg-card shadow-sm" : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </Field>
              {kind !== "company" && (
                <Field label={`Show up to ${limit}`}>
                  <input
                    type="range"
                    min={1}
                    max={MAX_ITEMS}
                    value={limit}
                    onChange={(e) => setLimit(Number(e.target.value))}
                    className="h-9 w-full accent-[#0c7a5a]"
                    aria-label="How many items to show"
                  />
                </Field>
              )}
            </div>

            <div className={cn("rounded-xl border border-dashed border-border p-4 sm:p-6", theme === "dark" ? "bg-[#161834]" : "bg-secondary/40")}>
              <p className={cn("mb-3 text-xs font-medium", theme === "dark" ? "text-[#a9adce]" : "text-muted-foreground")}>
                Live preview
              </p>
              {previewSrc && (
                <iframe
                  key={previewSrc}
                  ref={frame}
                  src={previewSrc}
                  title="Widget preview"
                  style={{ height }}
                  className="block w-full max-w-[640px] border-0"
                />
              )}
            </div>

            <Snippet label="Paste this where you want it to appear" code={scriptSnippet(base, config, options)} />
            <details className="rounded-lg border border-border bg-card p-4">
              <summary className="cursor-pointer text-sm font-semibold">Site builder won&apos;t take scripts? Use an iframe</summary>
              <div className="mt-4">
                <Snippet label="iframe code (fixed height)" code={iframeSnippet(base, config, options)} />
              </div>
            </details>
            {kind === "bids" && (
              <p className="text-xs text-muted-foreground">
                Only RFPs you post with public contact details appear here. RFPs posted anonymously or through PMRFP stay private.
              </p>
            )}
            {kind === "company" && access.company && !access.company.ready && (
              <p className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
                Your card goes live once your company profile is approved. You can paste the code now.
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
  const next = `/widgets?w=${kind}`;
  const copy: Record<Exclude<WidgetKind, "feed">, { text: string; cta: string; href: string }> = {
    bids: signedIn
      ? { text: "This widget is for property managers. Post an RFP from a property manager account to get your code.", cta: "Post an RFP", href: "/pm-dashboard/rfps/new" }
      : { text: "Sign in to your property manager account to get the code for your open bids.", cta: "Sign in", href: sign(next) },
    jobs: signedIn
      ? { text: "Set up your company first, then post a job to get the code.", cta: "Post a job", href: "/jobs/post" }
      : { text: "Sign in to get the code for your company's open jobs.", cta: "Sign in", href: sign(next) },
    company: signedIn
      ? { text: "Company cards are for listed trades and suppliers. List your company free to get yours.", cta: "Complete my profile", href: "/dashboard/company" }
      : { text: "List your company free, then come back for your card.", cta: "List my company", href: "/sign-up" },
    trusted: signedIn
      ? { text: "Publish your trusted trades page first, then your code appears here.", cta: "Build my list", href: "/pm-dashboard/saved-vendors" }
      : { text: "Sign in to get the code for your trusted trades list.", cta: "Sign in", href: sign(next) },
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
