import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Search } from "lucide-react";
import { Container, Eyebrow } from "@/components/container";
import { CTASection } from "@/components/public/section";
import { TrustDisclaimer } from "@/components/public/trust-disclaimer";
import { buttonVariants } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { JsonLd, breadcrumbSchema, faqSchema } from "@/lib/seo/jsonld";
import { COST_GUIDES, getCostGuide } from "@/lib/seo/cost-guides";
import { getTemplateForCostGuide } from "@/lib/seo/rfp-templates";
import { SITE } from "@/lib/site";

export const revalidate = 86400;

export async function generateStaticParams() {
  return COST_GUIDES.map((g) => ({ slug: g.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const g = getCostGuide(slug);
  if (!g) return { title: "Not found" };
  return {
    title: g.metaTitle,
    description: g.metaDescription,
    alternates: { canonical: `/cost-guides/${g.slug}` },
  };
}

export default async function CostGuidePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const g = getCostGuide(slug);
  if (!g) notFound();
  const template = getTemplateForCostGuide(g.slug);

  return (
    <>
      <JsonLd
        data={breadcrumbSchema([
          { name: "Home", path: "/" },
          { name: "Cost Guides", path: "/cost-guides" },
          { name: g.name, path: `/cost-guides/${g.slug}` },
        ])}
      />
      <JsonLd data={faqSchema(g.faqs)} />

      <section className="border-b border-border bg-background">
        <Container className="py-14 sm:py-16">
          <Eyebrow>{g.tradeName} cost guide</Eyebrow>
          <h1 className="mt-4 max-w-3xl text-3xl font-semibold leading-[1.1] tracking-tight sm:text-4xl">
            {g.headline}
          </h1>
          <div className="mt-6 inline-flex flex-col rounded-xl border border-border bg-secondary/40 px-5 py-4">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Typical Canadian range
            </span>
            <span className="mt-1 text-2xl font-bold text-indigo">{g.typicalRange}</span>
            <span className="text-sm text-muted-foreground">{g.rangeUnit}</span>
          </div>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground">{g.intro}</p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link href="/sign-up" className={buttonVariants({ size: "lg" })}>
              Get real quotes — post an RFP
            </Link>
            <Link
              href={`/trades/${g.tradeSlug}`}
              className={buttonVariants({ size: "lg", variant: "outline" })}
            >
              Browse {g.tradeName} companies
            </Link>
          </div>
        </Container>
      </section>

      <Container className="py-12">
        <h2 className="text-2xl font-semibold tracking-tight">Typical price breakdown</h2>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          General planning ranges for Canadian commercial work. Your actual price depends on scope,
          region, building condition, and access.
        </p>
        <div className="mt-6 overflow-hidden rounded-xl border border-border">
          <table className="w-full border-collapse text-left text-sm">
            <thead className="bg-secondary/50">
              <tr>
                <th className="px-4 py-3 font-semibold">Item</th>
                <th className="px-4 py-3 font-semibold whitespace-nowrap">Typical range</th>
              </tr>
            </thead>
            <tbody>
              {g.rows.map((r) => (
                <tr key={r.item} className="border-t border-border align-top">
                  <td className="px-4 py-3">
                    <span className="font-medium text-foreground">{r.item}</span>
                    {r.note && (
                      <span className="mt-0.5 block text-xs text-muted-foreground">{r.note}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 font-semibold text-indigo whitespace-nowrap">{r.range}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Container>

      <section className="bg-secondary/30">
        <Container className="py-12">
          <h2 className="text-2xl font-semibold tracking-tight">What moves the price</h2>
          <div className="mt-6 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {g.factors.map((f) => (
              <div key={f.title} className="rounded-lg border border-border bg-card p-6">
                <h3 className="text-base font-semibold">{f.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{f.desc}</p>
              </div>
            ))}
          </div>
        </Container>
      </section>

      <Container className="py-12">
        <div className="rounded-2xl border border-border bg-card p-6 sm:p-8">
          <Search className="size-6 text-teal-600" />
          <h2 className="mt-3 text-xl font-semibold tracking-tight sm:text-2xl">
            How to get an accurate price
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            The numbers above are for budgeting. To get a real, scope-specific price, post your
            project as an RFP on {SITE.name} — describe the building, the work, and your region, and
            qualified {g.tradeName.toLowerCase()} companies respond with their own pricing. Posting
            is free, and getting two or three competitive responses is the simplest way to know the
            true market rate.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link href="/sign-up" className={buttonVariants()}>
              Post an RFP <ArrowRight className="size-4" />
            </Link>
            <Link href="/for-property-managers" className={buttonVariants({ variant: "outline" })}>
              How PMRFP works
            </Link>
          </div>
        </div>

        {template && (
          <div className="mt-6 rounded-2xl border border-teal-300 bg-teal-100/40 p-6 sm:p-8">
            <Eyebrow>Skip the blank page</Eyebrow>
            <h2 className="mt-3 text-xl font-semibold tracking-tight sm:text-2xl">
              Use the {template.name.replace(/ RFP Template$/, "")} template
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              We&rsquo;ve already built the scope, requirements, and evaluation criteria for this kind of
              project. Customize in seconds and post — go from cost guide to live RFP without writing
              from scratch.
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <Link href={`/rfp-templates/${template.slug}`} className={buttonVariants()}>
                See the template <ArrowRight className="size-4" />
              </Link>
              <Link
                href={`/pm-dashboard/rfps/new?template=${template.slug}`}
                className={buttonVariants({ variant: "outline" })}
              >
                Use this template
              </Link>
            </div>
          </div>
        )}
      </Container>

      <section className="border-t border-border">
        <Container size="narrow" className="py-12">
          <h2 className="text-2xl font-semibold tracking-tight">Questions</h2>
          <Accordion className="mt-4">
            {g.faqs.map((f, i) => (
              <AccordionItem key={i} value={`q${i}`}>
                <AccordionTrigger>{f.q}</AccordionTrigger>
                <AccordionContent>{f.a}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
          <div className="mt-8">
            <TrustDisclaimer />
          </div>
        </Container>
      </section>

      <CTASection
        title={`Budgeting ${g.name.toLowerCase()}? Get real numbers.`}
        description={`Post your project on ${SITE.name} and qualified Canadian trades respond with real, scope-specific pricing. Free to post.`}
        primaryHref="/sign-up"
        primaryLabel="Post an RFP"
        secondaryHref={`/trades/${g.tradeSlug}`}
        secondaryLabel={`Browse ${g.tradeName}`}
      />
    </>
  );
}
