import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Calculator, Sparkles } from "lucide-react";
import { Container, Eyebrow } from "@/components/container";
import { EmptyState } from "@/components/public/empty-state";
import { buttonVariants } from "@/components/ui/button";
import { listResources } from "@/lib/data/resources";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Resources — Commercial Property RFP & Vendor Guides",
  description:
    "Guides and checklists for Canadian trades and property managers: how RFPs work, prequalification, capability statements, and more.",
};

export default async function ResourcesPage() {
  const resources = await listResources();
  return (
    <Container className="py-14">
      <Eyebrow>Resources</Eyebrow>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
        Guides for trades and property managers
      </h1>
      <p className="mt-3 max-w-2xl text-muted-foreground">
        Practical guidance on winning and running commercial property work in Canada.
      </p>

      {/* Done-for-you feature */}
      <Link
        href="/resources/grow"
        className="group mt-8 flex flex-col items-start gap-4 overflow-hidden rounded-2xl bg-indigo p-6 text-white sm:flex-row sm:items-center sm:justify-between sm:p-8"
      >
        <div className="max-w-2xl">
          <span className="eyebrow inline-flex items-center gap-2 text-teal-300">
            <Sparkles className="size-3.5" /> Done for you
          </span>
          <h2 className="mt-2 text-xl font-bold tracking-tight text-white sm:text-2xl">
            Opening a business — or ready to look the part?
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-indigo-100/75">
            Get your trade business online — branding, a website, your Google profile, and a
            standout listing, handled for you.
          </p>
        </div>
        <span className={cn(buttonVariants({ variant: "accent" }), "shrink-0")}>
          Learn more <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
        </span>
      </Link>

      {/* Cost guides feature */}
      <Link
        href="/cost-guides"
        className="group mt-4 flex items-center justify-between gap-4 rounded-2xl border border-border bg-card p-6 transition-all hover:border-teal-400 hover:shadow-sm"
      >
        <div className="max-w-2xl">
          <span className="eyebrow inline-flex items-center gap-2 text-teal-600">
            <Calculator className="size-3.5" /> Cost guides
          </span>
          <h2 className="mt-2 text-xl font-semibold tracking-tight group-hover:text-teal-700">
            What does commercial property work cost in Canada?
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Honest planning ranges for roofing, HVAC, renovations, paving, snow, cleaning, and more
            — so you walk into an RFP knowing what to expect.
          </p>
        </div>
        <span className="hidden shrink-0 items-center gap-1 text-sm font-medium text-teal-700 sm:flex">
          See guides <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
        </span>
      </Link>

      {resources.length === 0 ? (
        <div className="mt-8">
          <EmptyState title="No resources yet" description="Check back soon — we're publishing guides regularly." />
        </div>
      ) : (
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {resources.map((r) => (
            <Link
              key={r.slug}
              href={`/resources/${r.slug}`}
              className="group flex flex-col rounded-lg border border-border bg-card p-6 transition-all hover:border-teal-400 hover:shadow-sm"
            >
              <h2 className="text-lg font-semibold leading-snug group-hover:text-teal-700">{r.title}</h2>
              {r.excerpt && <p className="mt-2 flex-1 text-sm leading-relaxed text-muted-foreground">{r.excerpt}</p>}
              <span className="mt-4 flex items-center gap-1 text-sm font-medium text-teal-700">
                Read <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
              </span>
            </Link>
          ))}
        </div>
      )}
    </Container>
  );
}
