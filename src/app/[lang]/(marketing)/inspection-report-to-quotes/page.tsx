import type { Metadata } from "next";
import Link from "@/i18n/link";
import { AlertTriangle, ArrowRight, FileUp, ListChecks, Send, ShieldCheck } from "lucide-react";
import { Container, Eyebrow } from "@/components/container";
import { buttonVariants } from "@/components/ui/button";
import { JsonLd, breadcrumbSchema, faqSchema } from "@/lib/seo/jsonld";
import { getSession } from "@/lib/access/access";
import { getVisitorCountry } from "@/lib/visitor-geo.server";
import { SITE } from "@/lib/site";
import type { Urgency } from "@/lib/report-quotes/rules";
import { getT, setLangFrom } from "@/i18n/server";
import { getDictionary } from "@/i18n/dictionaries";
import { LOCALE_TAG, hasLocale, localizePath } from "@/i18n/config";
import { alternatesFor } from "@/i18n/metadata";
import { fmt } from "@/i18n/format";

const PATH = "/inspection-report-to-quotes";
const DASHBOARD = "/pm-dashboard/report-to-quotes";
const STEP_ICONS = [FileUp, ListChecks, Send];
const URGENCY_CHIP: Record<Urgency, string> = {
  safety: "border-red-200 bg-red-50 text-red-700",
  soon: "border-amber-200 bg-amber-50 text-amber-800",
  monitor: "border-slate-200 bg-slate-100 text-slate-700",
};

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  const l = hasLocale(lang) ? lang : "en";
  const t = getDictionary(l).reportQuotes.meta;
  return { title: t.title, description: t.description, alternates: alternatesFor(l, PATH) };
}

/**
 * /inspection-report-to-quotes — the free tool's public page. Country-first:
 * Canadian visitors read the listing / conditional-period copy, U.S.
 * visitors the inspection-contingency copy; never both. The demo is a
 * clearly labelled sample list (no upload, no real property). Sign-up lands
 * a realtor (or a landlord / property manager) in the tool.
 */
export default async function InspectionReportToQuotesPage({ params }: { params: Promise<object> }) {
  const lang = await setLangFrom(params);
  const r = getT("reportQuotes");
  const t = r.landing;
  const session = await getSession().catch(() => null);
  const { country } = await getVisitorCountry({ session });
  const role = session?.profile.primary_role;
  const signedIn = role === "property_manager" || role === "real_estate_agent";
  const next = encodeURIComponent(localizePath(DASHBOARD, lang));
  const ctaHref = signedIn ? DASHBOARD : `/sign-up?role=real_estate_agent&next=${next}`;
  const pmHref = `/sign-up?role=landlord&next=${next}`;
  const faqs = t.faqs[country];

  return (
    <>
      <JsonLd
        data={breadcrumbSchema([
          { name: t.crumbHome, path: localizePath("/", lang) },
          { name: t.crumbTool, path: localizePath(PATH, lang) },
        ])}
      />
      <JsonLd data={faqSchema(faqs)} />
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "WebApplication",
          name: fmt(t.appName, { brand: SITE.name }),
          url: `${SITE.url}${localizePath(PATH, lang)}`,
          applicationCategory: "BusinessApplication",
          operatingSystem: "Any",
          description: r.meta.description,
          offers: { "@type": "Offer", price: "0", priceCurrency: country === "US" ? "USD" : "CAD" },
          inLanguage: LOCALE_TAG[lang],
        }}
      />

      <section className="border-b border-border bg-secondary/30">
        <Container className="py-12 sm:py-16">
          <Eyebrow>{t.eyebrow}</Eyebrow>
          <h1 className="mt-3 max-w-3xl text-3xl font-semibold tracking-tight sm:text-4xl">{t.h1[country]}</h1>
          <p className="mt-3 max-w-2xl text-lg text-muted-foreground">{fmt(t.intro[country], { brand: SITE.name })}</p>
          <p className="mt-2 max-w-2xl text-base text-muted-foreground">{t.second[country]}</p>
          <p className="mt-4 text-base font-semibold text-indigo">{t.tagline}</p>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Link href={ctaHref} className={buttonVariants({ size: "lg" })}>
              {signedIn ? t.ctaSignedIn : t.cta} <ArrowRight className="size-4" />
            </Link>
            {!signedIn && (
              <Link href={pmHref} className={buttonVariants({ size: "lg", variant: "outline" })}>
                {t.ctaPm}
              </Link>
            )}
          </div>
          <p className="mt-4 inline-flex items-center gap-2 rounded-full bg-indigo px-3 py-1 text-sm text-white">
            <span className="size-1.5 rounded-full bg-teal-300" />
            {t.badge}
          </p>
        </Container>
      </section>

      <Container className="py-12">
        <h2 className="text-2xl font-semibold tracking-tight">{t.howTitle}</h2>
        <ol className="mt-6 grid gap-4 sm:grid-cols-3">
          {t.steps.map((s, i) => {
            const Icon = STEP_ICONS[i % STEP_ICONS.length];
            return (
              <li key={s.t} className="rounded-lg border border-border bg-card p-6">
                <span className="flex size-10 items-center justify-center rounded-md bg-teal-50 text-teal-700">
                  <Icon className="size-5" />
                </span>
                <h3 className="mt-4 font-semibold">
                  {i + 1}. {s.t}
                </h3>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{s.d}</p>
              </li>
            );
          })}
        </ol>

        <section className="mt-14" aria-labelledby="rq-sample">
          <div className="flex flex-wrap items-center gap-3">
            <h2 id="rq-sample" className="text-2xl font-semibold tracking-tight">
              {t.sampleTitle}
            </h2>
            <span className="rounded-full border border-amber-300 bg-amber-50 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide text-amber-800">{t.sampleLabel}</span>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">{t.sampleNote}</p>
          <div className="mt-6 rounded-2xl border-2 border-dashed border-amber-300 bg-card p-4 sm:p-6">
            <p className="text-sm font-medium text-muted-foreground">{t.sampleArea[country]}</p>
            <div className="mt-4 grid gap-4 md:grid-cols-3">
              {t.sampleGroups.map((g) => (
                <div key={g.trade} className="rounded-lg border border-border bg-background">
                  <p className="border-b border-border px-4 py-2.5 font-semibold">
                    {g.trade} <span className="text-sm font-normal text-muted-foreground">({g.items.length})</span>
                  </p>
                  <ul className="space-y-3 p-4">
                    {g.items.map((it) => {
                      const u = it.urgency as Urgency;
                      return (
                        <li key={it.item} className="text-sm">
                          {u === "safety" && (
                            <p className="mb-1.5 flex items-center gap-1.5 rounded bg-red-50 px-2 py-1 text-xs font-medium text-red-700">
                              <AlertTriangle className="size-3.5 shrink-0" /> {getT("reportQuotes").review.safetyBanner}
                            </p>
                          )}
                          <p>{it.item}</p>
                          <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                            <span className={`rounded-full border px-2 py-0.5 font-medium ${URGENCY_CHIP[u]}`}>{r.urgency[u]}</span>
                            {it.location} · {fmt(r.page, { n: it.page })}
                          </p>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
            <p className="mt-4 text-sm text-muted-foreground">{t.sampleActions}</p>
          </div>
        </section>

        <div className="mt-14 grid gap-4 md:grid-cols-3">
          {t.forWho[country].map((w) => (
            <div key={w.t} className="rounded-lg border border-border bg-card p-6">
              <h3 className="font-semibold">{w.t}</h3>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{w.d}</p>
            </div>
          ))}
        </div>

        <div className="mt-14 grid gap-4 lg:grid-cols-2">
          <div className="rounded-lg border border-teal-300 bg-teal-50/60 p-6">
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <ShieldCheck className="size-5 text-teal-700" /> {t.privacyTitle}
            </h2>
            <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-muted-foreground">
              {t.privacy.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </div>
          <div className="rounded-lg border border-border bg-card p-6">
            <h2 className="text-lg font-semibold">{t.disclaimerTitle}</h2>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{t.disclaimer}</p>
          </div>
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
          <div className="flex flex-wrap items-center gap-3">
            <Link href={ctaHref} className={buttonVariants({ size: "lg", variant: "accent" })}>
              {signedIn ? t.ctaSignedIn : t.cta} <ArrowRight className="size-4" />
            </Link>
            {!signedIn && (
              <Link href={pmHref} className="inline-flex items-center text-sm font-medium text-teal-300 hover:underline">
                {t.ctaPm}
              </Link>
            )}
          </div>
        </Container>
      </section>
    </>
  );
}
