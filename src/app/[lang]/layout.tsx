import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Toaster } from "@/components/ui/sonner";
import { RegisterServiceWorker } from "@/components/pwa/register-sw";
import { SiteAnalytics } from "@/components/site-analytics";
import { AnalyticsConsent } from "@/components/analytics-consent";
import { TrialBanner } from "@/components/trial/trial-banner";
import { CONSENT_ATTR, clarityId, gaMeasurementId } from "@/lib/tracking/ga";
import { JsonLd, organizationSchema, websiteSchema } from "@/lib/seo/jsonld";
import { SITE } from "@/lib/site";
import { LOCALES, LOCALE_TAG, OG_LOCALE, hasLocale } from "@/i18n/config";
import { clientMessages, getDictionary } from "@/i18n/dictionaries";
import { I18nProvider } from "@/i18n/provider";
import { setLang } from "@/i18n/server";
import { fontVariables } from "../fonts";
import "../globals.css";

const metadataBaseUrl =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : SITE.url);

// Every page renders once per language (English at the unprefixed URLs via the proxy).
export function generateStaticParams() {
  return LOCALES.map((lang) => ({ lang }));
}

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  const l = hasLocale(lang) ? lang : "en";
  const t = getDictionary(l).common.meta;
  return {
    metadataBase: new URL(metadataBaseUrl),
    title: {
      default: t.defaultTitle,
      template: `%s — ${SITE.name}`,
    },
    description: t.description,
    applicationName: SITE.name,
    // Home-screen install on iPhone/iPad (the manifest covers everyone else).
    // No site-wide theme color on purpose: marketing pages keep the browser's.
    appleWebApp: { capable: true, title: "PMRFP", statusBarStyle: "default" },
    // No og/twitter title, description or url here on purpose: Next fills them
    // from each page's own title + description. Hardcoding them made every page
    // share the homepage's social preview (and og:url) when linked.
    openGraph: {
      type: "website",
      siteName: SITE.name,
      locale: OG_LOCALE[l],
    },
    twitter: {
      card: "summary_large_image",
    },
    robots: { index: true, follow: true },
    // Google Search Console (URL-prefix property) verification — renders
    // <meta name="google-site-verification"> only when the token env is set.
    // (Domain-property verification via DNS TXT is the alternative and needs no code.)
    ...(process.env.GOOGLE_SITE_VERIFICATION
      ? { verification: { google: process.env.GOOGLE_SITE_VERIFICATION } }
      : {}),
  };
}

export default async function RootLayout({
  children,
  params,
}: Readonly<{ children: React.ReactNode; params: Promise<{ lang: string }> }>) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  setLang(lang);
  // Google Analytics 4 (lib/tracking/ga): NEXT_PUBLIC_GA_ID, else the
  // production default, none on previews. Like Microsoft Clarity
  // (NEXT_PUBLIC_CLARITY_ID), it loads only after the consent banner's
  // "Accept", never for Do-Not-Track / Global Privacy Control.
  const gaId = gaMeasurementId();
  const consentGated = Boolean(gaId || clarityId());
  return (
    <html lang={LOCALE_TAG[lang]} className={`${fontVariables} h-full antialiased`}>
      <body className="min-h-full" {...(consentGated ? { [CONSENT_ATTR]: "" } : {})}>
        <JsonLd data={organizationSchema()} />
        <JsonLd data={websiteSchema()} />
        <I18nProvider lang={lang} messages={clientMessages(lang)}>
          {/* Trial countdown / "your trial ended" note; draws nothing unless a signed-in company has a trial. */}
          <TrialBanner />
          {children}
          {/* Clear of the dashboards' bottom tab bar on phones. */}
          <Toaster mobileOffset={{ bottom: 88 }} />
          {/* GA4 and Microsoft Clarity, only with the visitor's consent. */}
          <AnalyticsConsent gaId={gaId} />
        </I18nProvider>
        <RegisterServiceWorker />
        {/* Cookieless: first-party page views (/api/t), Vercel Analytics, Speed Insights. */}
        <SiteAnalytics />
      </body>
    </html>
  );
}
