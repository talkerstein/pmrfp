"use client";

import { usePathname } from "next/navigation";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { SiteTracker } from "@/components/site-tracker";
import { trackingAllowed } from "@/lib/tracking/client";

/**
 * Cookieless measurement, everywhere except the website widgets (/embed/*),
 * which run inside other people's sites (/widgets promises their visitors
 * aren't tracked; clicks out of a widget still carry UTM tags, so sign-ups
 * remain traceable):
 *  - first-party page views, listing views and upgrade clicks
 *    (SiteTracker → /api/t, our own database);
 *  - Vercel Web Analytics + Speed Insights (they only collect once Web
 *    Analytics / Speed Insights are switched on for the Vercel project).
 * Nothing is sent when the browser asks not to be tracked (Do-Not-Track or
 * Global Privacy Control). Google Analytics 4 and Microsoft Clarity set
 * cookies, so they load only after consent (components/analytics-consent).
 */
export function SiteAnalytics() {
  const pathname = usePathname();
  if (pathname?.startsWith("/embed/")) return null;
  return (
    <>
      <SiteTracker />
      <Analytics beforeSend={(event) => (trackingAllowed() ? event : null)} />
      <SpeedInsights beforeSend={(event) => (trackingAllowed() ? event : null)} />
    </>
  );
}
