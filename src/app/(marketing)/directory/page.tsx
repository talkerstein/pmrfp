import type { Metadata } from "next";
import { Container, Eyebrow } from "@/components/container";
import { FilterBar } from "@/components/public/filter-bar";
import { DirectoryCard } from "@/components/public/directory-card";
import { EmptyState } from "@/components/public/empty-state";
import { FoundingRegionNotice } from "@/components/public/founding-region-notice";
import { listVendors } from "@/lib/data/directory";
import { getCategories, getPropertyTypes, getRegions } from "@/lib/data/taxonomy";
import { getRegionLiquidityBySlug } from "@/lib/data/liquidity";

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
  const [vendors, categories, regions, propertyTypes] = await Promise.all([
    listVendors({
      category: sp.category,
      region: sp.region,
      propertyType: sp.propertyType,
      verified: Boolean(sp.verified),
      q: sp.q,
      sort: (sp.sort as "featured" | "recent" | "alpha") ?? "featured",
    }),
    getCategories(),
    getRegions(),
    getPropertyTypes(),
  ]);

  const activeRegion = sp.region ? regions.find((r) => r.slug === sp.region) ?? null : null;
  const regionLiq = activeRegion ? await getRegionLiquidityBySlug(activeRegion.slug) : null;
  const showFounding = !!activeRegion && !!regionLiq && regionLiq.tier !== "active";

  return (
    <>
      <section className="border-b border-border bg-secondary/30">
        <Container className="py-12">
          <Eyebrow>Vendor directory</Eyebrow>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
            Find qualified trades for commercial property work
          </h1>
          <p className="mt-3 max-w-2xl text-muted-foreground">
            Discover trade and service companies by category, region, and the property
            types they serve.
          </p>
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
          {vendors.length} {vendors.length === 1 ? "vendor" : "vendors"}
        </p>

        {vendors.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              title="No vendors match your filters"
              description="Try clearing a filter or broadening your search."
            />
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
