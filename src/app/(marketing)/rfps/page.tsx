import type { Metadata } from "next";
import Link from "next/link";
import { Lock } from "lucide-react";
import { Container, Eyebrow } from "@/components/container";
import { FilterBar } from "@/components/public/filter-bar";
import { RfpCard } from "@/components/public/rfp-card";
import { EmptyState } from "@/components/public/empty-state";
import { ReferBanner } from "@/components/public/refer-banner";
import { FoundingBanner } from "@/components/public/founding-banner";
import { listRfps } from "@/lib/data/rfps";
import { getCategories, getPropertyTypes, getRegions } from "@/lib/data/taxonomy";
import { hasActiveTradeAccess } from "@/lib/access/access";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { boardStats, compactDollars, isPastContract } from "@/lib/data/fomo";
import { isGcPackage } from "@/lib/gc/packages";

const PAGE_SIZE = 30;
const AWARDED_PREVIEW = 9;

export async function generateMetadata(): Promise<Metadata> {
  const open = (await listRfps().catch(() => [])).filter((r) => r.status === "open").length;
  return {
    title: "Commercial Property RFPs & Tenders in Canada and the US",
    description: `${open > 0 ? `${open} open` : "Open"} commercial property RFPs and public tenders across Canada and the U.S. — snow removal, HVAC, roofing, cleaning, electrical and more. Updated daily, with closing dates and past awards.`,
    alternates: { canonical: "/rfps" },
  };
}

export default async function RfpsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const [rfps, categories, regions, propertyTypes, access] = await Promise.all([
    listRfps({
      category: sp.category,
      region: sp.region,
      propertyType: sp.propertyType,
      q: sp.q,
      sort: (sp.sort as "closing" | "newest") ?? "closing",
    }),
    getCategories(),
    getRegions(),
    getPropertyTypes(),
    hasActiveTradeAccess(),
  ]);

  // Demo mode (no Supabase): show as full-access so the experience is browsable.
  const locked = isSupabaseConfigured() ? !access : false;
  // Open tenders first (paginated), then real past contracts — who won, for
  // how much. Every number on this page is counted from the listings shown.
  const stats_ = boardStats(rfps);
  const open = rfps.filter((r) => r.status === "open");
  const past = rfps.filter((r) => r.status !== "open" && isPastContract(r));
  const otherClosed = rfps.filter((r) => r.status !== "open" && !isPastContract(r));
  const showAwarded = sp.view === "awarded";
  // GC sub-trade packages: open ones only, as their own tab once any exist.
  const gcOpen = open.filter(isGcPackage);
  const showGc = sp.view === "gc";
  const pageNum = Math.max(1, Number(sp.page) || 1);
  const listing = showAwarded ? [...past, ...otherClosed] : showGc ? gcOpen : open;
  const pages = Math.max(1, Math.ceil(listing.length / PAGE_SIZE));
  const pageItems = listing.slice((pageNum - 1) * PAGE_SIZE, pageNum * PAGE_SIZE);
  const pageHref = (n: number) => {
    const q = new URLSearchParams(Object.entries(sp).filter(([, v]) => v) as [string, string][]);
    q.set("page", String(n));
    return `/rfps?${q.toString()}`;
  };
  const viewHref = (view: "awarded" | "gc" | null) => {
    const q = new URLSearchParams(Object.entries(sp).filter(([k, v]) => v && k !== "page" && k !== "view") as [string, string][]);
    if (view) q.set("view", view);
    const qs = q.toString();
    return qs ? `/rfps?${qs}` : "/rfps";
  };

  const tabs: { key: "open" | "gc" | "awarded"; label: string; count: number; href: string; active: boolean; show: boolean }[] = [
    { key: "open", label: "Open now", count: open.length, href: viewHref(null), active: !showAwarded && !showGc, show: true },
    { key: "gc", label: "GC packages", count: gcOpen.length, href: viewHref("gc"), active: showGc, show: gcOpen.length > 0 || showGc },
    { key: "awarded", label: "Awarded", count: past.length + otherClosed.length, href: viewHref("awarded"), active: showAwarded, show: true },
  ];
  const hasFilters = Boolean(sp.category || sp.region || sp.propertyType || sp.q);

  return (
    <>
      <section className="border-b border-border bg-card">
        <Container className="py-10 sm:py-12">
          <Eyebrow>Tender board</Eyebrow>
          <div className="mt-3 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <h1 className="font-heading text-3xl font-semibold tracking-tight text-indigo sm:text-4xl">
                Commercial property RFPs and public tenders
              </h1>
              <p className="mt-3 text-muted-foreground">
                Private RFPs from property managers alongside public tenders from Canadian and U.S. buyers,
                with closing dates and past awards. Trade Pro members see full scope, documents and contacts.
              </p>
            </div>
            {(stats_.open > 0 || stats_.pastContracts > 0) && (
              <dl className="grid shrink-0 grid-cols-3 divide-x divide-border rounded-lg border border-border">
                <div className="px-4 py-3">
                  <dt className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Open</dt>
                  <dd className="mt-0.5 text-xl font-semibold tabular-nums text-foreground">{stats_.open}</dd>
                </div>
                <div className="px-4 py-3">
                  <dt className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Closing in 7d</dt>
                  <dd className="mt-0.5 text-xl font-semibold tabular-nums text-foreground">{stats_.closingThisWeek}</dd>
                </div>
                <div className="px-4 py-3">
                  <dt className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                    {stats_.awardedValue > 0 ? "Awarded" : "Past awards"}
                  </dt>
                  <dd className="mt-0.5 text-xl font-semibold tabular-nums text-foreground">
                    {stats_.awardedValue > 0 ? compactDollars(stats_.awardedValue) : stats_.pastContracts}
                  </dd>
                </div>
              </dl>
            )}
          </div>
        </Container>
      </section>

      <FoundingBanner />

      <Container className="py-8">
        <FilterBar
          categories={categories}
          regions={regions}
          propertyTypes={propertyTypes}
          sortOptions={[
            { value: "closing", label: "Closing soon" },
            { value: "newest", label: "Newest" },
          ]}
        />

        <div className="mt-6 flex flex-col gap-3 border-b border-border sm:flex-row sm:items-end sm:justify-between">
          <nav className="-mb-px flex gap-6 overflow-x-auto text-sm" aria-label="Listing view">
            {tabs.filter((t) => t.show).map((t) => (
              <Link
                key={t.key}
                href={t.href}
                aria-current={t.active ? "page" : undefined}
                className={`flex shrink-0 items-center gap-2 border-b-2 pb-3 font-medium transition-colors ${t.active ? "border-indigo text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
              >
                {t.label}
                <span className="rounded bg-secondary px-1.5 py-0.5 font-mono text-[11px] tabular-nums text-muted-foreground">{t.count}</span>
              </Link>
            ))}
          </nav>
          {locked && (
            <p className="flex items-center gap-1.5 pb-3 text-xs text-muted-foreground">
              <Lock className="size-3.5" /> Previews shown.{" "}
              <Link href="/pricing" className="font-medium text-teal-ink hover:underline">Trade Pro unlocks full details</Link>
            </p>
          )}
        </div>

        {pageItems.length === 0 ? (
          <div className="mt-6">
            <EmptyState
              title={
                showAwarded
                  ? "No past contracts match these filters"
                  : showGc
                    ? "No open GC sub-trade packages match these filters"
                    : "No open tenders match these filters"
              }
              description={
                hasFilters
                  ? "Widen the region or trade, or check the other tabs. New tenders are added every morning."
                  : "New tenders are added every morning. The awarded tab shows who won recent contracts."
              }
            >
              <div className="flex flex-wrap justify-center gap-2">
                {hasFilters && (
                  <Link href={showAwarded ? "/rfps?view=awarded" : showGc ? "/rfps?view=gc" : "/rfps"} className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-secondary">
                    Clear filters
                  </Link>
                )}
                <Link href="/pricing" className="rounded-md bg-indigo px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">
                  Get alerts for new tenders
                </Link>
              </div>
            </EmptyState>
          </div>
        ) : (
          <>
            <p className="mt-4 text-xs text-muted-foreground">
              {listing.length} {listing.length === 1 ? "listing" : "listings"}
              {pages > 1 && ` · page ${pageNum} of ${pages}`}
            </p>
            <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {pageItems.map((r) => (
                <RfpCard key={r.slug} rfp={r} locked={locked} />
              ))}
            </div>
          </>
        )}

        {pages > 1 && (
          <nav className="mt-8 flex items-center justify-between gap-3 border-t border-border pt-5 text-sm" aria-label="Pagination">
            {pageNum > 1 ? (
              <Link href={pageHref(pageNum - 1)} className="rounded-md border border-border px-4 py-2 font-medium hover:bg-secondary">Previous</Link>
            ) : <span />}
            <span className="font-mono text-xs tabular-nums text-muted-foreground">{pageNum} / {pages}</span>
            {pageNum < pages ? (
              <Link href={pageHref(pageNum + 1)} className="rounded-md border border-border px-4 py-2 font-medium hover:bg-secondary">Next</Link>
            ) : <span />}
          </nav>
        )}

        {/* Real past contracts: who won, for how much. */}
        {!showAwarded && !showGc && past.length > 0 && (
          <section className="mt-16">
            <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border pb-4">
              <div>
                <Eyebrow>Award notices</Eyebrow>
                <h2 className="mt-2 font-heading text-2xl font-semibold tracking-tight text-indigo">Recently awarded</h2>
                <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                  Public contracts with the winning company and the value. Trade Pro members are alerted the day the
                  next one in their trade is posted.
                </p>
              </div>
              <Link href={viewHref("awarded")} className="text-sm font-medium text-teal-ink hover:underline">
                All {past.length} awards
              </Link>
            </div>
            <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {past.slice(0, AWARDED_PREVIEW).map((r) => (
                <RfpCard key={r.slug} rfp={r} locked={locked} />
              ))}
            </div>
          </section>
        )}

        <ReferBanner variant="subtle" className="mt-14" />
      </Container>
    </>
  );
}
