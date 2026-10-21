import type { Metadata } from "next";
import Link from "@/i18n/link";
import { getVisitorGeo } from "@/lib/visitor-geo.server";
import { defaultProvinceFor } from "@/lib/geo-defaults";
import { Container, Eyebrow } from "@/components/container";
import { Markdown } from "@/components/public/markdown";
import { RfpWizard } from "@/components/rfp-writer/wizard";
import { JsonLd, breadcrumbSchema, faqSchema } from "@/lib/seo/jsonld";
import { getSession } from "@/lib/access/access";
import { getCategories, getPropertyTypes } from "@/lib/data/taxonomy";
import { RFP_TEMPLATES } from "@/lib/seo/rfp-templates";
import { RFP_TEMPLATES_FR } from "@/lib/rfp-writer/templates-fr";
import { RFP_TEMPLATES_ES } from "@/lib/rfp-writer/templates-es";
import { SITE } from "@/lib/site";
import { getT, setLangFrom } from "@/i18n/server";
import { getDictionary } from "@/i18n/dictionaries";
import { LOCALE_TAG, hasLocale, localizePath } from "@/i18n/config";
import { alternatesFor } from "@/i18n/metadata";
import { fmt } from "@/i18n/format";

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  const l = hasLocale(lang) ? lang : "en";
  const t = getDictionary(l).writer.meta;
  return {
    title: t.title,
    description: t.description,
    alternates: alternatesFor(l, "/rfp-writer"),
  };
}

export default async function RfpWriterPage({ params }: { params: Promise<object> }) {
  const lang = await setLangFrom(params);
  const t = getT("writer");
  const [categories, propertyTypes, session, geo] = await Promise.all([
    getCategories(),
    getPropertyTypes(),
    getSession(),
    getVisitorGeo(),
  ]);
  const postPath = "/pm-dashboard/rfps/new?draft=1";
  const isPm = session?.profile.primary_role === "property_manager" || session?.profile.primary_role === "real_estate_agent";
  const postHref = localizePath(
    isPm
      ? postPath
      : `/sign-up?role=property_manager&next=${encodeURIComponent(localizePath(postPath, lang))}`,
    lang,
  );
  const templates = RFP_TEMPLATES.map((tpl) => ({
    slug: tpl.slug,
    name:
      lang === "fr"
        ? RFP_TEMPLATES_FR[tpl.slug]?.name ?? tpl.name
        : lang === "es"
          ? RFP_TEMPLATES_ES[tpl.slug]?.name ?? tpl.name
          : tpl.name,
    tradeSlug: tpl.tradeSlug,
  }));
  const faqs = t.page.faqs;
  const about = fmt(t.page.about, {
    templates: localizePath("/rfp-templates", lang),
    guide: localizePath("/resources/how-to-post-a-quality-rfp", lang),
  });

  return (
    <>
      <JsonLd
        data={breadcrumbSchema([
          { name: t.page.crumbHome, path: localizePath("/", lang) },
          { name: t.page.crumbWriter, path: localizePath("/rfp-writer", lang) },
        ])}
      />
      <JsonLd data={faqSchema(faqs)} />
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "WebApplication",
          name: fmt(t.page.appName, { brand: SITE.name }),
          url: `${SITE.url}${localizePath("/rfp-writer", lang)}`,
          applicationCategory: "BusinessApplication",
          operatingSystem: "Any",
          description: t.meta.description,
          offers: { "@type": "Offer", price: "0", priceCurrency: "CAD" },
          inLanguage: LOCALE_TAG[lang],
        }}
      />

      <section className="border-b border-border bg-secondary/30">
        <Container className="py-12">
          <Eyebrow>{t.page.eyebrow}</Eyebrow>
          <h1 className="mt-3 max-w-3xl text-3xl font-semibold tracking-tight sm:text-4xl">
            {t.page.h1}
          </h1>
          <p className="mt-3 max-w-2xl text-lg text-muted-foreground">
            {fmt(t.page.intro, { brand: SITE.name })}
          </p>
          <p className="mt-3 inline-flex items-center gap-2 rounded-full bg-indigo px-3 py-1 text-sm text-white">
            <span className="size-1.5 rounded-full bg-teal-300" />
            {t.page.pmBadge}
          </p>
        </Container>
      </section>

      <Container className="py-10">
        <RfpWizard
          categories={categories}
          propertyTypes={propertyTypes}
          templates={templates}
          postHref={postHref}
          // French page: Québec first, whatever the visitor's IP says (lib/geo-defaults).
          defaultProvince={defaultProvinceFor(lang, geo.province)}
        />
      </Container>

      <Container size="narrow" className="pb-16">
        <Markdown content={about} />
        <h2 className="mt-10 text-2xl font-semibold tracking-tight">{t.page.faqTitle}</h2>
        <div className="mt-4 divide-y divide-border border-y border-border">
          {faqs.map((f) => (
            <details key={f.q} className="group py-4">
              <summary className="cursor-pointer list-none font-medium">{f.q}</summary>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.a}</p>
            </details>
          ))}
        </div>
        <p className="mt-8 text-sm text-muted-foreground">
          {t.page.preferExample}{" "}
          <Link href="/rfp-templates" className="font-medium text-teal-700 hover:underline">{t.page.browseTemplates}</Link>.
        </p>
      </Container>
    </>
  );
}
