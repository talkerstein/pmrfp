import type { Metadata } from "next";
import Link from "next/link";
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
import { listRfps } from "@/lib/data/rfps";
import { SITE } from "@/lib/site";

export const revalidate = 3600;

export async function generateStaticParams() {
  const regions = await getRegions();
  return regions.map((r) => ({ slug: r.slug }));
}

async function getRegion(slug: string) {
  const regions = await getRegions();
  return regions.find((r) => r.slug === slug) ?? null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const region = await getRegion(slug);
  if (!region) return { title: "Region not found" };
  // Thin-content guard: a region with no vendors AND no RFPs is an empty-state
  // page with no unique value. Keep it out of the index (links still flow) until
  // it has real content, so empty pages don't drag the domain's quality signal
  // down. Auto-flips back to indexable once real listings exist.
  const [vendors, rfps] = await Promise.all([
    listVendors({ region: region.slug }),
    listRfps({ region: region.slug }),
  ]);
  const isThin = vendors.length === 0 && rfps.length === 0;
  return {
    title: `Commercial Property Vendors & RFPs in ${region.name} | ${SITE.name}`,
    description: `Find commercial property trades and service companies in ${region.name}, and monitor local property RFP opportunities on ${SITE.name}.`,
    alternates: { canonical: `/regions/${region.slug}` },
    ...(isThin ? { robots: { index: false, follow: true } } : {}),
  };
}

export default async function RegionPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const region = await getRegion(slug);
  if (!region) notFound();

  const [vendors, rfps, categories] = await Promise.all([
    listVendors({ region: region.slug }),
    listRfps({ region: region.slug }),
    getCategories(),
  ]);
  // listRfps() includes closed RFPs — only status === "open" may be called open.
  const openRfps = rfps.filter((r) => r.status === "open");

  const regionLiq = await getRegionLiquidityBySlug(region.slug);
  const showFounding = regionLiq ? regionLiq.tier !== "active" : false;

  const faqs = [
    {
      q: `How do I find commercial property RFPs in ${region.name}?`,
      a: `${SITE.name} aggregates commercial property RFPs from property managers, builders, and owners in ${region.name}. Browse opportunities and, with Trade Pro, view full details and express interest.`,
    },
    {
      q: `How do I find vendors in ${region.name}?`,
      a: `Browse the ${SITE.name} directory filtered to ${region.name} to discover trades and service companies by category, then request an introduction or contact them directly.`,
    },
  ];

  return (
    <>
      <JsonLd data={breadcrumbSchema([
        { name: "Home", path: "/" },
        { name: "Regions", path: "/regions" },
        { name: region.name, path: `/regions/${region.slug}` },
      ])} />
      <JsonLd data={itemListSchema(`Vendors in ${region.name}`, vendors.map((v) => ({ name: v.name, path: `/directory/${v.slug}` })))} />
      <JsonLd data={faqSchema(faqs)} />

      <section className="border-b border-border bg-secondary/30">
        <Container className="py-12">
          <nav className="mb-3 text-xs text-muted-foreground">
            <Link href="/regions" className="hover:text-foreground">Regions</Link> / {region.name}
          </nav>
          <Eyebrow>{region.province ?? region.country}</Eyebrow>
          <h1 className="mt-3 max-w-3xl text-3xl font-semibold tracking-tight sm:text-4xl">
            Commercial Property Vendors & RFP Opportunities in {region.name}
          </h1>
          <p className="mt-4 max-w-2xl text-muted-foreground">
            {SITE.name} connects property managers, builders, and owners in {region.name} with
            qualified local trades — and gives trade companies a focused feed of property RFP
            opportunities in the area.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href={`/directory?region=${region.slug}`} className={buttonVariants()}>Find vendors in {region.name}</Link>
            <Link href={`/rfps?region=${region.slug}`} className={buttonVariants({ variant: "outline" })}>View {region.name} RFPs</Link>
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
            {openRfps.length > 0 ? `Open opportunities in ${region.name}` : `Recent RFPs in ${region.name}`}
          </h2>
          <Link href={`/rfps?region=${region.slug}`} className="text-sm text-teal-700 hover:underline">View all →</Link>
        </div>
        {rfps.length === 0 ? (
          <div className="mt-4"><EmptyState title={`No RFPs in ${region.name} right now`} description="Create a free profile and save your trade and region — we'll notify you when a match is posted." /></div>
        ) : (
          <>
            {openRfps.length === 0 && (
              <p className="mt-2 text-sm text-muted-foreground">
                Nothing is open right now. These closed projects show the kind of work posted here.
              </p>
            )}
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {rfps.slice(0, 6).map((r) => <RfpCard key={r.slug} rfp={r} locked={false} />)}
            </div>
          </>
        )}
      </Container>

      <section className="bg-secondary/30">
        <Container className="py-12">
          <div className="flex items-end justify-between gap-4">
            <h2 className="text-2xl font-semibold tracking-tight">Vendors serving {region.name}</h2>
            <Link href={`/directory?region=${region.slug}`} className="text-sm text-teal-700 hover:underline">Browse all →</Link>
          </div>
          {vendors.length === 0 ? (
            <div className="mt-4"><EmptyState title={`Be the first vendor listed in ${region.name}`} description="Create a profile and get discovered by property managers in your area." /></div>
          ) : (
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {vendors.slice(0, 6).map((v) => <DirectoryCard key={v.slug} vendor={v} />)}
            </div>
          )}
        </Container>
      </section>

      <Container className="py-12">
        <h2 className="text-2xl font-semibold tracking-tight">Trades in {region.name}</h2>
        <div className="mt-4 flex flex-wrap gap-2">
          {categories.slice(0, 18).map((c) => (
            <Link key={c.slug} href={`/trades/${c.slug}`} className="rounded-md border border-border bg-card px-3 py-1.5 text-sm hover:border-teal-400">
              {c.name}
            </Link>
          ))}
        </div>
      </Container>

      <section className="border-t border-border">
        <Container size="narrow" className="py-12">
          <h2 className="text-2xl font-semibold tracking-tight">Frequently asked</h2>
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
        title={`Get found in ${region.name}`}
        description="List your trade company where property decision-makers in your region are searching."
        primaryHref="/sign-up"
        primaryLabel="Join as a Trade Company"
        secondaryHref="/trades"
        secondaryLabel="Browse by trade"
      />
    </>
  );
}
