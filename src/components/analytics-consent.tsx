"use client";

import { useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import Script from "next/script";
import Link from "@/i18n/link";
import { useT } from "@/i18n/provider";
import { Button } from "@/components/ui/button";
import { browserOptedOut } from "@/lib/tracking/privacy";
import { CONSENT_ATTR, clarityId, validGaId } from "@/lib/tracking/ga";

/** localStorage key holding "granted" | "denied". */
export const CONSENT_KEY = "pmrfp-analytics-consent";
/** Fired on window after the visitor picks, so other prompts can wait their turn. */
export const CONSENT_EVENT = "pmrfp:consent";

/** The browser asked not to be tracked: Do-Not-Track or Global Privacy Control. Treated as "Decline". */
function privacySignal(): boolean {
  try {
    return browserOptedOut(navigator as Navigator & { globalPrivacyControl?: boolean }, window as Window & { doNotTrack?: string | null });
  } catch {
    return false;
  }
}

type Choice = "granted" | "denied" | "unset";
/** The choice made on this page when storage is blocked (ask again next visit, never assume consent). */
let memoryChoice: Choice | null = null;

/** The visitor's standing choice: a privacy signal (DNT / GPC) is a permanent "Decline". */
function readChoice(): Choice {
  if (privacySignal()) return "denied";
  try {
    const stored = window.localStorage.getItem(CONSENT_KEY);
    if (stored === "granted" || stored === "denied") return stored;
  } catch {
    // Storage blocked.
  }
  return memoryChoice ?? "unset";
}

function subscribeChoice(onChange: () => void): () => void {
  window.addEventListener(CONSENT_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CONSENT_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/** True while the banner is (or will be) on screen: a gated tool configured, no choice stored, no privacy signal. */
export function consentPending(): boolean {
  try {
    if (!document.body.hasAttribute(CONSENT_ATTR)) return false;
    if (privacySignal()) return false;
    return !window.localStorage.getItem(CONSENT_KEY);
  } catch {
    return false;
  }
}

/**
 * Google Analytics 4 and Microsoft Clarity behind one cookie-consent
 * banner. The banner shows only when at least one of them is configured
 * (GA4: NEXT_PUBLIC_GA_ID, or the production default in app/[lang]/layout;
 * Clarity: NEXT_PUBLIC_CLARITY_ID). Nothing loads until "Accept"; "Decline"
 * is remembered. A browser sending Do-Not-Track or Global Privacy Control
 * counts as "Decline": no banner, nothing loads. Skipped on the website
 * widgets (/embed/*).
 */
export function AnalyticsConsent({ gaId }: { gaId?: string | null }) {
  const t = useT("sharedClient").consent;
  const pathname = usePathname();
  const ga = validGaId(gaId);
  const clarity = clarityId();
  const gated = Boolean(ga || clarity);
  // null on the server and during hydration: nothing renders until the browser has been asked.
  const choice = useSyncExternalStore(subscribeChoice, readChoice, () => null);

  if (!gated || pathname?.startsWith("/embed/") || choice === null) return null;

  function decide(value: "granted" | "denied") {
    memoryChoice = value;
    try {
      window.localStorage.setItem(CONSENT_KEY, value);
    } catch {
      // Storage blocked: remembered for this page only.
    }
    window.dispatchEvent(new CustomEvent(CONSENT_EVENT, { detail: value }));
  }

  if (choice === "granted") {
    return (
      <>
        {ga ? (
          <>
            <Script src={`https://www.googletagmanager.com/gtag/js?id=${ga}`} strategy="afterInteractive" />
            <Script id="ga4-init" strategy="afterInteractive">
              {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${ga}',{allow_google_signals:false,allow_ad_personalization_signals:false});`}
            </Script>
          </>
        ) : null}
        {clarity ? (
          <Script id="ms-clarity" strategy="afterInteractive">
            {`(function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);})(window,document,"clarity","script","${clarity}");`}
          </Script>
        ) : null}
      </>
    );
  }
  if (choice === "denied") return null;

  const body = ga && clarity ? t.bodyBoth : ga ? t.bodyGa : t.body;
  return (
    <div
      role="region"
      aria-label={t.label}
      className="fixed inset-x-3 bottom-3 z-50 rounded-xl border border-border bg-card p-4 text-sm shadow-lg sm:left-auto sm:right-4 sm:bottom-4 sm:max-w-sm"
    >
      <p className="leading-relaxed text-muted-foreground">
        {body}{" "}
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
