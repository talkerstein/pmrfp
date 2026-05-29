import type { Metadata } from "next";
import Link from "next/link";
import { Container, Eyebrow } from "@/components/container";
import { DynamicIcon } from "@/components/public/dynamic-icon";
import { CTASection } from "@/components/public/section";
import { getCategories } from "@/lib/data/taxonomy";
import { SITE } from "@/lib/site";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Trade Categories — Commercial Property Contractors in Canada",
  description: `Browse every trade category on ${SITE.name} — from electrical and HVAC to snow removal and fire safety. Find commercial property contractors and RFP opportunities across Canada.`,
  alternates: { canonical: "/trades" },
};

export default async function TradesIndexPage() {
  const categories = await getCategories();
  return (
    <>
      <section className="border-b border-border bg-secondary/30">
        <Container className="py-12">
          <Eyebrow>Trade categories</Eyebrow>
          <h1 className="mt-3 max-w-3xl text-3xl font-semibold tracking-tight sm:text-4xl">
            Commercial property trades & service categories
          </h1>
          <p className="mt-4 max-w-2xl text-muted-foreground">
            Every category property managers source on {SITE.name}. Pick a trade to find contractors,
            see open RFP opportunities, and explore demand by region.
          </p>
        </Container>
      </section>
      <Container className="py-12">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {categories.map((c) => (
            <Link
              key={c.slug}
              href={`/trades/${c.slug}`}
              className="group flex items-center gap-3 rounded-lg border border-border bg-card p-4 transition-colors hover:border-gold-400"
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-secondary text-gold-600 group-hover:bg-gold-100">
                <DynamicIcon name={c.icon} className="size-5" />
              </span>
              <span>
                <span className="block text-sm font-semibold text-foreground group-hover:text-gold-700">{c.name}</span>
                <span className="block text-xs text-muted-foreground">Commercial {c.name.toLowerCase()} contractors & RFPs</span>
              </span>
            </Link>
          ))}
        </div>
      </Container>
      <CTASection
        title="Get listed in your trade category"
        description="Become easy to find for property managers searching your category across Canada."
        primaryHref="/sign-up"
        primaryLabel="Join as a Trade Company"
        secondaryHref="/regions"
        secondaryLabel="Browse by region"
      />
    </>
  );
}
