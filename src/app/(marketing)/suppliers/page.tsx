import type { Metadata } from "next";
import { Container, Eyebrow } from "@/components/container";
import { FilterBar } from "@/components/public/filter-bar";
import { DirectoryCard } from "@/components/public/directory-card";
import { EmptyState } from "@/components/public/empty-state";
import { CTASection } from "@/components/public/section";
import { listVendors } from "@/lib/data/directory";
import { getCategories, getPropertyTypes, getRegions } from "@/lib/data/taxonomy";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Supplier Directory — Building Product & Material Suppliers in Canada",
  description:
    "Browse building product, material, and equipment suppliers serving Canadian commercial trades, builders, and property managers. Filter by category and region.",
  alternates: { canonical: "/suppliers" },
};

export default async function SuppliersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const [suppliers, categories, regions, propertyTypes] = await Promise.all([
    listVendors({
      orgType: "supplier",
      category: sp.category,
      region: sp.region,
      propertyType: sp.propertyType,
      verified: Boolean(sp.verified),
      q: sp.q,
      sort: (sp.sort as "featured" | "alpha") ?? "featured",
    }),
    getCategories(),
    getRegions(),
    getPropertyTypes(),
  ]);

  return (
    <>
      <section className="border-b border-border bg-secondary/30">
        <Container className="py-12">
          <Eyebrow>Supplier directory</Eyebrow>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
            Building product & material suppliers
          </h1>
          <p className="mt-3 max-w-2xl text-muted-foreground">
            Distributors and suppliers serving Canadian commercial trades, builders, and property
            managers — by category and region.
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
        <p className="mt-6 text-sm text-muted-foreground">
          {suppliers.length} {suppliers.length === 1 ? "supplier" : "suppliers"}
        </p>
        {suppliers.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              title="No suppliers match your filters"
              description="Try clearing a filter, or check back soon as more suppliers join."
            />
          </div>
        ) : (
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {suppliers.map((v) => (
              <DirectoryCard key={v.slug} vendor={v} />
            ))}
          </div>
        )}
      </Container>

      <CTASection
        title="Are you a supplier or distributor?"
        description={`Get listed where Canadian trades, builders, and property managers source products — ${SITE.name} Pro.`}
        primaryHref="/sign-up"
        primaryLabel="List your company"
        secondaryHref="/for/suppliers"
        secondaryLabel="How it works for suppliers"
      />
    </>
  );
}
