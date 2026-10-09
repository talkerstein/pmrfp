import "@/components/v3-pages/portfolio.css";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SimplePage } from "@/components/v3/simple";
import { CaseStudyBody } from "@/components/projects/case-study-view";
import { JsonLd, breadcrumbSchema } from "@/lib/seo/jsonld";
import { getCaseStudy, listCaseStudies } from "@/lib/data/case-studies";
import { getQualifyingCombo } from "@/lib/data/trade-city";
import { getProjectExtras, listPublishedReviews } from "@/lib/data/projects";
import { isIndexable } from "@/lib/projects/visibility";
import { caseStudySchema } from "@/lib/projects/schema";
import { SITE } from "@/lib/site";
import { getLang, getT, setLangFrom } from "@/i18n/server";
import { getDictionary } from "@/i18n/dictionaries";
import { hasLocale, localizePath } from "@/i18n/config";
import { fmt } from "@/i18n/format";
import { regionName, tradeName } from "@/i18n/terms";

export const revalidate = 3600;

const BASE = (process.env.NEXT_PUBLIC_SITE_URL || SITE.url).replace(/\/$/, "");

export async function generateStaticParams({ params }: { params: { lang: string } }) {
  // English is prebuilt in full; French and Spanish get a few and render the rest
  // on first visit, then cache (ISR). Only PUBLIC studies are prebuilt; an
  // unlisted one renders on first visit (noindexed).
  const studies = await listCaseStudies();
  const all = studies.map((s) => ({ slug: s.slug }));
  return params.lang === "en" ? all : all.slice(0, 3);
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string; slug: string }>;
}): Promise<Metadata> {
  const { lang, slug } = await params;
  const t = getDictionary(hasLocale(lang) ? lang : "en").content.caseStudy;
  const cs = await getCaseStudy(slug);
  if (!cs) return { title: t.notFound, robots: { index: false } };
  const extras = await getProjectExtras(cs.id);
  const description = (extras.summary ?? cs.challenge).slice(0, 155);
  const indexable = isIndexable(cs.visibility);
  // The study itself is English database content: every language
  // canonicalizes to the English URL rather than claim a French version.
  // Unlisted: link-only, so no canonical, no index, no follow.
  return {
    title: fmt(t.metaTitle, { title: cs.title }),
    description,
    ...(indexable ? { alternates: { canonical: `/case-studies/${cs.slug}` } } : { robots: { index: false, follow: false } }),
    ...(extras.heroUrl ? { openGraph: { images: [{ url: extras.heroUrl }] } } : {}),
  };
}

export default async function CaseStudyPage({ params }: { params: Promise<{ slug: string }> }) {
  await setLangFrom(params);
  const lang = getLang();
  const c = getT("content");
  const t = getT("portfolio").page;
  const { slug } = await params;
  const cs = await getCaseStudy(slug);
  if (!cs) notFound();

  const [combo, extras, reviews] = await Promise.all([
    cs.categorySlug && cs.regionSlug ? getQualifyingCombo(cs.categorySlug, cs.regionSlug) : null,
    getProjectExtras(cs.id),
    listPublishedReviews({ caseStudyId: cs.id }),
  ]);
  const indexable = isIndexable(cs.visibility);
  const orgLinked = Boolean(cs.orgSlug);
  const lead = [
    cs.categoryName ? tradeName(cs.categoryName, lang) : null,
    [cs.city, cs.province ? regionName(cs.province, lang) : null].filter(Boolean).join(", "),
    fmt(t.by, { org: cs.orgName }),
  ]
    .filter(Boolean)
    .join(" · ");

  const more: { href: string; label: string }[] = [];
  if (indexable && cs.categorySlug && cs.categoryName) {
    more.push({ href: `/projects?trade=${cs.categorySlug}`, label: fmt(t.more, { trade: tradeName(cs.categoryName, lang) }) });
  }
  if (combo) {
    more.push({
      href: `/trades/${combo.category.slug}/${combo.region.slug}`,
      label: fmt(c.caseStudy.more, { trade: tradeName(combo.category.name, lang), region: regionName(combo.region.name, lang) }),
    });
  }
  if (indexable) more.push({ href: "/projects", label: t.gallery });

  return (
    <>
      {indexable && (
        <>
          <JsonLd
            data={breadcrumbSchema([
              { name: c.crumbs.home, path: localizePath("/", lang) },
              { name: t.crumb, path: localizePath("/projects", lang) },
              { name: cs.title, path: `/case-studies/${cs.slug}` },
            ])}
          />
          <JsonLd data={caseStudySchema(cs, extras, orgLinked ? `${BASE}/directory/${cs.orgSlug}` : null)} />
        </>
      )}
      <SimplePage
        lang={lang}
        current={null}
        group="company"
        crumbs={[{ label: t.crumb, href: "/projects" }]}
        tabs={false}
        aside={false}
        title={cs.title}
        lead={extras.summary ? <>{extras.summary}<br /><small>{lead}</small></> : lead}
        heroImage={extras.heroUrl ? { src: extras.heroUrl, alt: "" } : null}
      >
        <CaseStudyBody cs={cs} extras={extras} reviews={reviews} orgLinked={orgLinked} more={more} />
      </SimplePage>
    </>
  );
}
