import type { Metadata } from "next";
import Link from "next/link";
import { MapPin } from "lucide-react";
import { Container, Eyebrow } from "@/components/container";
import { CTASection } from "@/components/public/section";
import { getRegions } from "@/lib/data/taxonomy";
import { SITE } from "@/lib/site";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Regions — Commercial Property Vendors & RFPs Across Canada",
  description: `Explore commercial property trades and RFP opportunities by region on ${SITE.name} — from the Greater Toronto Area to Vancouver, Calgary, Montreal, and beyond.`,
  alternates: { canonical: "/regions" },
};

export default async function RegionsIndexPage() {
  const regions = await getRegions();
  const byProvince = new Map<string, typeof regions>();
  for (const r of regions) {
    const key = r.province ?? "Canada";
    if (!byProvince.has(key)) byProvince.set(key, []);
    byProvince.get(key)!.push(r);
  }

  return (
    <>
      <section className="border-b border-border bg-secondary/30">
        <Container className="py-12">
          <Eyebrow>Regions</Eyebrow>
          <h1 className="mt-3 max-w-3xl text-3xl font-semibold tracking-tight sm:text-4xl">
            Commercial property vendors & RFPs by region
          </h1>
          <p className="mt-4 max-w-2xl text-muted-foreground">
            {SITE.name} is Canada-first with deep coverage in Ontario and the GTA. Pick a region to
            find local trades and property RFP opportunities.
          </p>
        </Container>
      </section>
      <Container className="py-12">
        <div className="space-y-8">
          {[...byProvince.entries()].map(([province, regs]) => (
            <div key={province}>
              <h2 className="eyebrow text-muted-foreground">{province}</h2>
              <div className="mt-3 flex flex-wrap gap-2">
                {regs.map((r) => (
                  <Link key={r.slug} href={`/regions/${r.slug}`} className="flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-sm hover:border-teal-400">
                    <MapPin className="size-3.5 text-teal-600" /> {r.name}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Container>
      <CTASection
        title="List your company across the regions you serve"
        description="Choose your service regions and appear where property managers are searching."
        primaryHref="/sign-up"
        primaryLabel="Join as a Trade Company"
        secondaryHref="/trades"
        secondaryLabel="Browse by trade"
      />
    </>
  );
}
