import { compactDollars } from "@/lib/data/fomo";
import { formatDate, formatNumber } from "@/i18n/format";
import type { Locale } from "@/i18n/config";
import type { Currency } from "./model";

const NBSP = " ";

/** "$123,456 CAD" (en/es), "123 456 $ CAD" (fr). One currency per view, always named. */
export function intelMoney(n: number, currency: Currency, lang: Locale): string {
  const v = formatNumber(Math.round(n), lang);
  return lang === "fr" ? `${v}${NBSP}$${NBSP}${currency}` : `$${v}${NBSP}${currency}`;
}

/** "$1.2M CAD" / "1,2 M$ CAD". */
export function intelShortMoney(n: number, currency: Currency, lang: Locale): string {
  return `${compactDollars(n, lang)}${NBSP}${currency}`;
}

/** "12.5%" / "12,5 %". */
export function intelPct(n: number, lang: Locale): string {
  const v = formatNumber(Math.abs(n), lang, { maximumFractionDigits: 1 });
  return lang === "fr" ? `${v}${NBSP}%` : `${v}%`;
}

/** A YYYY-MM-DD as "Oct 14, 2025" in the visitor's language. */
export function intelDay(d: string, lang: Locale): string {
  return formatDate(`${d.slice(0, 10)}T12:00:00Z`, lang, { month: "short", day: "numeric", year: "numeric" });
}

/** A YYYY-MM-DD as "Oct 2025". */
export function intelMonth(d: string, lang: Locale): string {
  return formatDate(`${d.slice(0, 10)}T12:00:00Z`, lang, { month: "short", year: "numeric" });
}

/** Whole-dollar price for the plan cards ("$99", "99 $"). */
export function planPrice(n: number, lang: Locale): string {
  return lang === "fr" ? `${formatNumber(n, lang)}${NBSP}$` : `$${formatNumber(n, lang)}`;
}
