import type { Metadata } from "next";
import Link from "@/i18n/link";
import { Container, Eyebrow } from "@/components/container";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { FilterBar } from "@/components/public/filter-bar";
import { DirectoryCard } from "@/components/public/directory-card";
import { EmptyState } from "@/components/public/empty-state";
import { CTASection } from "@/components/public/section";
import { listVendors } from "@/lib/data/directory";
import { getCategories, getPropertyTypes, getRegions } from "@/lib/data/taxonomy";
import { SITE } from "@/lib/site";
import { getT, setLangFrom } from "@/i18n/server";
import { getDictionary } from "@/i18n/dictionaries";
import { hasLocale } from "@/i18n/config";
import { alternatesFor } from "@/i18n/metadata";
import { fmt, plural } from "@/i18n/format";

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  const l = hasLocale(lang) ? lang : "en";
  const t = getDictionary(l).directory.suppliers;
  return {
    title: t.title,
    description: t.description,
    alternates: alternatesFor(l, "/suppliers"),
  };
}

export default async function SuppliersPage({
  searchParams, params }: {
  searchParams: Promise<Record<string, string | undefined>>;
} & { params: Promise<object> }) {
  await setLangFrom(params);
  const td = getT("directory");
  const t = td.suppliers;
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
          <Eyebrow>{t.eyebrow}</Eyebrow>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
            {t.h1}
          </h1>
          <p className="mt-3 max-w-2xl text-muted-foreground">
            {t.body}
          </p>
          <Link href="/become-a-supplier" className={cn(buttonVariants(), "mt-6")}>
            {t.become}
          </Link>
        </Container>
      </section>

      <Container className="py-8">
        <FilterBar
          categories={categories}
          regions={regions}
          propertyTypes={propertyTypes}
          showVerified
          sortOptions={[
            { value: "featured", label: td.sort.featured },
            { value: "alpha", label: td.sort.alpha },
          ]}
        />
        <p className="mt-6 text-sm text-muted-foreground">
          {plural(suppliers.length, t.count)}
        </p>
        {suppliers.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              title={t.emptyTitle}
              description={t.emptyBody}
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
        title={t.ctaTitle}
        description={fmt(t.ctaBody, { site: SITE.name })}
        primaryHref="/sign-up"
        primaryLabel={t.ctaPrimary}
        secondaryHref="/become-a-supplier"
        secondaryLabel={t.ctaSecondary}
      />
    </>
  );
}
