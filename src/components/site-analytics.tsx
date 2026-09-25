"use client";

import { usePathname } from "next/navigation";
import Script from "next/script";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";

/**
 * Vercel Analytics + Speed Insights + GA4, everywhere except the website
 * widgets (/embed/*). Those run inside other people's sites, and /widgets
 * promises their visitors aren't tracked; clicks out of a widget still carry
 * UTM tags, so sign-ups remain traceable.
 */
export function SiteAnalytics({ gaId }: { gaId?: string }) {
  const pathname = usePathname();
  if (pathname?.startsWith("/embed/")) return null;
  return (
    <>
      <Analytics />
      <SpeedInsights />
      {gaId ? (
        <>
          <Script src={`https://www.googletagmanager.com/gtag/js?id=${gaId}`} strategy="afterInteractive" />
          <Script id="ga4-init" strategy="afterInteractive">
            {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${gaId}');`}
          </Script>
        </>
      ) : null}
    </>
  );
}
