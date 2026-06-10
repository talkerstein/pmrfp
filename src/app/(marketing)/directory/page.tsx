import type { Metadata } from "next";
import Link from "next/link";
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

  const verifiedCount = vendors.filter((v) => v.verified).length;
  const hasFilters = Boolean(
    sp.category || sp.region || sp.propertyType || sp.verified || sp.q,
  );

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
          {categories.length > 0 && (
            <>
              {" · "}
              <span className="font-medium text-foreground">{categories.length}</span> categories
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
