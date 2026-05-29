import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Container, Eyebrow } from "@/components/container";
import { EmptyState } from "@/components/public/empty-state";
import { listResources } from "@/lib/data/resources";

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
