import type { Metadata } from "next";
import Link from "next/link";
import { LayoutGrid } from "lucide-react";
import { Container, Eyebrow } from "@/components/container";
import { buttonVariants } from "@/components/ui/button";
import { FilterBar } from "@/components/public/filter-bar";
import { DirectoryCard } from "@/components/public/directory-card";
import { EmptyState } from "@/components/public/empty-state";
import { FoundingRegionNotice } from "@/components/public/founding-region-notice";
import { JsonLd, itemListSchema } from "@/lib/seo/jsonld";
import { listVendors } from "@/lib/data/directory";
import { getCategories, getPropertyTypes, getRegions } from "@/lib/data/taxonomy";
import { getRegionLiquidityBySlug } from "@/lib/data/liquidity";
import { cn } from "@/lib/utils";
import type { VendorListItem } from "@/lib/data/types";

export const metadata: Metadata = {
  title: "Vendor Directory — Commercial Property Trades",
  description:
    "Browse qualified trade and service companies for commercial property work. Filter by category, region, and property type.",
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
    // Unfiltered pool — powers the category chip counts even while filtered.
    hasFilters ? listVendors({}) : Promise.resolve(null),
    getCategories(),
    getRegions(),
    getPropertyTypes(),
  ]);
  const pool = allVendors ?? vendors;

  const activeRegion = sp.region ? regions.find((r) => r.slug === sp.region) ?? null : null;
  const regionLiq = activeRegion ? await getRegionLiquidityBySlug(activeRegion.slug) : null;
  const showFounding = !!activeRegion && !!regionLiq && regionLiq.tier !== "active";

  const verifiedCount = vendors.filter((v) => v.verified).length;

  // Categories that actually have vendors, with counts (chips + honest stat).
  const countByName = new Map<string, number>();
  for (const v of pool) for (const c of v.categories) countByName.set(c, (countByName.get(c) ?? 0) + 1);
  const activeCats = categories
    .map((c) => ({ ...c, count: countByName.get(c.name) ?? 0 }))
    .filter((c) => c.count > 0)
    .sort((a, b) => b.count - a.count);

  // Default (unfiltered) view groups vendors under their primary category so a
  // young directory reads as organized coverage, not a random pile of cards.
  const grouped: { name: string; slug: string | null; vendors: VendorListItem[] }[] = [];
  if (!hasFilters) {
    const byPrimary = new Map<string, VendorListItem[]>();
    for (const v of vendors) {
      const key = v.categories[0] ?? "Other services";
      byPrimary.set(key, [...(byPrimary.get(key) ?? []), v]);
    }
    for (const [name, vs] of byPrimary) {
      grouped.push({ name, slug: categories.find((c) => c.name === name)?.slug ?? null, vendors: vs });
    }
    grouped.sort((a, b) =>
      a.name === "Other services" ? 1 : b.name === "Other services" ? -1 : b.vendors.length - a.vendors.length,
    );
  }

  return (
    <>
      <JsonLd
        data={itemListSchema(
          "Commercial property vendor directory",
          vendors.slice(0, 50).map((v) => ({ name: v.name, path: `/directory/${v.slug}` })),
        )}
      />

      <section className="border-b border-border bg-secondary/30">
        <Container className="py-12">
          <Eyebrow>Vendor directory</Eyebrow>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
            Find qualified trades for commercial property work
          </h1>
          <p className="mt-3 max-w-2xl text-muted-foreground">
            Discover vetted trade and service companies by category, region, and the property
            types they serve.
          </p>

          {/* Demand bridge: turn directory browsing into a posted project. */}
          <div className="mt-6 flex flex-col gap-3 rounded-xl border border-teal-200 bg-teal-50/60 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-medium text-foreground">Need work done on your property?</p>
              <p className="text-sm text-muted-foreground">
                Post your project once and these trades come to you with their bids. Free for property managers.
              </p>
            </div>
            <Link
              href="/sign-up?role=property_manager"
              className={buttonVariants({ className: "shrink-0" })}
            >
              Post your project free
            </Link>
          </div>
        </Container>
      </section>

      <Container className="py-8">
        <FilterBar
          categories={categories}
          regions={regions}
          propertyTypes={propertyTypes}
          showVerified
          sortOptions={[
            { value: "featured", label: "Featured first" },
            { value: "alpha", label: "A–Z" },
          ]}
        />

        {/* One-tap category browse — same chip pattern as the homepage board. */}
        {activeCats.length > 0 && (
          <div className="mt-6 flex flex-wrap gap-2">
            <Link
              href="/directory"
              className={cn(
                "inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-colors",
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
                  "inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-colors",
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

        <p className="mt-6 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{vendors.length}</span>{" "}
          {vendors.length === 1 ? "trade" : "trades"}
          {verifiedCount > 0 && (
            <>
              {" · "}
              <span className="font-medium text-foreground">{verifiedCount}</span> verified
            </>
          )}
          {activeCats.length > 0 && (
            <>
              {" · "}
              <span className="font-medium text-foreground">{activeCats.length}</span>{" "}
              {activeCats.length === 1 ? "category" : "categories"} covered
            </>
          )}
        </p>

        {vendors.length === 0 ? (
          <div className="mt-4 flex flex-col items-center gap-4">
            <EmptyState
              title="No trades match your filters"
              description="Try clearing a filter or broadening your search."
            />
            {hasFilters && (
              <Link
                href="/directory"
                className={buttonVariants({ variant: "outline", className: "shrink-0" })}
              >
                Clear all filters
              </Link>
            )}
          </div>
        ) : !hasFilters && grouped.length > 0 ? (
          <div className="mt-2">
            {grouped.map((g) => (
              <section key={g.name} className="mt-8">
                <div className="flex items-baseline justify-between gap-4">
                  <h2 className="flex items-baseline gap-2 text-lg font-semibold tracking-tight">
                    {g.name}
                    <span className="font-mono text-xs font-normal text-muted-foreground">
                      {g.vendors.length}
                    </span>
                  </h2>
                  {g.slug && (
                    <Link
                      href={`/directory?category=${g.slug}`}
                      className="text-sm font-medium text-teal-700 hover:underline"
                    >
                      View all
                    </Link>
                  )}
                </div>
                <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {g.vendors.map((v) => (
                    <DirectoryCard key={v.slug} vendor={v} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {vendors.map((v) => (
              <DirectoryCard key={v.slug} vendor={v} />
            ))}
          </div>
        )}
      </Container>
    </>
  );
}
