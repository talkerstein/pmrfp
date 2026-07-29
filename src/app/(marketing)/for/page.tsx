import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Container, Eyebrow } from "@/components/container";
import { CTASection } from "@/components/public/section";
import { VERTICALS } from "@/lib/seo/verticals";
import { SITE } from "@/lib/site";

export const revalidate = 86400;

export const metadata: Metadata = {
  title: "Solutions for Builders, Trades, Sales Teams & Investors",
  description: `How ${SITE.name} works for every side of commercial property: builders, trade contractors, sales teams, and property investors.`,
  alternates: { canonical: "/for" },
};

export default function SolutionsIndexPage() {
  return (
    <>
      <section className="border-b border-border bg-secondary/30">
        <Container className="py-12">
          <Eyebrow>Solutions</Eyebrow>
          <h1 className="mt-3 max-w-3xl text-3xl font-semibold tracking-tight sm:text-4xl">
            Built for every side of commercial property
          </h1>
          <p className="mt-4 max-w-2xl text-muted-foreground">
            Whoever you are in the commercial property world, {SITE.name} has a place for you.
          </p>
        </Container>
      </section>
      <Container className="py-12">
        <div className="grid gap-4 sm:grid-cols-2">
          {VERTICALS.map((v) => (
            <Link
              key={v.slug}
              href={`/for/${v.slug}`}
              className="group flex flex-col rounded-lg border border-border bg-card p-6 transition-all hover:border-teal-400 hover:shadow-sm"
            >
              <Eyebrow>{v.who}</Eyebrow>
              <h2 className="mt-3 text-xl font-semibold group-hover:text-teal-700">{v.name}</h2>
              <p className="mt-2 flex-1 text-sm leading-relaxed text-muted-foreground">{v.positioning}</p>
              <span className="mt-4 flex items-center gap-1 text-sm font-medium text-teal-700">
                Learn more <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
              </span>
            </Link>
          ))}
        </div>
      </Container>
      <CTASection
        title="Find your place in the network"
        description="Property managers post building RFPs free. Commercial trades discover the work and respond."
        primaryHref="/sign-up"
        primaryLabel={`Join ${SITE.name}`}
        secondaryHref="/vs"
        secondaryLabel="Compare alternatives"
      />
    </>
  );
}
