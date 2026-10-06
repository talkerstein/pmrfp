import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Toaster } from "@/components/ui/sonner";
import { RegisterServiceWorker } from "@/components/pwa/register-sw";
import { SiteAnalytics } from "@/components/site-analytics";
import { AnalyticsConsent } from "@/components/analytics-consent";
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
  // Google Analytics 4. The measurement ID is public (rendered in page HTML),
  // so it's baked in as the production default; an env override still wins.
  // Only fires in production so preview/dev traffic never pollutes GA data.
  // Runs alongside Vercel Analytics (kept for server-side custom events).
  const gaId =
    process.env.NEXT_PUBLIC_GA_ID ??
    (process.env.VERCEL_ENV === "production" ? "G-FEC0QRSEFE" : undefined);
  return (
    <html lang={LOCALE_TAG[lang]} className={`${fontVariables} h-full antialiased`}>
      <body className="min-h-full">
        <JsonLd data={organizationSchema()} />
        <JsonLd data={websiteSchema()} />
        <I18nProvider lang={lang} messages={clientMessages(lang)}>
          {children}
          {/* Clear of the dashboards' bottom tab bar on phones. */}
          <Toaster mobileOffset={{ bottom: 88 }} />
          {/* Microsoft Clarity, only with NEXT_PUBLIC_CLARITY_ID and the visitor's consent. */}
          <AnalyticsConsent />
        </I18nProvider>
        <RegisterServiceWorker />
        <SiteAnalytics gaId={gaId} />
      </body>
    </html>
  );
}
