import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Container, Eyebrow } from "@/components/container";
import { CTASection } from "@/components/public/section";
import { TrustDisclaimer } from "@/components/public/trust-disclaimer";
import { JsonLd, breadcrumbSchema, itemListSchema } from "@/lib/seo/jsonld";
import { COST_GUIDES } from "@/lib/seo/cost-guides";
import { SITE } from "@/lib/site";

export const revalidate = 86400;

export const metadata: Metadata = {
  title: "Commercial Property Cost Guides (Canada) — What Trade Work Costs",
  description:
    "Plain-English cost guides for Canadian commercial property work — roofing, HVAC, renovations, paving, snow, cleaning, and more. See typical ranges, then post an RFP for real quotes.",
  alternates: { canonical: "/cost-guides" },
};

export default function CostGuidesIndexPage() {
  return (
    <>
      <JsonLd
        data={breadcrumbSchema([
          { name: "Home", path: "/" },
          { name: "Cost Guides", path: "/cost-guides" },
        ])}
      />
      <JsonLd
        data={itemListSchema(
          "Commercial Property Cost Guides",
          COST_GUIDES.map((g) => ({ name: g.name, path: `/cost-guides/${g.slug}` })),
        )}
      />

      <section className="border-b border-border bg-secondary/30">
        <Container className="py-12">
          <Eyebrow>Cost Guides</Eyebrow>
          <h1 className="mt-3 max-w-3xl text-3xl font-semibold tracking-tight sm:text-4xl">
            What does commercial property work cost in Canada?
          </h1>
          <p className="mt-4 max-w-2xl text-muted-foreground">
            Budgeting a project? These guides give you honest, plain-English planning ranges for the
            most common commercial property work — so you walk into an RFP knowing roughly what to
            expect. They&rsquo;re estimates, not quotes: the real number comes from interested trades
            once you post your scope.
          </p>
        </Container>
      </section>

      <Container className="py-12">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {COST_GUIDES.map((g) => (
            <Link
              key={g.slug}
              href={`/cost-guides/${g.slug}`}
              className="group flex flex-col rounded-lg border border-border bg-card p-6 transition-all hover:border-teal-400 hover:shadow-sm"
            >
              <Eyebrow>{g.tradeName}</Eyebrow>
              <h2 className="mt-3 text-lg font-semibold leading-snug group-hover:text-teal-700">
                {g.name}
              </h2>
              <p className="mt-2 text-sm font-medium text-foreground/90">
                Typical: {g.typicalRange}{" "}
                <span className="font-normal text-muted-foreground">— {g.rangeUnit}</span>
              </p>
              <span className="mt-4 flex items-center gap-1 text-sm font-medium text-teal-700">
                See the guide{" "}
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
              </span>
            </Link>
          ))}
        </div>

        <div className="mt-10">
          <TrustDisclaimer />
        </div>
      </Container>

      <CTASection
        title="Skip the guesswork — get real numbers"
        description={`Post your project on ${SITE.name} and qualified Canadian trades respond with real, scope-specific pricing. Free to post.`}
        primaryHref="/sign-up"
        primaryLabel="Post an RFP"
        secondaryHref="/directory"
        secondaryLabel="Browse the directory"
      />
    </>
  );
}
