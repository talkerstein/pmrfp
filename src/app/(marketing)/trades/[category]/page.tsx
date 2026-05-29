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
import {
  JsonLd,
  breadcrumbSchema,
  faqSchema,
  itemListSchema,
} from "@/lib/seo/jsonld";
import { getCategories, getRegions } from "@/lib/data/taxonomy";
import { listVendors } from "@/lib/data/directory";
import { listRfps } from "@/lib/data/rfps";
import { SITE } from "@/lib/site";

export const revalidate = 3600;

export async function generateStaticParams() {
  const cats = await getCategories();
  return cats.map((c) => ({ category: c.slug }));
}

async function getCategory(slug: string) {
  const cats = await getCategories();
  return cats.find((c) => c.slug === slug) ?? null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ category: string }>;
}): Promise<Metadata> {
  const { category } = await params;
  const cat = await getCategory(category);
  if (!cat) return { title: "Trade not found" };
  return {
    title: `Commercial ${cat.name} Contractors in Canada | Directory & RFPs`,
    description: `Find commercial ${cat.name.toLowerCase()} contractors across Canada and monitor ${cat.name.toLowerCase()} RFP opportunities. Get your ${cat.name.toLowerCase()} company listed on ${SITE.name}.`,
    alternates: { canonical: `/trades/${cat.slug}` },
  };
}

export default async function TradeCategoryPage({
  params,
}: {
  params: Promise<{ category: string }>;
}) {
  const { category } = await params;
  const cat = await getCategory(category);
  if (!cat) notFound();

  const [vendors, rfps, regions] = await Promise.all([
    listVendors({ category: cat.slug }),
    listRfps({ category: cat.slug }),
    getRegions(),
  ]);

  const lower = cat.name.toLowerCase();
  const faqs = [
    {
      q: `How do I find commercial ${lower} RFP opportunities in Canada?`,
      a: `${SITE.name} aggregates commercial property ${lower} RFPs from property managers, builders, and owners across Canada. Browse open opportunities and, with a Trade Pro membership, view full details and express interest.`,
    },
    {
      q: `How do I get my ${lower} company listed?`,
      a: `Create a free company profile, choose ${cat.name} as a service category and your service regions, and your company appears in the ${SITE.name} vendor directory where property decision-makers search.`,
    },
    {
      q: `Does ${SITE.name} guarantee ${lower} contracts?`,
      a: `No. ${SITE.name} is a vendor discovery and RFP visibility platform. We help your company get found and monitor opportunities — we do not guarantee awards, responses, or revenue.`,
    },
  ];

  const topRegions = regions.filter((r) => !["canada"].includes(r.slug)).slice(0, 12);

  return (
    <>
      <JsonLd data={breadcrumbSchema([
        { name: "Home", path: "/" },
        { name: "Trades", path: "/trades" },
        { name: cat.name, path: `/trades/${cat.slug}` },
      ])} />
      <JsonLd data={itemListSchema(`${cat.name} companies`, vendors.map((v) => ({ name: v.name, path: `/directory/${v.slug}` })))} />
      <JsonLd data={faqSchema(faqs.map((f) => ({ q: f.q, a: f.a })))} />

      <section className="border-b border-border bg-secondary/30">
        <Container className="py-12">
          <nav className="mb-3 text-xs text-muted-foreground">
            <Link href="/trades" className="hover:text-foreground">Trades</Link> / {cat.name}
          </nav>
          <Eyebrow>Commercial {cat.name}</Eyebrow>
          <h1 className="mt-3 max-w-3xl text-3xl font-semibold tracking-tight sm:text-4xl">
            Commercial {cat.name} Contractors & RFP Opportunities in Canada
          </h1>
          <p className="mt-4 max-w-2xl text-muted-foreground">
            Whether you run a {lower} company looking for commercial property work, or you manage
            properties and need a qualified {lower} contractor, {SITE.name} connects both sides —
            a Canada-first directory plus a focused feed of {lower} RFP opportunities.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/sign-up" className={buttonVariants()}>List your {lower} company</Link>
            <Link href={`/rfps?category=${cat.slug}`} className={buttonVariants({ variant: "outline" })}>
              View {lower} RFPs
            </Link>
          </div>
        </Container>
      </section>

      <Container className="py-12">
        <div className="flex items-end justify-between gap-4">
          <h2 className="text-2xl font-semibold tracking-tight">Open {cat.name} opportunities</h2>
          <Link href={`/rfps?category=${cat.slug}`} className="text-sm text-gold-700 hover:underline">View all →</Link>
        </div>
        {rfps.length === 0 ? (
          <div className="mt-4"><EmptyState title={`No open ${lower} RFPs right now`} description="New opportunities are added regularly — check back soon or get listed to be ready." /></div>
        ) : (
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {rfps.slice(0, 6).map((r) => <RfpCard key={r.slug} rfp={r} locked={false} />)}
          </div>
        )}
      </Container>

      <section className="bg-secondary/30">
        <Container className="py-12">
          <div className="flex items-end justify-between gap-4">
            <h2 className="text-2xl font-semibold tracking-tight">{cat.name} companies in the directory</h2>
            <Link href={`/directory?category=${cat.slug}`} className="text-sm text-gold-700 hover:underline">Browse all →</Link>
          </div>
          {vendors.length === 0 ? (
            <div className="mt-4"><EmptyState title={`Be the first ${lower} company listed`} description="Create a profile and get discovered by property managers searching this category." /></div>
          ) : (
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {vendors.slice(0, 6).map((v) => <DirectoryCard key={v.slug} vendor={v} />)}
            </div>
          )}
        </Container>
      </section>

      <Container className="py-12">
        <h2 className="text-2xl font-semibold tracking-tight">{cat.name} by region</h2>
        <p className="mt-2 text-sm text-muted-foreground">Explore {lower} demand and vendors across Canada.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {topRegions.map((r) => (
            <Link key={r.slug} href={`/regions/${r.slug}`} className="rounded-md border border-border bg-card px-3 py-1.5 text-sm hover:border-gold-400">
              {cat.name} in {r.name}
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
        title={`Win more commercial ${lower} work`}
        description={`Get listed and monitor ${lower} RFPs across Canada — $${249} CAD/year for Trade Pro.`}
        primaryHref="/sign-up"
        primaryLabel="Join as a Trade Company"
        secondaryHref="/pricing"
        secondaryLabel="See pricing"
      />
    </>
  );
}
