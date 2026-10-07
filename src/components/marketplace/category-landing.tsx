import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "@/i18n/link";
import { Container } from "@/components/container";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/public/empty-state";
import { ListingCard } from "@/components/marketplace/listing-card";
import { JsonLd, breadcrumbSchema } from "@/lib/seo/jsonld";
import { listActiveListings } from "@/lib/marketplace/data";
import { isCategory, landingIndexable } from "@/lib/marketplace/rules";
import { getRegions } from "@/lib/data/taxonomy";
import { getLang, getT } from "@/i18n/server";
import { getDictionary } from "@/i18n/dictionaries";
import { hasLocale, localizePath } from "@/i18n/config";
import { alternatesFor } from "@/i18n/metadata";
import { fmt, plural } from "@/i18n/format";
import { regionName } from "@/i18n/terms";

/**
 * /marketplace/category/{category}[/{region}]. Indexed only when the slice
 * has at least LANDING_MIN_LISTINGS live listings; thinner pages render for
 * people but carry noindex (and stay out of the sitemap).
 */
export async function categoryLandingMetadata(lang: string, category: string, regionSlug?: string): Promise<Metadata> {
  const l = hasLocale(lang) ? lang : "en";
  const dict = getDictionary(l);
  if (!isCategory(category)) return { title: dict.marketplace.meta.notFound, robots: { index: false, follow: false } };
  const [{ listings }, regions] = await Promise.all([listActiveListings(), getRegions().catch(() => [])]);
  const region = regionSlug ? regions.find((r) => r.slug === regionSlug) : null;
  if (regionSlug && !region) return { title: dict.marketplace.meta.notFound, robots: { index: false, follow: false } };
  const count = listings.filter((x) => x.category === category && (!region || x.regionSlug === region.slug)).length;
  const name = dict.marketplaceClient.categories[category];
  const where = region ? ` — ${regionName(region.name, l)}` : "";
  const path = `/marketplace/category/${category}${region ? `/${region.slug}` : ""}`;
  return {
    title: { absolute: fmt(dict.marketplace.meta.categoryTitle, { category: name, where }) },
    description: fmt(dict.marketplace.meta.categoryDescription, { category: name.toLowerCase(), where: region ? ` (${regionName(region.name, l)})` : "" }),
    alternates: alternatesFor(l, path),
    ...(landingIndexable(count) ? {} : { robots: { index: false, follow: true } }),
  };
}

export async function CategoryLanding({ category, regionSlug }: { category: string; regionSlug?: string }) {
  if (!isCategory(category)) notFound();
  const lang = getLang();
  const t = getT("marketplace");
  const labels = getT("marketplaceClient");
  const [{ ready, listings }, regions] = await Promise.all([listActiveListings(), getRegions().catch(() => [])]);
  const region = regionSlug ? regions.find((r) => r.slug === regionSlug) : null;
  if (regionSlug && !region) notFound();

  const inCategory = listings.filter((l) => l.category === category);
  const shown = region ? inCategory.filter((l) => l.regionSlug === region.slug) : inCategory;
  const name = labels.categories[category];
  const where = region ? regionName(region.name, lang) : null;
  const regionLinks = region
    ? []
    : regions.filter((r) => inCategory.some((l) => l.regionSlug === r.slug));
  const path = `/marketplace/category/${category}${region ? `/${region.slug}` : ""}`;

  return (
    <Container className="py-10">
      <JsonLd
        data={breadcrumbSchema([
          { name: t.breadcrumb.home, path: localizePath("/", lang) },
          { name: t.breadcrumb.marketplace, path: localizePath("/marketplace", lang) },
          { name, path: localizePath(`/marketplace/category/${category}`, lang) },
          ...(region && where ? [{ name: where, path: localizePath(path, lang) }] : []),
        ])}
      />
      <nav aria-label="Breadcrumb" className="flex flex-wrap gap-1 text-sm text-muted-foreground">
        <Link href="/marketplace" className="hover:text-foreground">{t.breadcrumb.marketplace}</Link>
        {region && (
          <>
            <span>/</span>
            <Link href={`/marketplace/category/${category}`} className="hover:text-foreground">{name}</Link>
          </>
        )}
      </nav>
      <h1 className="mt-3 text-3xl font-bold tracking-tight md:text-4xl">
        {where ? fmt(t.landing.headingIn, { category: name, where }) : fmt(t.landing.heading, { category: name })}
      </h1>
      <p className="mt-3 max-w-2xl text-muted-foreground">{t.landing.lead}</p>

      {regionLinks.length > 0 && (
        <div className="mt-6">
          <h2 className="text-sm font-medium text-muted-foreground">{t.landing.regions}</h2>
          <ul className="mt-2 flex flex-wrap gap-2">
            {regionLinks.map((r) => (
              <li key={r.slug}>
                <Link href={`/marketplace/category/${category}/${r.slug}`} className="inline-block rounded-full border border-border px-3 py-1 text-sm hover:bg-secondary">
                  {regionName(r.name, lang)}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-8">
        {!ready ? (
          <EmptyState title={t.index.comingSoonTitle} description={t.index.comingSoonBody} />
        ) : shown.length === 0 ? (
          <EmptyState title={t.index.emptyTitle} description={t.index.emptyBody}>
            <Link href="/marketplace/new" className={buttonVariants()}>{t.index.sell}</Link>
          </EmptyState>
        ) : (
          <>
            <p className="mb-4 text-sm text-muted-foreground">{plural(shown.length, t.index.count)}</p>
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {shown.map((l) => (
                <li key={l.id}>
                  <ListingCard listing={l} />
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </Container>
  );
}
