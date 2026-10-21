/**
 * Which Google Analytics 4 property the site uses, if any. Pure.
 *
 *   NEXT_PUBLIC_GA_ID=G-XXXXXXXXXX   use this property (the documented name);
 *   NEXT_PUBLIC_GA_ID=off            no GA4 at all;
 *   unset                            the production default below, and none
 *                                    on previews / local dev.
 * NEXT_PUBLIC_GA4_ID and NEXT_PUBLIC_GA_MEASUREMENT_ID are accepted as
 * aliases, so a differently-named variable isn't silently ignored.
 *
 * Either way GA4 loads only after the visitor accepts the consent banner,
 * and never for Do-Not-Track / Global Privacy Control (components/analytics-consent).
 */

/** The property that has always been baked in for production (public: it's in the page HTML). */
export const DEFAULT_GA_ID = "G-FEC0QRSEFE";

const GA_ID = /^G-[A-Z0-9]{4,20}$/i;

/** On <body> (app/[lang]/layout) when a consent-gated tool (GA4 or Clarity) is configured. */
export const CONSENT_ATTR = "data-analytics-consent";

/** Microsoft Clarity's project id (NEXT_PUBLIC_CLARITY_ID). Short alphanumerics only, so nothing else reaches the inline script. */
export function clarityId(env: Record<string, string | undefined> = { NEXT_PUBLIC_CLARITY_ID: process.env.NEXT_PUBLIC_CLARITY_ID }): string | null {
  const id = env.NEXT_PUBLIC_CLARITY_ID?.trim();
  return id && /^[a-z0-9]+$/i.test(id) ? id : null;
}

/** A GA4 measurement id (G-XXXXXXXXXX), upper-cased, or null. */
export function validGaId(id: string | null | undefined): string | null {
  const v = id?.trim();
  return v && GA_ID.test(v) ? v.toUpperCase() : null;
}

export function gaMeasurementId(env: Record<string, string | undefined> = process.env): string | null {
  const raw = (env.NEXT_PUBLIC_GA_ID ?? env.NEXT_PUBLIC_GA4_ID ?? env.NEXT_PUBLIC_GA_MEASUREMENT_ID ?? "").trim();
  if (/^(off|none|false|0)$/i.test(raw)) return null;
  if (raw) return GA_ID.test(raw) ? raw.toUpperCase() : null;
  return env.VERCEL_ENV === "production" ? DEFAULT_GA_ID : null;
}
