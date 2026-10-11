import type { Metadata } from "next";
import { prebuildSlice } from "@/lib/build/prebuild";
import Link from "@/i18n/link";
import { notFound } from "next/navigation";
import { Container } from "@/components/container";
import { Markdown } from "@/components/public/markdown";
import { CTASection } from "@/components/public/section";
import { getResource, listResources } from "@/lib/data/resources";
import { getT, setLangFrom } from "@/i18n/server";
import { getDictionary } from "@/i18n/dictionaries";
import { LOCALE_TAG, hasLocale } from "@/i18n/config";

export const revalidate = 3600;

export async function generateStaticParams({ params }: { params: { lang: string } }) {
  // A few pages are prebuilt (lib/build/prebuild); the rest render
  // on first visit, then cache (ISR), so deploys do not stampede the database.
  // (An empty list for any language switches prebuilding off for the whole route.)
  const resources = await listResources();
  const all = resources.map((r) => ({ slug: r.slug }));
  return prebuildSlice(all, params.lang);
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string; slug: string }>;
}): Promise<Metadata> {
  const { lang, slug } = await params;
  const r = await getResource(slug);
  if (!r) return { title: getDictionary(hasLocale(lang) ? lang : "en").content.resource.notFound };
  // The article itself is English database content: every language
  // canonicalizes to the English URL rather than claim a French version.
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
  const lang = await setLangFrom(params);
  const t = getT("content").resource;
  const { slug } = await params;
  const r = await getResource(slug);
  if (!r) notFound();

  return (
    <>
      <Container size="narrow" className="py-14">
        <Link href="/resources" className="text-sm text-muted-foreground hover:text-foreground">
          {t.back}
        </Link>
        <h1 className="mt-6 text-3xl font-semibold tracking-tight sm:text-4xl">{r.title}</h1>
        {r.publishedAt && (
          <p className="mt-2 text-sm text-muted-foreground">
            {new Date(r.publishedAt).toLocaleDateString(LOCALE_TAG[lang], { year: "numeric", month: "long", day: "numeric" })}
          </p>
        )}
        <article className="mt-8">{r.body && <Markdown content={r.body} />}</article>
      </Container>
      <CTASection
        title={t.cta.title}
        description={t.cta.description}
        primaryHref="/sign-up"
        primaryLabel={t.cta.primary}
        secondaryHref="/rfps"
        secondaryLabel={t.cta.secondary}
      />
    </>
  );
}
