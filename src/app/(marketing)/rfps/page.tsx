import type { Metadata } from "next";
import { Lock } from "lucide-react";
import { Container, Eyebrow } from "@/components/container";
import { FilterBar } from "@/components/public/filter-bar";
import { RfpCard } from "@/components/public/rfp-card";
import { EmptyState } from "@/components/public/empty-state";
import { StatsStrip } from "@/components/public/stats-strip";
import { ReferBanner } from "@/components/public/refer-banner";
import { listRfps } from "@/lib/data/rfps";
import { getPlatformStats } from "@/lib/data/stats";
import { getCategories, getPropertyTypes, getRegions } from "@/lib/data/taxonomy";
import { hasActiveTradeAccess } from "@/lib/access/access";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export const metadata: Metadata = {
  title: "Commercial Property RFP Opportunities",
  description:
    "Monitor commercial property RFPs by region — electrical, HVAC, roofing, snow removal, cleaning, and more. Subscribe to view full opportunities and express interest.",
};

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

        <p className="mt-6 text-sm text-muted-foreground">
          {rfps.length} {rfps.length === 1 ? "opportunity" : "opportunities"}
        </p>

        {rfps.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              title="No opportunities match your filters"
              description="Try clearing a filter, or check back soon — new RFPs are added regularly."
            />
          </div>
        ) : (
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {rfps.map((r) => (
              <RfpCard key={r.slug} rfp={r} locked={locked} />
            ))}
          </div>
        )}
      </Container>
    </>
  );
}
