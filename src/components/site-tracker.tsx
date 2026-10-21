"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { track, trackPageView } from "@/lib/tracking/client";
import { upgradeIntent } from "@/lib/tracking/intent";

/**
 * First-party page views and upgrade clicks (lib/tracking/client → /api/t).
 * One page view per route (client-side navigations included); the
 * referring site's host is sent with the first page of a visit only. Clicks
 * on purchase links or on anything tagged data-track="upgrade_clicked"
 * count as upgrade_clicked. Do-Not-Track / Global Privacy Control and the
 * website widgets are skipped inside lib/tracking/client.
 */
export function SiteTracker() {
  const pathname = usePathname();
  const first = useRef(true);

  useEffect(() => {
    if (!pathname) return;
    const ref = first.current && document.referrer ? document.referrer : null;
    first.current = false;
    trackPageView(pathname, ref);
  }, [pathname]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      const target = e.target instanceof Element ? e.target : null;
      if (!target) return;
      const tagged = target.closest<HTMLElement>("[data-track]");
      if (tagged?.dataset.track === "upgrade_clicked") {
        track("upgrade_clicked", { plan: tagged.dataset.plan ?? null, where: tagged.dataset.where ?? null });
        return;
      }
      const link = target.closest<HTMLAnchorElement>("a[href]");
      const plan = link ? upgradeIntent(link.getAttribute("href"), window.location.origin) : null;
      if (plan) track("upgrade_clicked", { plan, where: link?.dataset.where ?? null });
    }
    document.addEventListener("click", onClick, { capture: true });
    return () => document.removeEventListener("click", onClick, { capture: true });
  }, []);

  return null;
}
