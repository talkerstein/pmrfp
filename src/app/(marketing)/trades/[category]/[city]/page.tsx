import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Container, Eyebrow } from "@/components/container";
import { DirectoryCard } from "@/components/public/directory-card";
import { RfpCard } from "@/components/public/rfp-card";
import { CTASection } from "@/components/public/section";
import { buttonVariants } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { JsonLd, breadcrumbSchema, faqSchema, itemListSchema } from "@/lib/seo/jsonld";
import { getQualifyingCombo, listQualifyingCombos } from "@/lib/data/trade-city";
import { listVendors } from "@/lib/data/directory";
import { listRfps } from "@/lib/data/rfps";
import { COST_GUIDES } from "@/lib/seo/cost-guides";
import { getTemplatesForTrade } from "@/lib/seo/rfp-templates";
import { SITE } from "@/lib/site";

export const revalidate = 3600;

/**
 * Content-gated programmatic page: exists ONLY for trade×city combos with
 * enough approved vendors (see MIN_VENDORS in lib/data/trade-city). Combos
 * below the gate 404 — never rendered, never in the sitemap, never linked —
 * so the ~1,000-page empty grid that would read as scaled content simply
 * doesn't exist. New combos turn on via ISR as vendors are approved.
 */
export async function generateStaticParams() {
  const combos = await listQualifyingCombos();
  return combos.map((c) => ({ category: c.category.slug, city: c.region.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ category: string; city: string }>;
}): Promise<Metadata> {
  const { category, city } = await params;
  const combo = await getQualifyingCombo(category, city);
  if (!combo) return { title: "Not found" };
  const { category: cat, region } = combo;
  return {
    title: `Commercial ${cat.name} Contractors in ${region.name} | Directory & RFPs`,
    description: `${combo.vendorCount} commercial ${cat.name.toLowerCase()} ${
      combo.vendorCount === 1 ? "contractor" : "contractors"
    } serving ${region.name} on ${SITE.name} — compare companies, post an RFP free, and get quotes for ${cat.name.toLowerCase()} work.`,
    alternates: { canonical: `/trades/${cat.slug}/${region.slug}` },
  };
}

export default async function TradeCityPage({
  params,
}: {
  params: Promise<{ category: string; city: string }>;
}) {
  const { category, city } = await params;
  const combo = await getQualifyingCombo(category, city);
  if (!combo) notFound();

  const { category: cat, region } = combo;
  const lower = cat.name.toLowerCase();

  const [vendors, rfps] = await Promise.all([
    listVendors({ category: cat.slug, region: region.slug }),
    listRfps({ category: cat.slug, region: region.slug }),
  ]);
  // The gate ran against a cached combo list; the live vendor query is the
  // truth. If approvals were just revoked, don't render a hollow page.
  if (vendors.length === 0) notFound();

  const guide = COST_GUIDES.find((g) => g.tradeSlug === cat.slug);
  const templates = getTemplatesForTrade(cat.slug);

  const faqs = [
    {
      q: `How do I get quotes from ${lower} contractors in ${region.name}?`,
      a: `Post your project as an RFP on ${SITE.name} — free for property managers and owners. ${cat.name} contractors serving ${region.name} see it and express interest, and you compare respondents in one place instead of chasing quotes by email.`,
    },
    {
      q: `Are these ${lower} companies vetted?`,
      a: `Each company maintains its own profile, including insurance and licensing details where provided. Listings marked Verified have been reviewed by ${SITE.name}. Always confirm credentials directly before awarding work.`,
    },
    {
      q: `I run a ${lower} company serving ${region.name} — how do I get listed?`,
      a: `Create a free profile, select ${cat.name} as a service category and ${region.name} as a service region. Your company appears in this directory where local property managers search.`,
    },
  ];

  return (
    <>
      <JsonLd
        data={breadcrumbSchema([
          { name: "Home", path: "/" },
          { name: "Trades", path: "/trades" },
          { name: cat.name, path: `/trades/${cat.slug}` },
          { name: region.name, path: `/trades/${cat.slug}/${region.slug}` },
        ])}
      />
      <JsonLd
        data={itemListSchema(
          `${cat.name} companies in ${region.name}`,
          vendors.map((v) => ({ name: v.name, path: `/directory/${v.slug}` })),
        )}
      />
      <JsonLd data={faqSchema(faqs.map((f) => ({ q: f.q, a: f.a })))} />

      <section className="border-b border-border bg-secondary/30">
        <Container className="py-12">
          <nav className="mb-3 text-xs text-muted-foreground">
            <Link href="/trades" className="hover:text-foreground">Trades</Link>
            {" / "}
            <Link href={`/trades/${cat.slug}`} className="hover:text-foreground">{cat.name}</Link>
            {" / "}
            {region.name}
          </nav>
          <Eyebrow>
            {cat.name} · {region.name}
          </Eyebrow>
          <h1 className="mt-3 max-w-3xl text-3xl font-semibold tracking-tight sm:text-4xl">
            Commercial {cat.name} Contractors in {region.name}
          </h1>
          <p className="mt-4 max-w-2xl text-muted-foreground">
            {combo.vendorCount === 1 ? "One" : combo.vendorCount} {lower}{" "}
            {combo.vendorCount === 1 ? "company" : "companies"} on {SITE.name}{" "}
            serve{combo.vendorCount === 1 ? "s" : ""} {region.name}. Managing property here? Post
            your {lower} project once, free, and interested contractors come to you.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/sign-up" className={buttonVariants()}>
              Post a {lower} RFP — free
            </Link>
            <Link
              href={`/directory?category=${cat.slug}&region=${region.slug}`}
              className={buttonVariants({ variant: "outline" })}
            >
              Browse the directory
            </Link>
          </div>
        </Container>
      </section>

      <Container className="py-12">
        <h2 className="text-2xl font-semibold tracking-tight">
          {cat.name} companies serving {region.name}
        </h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {vendors.map((v) => (
            <DirectoryCard key={v.slug} vendor={v} />
          ))}
        </div>
      </Container>

      {rfps.length > 0 && (
        <section className="bg-secondary/30">
          <Container className="py-12">
            <div className="flex items-end justify-between gap-4">
              <h2 className="text-2xl font-semibold tracking-tight">
                Open {lower} opportunities in {region.name}
              </h2>
              <Link
                href={`/rfps?category=${cat.slug}&region=${region.slug}`}
                className="text-sm text-teal-700 hover:underline"
              >
                View all →
              </Link>
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {rfps.slice(0, 6).map((r) => (
                <RfpCard key={r.slug} rfp={r} locked={false} />
              ))}
            </div>
          </Container>
        </section>
      )}

      {(guide || templates.length > 0) && (
        <Container className="py-12">
          <h2 className="text-2xl font-semibold tracking-tight">
            Planning {lower} work in {region.name}?
          </h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {guide && (
              <Link
                href={`/cost-guides/${guide.slug}`}
                className="group rounded-lg border border-border bg-card p-5 transition-all hover:border-teal-400 hover:shadow-sm"
              >
                <h3 className="text-base font-semibold group-hover:text-teal-ink">
                  What does it cost? →
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  Canadian planning ranges for {lower} work — before you collect real quotes.
                </p>
              </Link>
            )}
            {templates.slice(0, 1).map((t) => (
              <Link
                key={t.slug}
                href={`/rfp-templates/${t.slug}`}
                className="group rounded-lg border border-border bg-card p-5 transition-all hover:border-teal-400 hover:shadow-sm"
              >
                <h3 className="text-base font-semibold group-hover:text-teal-ink">
                  Start from an RFP template →
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {t.name.replace(/ RFP Template$/, "")} — scope, requirements, and evaluation
                  criteria, ready to customize.
                </p>
              </Link>
            ))}
          </div>
        </Container>
      )}

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
        title={`Need a ${lower} contractor in ${region.name}?`}
        description={`Post your project free on ${SITE.name} and compare interested ${lower} companies side by side.`}
        primaryHref="/sign-up"
        primaryLabel="Post an RFP free"
        secondaryHref={`/trades/${cat.slug}`}
        secondaryLabel={`All ${cat.name} in Canada`}
      />
    </>
  );
}
