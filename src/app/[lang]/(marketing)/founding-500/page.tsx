import type { Metadata } from "next";
import Link from "@/i18n/link";
import { Check } from "lucide-react";
import { Container, Eyebrow } from "@/components/container";
import { buttonVariants } from "@/components/ui/button";
import { FoundingBuyButton } from "@/components/founding/buy-button";
import { FoundingTermsList } from "@/components/founding/terms-list";
import { FoundingPrice, FoundingRegularPrice } from "@/components/founding/market-text";
import { JsonLd, breadcrumbSchema, faqSchema } from "@/lib/seo/jsonld";
import { FOUNDING, FOUNDING_PATH, spotsLeft } from "@/lib/founding/config";
import { cachedLifetimeCount } from "@/lib/founding/server";
import { SITE } from "@/lib/site";
import { getT, setLangFrom } from "@/i18n/server";
import { getDictionary } from "@/i18n/dictionaries";
import { hasLocale } from "@/i18n/config";
import { alternatesFor } from "@/i18n/metadata";
import { fmt } from "@/i18n/format";

/** The spots-left counter refreshes about once a minute. */
export const revalidate = 60;

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  const l = hasLocale(lang) ? lang : "en";
  const t = getDictionary(l).founding.meta;
  return { title: t.title, description: fmt(t.description, { usd: FOUNDING.priceUsd, cad: FOUNDING.priceCad }), alternates: alternatesFor(l, FOUNDING_PATH) };
}

export default async function FoundingPage({ params }: { params: Promise<object> }) {
  await setLangFrom(params);
  const t = getT("founding");
  const features = getT("salesClient").tradePro.features;
  const sold = await cachedLifetimeCount();
  const left = sold == null ? null : spotsLeft(sold);
  const soldOut = left === 0;
  const vars = {
    usd: FOUNDING.priceUsd,
    cad: FOUNDING.priceCad,
    cap: FOUNDING.cap,
    days: FOUNDING.refundDays,
    months: FOUNDING.discontinueRefundMonths,
  };
  const faq = t.faq.map((x) => ({ q: x.q, a: fmt(x.a, vars) }));
  const base = (process.env.NEXT_PUBLIC_SITE_URL || SITE.url).replace(/\/$/, "");
  const availability = soldOut ? "https://schema.org/SoldOut" : "https://schema.org/LimitedAvailability";
  const offer = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: "PMRFP Trade Pro: Founding 500 lifetime",
    description: fmt(t.meta.description, vars),
    brand: { "@type": "Brand", name: SITE.name },
    // One currency only (site default market, Canada); U.S. visitors see USD on the page.
    offers: [
      { "@type": "Offer", price: FOUNDING.priceCad, priceCurrency: "CAD", availability, url: `${base}${FOUNDING_PATH}`, eligibleRegion: "CA", inventoryLevel: left == null ? undefined : { "@type": "QuantitativeValue", value: left } },
    ],
  };

  return (
    <Container size="narrow" className="py-14">
      <JsonLd data={breadcrumbSchema([{ name: "Home", path: "/" }, { name: t.eyebrow, path: FOUNDING_PATH }])} />
      <JsonLd data={faqSchema(faq)} />
      <JsonLd data={offer} />
      <Eyebrow>{t.eyebrow}</Eyebrow>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">{t.title}</h1>
      <p className="mt-4 text-lg leading-relaxed text-muted-foreground">{fmt(t.lead, vars)}</p>

      {soldOut ? (
        <div className="mt-8 rounded-lg border border-border bg-card p-6">
          <h2 className="text-lg font-semibold">{t.soldOutTitle}</h2>
          <p className="mt-2 text-sm text-muted-foreground">{t.soldOutBody}</p>
          <Link href="/pricing" className={buttonVariants({ size: "lg", className: "mt-4" })}>{t.soldOutCta}</Link>
        </div>
      ) : (
        <div className="mt-8 rounded-lg border border-teal-400/60 bg-teal-100/30 p-6">
          <p className="text-sm font-medium text-teal-ink">
            {left == null ? fmt(t.counterUnknown, vars) : fmt(t.counter, { ...vars, left })}
          </p>
          <p className="mt-2 text-2xl font-semibold">
            <FoundingPrice />
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{t.plusTax}</p>
          <FoundingBuyButton className="mt-5" />
        </div>
      )}

      <section className="mt-12">
        <h2 className="text-lg font-semibold">{t.includedTitle}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t.includedNote}</p>
        <ul className="mt-3 space-y-2 text-sm">
          {features.map((f) => (
            <li key={f} className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0 text-teal-600" />{f}</li>
          ))}
        </ul>
      </section>

      <section className="mt-12">
        <h2 className="text-lg font-semibold">{t.compareTitle}</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-border p-4">
            <div className="text-sm text-muted-foreground">{t.compareRegular}</div>
            <div className="mt-1 font-semibold"><FoundingRegularPrice /></div>
          </div>
          <div className="rounded-lg border border-teal-400 p-4">
            <div className="text-sm text-muted-foreground">{t.compareFounding}</div>
            <div className="mt-1 font-semibold">{t.compareFoundingPrice}</div>
          </div>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">{t.compareNote}</p>
      </section>

      <section className="mt-12">
        <h2 className="text-lg font-semibold">{t.faqTitle}</h2>
        <dl className="mt-3 space-y-4 text-sm">
          {faq.map((x) => (
            <div key={x.q}>
              <dt className="font-medium">{x.q}</dt>
              <dd className="mt-1 text-muted-foreground">{x.a}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="mt-12" id="terms">
        <h2 className="text-lg font-semibold">{t.termsTitle}</h2>
        <FoundingTermsList className="mt-3 text-sm text-muted-foreground" />
        <Link href="/terms#founding-500" className="mt-3 inline-block text-sm font-medium text-teal-ink underline">{t.fullTerms}</Link>
      </section>
    </Container>
  );
}
