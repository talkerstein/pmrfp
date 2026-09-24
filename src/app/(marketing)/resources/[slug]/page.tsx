import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Container } from "@/components/container";
import { Markdown } from "@/components/public/markdown";
import { CTASection } from "@/components/public/section";
import { getResource, listResources } from "@/lib/data/resources";

export const revalidate = 3600;

export async function generateStaticParams() {
  const resources = await listResources();
  return resources.map((r) => ({ slug: r.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const r = await getResource(slug);
  if (!r) return { title: "Resource not found" };
  return {
    title: r.seoTitle ?? r.title,
    description: r.metaDescription ?? r.excerpt ?? undefined,
    alternates: { canonical: `/resources/${slug}` },
  };
}

export default async function ResourceDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const r = await getResource(slug);
  if (!r) notFound();

  return (
    <>
      <Container size="narrow" className="py-14">
        <Link href="/resources" className="text-sm text-muted-foreground hover:text-foreground">
          ← All resources
        </Link>
        <h1 className="mt-6 text-3xl font-semibold tracking-tight sm:text-4xl">{r.title}</h1>
        {r.publishedAt && (
          <p className="mt-2 text-sm text-muted-foreground">
            {new Date(r.publishedAt).toLocaleDateString("en-CA", { year: "numeric", month: "long", day: "numeric" })}
          </p>
        )}
        <article className="mt-8">{r.body && <Markdown content={r.body} />}</article>
      </Container>
      <CTASection
        title="Ready to find commercial property work?"
        description="Get listed and monitor RFP opportunities across Canada."
        primaryHref="/sign-up"
        primaryLabel="Join as a Trade Company"
        secondaryHref="/rfps"
        secondaryLabel="Browse opportunities"
      />
    </>
  );
}
