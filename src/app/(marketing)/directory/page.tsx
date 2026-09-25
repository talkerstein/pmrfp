import type { Metadata } from "next";
import Link from "next/link";
import { LayoutGrid, ArrowRight } from "lucide-react";
import { Container } from "@/components/container";
import { buttonVariants } from "@/components/ui/button";
import { FilterBar } from "@/components/public/filter-bar";
import { FeaturedVendorCard, FeaturedUpsellSlot } from "@/components/public/featured-vendor-card";
import { VendorRow, VendorRowHeader } from "@/components/public/vendor-row";
import { EmptyState } from "@/components/public/empty-state";
import { FoundingRegionNotice } from "@/components/public/founding-region-notice";
import { JsonLd, itemListSchema } from "@/lib/seo/jsonld";
import { listVendors } from "@/lib/data/directory";
import { getCategories, getPropertyTypes, getRegions } from "@/lib/data/taxonomy";
import { getRegionLiquidityBySlug } from "@/lib/data/liquidity";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Vendor Directory — Commercial Property Trades",
  description:
    "Browse qualified trade and service companies for commercial property work. Filter by category, region, and property type.",
  // Filtered views (?category=, ?region=, ?q=) are the same page to Google.
  alternates: { canonical: "/directory" },
};

export default async function DirectoryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const hasFilters = Boolean(
    sp.category || sp.region || sp.propertyType || sp.verified || sp.q,
  );
  const sort = (sp.sort as "featured" | "recent" | "alpha") ?? "featured";

  const [vendors, allVendors, categories, regions, propertyTypes] = await Promise.all([
    listVendors({
      category: sp.category,
      region: sp.region,
      propertyType: sp.propertyType,
      verified: Boolean(sp.verified),
      q: sp.q,
      sort,
    }),
    // Unfiltered pool — hero stats, the featured marquee, and chip counts stay
    // stable while the ledger filters.
    hasFilters ? listVendors({}) : Promise.resolve(null),
    getCategories(),
    getRegions(),
    getPropertyTypes(),
  ]);
  const pool = allVendors ?? vendors;

  const activeRegion = sp.region ? regions.find((r) => r.slug === sp.region) ?? null : null;
  const regionLiq = activeRegion ? await getRegionLiquidityBySlug(activeRegion.slug) : null;
  const showFounding = !!activeRegion && !!regionLiq && regionLiq.tier !== "active";

  // Paid placement must still be RELEVANT (audit F06): a featured electrician
  // was shown above an HVAC search and above zero-result keyword searches.
  // Draw the marquee from the filtered results, so a sponsor only appears when
  // it actually matches the visitor's trade / region / keyword.
  const featured = vendors.filter((v) => v.featured).slice(0, 3);
  const featuredSlugs = new Set(featured.map((v) => v.slug));
  const rows = vendors.filter((v) => !featuredSlugs.has(v.slug));

  // Categories that actually have vendors, with counts (chips).
  const countByName = new Map<string, number>();
  for (const v of pool) for (const c of v.categories) countByName.set(c, (countByName.get(c) ?? 0) + 1);
  const activeCats = categories
    .map((c) => ({ ...c, count: countByName.get(c.name) ?? 0 }))
    .filter((c) => c.count > 0)
    .sort((a, b) => b.count - a.count);

  return (
    <>
      <JsonLd
        data={itemListSchema(
          "Commercial property vendor directory",
          vendors.slice(0, 50).map((v) => ({ name: v.name, path: `/directory/${v.slug}` })),
        )}
      />

      {/* ===== Indigo hero with stat block (Direction A) ===== */}
      <section className="grid-tex relative overflow-hidden bg-indigo text-white [--grid-color:rgba(255,255,255,0.045)]">
        <Container className="relative z-10 grid items-end gap-10 pb-20 pt-12 lg:grid-cols-[1fr_auto]">
          <div>
            <span className="eyebrow inline-flex items-center gap-2 text-teal-300">
              <span className="h-px w-5 bg-teal-300" /> Trade directory
            </span>
            <h1 className="mt-4 max-w-xl text-balance font-heading text-4xl font-semibold leading-[1.05] tracking-tight text-white sm:text-5xl">
              Trades worth shortlisting.
            </h1>
            <p className="mt-4 max-w-lg text-[16.5px] leading-relaxed text-indigo-100/75">
              Commercial property trades across Canada and the U.S., browsable by category, region and
              property type. Property managers browse and post free.
            </p>
          </div>
          <div className="flex flex-col items-start gap-4 pb-1 lg:items-end">
            <div className="flex gap-7">
              <div className="lg:text-right">
                <div className="text-[26px] font-extrabold leading-none text-teal-300">{pool.length}</div>
                <div className="mt-1.5 font-mono text-[10px] uppercase tracking-[0.1em] text-indigo-100/60">Companies</div>
              </div>
              <div className="lg:text-right">
                <div className="text-[26px] font-extrabold leading-none text-teal-300">{activeCats.length}</div>
                <div className="mt-1.5 font-mono text-[10px] uppercase tracking-[0.1em] text-indigo-100/60">Categories</div>
              </div>
              <div className="lg:text-right">
                <div className="text-[26px] font-extrabold leading-none text-teal-300">{regions.length}</div>
                <div className="mt-1.5 font-mono text-[10px] uppercase tracking-[0.1em] text-indigo-100/60">Regions</div>
              </div>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/sign-up?role=property_manager"
                className={buttonVariants({ size: "sm", variant: "accent" })}
              >
                Post a project free
              </Link>
              <Link
                href="/sign-up"
                className={cn(
                  buttonVariants({ size: "sm", variant: "outline" }),
                  "border-white/25 bg-transparent text-white hover:bg-white/10 hover:text-white",
                )}
              >
                Get listed <ArrowRight className="size-3.5" />
              </Link>
            </div>
          </div>
        </Container>
      </section>

      {/* ===== Command bar — overlaps the hero ===== */}
      <Container className="relative z-20 -mt-10">
        <div className="rounded-lg border border-border bg-white p-2.5 shadow-lg">
          <FilterBar
            categories={categories}
            regions={regions}
            propertyTypes={propertyTypes}
            showVerified
            sticky={false}
            sortOptions={[
              { value: "featured", label: "Featured first" },
              { value: "alpha", label: "A–Z" },
            ]}
          />
        </div>

        {/* One-tap category chips with counts */}
        {activeCats.length > 0 && (
          <div className="mt-5 flex flex-wrap gap-2">
            <Link
              href="/directory"
              className={cn(
                "inline-flex items-center gap-2 rounded-md border px-3.5 py-1.5 text-sm font-medium transition-colors",
                !sp.category
                  ? "border-indigo bg-indigo text-white"
                  : "border-border bg-card text-foreground hover:border-teal-300 hover:bg-teal-50",
              )}
            >
              <LayoutGrid className="size-3.5" /> All trades
            </Link>
            {activeCats.map((c) => (
              <Link
                key={c.slug}
                href={`/directory?category=${c.slug}`}
                className={cn(
                  "inline-flex items-center gap-2 rounded-md border px-3.5 py-1.5 text-sm font-medium transition-colors",
                  sp.category === c.slug
                    ? "border-indigo bg-indigo text-white"
                    : "border-border bg-card text-foreground hover:border-teal-300 hover:bg-teal-50",
                )}
              >
                {c.name}
                <span className={cn("font-mono text-[11px]", sp.category === c.slug ? "text-teal-300" : "text-muted-foreground")}>
                  {c.count}
                </span>
              </Link>
            ))}
          </div>
        )}

        {showFounding && activeRegion && (
          <FoundingRegionNotice
            regionName={activeRegion.name}
            regionSlug={activeRegion.slug}
            reason="no_supply_directory"
            role="property_manager"
            province={activeRegion.province ?? undefined}
            country={activeRegion.country}
            className="mt-6"
          />
        )}
      </Container>

      {/* ===== Featured marquee ===== */}
      {featured.length > 0 && (
        <Container className="pt-9">
          <div className="mb-4 flex items-baseline justify-between gap-4">
            <span className="inline-flex items-center gap-2 font-mono text-[11.5px] uppercase tracking-[0.16em] text-teal-700">
              <span className="h-0.5 w-5 rounded bg-teal-700" /> Featured partners · Sponsored placement
            </span>
            <Link href="/pricing" className="text-[13px] font-semibold text-periwinkle hover:underline">
              What is a featured listing?
            </Link>
          </div>
          <div
            className={cn(
              "grid items-stretch gap-3.5",
              featured.length === 1 && "md:grid-cols-2 xl:grid-cols-[1fr_232px]",
              featured.length === 2 && "md:grid-cols-2 xl:grid-cols-[1fr_1fr_232px]",
              featured.length >= 3 && "md:grid-cols-2 xl:grid-cols-[1fr_1fr_1fr_232px]",
            )}
          >
            {featured.map((v) => (
              <FeaturedVendorCard key={v.slug} vendor={v} />
            ))}
            <FeaturedUpsellSlot />
          </div>
        </Container>
      )}

      {/* ===== Ledger — all companies ===== */}
      <Container className="pb-4 pt-8">
        <div className="mb-4 flex items-baseline justify-between gap-4">
          <span className="inline-flex items-center gap-2 font-mono text-[11.5px] uppercase tracking-[0.16em] text-teal-700">
            <span className="h-0.5 w-5 rounded bg-teal-700" />
            {hasFilters ? `${rows.length} results` : `All companies · ${vendors.length}`}
          </span>
          <Link href="/regions" className="text-[13px] font-semibold text-periwinkle hover:underline">
            Browse by region
          </Link>
        </div>

        {rows.length === 0 ? (
          <div className="flex flex-col items-center gap-4">
            <EmptyState
              title="No companies match these filters"
              description="Widen the region or trade. New companies join every week, and property managers can post a project so trades come to them."
            />
            {hasFilters && (
              <Link href="/directory" className={buttonVariants({ variant: "outline" })}>
                Clear all filters
              </Link>
            )}
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-border bg-white">
            <VendorRowHeader />
            {rows.map((v) => (
              <VendorRow key={v.slug} vendor={v} />
            ))}
          </div>
        )}

        <div className="flex items-center justify-center gap-2.5 pt-4 font-mono text-xs text-muted-foreground">
          Profiles are free to view · Posting a project is free for property managers
        </div>
      </Container>

      {/* ===== Bottom CTA band ===== */}
      <Container className="pb-16 pt-10">
        <div className="relative grid items-center gap-8 overflow-hidden rounded-lg bg-indigo p-10 text-white sm:p-12 lg:grid-cols-[1fr_auto]">
          <div className="relative">
            <h2 className="max-w-lg font-heading text-3xl font-semibold leading-tight tracking-tight text-white">
              Property managers browse this page before they post.
            </h2>
            <p className="mt-3 max-w-md text-[15px] text-indigo-100/70">
              Get your company listed, or take a featured slot and be the first name they see.
            </p>
          </div>
          <div className="relative flex flex-wrap gap-3">
            <Link href="/pricing" className={buttonVariants({ size: "lg", variant: "accent" })}>
              Get featured <ArrowRight className="size-4" />
            </Link>
            <Link
              href="/sign-up"
              className={cn(
                buttonVariants({ size: "lg", variant: "outline" }),
                "border-white/25 bg-transparent text-white hover:bg-white/10 hover:text-white",
              )}
            >
              Join free
            </Link>
          </div>
        </div>
      </Container>
    </>
  );
}
