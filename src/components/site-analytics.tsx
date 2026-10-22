"use client";

import { usePathname } from "next/navigation";
import { SiteTracker } from "@/components/site-tracker";

/**
 * Cookieless measurement, everywhere except the website widgets (/embed/*),
 * which run inside other people's sites (/widgets promises their visitors
 * aren't tracked; clicks out of a widget still carry UTM tags, so sign-ups
 * remain traceable):
 *  - first-party page views, listing views and upgrade clicks
 *    (SiteTracker → /api/t, our own database);
 * Vercel Web Analytics and Speed Insights were removed (2026-10): the
 * first-party beacon covers page views and funnels, and Speed Insights was a
 * paid per-event add-on. Do not re-add them without checking the Vercel bill.
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
    </>
  );
}
