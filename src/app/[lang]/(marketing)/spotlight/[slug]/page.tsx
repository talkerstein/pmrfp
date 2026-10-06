import type { Metadata } from "next";
import Image from "next/image";
import Link from "@/i18n/link";
import { notFound } from "next/navigation";
import { Container } from "@/components/container";
import { SPOTLIGHTS, getSpotlight } from "@/lib/spotlight/articles";
import { JsonLd, breadcrumbSchema } from "@/lib/seo/jsonld";
import { SITE } from "@/lib/site";

export function generateStaticParams() {
  return SPOTLIGHTS.map((s) => ({ slug: s.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const s = getSpotlight((await params).slug);
  if (!s) return {};
  return {
    title: `${s.title} | ${s.company}`,
    description: s.summary,
    alternates: { canonical: `/spotlight/${s.slug}` },
    openGraph: s.photos[0] ? { images: [s.photos[0].src] } : undefined,
  };
}

export default async function SpotlightArticle({ params }: { params: Promise<{ slug: string }> }) {
  const s = getSpotlight((await params).slug);
  if (!s) notFound();
  const base = SITE.url.replace(/\/$/, "");
  return (
    <Container size="narrow" className="py-14">
      <JsonLd data={breadcrumbSchema([{ name: "Project Spotlight", path: "/spotlight" }, { name: s.title, path: `/spotlight/${s.slug}` }])} />
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "Article",
          headline: s.title,
          description: s.summary,
          datePublished: s.published,
          image: s.photos.map((p) => `${base}${p.src}`),
          author: { "@type": "Organization", name: s.company, ...(s.website ? { url: s.website } : {}) },
          publisher: { "@type": "Organization", name: SITE.name, url: base },
          about: { "@type": "Service", serviceType: s.trade, areaServed: `${s.city}, ${s.province}` },
        }}
      />
      <p className="inline-block rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-amber-900">Sponsored Spotlight</p>
      <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">{s.title}</h1>
      <p className="mt-3 text-sm text-muted-foreground">
        {s.company} · {s.trade} · {s.city}, {s.province} · {new Date(s.published).toLocaleDateString("en-CA", { year: "numeric", month: "long", day: "numeric" })}
      </p>
      {s.photos[0] && (
        <Image src={s.photos[0].src} alt={s.photos[0].alt} width={1200} height={750} className="mt-8 w-full rounded-xl object-cover" priority />
      )}
      <article className="mt-8 space-y-4 text-base leading-relaxed">
        {s.body.map((p, i) => <p key={i}>{p}</p>)}
      </article>
      {s.photos.length > 1 && (
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {s.photos.slice(1).map((p) => <Image key={p.src} src={p.src} alt={p.alt} width={800} height={600} className="w-full rounded-lg object-cover" />)}
        </div>
      )}
      <div className="mt-10 rounded-xl border p-5 text-sm">
        <p className="font-semibold">About {s.company}</p>
        <div className="mt-2 flex flex-wrap gap-4">
          {s.website && <a href={s.website} rel="sponsored noopener" target="_blank" className="underline">Visit website</a>}
          {s.profileSlug && <Link href={`/directory/${s.profileSlug}`} className="underline">PMRFP directory profile</Link>}
        </div>
      </div>
      <p className="mt-6 text-xs text-muted-foreground">
        This article was written by {s.company} and reviewed by PMRFP before publishing. Spotlights are paid placements. <Link href="/spotlight" className="underline">Feature your own project</Link>.
      </p>
    </Container>
  );
}
