/**
 * Sponsorship prices now live in lib/sponsors/pricing (per tier, CAD and USD
 * set separately). This module keeps the CAD money formatter other pages use.
 */
import type { Locale } from "@/i18n/config";
import { formatNumber } from "@/i18n/format";

/** "$149" in English, "149 $" in French, "$149" / "$1,490" in Spanish (U.S. style). */
export const cad = (n: number, lang: Locale = "en") =>
  lang === "es"
    ? `$${formatNumber(n, lang)}`
    : lang === "en"
      ? `$${n.toLocaleString("en-CA")}`
      : `${formatNumber(n, lang)} $`;
