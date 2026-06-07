import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Container, Eyebrow } from "@/components/container";
import { CTASection } from "@/components/public/section";
import { COMPETITORS } from "@/lib/seo/competitors";
import { SITE } from "@/lib/site";

export const revalidate = 86400;

export const metadata: Metadata = {
  title: "Compare PMRFP — Alternatives for Canadian Commercial Trades",
  description: `How ${SITE.name} compares to MERX, Biddingo, ConstructConnect, HomeStars, VendorPM, and more — for Canadian trades and property managers.`,
  alternates: { canonical: "/vs" },
};

export default function VsIndexPage() {
  return (
    <>
      <section className="border-b border-border bg-secondary/30">
        <Container className="py-12">
          <Eyebrow>Compare</Eyebrow>
          <h1 className="mt-3 max-w-3xl text-3xl font-semibold tracking-tight sm:text-4xl">
            How {SITE.name} compares
          </h1>
          <p className="mt-4 max-w-2xl text-muted-foreground">
            Most platforms are for government tenders, new-build leads, or residential homeowners.
            {" "}{SITE.name} is purpose-built for Canadian private commercial property — here&apos;s how it
            stacks up.
          </p>
        </Container>
      </section>
      <Container className="py-12">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {COMPETITORS.map((c) => (
            <Link
              key={c.slug}
              href={`/vs/${c.slug}`}
              className="group flex flex-col rounded-lg border border-border bg-card p-6 transition-all hover:border-teal-400 hover:shadow-sm"
            >
              <h2 className="text-lg font-semibold group-hover:text-teal-700">{SITE.name} vs {c.name}</h2>
              <p className="mt-2 flex-1 text-sm leading-relaxed text-muted-foreground">{c.tagline}</p>
              <span className="mt-4 flex items-center gap-1 text-sm font-medium text-teal-700">
                Compare <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
              </span>
            </Link>
          ))}
        </div>
      </Container>
      <CTASection
        title="See why trades choose PMRFP"
        description="Commercial & residential property focused, $249 CAD/year flat."
        primaryHref="/sign-up"
        primaryLabel="Join as a Trade Company"
        secondaryHref="/pricing"
        secondaryLabel="See pricing"
      />
    </>
  );
}
