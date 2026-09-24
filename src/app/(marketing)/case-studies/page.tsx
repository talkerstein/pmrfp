import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { Container, Eyebrow } from "@/components/container";
import { CTASection } from "@/components/public/section";
import { EmptyState } from "@/components/public/empty-state";
import { JsonLd, breadcrumbSchema, itemListSchema } from "@/lib/seo/jsonld";
import { listCaseStudies } from "@/lib/data/case-studies";
import { heroUrlsBySlug } from "@/lib/data/projects";
import { SITE } from "@/lib/site";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Commercial Property Project Case Studies",
  description: `Real completed projects from ${SITE.name} member trades — the challenge, the approach, and the outcome, by trade and region across Canada.`,
  alternates: { canonical: "/case-studies" },
};

export default async function CaseStudiesIndexPage() {
  const studies = await listCaseStudies();
  const heroes = await heroUrlsBySlug(studies.map((s) => s.slug));

  return (
    <>
      <JsonLd data={breadcrumbSchema([
        { name: "Home", path: "/" },
        { name: "Case Studies", path: "/case-studies" },
      ])} />
      <JsonLd data={itemListSchema(
        "Commercial property project case studies",
        studies.map((s) => ({ name: s.title, path: `/case-studies/${s.slug}` })),
      )} />

      <section className="border-b border-border bg-secondary/30">
        <Container className="py-12">
          <Eyebrow>Real projects</Eyebrow>
          <h1 className="mt-3 max-w-3xl text-3xl font-semibold tracking-tight sm:text-4xl">
            Commercial property project case studies
          </h1>
          <p className="mt-4 max-w-2xl text-muted-foreground">
            Completed work from {SITE.name} member trades — what the building needed, how the
            contractor approached it, and how it turned out. Written by the companies that did
            the work, reviewed before publishing.
          </p>
        </Container>
      </section>

      <Container className="py-12">
        {studies.length === 0 ? (
          <EmptyState
            title="First case studies are in review"
            description="Member trades are writing up their recent projects now. Check back shortly — or if you're a member, submit yours from your dashboard."
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {studies.map((s) => (
              <Link
                key={s.slug}
                href={`/case-studies/${s.slug}`}
                className="group flex flex-col overflow-hidden rounded-lg border border-border bg-card transition-all hover:border-teal-400 hover:shadow-sm"
              >
                {heroes.get(s.slug) && (
                  <div className="relative aspect-[16/10] bg-secondary">
                    <Image
                      src={heroes.get(s.slug)!}
                      alt={s.title}
                      fill
                      sizes="(min-width: 1024px) 360px, (min-width: 640px) 50vw, 100vw"
                      className="object-cover"
                    />
                  </div>
                )}
                <div className="flex flex-1 flex-col p-5">
                  <p className="text-xs font-medium uppercase tracking-wide text-teal-ink">
                    {[s.categoryName, [s.city, s.province].filter(Boolean).join(", ")]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  <h2 className="mt-2 text-base font-semibold leading-snug group-hover:text-teal-ink">
                    {s.title}
                  </h2>
                  <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-muted-foreground">
                    {s.challenge}
                  </p>
                  <span className="mt-auto pt-4 text-sm font-medium text-teal-ink">
                    By {s.orgName} →
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </Container>

      <CTASection
        title="Done work like this?"
        description={`Member trades publish case studies free — each one strengthens your profile and your visibility on ${SITE.name}'s trade and city pages.`}
        primaryHref="/dashboard/projects"
        primaryLabel="Add a project"
        secondaryHref="/for-trades"
        secondaryLabel="How membership works"
      />
    </>
  );
}
