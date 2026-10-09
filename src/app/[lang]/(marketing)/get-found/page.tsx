import type { Metadata } from "next";
import Link from "@/i18n/link";
import { Check } from "lucide-react";
import { Container, Eyebrow } from "@/components/container";
import { CTASection } from "@/components/public/section";
import { buttonVariants } from "@/components/ui/button";
import { JsonLd, breadcrumbSchema, faqSchema } from "@/lib/seo/jsonld";
import { PRICING } from "@/lib/site";
import { getLang, getT, setLangFrom } from "@/i18n/server";
import { getDictionary } from "@/i18n/dictionaries";
import { hasLocale, localizePath } from "@/i18n/config";
import { alternatesFor } from "@/i18n/metadata";
import { fmt } from "@/i18n/format";

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  const l = hasLocale(lang) ? lang : "en";
  const t = getDictionary(l).misc.getFound.meta;
  return { title: t.title, description: t.description, alternates: alternatesFor(l, "/get-found") };
}

/** Prices for the {placeholders} in the copy (lib/site.ts). */
const p = (s: string) =>
  fmt(s, { annual: PRICING.proAnnual, seoAnnual: PRICING.seoAnnual, seoMonthly: PRICING.seoMonthly });

/**
 * The SEO/AEO pitch page for the tiered directory model. Claims here are
 * deliberately conservative: real Search Console positions, no invented
 * metrics, no ranking guarantees. Update the proof points from GSC exports,
 * never from imagination. Copy lives in messages/misc.ts (getFound).
 */
export default async function GetFoundPage({ params }: { params: Promise<object> }) {
  await setLangFrom(params);
  const lang = getLang();
  const t = getT("misc").getFound;
  const faqs = t.faqs.map((f) => ({ q: f.q, a: p(f.a) }));
  const tiers: { name: string; price: string; badge?: string; lines: string[] }[] = [
    { name: t.tiers.free.name, price: t.tiers.free.price, lines: t.tiers.free.lines },
    { name: t.tiers.seo.name, price: p(t.tiers.seo.price), badge: p(t.tiers.seo.badge), lines: t.tiers.seo.lines },
    { name: p(t.tiers.pro.name), price: "", lines: t.tiers.pro.lines },
  ];
  return (
    <>
      <JsonLd data={breadcrumbSchema([
        { name: t.crumbHome, path: localizePath("/", lang) },
        { name: t.crumbPage, path: localizePath("/get-found", lang) },
      ])} />
      <JsonLd data={faqSchema(faqs)} />

      <section className="border-b border-border bg-secondary/30">
        <Container className="py-14">
          <Eyebrow>{t.eyebrow}</Eyebrow>
          <h1 className="mt-3 max-w-3xl text-3xl font-semibold tracking-tight sm:text-4xl">
            {t.title}
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-muted-foreground">
            {t.lead}
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/sign-up" className={buttonVariants()}>{t.listFree}</Link>
            <Link href="/pricing" className={buttonVariants({ variant: "outline" })}>{t.seePricing}</Link>
          </div>
        </Container>
      </section>

      <Container className="py-12">
        <h2 className="text-2xl font-semibold tracking-tight">{t.proofTitle}</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          {t.proofs.map((proof) => (
            <div key={proof.stat} className="rounded-lg border border-border bg-card p-5">
              <p className="text-2xl font-semibold text-teal-ink">{proof.stat}</p>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{proof.line}</p>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          {t.proofNote}
        </p>
      </Container>

      <section className="bg-secondary/30">
        <Container className="py-12">
          <h2 className="text-2xl font-semibold tracking-tight">{t.ladderTitle}</h2>
          <div className="mt-5 grid gap-4 lg:grid-cols-3">
            {tiers.map((tier) => (
              <div key={tier.name} className="flex flex-col rounded-lg border border-border bg-card p-6">
                <div className="flex items-baseline justify-between">
                  <h3 className="text-base font-semibold">{tier.name}</h3>
                  {tier.price && <span className="text-lg font-semibold text-teal-ink">{tier.price}</span>}
                </div>
                {tier.badge && (
                  <span className="mt-1 w-fit rounded-full bg-teal-100 px-2 py-0.5 text-xs font-medium text-teal-700">
                    {tier.badge}
                  </span>
                )}
                <ul className="mt-4 space-y-2 text-sm">
                  {tier.lines.map((l) => (
                    <li key={l} className="flex gap-2">
                      <Check className="mt-0.5 size-4 shrink-0 text-teal-600" />
                      {l}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <p className="mt-4 text-sm text-muted-foreground">
            {t.ladderNote}
          </p>
        </Container>
      </section>

      <Container size="narrow" className="py-12">
        <h2 className="text-2xl font-semibold tracking-tight">{t.faqTitle}</h2>
        <div className="mt-4 space-y-5">
          {faqs.map((f) => (
            <div key={f.q}>
              <h3 className="font-semibold">{f.q}</h3>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{f.a}</p>
            </div>
          ))}
        </div>
      </Container>

      <CTASection
        title={t.ctaTitle}
        description={t.ctaBody}
        primaryHref="/sign-up"
        primaryLabel={t.listFree}
        secondaryHref="/projects"
        secondaryLabel={t.ctaSecondary}
      />
    </>
  );
}
