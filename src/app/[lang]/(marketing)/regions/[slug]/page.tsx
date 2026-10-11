import type { Metadata } from "next";
import { prebuildSlice } from "@/lib/build/prebuild";
import Link from "@/i18n/link";
import { notFound } from "next/navigation";
import { Container, Eyebrow } from "@/components/container";
import { DirectoryCard } from "@/components/public/directory-card";
import { RfpCard } from "@/components/public/rfp-card";
import { CTASection } from "@/components/public/section";
import { EmptyState } from "@/components/public/empty-state";
import { buttonVariants } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { JsonLd, breadcrumbSchema, faqSchema, itemListSchema } from "@/lib/seo/jsonld";
import { getCategories, getRegions } from "@/lib/data/taxonomy";
import { getRegionLiquidityBySlug } from "@/lib/data/liquidity";
import { FoundingRegionNotice } from "@/components/public/founding-region-notice";
import { listVendors } from "@/lib/data/directory";
import { listRfps, withPublicRfpPhotos } from "@/lib/data/rfps";
import { listTradesForRegion } from "@/lib/data/trade-city";
import { SITE } from "@/lib/site";
import { getLang, getT, setLangFrom } from "@/i18n/server";
import { getDictionary } from "@/i18n/dictionaries";
import { hasLocale, localizePath, type Locale } from "@/i18n/config";
import { alternatesFor } from "@/i18n/metadata";
import { fmt } from "@/i18n/format";
import { regionName, tradeName } from "@/i18n/terms";
import { frIn, frPlace, frTradeOf } from "@/lib/seo/phrases.fr";
import { esIn, esPlace, esTradeOf } from "@/lib/seo/phrases.es";

export const revalidate = 3600;

export async function generateStaticParams({ params }: { params: { lang: string } }) {
  // A few pages are prebuilt (lib/build/prebuild); the rest render
  // on first visit, then cache (ISR), so deploys do not stampede the database.
  // (An empty list for any language switches prebuilding off for the whole route.)
  const regions = await getRegions();
  const all = regions.map((r) => ({ slug: r.slug }));
  return prebuildSlice(all, params.lang);
}

async function getRegion(slug: string) {
  const regions = await getRegions();
  return regions.find((r) => r.slug === slug) ?? null;
}

/** Placeholders for the seo strings: each language picks the ones it needs. */
function placeVars(placeEn: string, lang: Locale) {
  return { site: SITE.name, place: regionName(placeEn, lang), in: lang === "es" ? esIn(placeEn) : frIn(placeEn) };
}

/** A group heading (province, state or country) in the page language. */
function placeHeading(name: string, lang: Locale): string {
  if (lang === "fr") return frPlace(name);
  if (lang === "es") return esPlace(name);
  return regionName(name, lang);
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string; slug: string }>;
}): Promise<Metadata> {
  const { lang, slug } = await params;
  const l = hasLocale(lang) ? lang : "en";
  const t = getDictionary(l).seo.region;
  const region = await getRegion(slug);
  if (!region) return { title: t.notFound };
  // Thin-content guard: a region with no vendors AND no RFPs is an empty-state
  // page with no unique value. Keep it out of the index (links still flow) until
  // it has real content, so empty pages don't drag the domain's quality signal
  // down. Auto-flips back to indexable once real listings exist.
  const [vendors, rfps] = await Promise.all([
    listVendors({ region: region.slug }),
    listRfps({ region: region.slug }),
  ]);
  const isThin = vendors.length === 0 && rfps.length === 0;
  const vars = placeVars(region.name, l);
  return {
    title: fmt(t.meta.title, vars),
    description: fmt(t.meta.description, vars),
    alternates: alternatesFor(l, `/regions/${region.slug}`),
    ...(isThin ? { robots: { index: false, follow: true } } : {}),
  };
}

export default async function RegionPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  await setLangFrom(params);
  const seo = getT("seo");
  const t = seo.region;
  const lang = getLang();
  const { slug } = await params;
  const region = await getRegion(slug);
  if (!region) notFound();
  const vars = placeVars(region.name, lang);

  const [vendors, rfps, categories, liveTrades] = await Promise.all([
    listVendors({ region: region.slug }),
    listRfps({ region: region.slug }),
    getCategories(),
    listTradesForRegion(region.slug),
  ]);
  const liveTradeSlugs = new Set(liveTrades.map((c) => c.category.slug));
  // Trades with a live page here first, linked to it; the rest to the trade hub.
  const tradeLinks = [
    ...liveTrades.map((c) => ({
      slug: c.category.slug,
      name: fmt(c.open.length + c.past.length ? t.tradeRfps : t.tradeIn, {
        ...vars,
        trade: tradeName(c.category.name, lang),
        of: lang === "es" ? esTradeOf(c.category.name) : frTradeOf(c.category.name),
      }),
      href: `/trades/${c.category.slug}/${region.slug}`,
    })),
    ...categories
      .filter((c) => !liveTradeSlugs.has(c.slug))
      .map((c) => ({ slug: c.slug, name: tradeName(c.name, lang), href: `/trades/${c.slug}` })),
  ].slice(0, Math.max(18, liveTrades.length));
  // listRfps() includes closed RFPs — only status === "open" may be called open.
  const openRfps = rfps.filter((r) => r.status === "open");
  // Photos only for the six cards shown (one small query, not the whole board).
  const cardRfps = await withPublicRfpPhotos(rfps.slice(0, 6)).catch(() => rfps.slice(0, 6));

  const regionLiq = await getRegionLiquidityBySlug(region.slug);
  const showFounding = regionLiq ? regionLiq.tier !== "active" : false;

  const faqs = t.faqs.map((f) => ({ q: fmt(f.q, vars), a: fmt(f.a, vars) }));

  return (
    <>
      <JsonLd data={breadcrumbSchema([
        { name: seo.crumbs.home, path: localizePath("/", lang) },
        { name: seo.crumbs.regions, path: localizePath("/regions", lang) },
        { name: vars.place, path: localizePath(`/regions/${region.slug}`, lang) },
      ])} />
      <JsonLd data={itemListSchema(fmt(t.listName, vars), vendors.map((v) => ({ name: v.name, path: localizePath(`/directory/${v.slug}`, lang) })))} />
      <JsonLd data={faqSchema(faqs)} />

      <section className="border-b border-border bg-secondary/30">
        <Container className="py-12">
          <nav className="mb-3 text-xs text-muted-foreground">
            <Link href="/regions" className="hover:text-foreground">{seo.crumbs.regions}</Link> / {vars.place}
          </nav>
          <Eyebrow>{placeHeading(region.province ?? region.country, lang)}</Eyebrow>
          <h1 className="mt-3 max-w-3xl text-3xl font-semibold tracking-tight sm:text-4xl">
            {fmt(t.title, vars)}
          </h1>
          <p className="mt-4 max-w-2xl text-muted-foreground">
            {fmt(t.lead, vars)}
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href={`/directory?region=${region.slug}`} className={buttonVariants()}>{fmt(t.findVendors, vars)}</Link>
            <Link href={`/rfps?region=${region.slug}`} className={buttonVariants({ variant: "outline" })}>{fmt(t.viewRfps, vars)}</Link>
          </div>
        </Container>
      </section>

      {showFounding && (
        <Container className="pt-8">
          <FoundingRegionNotice
            regionName={region.name}
            regionSlug={region.slug}
            reason="no_supply_directory"
            role="property_manager"
            province={region.province ?? undefined}
            country={region.country}
          />
        </Container>
      )}

      <Container className="py-12">
        <div className="flex items-end justify-between gap-4">
          <h2 className="text-2xl font-semibold tracking-tight">
            {fmt(openRfps.length > 0 ? t.openTitle : t.recentTitle, vars)}
          </h2>
          <Link href={`/rfps?region=${region.slug}`} className="text-sm text-teal-700 hover:underline">{seo.viewAll}</Link>
        </div>
        {rfps.length === 0 ? (
          <div className="mt-4"><EmptyState title={fmt(t.emptyRfps.title, vars)} description={t.emptyRfps.description} /></div>
        ) : (
          <>
            {openRfps.length === 0 && (
              <p className="mt-2 text-sm text-muted-foreground">
                {t.closedNote}
              </p>
            )}
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {cardRfps.map((r) => <RfpCard key={r.slug} rfp={r} locked />)}
            </div>
          </>
        )}
      </Container>

      <section className="bg-secondary/30">
        <Container className="py-12">
          <div className="flex items-end justify-between gap-4">
            <h2 className="text-2xl font-semibold tracking-tight">{fmt(t.vendorsTitle, vars)}</h2>
            <Link href={`/directory?region=${region.slug}`} className="text-sm text-teal-700 hover:underline">{seo.browseAll}</Link>
          </div>
          {vendors.length === 0 ? (
            <div className="mt-4"><EmptyState title={fmt(t.emptyVendors.title, vars)} description={t.emptyVendors.description} /></div>
          ) : (
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {vendors.slice(0, 6).map((v) => <DirectoryCard key={v.slug} vendor={v} />)}
            </div>
          )}
        </Container>
      </section>

      <Container className="py-12">
        <h2 className="text-2xl font-semibold tracking-tight">{fmt(t.tradesTitle, vars)}</h2>
        <div className="mt-4 flex flex-wrap gap-2">
          {tradeLinks.map((c) => (
            <Link key={c.slug} href={c.href} className="rounded-md border border-border bg-card px-3 py-1.5 text-sm hover:border-teal-400">
              {c.name}
            </Link>
          ))}
        </div>
      </Container>

      <section className="border-t border-border">
        <Container size="narrow" className="py-12">
          <h2 className="text-2xl font-semibold tracking-tight">{seo.faqTitle}</h2>
          <Accordion className="mt-4">
            {faqs.map((f, i) => (
              <AccordionItem key={i} value={`q${i}`}>
                <AccordionTrigger>{f.q}</AccordionTrigger>
                <AccordionContent>{f.a}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </Container>
      </section>

      <CTASection
        title={fmt(t.cta.title, vars)}
        description={t.cta.description}
        primaryHref="/sign-up"
        primaryLabel={seo.joinTrade}
        secondaryHref="/trades"
        secondaryLabel={seo.browseByTrade}
      />
    </>
  );
}
