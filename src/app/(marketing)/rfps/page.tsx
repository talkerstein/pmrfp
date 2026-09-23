import type { Metadata } from "next";
import Link from "next/link";
import { Flame, Lock, Trophy } from "lucide-react";
import { Container, Eyebrow } from "@/components/container";
import { FilterBar } from "@/components/public/filter-bar";
import { RfpCard } from "@/components/public/rfp-card";
import { EmptyState } from "@/components/public/empty-state";
import { StatsStrip } from "@/components/public/stats-strip";
import { ReferBanner } from "@/components/public/refer-banner";
import { FoundingBanner } from "@/components/public/founding-banner";
import { listRfps } from "@/lib/data/rfps";
import { getPlatformStats } from "@/lib/data/stats";
import { getCategories, getPropertyTypes, getRegions } from "@/lib/data/taxonomy";
import { hasActiveTradeAccess } from "@/lib/access/access";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { boardStats, compactDollars, isPastContract } from "@/lib/data/fomo";

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
  const [rfps, categories, regions, propertyTypes, access, stats] = await Promise.all([
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
    getPlatformStats(),
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
  const pageNum = Math.max(1, Number(sp.page) || 1);
  const listing = showAwarded ? [...past, ...otherClosed] : open;
  const pages = Math.max(1, Math.ceil(listing.length / PAGE_SIZE));
  const pageItems = listing.slice((pageNum - 1) * PAGE_SIZE, pageNum * PAGE_SIZE);
  const pageHref = (n: number) => {
    const q = new URLSearchParams(Object.entries(sp).filter(([, v]) => v) as [string, string][]);
    q.set("page", String(n));
    return `/rfps?${q.toString()}`;
  };
  const viewHref = (awarded: boolean) => {
    const q = new URLSearchParams(Object.entries(sp).filter(([k, v]) => v && k !== "page" && k !== "view") as [string, string][]);
    if (awarded) q.set("view", "awarded");
    const qs = q.toString();
    return qs ? `/rfps?${qs}` : "/rfps";
  };

  return (
    <>
      <section className="border-b border-border bg-secondary/30">
        <Container className="py-12">
          <Eyebrow>RFP opportunities</Eyebrow>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
            Commercial property RFP opportunities
          </h1>
          <p className="mt-3 max-w-2xl text-muted-foreground">
            Monitor property-related opportunities by region. Trade Pro members see full scope,
            requirements, and contact details, and can express interest.
          </p>
          <StatsStrip stats={stats} className="mt-6" />
        </Container>
      </section>

      <FoundingBanner />

      <Container className="py-8">
        <ReferBanner variant="subtle" className="mb-6" />

        {locked && (
          <div className="mb-6 flex items-center gap-3 rounded-lg border border-teal-200 bg-teal-50/60 p-4 text-sm text-foreground">
            <Lock className="size-4 shrink-0 text-teal-600" />
            You&apos;re viewing opportunity previews. Join PMRFP Trade Pro to unlock full details and
            express interest.
          </div>
        )}

        <FilterBar
          categories={categories}
          regions={regions}
          propertyTypes={propertyTypes}
          sortOptions={[
            { value: "closing", label: "Closing soon" },
            { value: "newest", label: "Newest" },
          ]}
        />

        {/* Live numbers — all counted from the listings on this page. */}
        {(stats_.open > 0 || stats_.pastContracts > 0) && (
          <div className="mt-6 grid gap-3 rounded-xl border border-border bg-indigo p-5 text-white sm:grid-cols-3">
            <div>
              <div className="text-3xl font-extrabold tracking-tight">{stats_.open}</div>
              <div className="text-xs uppercase tracking-wide text-indigo-100/75">open tenders right now</div>
            </div>
            <div>
              <div className="flex items-center gap-1.5 text-3xl font-extrabold tracking-tight text-teal-300">
                <Flame className="size-6" /> {stats_.closingThisWeek}
              </div>
              <div className="text-xs uppercase tracking-wide text-indigo-100/75">close in the next 7 days</div>
            </div>
            <div>
              <div className="text-3xl font-extrabold tracking-tight">
                {stats_.awardedValue > 0 ? compactDollars(stats_.awardedValue) : stats_.pastContracts}
              </div>
              <div className="text-xs uppercase tracking-wide text-indigo-100/75">
                {stats_.awardedValue > 0
                  ? `awarded to trades in ${stats_.pastContracts} public contracts this year`
                  : "public contracts awarded this year"}
              </div>
            </div>
          </div>
        )}

        <div className="mt-6 flex flex-wrap items-center gap-2 text-sm">
          <Link
            href={viewHref(false)}
            className={`rounded-full px-4 py-1.5 font-medium ${!showAwarded ? "bg-indigo text-white" : "border border-border hover:bg-secondary"}`}
          >
            Open now ({open.length})
          </Link>
          <Link
            href={viewHref(true)}
            className={`flex items-center gap-1.5 rounded-full px-4 py-1.5 font-medium ${showAwarded ? "bg-indigo text-white" : "border border-border hover:bg-secondary"}`}
          >
            <Trophy className="size-3.5" /> Already awarded ({past.length + otherClosed.length})
          </Link>
        </div>

        {pageItems.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              title={showAwarded ? "No past contracts match your filters" : "No open opportunities match your filters"}
              description="Try clearing a filter, or check the other tab."
            />
          </div>
        ) : (
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {pageItems.map((r) => (
              <RfpCard key={r.slug} rfp={r} locked={locked} />
            ))}
          </div>
        )}

        {pages > 1 && (
          <nav className="mt-6 flex items-center justify-center gap-3 text-sm" aria-label="Pagination">
            {pageNum > 1 && <Link href={pageHref(pageNum - 1)} className="rounded-full border border-border px-4 py-1.5 hover:bg-secondary">← Previous</Link>}
            <span className="text-muted-foreground">Page {pageNum} of {pages}</span>
            {pageNum < pages && <Link href={pageHref(pageNum + 1)} className="rounded-full border border-border px-4 py-1.5 hover:bg-secondary">Next →</Link>}
          </nav>
        )}

        {/* The contracts trades already lost to someone else — real awards. */}
        {!showAwarded && past.length > 0 && (
          <section className="mt-14">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-2xl font-semibold tracking-tight">Already awarded — someone else won these</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Real public contracts, with the winning company and the value. Trade Pro members get alerted
                  the day the next one is posted.
                </p>
              </div>
              <Link href={viewHref(true)} className="text-sm font-medium text-teal-700 hover:underline">
                See all {past.length} →
              </Link>
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {past.slice(0, AWARDED_PREVIEW).map((r) => (
                <RfpCard key={r.slug} rfp={r} locked={locked} />
              ))}
            </div>
          </section>
        )}
      </Container>
    </>
  );
}
