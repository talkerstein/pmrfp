import type { Metadata } from "next";
import { Poppins, Lato, IBM_Plex_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { RegisterServiceWorker } from "@/components/pwa/register-sw";
import { SiteAnalytics } from "@/components/site-analytics";
import { JsonLd, organizationSchema, websiteSchema } from "@/lib/seo/jsonld";
import { SITE } from "@/lib/site";
import "./globals.css";

// Display / headings
const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

// Body / UI
const lato = Lato({
  variable: "--font-lato",
  subsets: ["latin"],
  weight: ["400", "700"],
  display: "swap",
});

// Mono / eyebrows / data
const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

const metadataBaseUrl =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : SITE.url);

export const metadata: Metadata = {
  metadataBase: new URL(metadataBaseUrl),
  title: {
    default: `${SITE.name} — Commercial Property RFPs & Trade Directory`,
    template: `%s — ${SITE.name}`,
  },
  description: SITE.description,
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
    locale: "en_CA",
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

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Google Analytics 4. The measurement ID is public (rendered in page HTML),
  // so it's baked in as the production default; an env override still wins.
  // Only fires in production so preview/dev traffic never pollutes GA data.
  // Runs alongside Vercel Analytics (kept for server-side custom events).
  const gaId =
    process.env.NEXT_PUBLIC_GA_ID ??
    (process.env.VERCEL_ENV === "production" ? "G-FEC0QRSEFE" : undefined);
  return (
    <html
      lang="en"
      className={`${poppins.variable} ${lato.variable} ${plexMono.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        <JsonLd data={organizationSchema()} />
        <JsonLd data={websiteSchema()} />
        {children}
        {/* Clear of the dashboards' bottom tab bar on phones. */}
        <Toaster mobileOffset={{ bottom: 88 }} />
        <RegisterServiceWorker />
        <SiteAnalytics gaId={gaId} />
      </body>
    </html>
  );
}
