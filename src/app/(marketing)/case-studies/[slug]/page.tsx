import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Container, Eyebrow } from "@/components/container";
import { CTASection } from "@/components/public/section";
import { buttonVariants } from "@/components/ui/button";
import { JsonLd, breadcrumbSchema } from "@/lib/seo/jsonld";
import { getCaseStudy, listCaseStudies } from "@/lib/data/case-studies";
import { getQualifyingCombo } from "@/lib/data/trade-city";
import { SITE } from "@/lib/site";

export const revalidate = 3600;

export async function generateStaticParams() {
  const studies = await listCaseStudies();
  return studies.map((s) => ({ slug: s.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const cs = await getCaseStudy(slug);
  if (!cs) return { title: "Case study not found" };
  return {
    title: `${cs.title} — Case Study`,
    description: cs.challenge.slice(0, 155),
    alternates: { canonical: `/case-studies/${cs.slug}` },
  };
}

export default async function CaseStudyPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const cs = await getCaseStudy(slug);
  if (!cs) notFound();

  // Only deep-link the trade×city page when it actually exists (gated).
  const combo =
    cs.categorySlug && cs.regionSlug
      ? await getQualifyingCombo(cs.categorySlug, cs.regionSlug)
      : null;

  const sections = [
    { label: "The challenge", body: cs.challenge },
    { label: "The approach", body: cs.approach },
    { label: "The outcome", body: cs.outcome },
  ];

  return (
    <>
      <JsonLd data={breadcrumbSchema([
        { name: "Home", path: "/" },
        { name: "Case Studies", path: "/case-studies" },
        { name: cs.title, path: `/case-studies/${cs.slug}` },
      ])} />
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "Article",
          headline: cs.title,
          datePublished: cs.publishedAt ?? undefined,
          author: { "@type": "Organization", name: cs.orgName },
          publisher: { "@type": "Organization", name: SITE.name },
          about: cs.categoryName ?? undefined,
          contentLocation: cs.city
            ? { "@type": "Place", name: [cs.city, cs.province].filter(Boolean).join(", ") }
            : undefined,
        }}
      />

      <section className="border-b border-border bg-secondary/30">
        <Container size="narrow" className="py-12">
          <nav className="mb-3 text-xs text-muted-foreground">
            <Link href="/case-studies" className="hover:text-foreground">Case Studies</Link>
            {" / "}
            {cs.title}
          </nav>
          <Eyebrow>
            {[cs.categoryName, [cs.city, cs.province].filter(Boolean).join(", ")]
              .filter(Boolean)
              .join(" · ")}
          </Eyebrow>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">{cs.title}</h1>
          <p className="mt-4 text-sm text-muted-foreground">
            A completed project by{" "}
            <Link href={`/directory/${cs.orgSlug}`} className="font-medium text-teal-ink hover:underline">
              {cs.orgName}
            </Link>
            {cs.timeline ? <> · {cs.timeline}</> : null}
            {cs.budgetBand ? <> · {cs.budgetBand}</> : null}
          </p>
        </Container>
      </section>

      <Container size="narrow" className="py-12">
        {sections.map((s) => (
          <div key={s.label} className="mb-8">
            <h2 className="text-xl font-semibold tracking-tight">{s.label}</h2>
            <p className="mt-3 whitespace-pre-line leading-relaxed text-foreground/90">{s.body}</p>
          </div>
        ))}

        <div className="mt-10 flex flex-wrap gap-3">
          <Link href={`/directory/${cs.orgSlug}`} className={buttonVariants()}>
            View {cs.orgName}
          </Link>
          {combo && (
            <Link
              href={`/trades/${combo.category.slug}/${combo.region.slug}`}
              className={buttonVariants({ variant: "outline" })}
            >
              More {combo.category.name} in {combo.region.name}
            </Link>
          )}
        </div>
      </Container>

      <CTASection
        title="Have a project like this coming up?"
        description={`Post it free on ${SITE.name} — qualified trades express interest and you compare them in one place.`}
        primaryHref="/sign-up"
        primaryLabel="Post an RFP free"
        secondaryHref="/case-studies"
        secondaryLabel="More case studies"
      />
    </>
  );
}
