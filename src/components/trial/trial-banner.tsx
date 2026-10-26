"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "@/i18n/link";
import { useLang } from "@/i18n/provider";
import type { BannerCopy } from "@/lib/entitlement/banner-copy";

/**
 * "Trial day 3 of 14 · 11 days left · what you've used" with an Upgrade
 * button, in every page's frame while a company is on its free trial, and a
 * calm "your trial ended" note after. It asks /api/trial/state once per page
 * load, and only when a sign-in cookie exists, so public pages stay static
 * and visitors cost nothing. After a trial starts, the page it returns to
 * carries ?trial=started, which makes the banner ask again right away.
 */
const AUTH_COOKIE = /(?:^|;\s*)sb-[^=;]*-auth-token/;
const FRESH_MS = 60_000;
let cache: { at: number; lang: string; banner: BannerCopy | null } | null = null;

export function TrialBanner() {
  const lang = useLang();
  const pathname = usePathname();
  const [banner, setBanner] = useState<BannerCopy | null>(cache?.banner ?? null);

  useEffect(() => {
    if (!pathname || pathname.includes("/embed/")) return;
    if (typeof document === "undefined" || !AUTH_COOKIE.test(document.cookie)) {
      setBanner(null);
      return;
    }
    const forced = new URLSearchParams(window.location.search).get("trial") === "started";
    if (!forced && cache && cache.lang === lang && Date.now() - cache.at < FRESH_MS) {
      setBanner(cache.banner);
      return;
    }
    let live = true;
    fetch(`/api/trial/state?lang=${lang}`, { credentials: "same-origin", cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<{ banner: BannerCopy | null }>) : { banner: null }))
      .then((d) => {
        cache = { at: Date.now(), lang, banner: d.banner };
        if (live) setBanner(d.banner);
      })
      .catch(() => {
        if (live) setBanner(null);
      });
    return () => {
      live = false;
    };
  }, [pathname, lang]);

  if (!banner) return null;
  const urgent = banner.tone !== "normal";
  const upgradeHref = "/dashboard/billing?plan=pro&interval=annual";
  return (
    <div
      role="status"
      data-section="trial-banner"
      data-tone={banner.tone}
      className={`border-b px-4 py-2 text-sm ${
        banner.kind === "expired"
          ? "border-border bg-muted/50 text-foreground"
          : urgent
            ? "border-amber-300 bg-amber-50 text-amber-950"
            : "border-teal-300 bg-teal-50 text-teal-950"
      }`}
    >
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <span className="font-semibold">{banner.title}</span>
          {banner.detail && <span className="ml-2">{banner.detail}</span>}
          {banner.lostHead && (
            <div className="mt-1">
              <span>{banner.lostHead}</span>
              <ul className="ml-5 list-disc">
                {banner.lost.map((l) => (
                  <li key={l}>{l}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <Link
            href="/pricing"
            className="text-xs underline underline-offset-2"
          >
            {banner.plansLabel}
          </Link>
          <Link
            href={upgradeHref}
            data-track="trial_banner_upgrade_clicked"
            data-source={banner.kind === "expired" ? "banner_expired" : "banner"}
            className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90"
          >
            {banner.upgradeLabel}
          </Link>
        </div>
      </div>
    </div>
  );
}
