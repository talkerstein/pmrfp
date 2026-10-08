import type { Metadata } from "next";
import Image from "next/image";
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
import {
  JsonLd,
  breadcrumbSchema,
  faqSchema,
  itemListSchema,
} from "@/lib/seo/jsonld";
import { getCategories, getRegions } from "@/lib/data/taxonomy";
import { listVendors } from "@/lib/data/directory";
import { listRfps } from "@/lib/data/rfps";
import { getTemplatesForTrade } from "@/lib/seo/rfp-templates";
import { localizeRfpTemplate } from "@/lib/seo/rfp-templates.fr";
import { listCitiesForTrade } from "@/lib/data/trade-city";
import { costGuidesFor } from "@/lib/seo/cost-guides.fr";
import { SITE } from "@/lib/site";
import { liveSolutionFor } from "@/lib/partners/vertical-solutions";
import { VerticalSolutionBlock } from "@/components/public/vertical-solution";
import { SponsorSlot } from "@/components/sponsors/sponsor-slot";
import { tradePhoto } from "@/lib/photos";
import { getLang, getT, setLangFrom } from "@/i18n/server";
import { forumForTrade } from "@/lib/forum/categories";
import { getDictionary } from "@/i18n/dictionaries";
import { hasLocale, localizePath, type Locale } from "@/i18n/config";
import { alternatesFor } from "@/i18n/metadata";
import { fmt } from "@/i18n/format";
import { regionName, tradeName } from "@/i18n/terms";
import { frIn, frTradeOf } from "@/lib/seo/phrases.fr";
import { esIn, esTradeOf } from "@/lib/seo/phrases.es";
import { photoAlt } from "@/lib/seo/photos.fr";

export const revalidate = 3600;

export async function generateStaticParams({ params }: { params: { lang: string } }) {
  // English is prebuilt in full; French and Spanish get a few and render the rest
  // on first visit, then cache (ISR). Prebuilding every language tripled the build.
  // (An empty list for any language switches prebuilding off for the whole route.)
  const cats = await getCategories();
  const all = cats.map((c) => ({ category: c.slug }));
  return params.lang === "en" ? all : all.slice(0, 3);
}

async function getCategory(slug: string) {
  const cats = await getCategories();
  return cats.find((c) => c.slug === slug) ?? null;
}

/** Placeholders for the seo strings: each language picks the ones it needs. */
function tradeVars(name: string, lang: Locale) {
  return {
    site: SITE.name,
    trade: tradeName(name, lang),
    lower: name.toLowerCase(),
    of: lang === "es" ? esTradeOf(name) : frTradeOf(name),
  };
}

/** The {in} place phrase: Spanish "en Toronto", French "à Toronto" (English strings don't use it). */
const placeIn = (name: string, lang: Locale) => (lang === "es" ? esIn(name) : frIn(name));

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string; category: string }>;
}): Promise<Metadata> {
  const { lang, category } = await params;
  const l = hasLocale(lang) ? lang : "en";
  const t = getDictionary(l).seo.trade;
  const cat = await getCategory(category);
  if (!cat) return { title: t.notFound };
  // Thin-content guard: a category with no vendors AND no RFPs is an empty-state
  // page. Keep it out of the index (links still flow) until it has real content,
  // so the long tail of empty categories doesn't drag the domain down. Auto-flips
  // back to indexable once real listings exist.
  const [vendors, rfps] = await Promise.all([
    listVendors({ category: cat.slug }),
    listRfps({ category: cat.slug }),
  ]);
  const isThin = vendors.length === 0 && rfps.length === 0;
  const vars = tradeVars(cat.name, l);
  return {
    title: fmt(t.meta.title, vars),
    description: fmt(t.meta.description, vars),
    alternates: alternatesFor(l, `/trades/${cat.slug}`),
    ...(isThin ? { robots: { index: false, follow: true } } : {}),
  };
}

export default async function TradeCategoryPage({
  params,
}: {
  params: Promise<{ category: string }>;
}) {
  await setLangFrom(params);
  const seo = getT("seo");
  const t = seo.trade;
  const lang = getLang();
  const { category } = await params;
  const cat = await getCategory(category);
  if (!cat) notFound();

  const [vendors, rfps, regions, liveCities, solution] = await Promise.all([
    listVendors({ category: cat.slug }),
    listRfps({ category: cat.slug }),
    getRegions(),
    listCitiesForTrade(cat.slug),
    liveSolutionFor(cat.slug),
  ]);
  const liveCitySlugs = new Set(liveCities.map((c) => c.region.slug));

  const vars = tradeVars(cat.name, lang);
  const faqs = t.faqs.map((f) => ({ q: fmt(f.q, vars), a: fmt(f.a, vars) }));

  // Live trade × place pages first (busiest first), then other regions to fill.
  const liveRegions = liveCities.map((c) => c.region);
  const topRegions = [
    ...liveRegions,
    ...regions.filter((r) => !["canada", "united-states"].includes(r.slug) && !liveCitySlugs.has(r.slug)),
  ].slice(0, Math.max(12, liveRegions.length));
  const templates = getTemplatesForTrade(cat.slug).map((tpl) => localizeRfpTemplate(tpl, lang));
  const costGuide = costGuidesFor(lang).find((g) => g.tradeSlug === cat.slug);
  const photo = tradePhoto(cat.slug);
  const forum = forumForTrade(cat.slug);
  const forumT = getT("forum");

  return (
    <>
      <JsonLd data={breadcrumbSchema([
        { name: seo.crumbs.home, path: localizePath("/", lang) },
        { name: seo.crumbs.trades, path: localizePath("/trades", lang) },
        { name: vars.trade, path: localizePath(`/trades/${cat.slug}`, lang) },
      ])} />
      <JsonLd data={itemListSchema(fmt(t.listName, vars), vendors.map((v) => ({ name: v.name, path: localizePath(`/directory/${v.slug}`, lang) })))} />
      <JsonLd data={faqSchema(faqs.map((f) => ({ q: f.q, a: f.a })))} />

      <section className="border-b border-border bg-secondary/30">
        <Container className="grid items-center gap-8 py-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,440px)] lg:gap-12">
          <div>
            <nav className="mb-3 text-xs text-muted-foreground">
              <Link href="/trades" className="hover:text-foreground">{seo.crumbs.trades}</Link> / {vars.trade}
            </nav>
            <Eyebrow>{fmt(t.eyebrow, vars)}</Eyebrow>
            <h1 className="mt-3 max-w-3xl text-3xl font-semibold tracking-tight sm:text-4xl">
              {fmt(t.title, vars)}
            </h1>
            <p className="mt-4 max-w-2xl text-muted-foreground">
              {fmt(t.lead, vars)}
            </p>
            {costGuide && (
              <p className="mt-3 text-sm">
                <Link href={`/cost-guides/${costGuide.slug}`} className="text-teal-700 hover:underline">
                  {fmt(t.costGuide, vars)}
                </Link>
              </p>
            )}
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/sign-up" className={buttonVariants()}>{fmt(t.listCompany, vars)}</Link>
              <Link href={`/rfps?category=${cat.slug}`} className={buttonVariants({ variant: "outline" })}>
                {fmt(t.viewRfps, vars)}
              </Link>
            </div>
          </div>
          <div className="relative aspect-[16/10] overflow-hidden rounded-2xl border border-border bg-indigo lg:aspect-[4/3]">
            <Image
              src={photo.src}
              alt={photoAlt(photo, lang)}
              fill
              loading="eager"
              fetchPriority="high"
              sizes="(min-width: 1024px) 440px, (min-width: 640px) calc(100vw - 4rem), calc(100vw - 2.5rem)"
              className="object-cover"
            />
          </div>
        </Container>
      </section>

      <Container className="py-12">
        <div className="flex items-end justify-between gap-4">
          <h2 className="text-2xl font-semibold tracking-tight">{fmt(t.openTitle, vars)}</h2>
          <Link href={`/rfps?category=${cat.slug}`} className="text-sm text-teal-700 hover:underline">{seo.viewAll}</Link>
        </div>
        {rfps.length === 0 ? (
          <div className="mt-4"><EmptyState title={fmt(t.emptyRfps.title, vars)} description={t.emptyRfps.description} /></div>
        ) : (
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {rfps.slice(0, 6).map((r) => <RfpCard key={r.slug} rfp={r} locked />)}
          </div>
        )}
      </Container>

      <section className="bg-secondary/30">
        <Container className="py-12">
          <div className="flex items-end justify-between gap-4">
            <h2 className="text-2xl font-semibold tracking-tight">{fmt(t.companiesTitle, vars)}</h2>
            <Link href={`/directory?category=${cat.slug}`} className="text-sm text-teal-700 hover:underline">{seo.browseAll}</Link>
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

      {solution && <VerticalSolutionBlock solution={solution} trade={cat.name} />}

      {templates.length > 0 && (
        <Container className="py-12">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight">
                {fmt(t.templatesTitle, vars)}
              </h2>
              <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                {fmt(t.templatesLead, vars)}
              </p>
            </div>
            <Link href="/rfp-templates" className="text-sm text-teal-ink hover:underline">
              {t.allTemplates}
            </Link>
          </div>
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {templates.slice(0, 3).map((tpl) => (
              <Link
                key={tpl.slug}
                href={`/rfp-templates/${tpl.slug}`}
                className="group flex flex-col rounded-lg border border-border bg-card p-5 transition-all hover:border-teal-400 hover:shadow-sm"
              >
                <h3 className="text-base font-semibold leading-snug group-hover:text-teal-ink">
                  {tpl.shortName}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{tpl.pitch}</p>
                <span className="mt-4 text-sm font-medium text-teal-ink">{t.useTemplate}</span>
              </Link>
            ))}
          </div>
        </Container>
      )}

      <Container className="py-12">
        <h2 className="text-2xl font-semibold tracking-tight">{fmt(t.byRegionTitle, vars)}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{fmt(t.byRegionLead, vars)}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {topRegions.map((r) => (
            <Link
              key={r.slug}
              href={liveCitySlugs.has(r.slug) ? `/trades/${cat.slug}/${r.slug}` : `/regions/${r.slug}`}
              className="rounded-md border border-border bg-card px-3 py-1.5 text-sm hover:border-teal-400"
            >
              {fmt(t.inPlace, { ...vars, place: regionName(r.name, lang), in: placeIn(r.name, lang) })}
            </Link>
          ))}
        </div>
        <SponsorSlot
          className="mt-10 max-w-md"
          ctx={{ placement: "trade_page", categories: [cat.slug], seed: cat.slug }}
        />
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
          {forum && (
            <p className="mt-6 text-sm text-muted-foreground">
              {forumT.tradeLinkLead}{" "}
              <Link href={`/forum/${forum}/new?type=question`} rel="nofollow" className="font-medium text-primary hover:underline">
                {fmt(forumT.tradeLink, { name: forumT.categories[forum].name })}
              </Link>{" "}
              ·{" "}
              <Link href={`/forum/${forum}`} className="font-medium text-primary hover:underline">
                {fmt(forumT.org.browseForum, { name: forumT.categories[forum].name })}
              </Link>
            </p>
          )}
        </Container>
      </section>

      <CTASection
        title={fmt(t.cta.title, vars)}
        description={fmt(t.cta.description, { ...vars, price: 249 })}
        primaryHref="/sign-up"
        primaryLabel={seo.joinTrade}
        secondaryHref="/pricing"
        secondaryLabel={seo.seePricing}
      />
    </>
  );
}
