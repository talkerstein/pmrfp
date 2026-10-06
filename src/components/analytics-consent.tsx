"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Script from "next/script";
import Link from "@/i18n/link";
import { useT } from "@/i18n/provider";
import { Button } from "@/components/ui/button";

/** localStorage key holding "granted" | "denied". */
export const CONSENT_KEY = "pmrfp-analytics-consent";
/** Fired on window after the visitor picks, so other prompts can wait their turn. */
export const CONSENT_EVENT = "pmrfp:consent";

/** True while the banner is (or will be) on screen: Clarity configured, no choice stored. */
export function consentPending(): boolean {
  if (!clarityId()) return false;
  try {
    return !window.localStorage.getItem(CONSENT_KEY);
  } catch {
    return false;
  }
}

function clarityId(): string | null {
  const id = process.env.NEXT_PUBLIC_CLARITY_ID?.trim();
  // Project IDs are short alphanumerics; anything else never reaches the inline script.
  return id && /^[a-z0-9]+$/i.test(id) ? id : null;
}

/**
 * Microsoft Clarity behind a cookie-consent banner. Nothing loads, and no
 * banner shows, unless NEXT_PUBLIC_CLARITY_ID is set. Clarity loads only after
 * "Accept"; "Decline" is remembered and Clarity never loads. Skipped on the
 * website widgets (/embed/*), same as SiteAnalytics.
 */
export function AnalyticsConsent() {
  const t = useT("sharedClient").consent;
  const pathname = usePathname();
  const id = clarityId();
  const [choice, setChoice] = useState<"granted" | "denied" | "unset" | null>(null);

  useEffect(() => {
    if (!id) return;
    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem(CONSENT_KEY);
    } catch {
      // Storage blocked: ask every visit, never assume consent.
    }
    setChoice(stored === "granted" || stored === "denied" ? stored : "unset");
  }, [id]);

  if (!id || pathname?.startsWith("/embed/") || choice === null) return null;

  function decide(value: "granted" | "denied") {
    try {
      window.localStorage.setItem(CONSENT_KEY, value);
    } catch {
      // ignore
    }
    setChoice(value);
    window.dispatchEvent(new CustomEvent(CONSENT_EVENT, { detail: value }));
  }

  if (choice === "granted") {
    return (
      <Script id="ms-clarity" strategy="afterInteractive">
        {`(function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);})(window,document,"clarity","script","${id}");`}
      </Script>
    );
  }
  if (choice === "denied") return null;

  return (
    <div
      role="region"
      aria-label={t.label}
      className="fixed inset-x-3 bottom-3 z-50 rounded-xl border border-border bg-card p-4 text-sm shadow-lg sm:left-auto sm:right-4 sm:bottom-4 sm:max-w-sm"
    >
      <p className="leading-relaxed text-muted-foreground">
        {t.body}{" "}
        <Link href="/privacy" className="font-medium text-teal-ink underline-offset-2 hover:underline">
          {t.privacy}
        </Link>
      </p>
      <div className="mt-3 flex gap-2">
        <Button size="sm" onClick={() => decide("granted")}>
          {t.accept}
        </Button>
        <Button size="sm" variant="outline" onClick={() => decide("denied")}>
          {t.decline}
        </Button>
      </div>
    </div>
  );
}
