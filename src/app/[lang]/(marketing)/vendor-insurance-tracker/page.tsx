import type { Metadata } from "next";
import Link from "@/i18n/link";
import { ArrowRight, BellRing, FileCheck2, ListChecks, Send } from "lucide-react";
import { Container, Eyebrow } from "@/components/container";
import { buttonVariants } from "@/components/ui/button";
import { JsonLd, breadcrumbSchema, faqSchema } from "@/lib/seo/jsonld";
import { TrackerDemo } from "@/components/vendor-certs/tracker-demo";
import { isoDay } from "@/lib/vendor-certs/rules";
import { getSession } from "@/lib/access/access";
import { getVisitorCountry } from "@/lib/visitor-geo.server";
import { SITE } from "@/lib/site";
import { getT, setLangFrom } from "@/i18n/server";
import { getDictionary } from "@/i18n/dictionaries";
import { LOCALE_TAG, hasLocale, localizePath } from "@/i18n/config";
import { alternatesFor } from "@/i18n/metadata";
import { fmt } from "@/i18n/format";

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  const l = hasLocale(lang) ? lang : "en";
  const t = getDictionary(l).certs.meta;
  return {
    title: t.title,
    description: t.description,
    alternates: alternatesFor(l, "/vendor-insurance-tracker"),
  };
}

const DASHBOARD = "/pm-dashboard/vendor-insurance";
const ICONS = [ListChecks, FileCheck2, Send, BellRing];

/**
 * /vendor-insurance-tracker — the free tool's public page. Country-first:
 * Canadian visitors read WSIB/WCB + CGL, U.S. visitors read COI + workers'
 * comp. The CTA signs a visitor up as a property manager and lands them in
 * the tracker; a signed-in PM goes straight there. The try-it box comes
 * first so a visitor sees their own list before being asked to sign up. The page ends on posting
 * an RFP (the step every PMRFP tool leads to).
 */
export default async function VendorInsuranceTrackerPage({ params }: { params: Promise<object> }) {
  const lang = await setLangFrom(params);
  const t = getT("certs").landing;
  const demo = getT("certs").demo;
  const meta = getT("certs").meta;
  const session = await getSession().catch(() => null);
  const { country } = await getVisitorCountry({ session });
  const isPm = session?.profile.primary_role === "property_manager" || session?.profile.primary_role === "real_estate_agent";
  const ctaHref = isPm ? DASHBOARD : `/sign-up?role=property_manager&next=${encodeURIComponent(localizePath(DASHBOARD, lang))}`;
  const postHref = isPm ? "/pm-dashboard/rfps/new" : "/rfp-writer";
  const faqs = t.faqs[country];

  return (
    <>
      <JsonLd
        data={breadcrumbSchema([
          { name: t.crumbHome, path: localizePath("/", lang) },
          { name: t.crumbTool, path: localizePath("/vendor-insurance-tracker", lang) },
        ])}
      />
      <JsonLd data={faqSchema(faqs)} />
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "WebApplication",
          name: fmt(t.appName, { brand: SITE.name }),
          url: `${SITE.url}${localizePath("/vendor-insurance-tracker", lang)}`,
          applicationCategory: "BusinessApplication",
          operatingSystem: "Any",
          description: meta.description,
          offers: { "@type": "Offer", price: "0", priceCurrency: country === "US" ? "USD" : "CAD" },
          inLanguage: LOCALE_TAG[lang],
        }}
      />

      <section className="border-b border-border bg-secondary/30">
        <Container className="py-12 sm:py-16">
          <Eyebrow>{t.eyebrow}</Eyebrow>
          <h1 className="mt-3 max-w-3xl text-3xl font-semibold tracking-tight sm:text-4xl">{t.h1[country]}</h1>
          <p className="mt-3 max-w-2xl text-lg text-muted-foreground">{fmt(t.intro[country], { brand: SITE.name })}</p>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Link href={ctaHref} className={buttonVariants({ size: "lg" })}>
              {isPm ? t.ctaSignedIn : t.cta} <ArrowRight className="size-4" />
            </Link>
            <span className="inline-flex items-center gap-2 rounded-full bg-indigo px-3 py-1 text-sm text-white">
              <span className="size-1.5 rounded-full bg-teal-300" />
              {t.badge}
            </span>
          </div>
        </Container>
      </section>

      <Container className="py-12">
        <h2 className="text-2xl font-semibold tracking-tight">{demo.title}</h2>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{demo.body[country]}</p>
        <div className="mt-5">
          <TrackerDemo t={demo} country={country} today={isoDay(new Date())} ctaHref={ctaHref} />
        </div>

        <div className="mt-14 grid gap-4 sm:grid-cols-2">
          {t.points[country].map((pt, i) => {
            const Icon = ICONS[i % ICONS.length];
            return (
              <div key={pt.t} className="rounded-lg border border-border bg-card p-6">
                <span className="flex size-10 items-center justify-center rounded-md bg-teal-50 text-teal-700">
                  <Icon className="size-5" />
                </span>
                <h2 className="mt-4 text-base font-semibold">{pt.t}</h2>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{pt.d}</p>
              </div>
            );
          })}
        </div>

        <h2 className="mt-14 text-2xl font-semibold tracking-tight">{t.howTitle}</h2>
        <ol className="mt-6 grid gap-4 sm:grid-cols-3">
          {t.steps.map((s, i) => (
            <li key={s.t} className="rounded-lg border border-border bg-card p-6">
              <span className="flex size-8 items-center justify-center rounded-full bg-indigo text-sm font-semibold text-white">{i + 1}</span>
              <h3 className="mt-3 font-semibold">{s.t}</h3>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{s.d}</p>
            </li>
          ))}
        </ol>

        <div className="mt-14 rounded-lg border border-teal-300 bg-teal-50/60 p-6">
          <h2 className="text-lg font-semibold">{t.loopTitle}</h2>
          <p className="mt-1 max-w-3xl text-sm leading-relaxed text-muted-foreground">{t.loopBody}</p>
        </div>
      </Container>

      <Container size="narrow" className="pb-12">
        <h2 className="text-2xl font-semibold tracking-tight">{t.faqTitle}</h2>
        <div className="mt-4 divide-y divide-border border-y border-border">
          {faqs.map((f) => (
            <details key={f.q} className="group py-4">
              <summary className="cursor-pointer list-none font-medium">{f.q}</summary>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.a}</p>
            </details>
          ))}
        </div>
      </Container>

      <section className="bg-indigo">
        <Container className="flex flex-wrap items-center justify-between gap-6 py-12">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight text-white">{t.endTitle}</h2>
            <p className="mt-2 max-w-xl text-indigo-100/80">{t.endBody}</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href={ctaHref} className={buttonVariants({ size: "lg", variant: "accent" })}>
              {isPm ? t.ctaSignedIn : t.cta} <ArrowRight className="size-4" />
            </Link>
            <Link href={postHref} className="inline-flex items-center text-sm font-medium text-teal-300 hover:underline">
              {t.secondary}
            </Link>
          </div>
        </Container>
      </section>
    </>
  );
}
