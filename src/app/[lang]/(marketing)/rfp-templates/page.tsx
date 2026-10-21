import type { Metadata } from "next";
import Link from "@/i18n/link";
import { ArrowRight, FileText, Download, Sparkles } from "lucide-react";
import { Container, Eyebrow } from "@/components/container";
import { CTASection } from "@/components/public/section";
import { TrustDisclaimer } from "@/components/public/trust-disclaimer";
import { JsonLd, breadcrumbSchema, itemListSchema } from "@/lib/seo/jsonld";
import { RFP_TEMPLATES } from "@/lib/seo/rfp-templates";
import { localizeRfpTemplate } from "@/lib/seo/rfp-templates.fr";
import { SITE } from "@/lib/site";
import { getT, setLangFrom } from "@/i18n/server";
import { getDictionary } from "@/i18n/dictionaries";
import { LOCALE_TAG, hasLocale, localizePath } from "@/i18n/config";
import { alternatesFor } from "@/i18n/metadata";
import { fmt } from "@/i18n/format";

export const revalidate = 86400;

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  const l = hasLocale(lang) ? lang : "en";
  const t = getDictionary(l).content.templatesIndex.meta;
  return {
    title: t.title,
    description: t.description,
    alternates: alternatesFor(l, "/rfp-templates"),
  };
}

export default async function RfpTemplatesIndexPage({ params }: { params: Promise<object> }) {
  const lang = await setLangFrom(params);
  const c = getT("content");
  const t = c.templatesIndex;
  const templates = RFP_TEMPLATES.map((tpl) => localizeRfpTemplate(tpl, lang));
  // Group templates by trade for the secondary view.
  const byTrade = templates.reduce<Record<string, typeof templates>>((acc, tpl) => {
    (acc[tpl.tradeName] ??= []).push(tpl);
    return acc;
  }, {});
  const tradeNames = Object.keys(byTrade).sort((a, b) =>
    lang === "en" ? (a < b ? -1 : a > b ? 1 : 0) : a.localeCompare(b, LOCALE_TAG[lang]),
  );

  return (
    <>
      <JsonLd
        data={breadcrumbSchema([
          { name: c.crumbs.home, path: localizePath("/", lang) },
          { name: c.crumbs.templates, path: localizePath("/rfp-templates", lang) },
        ])}
      />
      <JsonLd
        data={itemListSchema(
          t.listName,
          templates.map((tpl) => ({ name: tpl.name, path: localizePath(`/rfp-templates/${tpl.slug}`, lang) })),
        )}
      />

      <section className="border-b border-border bg-secondary/30">
        <Container className="py-14 sm:py-16">
          <Eyebrow>{t.eyebrow}</Eyebrow>
          <h1 className="mt-4 max-w-3xl text-3xl font-semibold tracking-tight sm:text-4xl">
            {t.h1}
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-muted-foreground">
            {t.lead}
          </p>
          <div className="mt-7 flex flex-wrap gap-3 text-sm">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-teal-100 px-3 py-1 font-medium text-teal-ink">
              <FileText className="size-3.5" /> {t.chipCount}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1 font-medium text-foreground/80">
              <Sparkles className="size-3.5" /> {t.chipPrefilled}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1 font-medium text-foreground/80">
              <Download className="size-3.5" /> {t.chipPdf}
            </span>
          </div>
          <p className="mt-6 text-sm text-muted-foreground">
            {t.writerBefore}{" "}
            <Link href="/rfp-writer" className="font-semibold text-teal-700 hover:underline">
              {t.writerLink}
            </Link>{" "}
            {t.writerAfter}
          </p>
        </Container>
      </section>

      <Container className="py-12">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {templates.map((tpl) => (
            <Link
              key={tpl.slug}
              href={`/rfp-templates/${tpl.slug}`}
              className="group flex flex-col rounded-xl border border-border bg-card p-6 transition-all hover:border-teal-400 hover:shadow-sm"
            >
              <Eyebrow>{tpl.tradeName}</Eyebrow>
              <h2 className="mt-3 text-lg font-semibold leading-snug group-hover:text-teal-ink">
                {tpl.shortName}
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{tpl.pitch}</p>
              <span className="mt-5 inline-flex items-center gap-1 text-sm font-medium text-teal-ink">
                {t.useTemplate}{" "}
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
              </span>
            </Link>
          ))}
        </div>
      </Container>

      <section className="border-t border-border bg-secondary/30">
        <Container className="py-12">
          <h2 className="text-2xl font-semibold tracking-tight">{t.byTradeTitle}</h2>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            {t.byTradeLead}
          </p>
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {tradeNames.map((trade) => (
              <div key={trade} className="rounded-lg border border-border bg-card p-5">
                <h3 className="text-sm font-semibold tracking-tight">{trade}</h3>
                <ul className="mt-3 space-y-1.5">
                  {byTrade[trade].map((tpl) => (
                    <li key={tpl.slug}>
                      <Link
                        href={`/rfp-templates/${tpl.slug}`}
                        className="text-sm text-muted-foreground hover:text-teal-ink"
                      >
                        {tpl.shortName}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Container>
      </section>

      <Container className="py-12">
        <div className="rounded-2xl border border-border bg-card p-6 sm:p-8">
          <Eyebrow>{t.howEyebrow}</Eyebrow>
          <h2 className="mt-3 text-xl font-semibold tracking-tight sm:text-2xl">
            {t.howTitle}
          </h2>
          <ol className="mt-5 grid gap-5 sm:grid-cols-3">
            {t.steps.map((step) => (
              <li key={step.label}>
                <div className="text-xs font-semibold uppercase tracking-wide text-teal-ink">
                  {step.label}
                </div>
                <h3 className="mt-1 text-base font-semibold">{step.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  {fmt(step.body, { brand: SITE.name })}
                </p>
              </li>
            ))}
          </ol>
        </div>

        <div className="mt-8">
          <TrustDisclaimer />
        </div>
      </Container>

      <CTASection
        title={t.cta.title}
        description={fmt(t.cta.description, { brand: SITE.name })}
        primaryHref="/rfp-writer"
        primaryLabel={t.cta.primary}
        secondaryHref="/directory"
        secondaryLabel={t.cta.secondary}
      />
    </>
  );
}
