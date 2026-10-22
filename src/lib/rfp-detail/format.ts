/** Small display helpers for the tender-page blocks (pure; the words come from the caller's dictionary). */
import { compactDollars } from "@/lib/data/fomo";
import { fmt, formatNumber, plural } from "@/i18n/format";
import type { Locale } from "@/i18n/config";

const NBSP = String.fromCharCode(160); // non-breaking space

/** "$97,625 CAD" (en/es), "97 625 $ CAD" (fr). One currency per country: never mixed. */
export function money(n: number, currency: "CAD" | "USD", lang: Locale): string {
  const v = formatNumber(Math.round(n), lang);
  return lang === "fr" ? `${v}${NBSP}$${NBSP}${currency}` : `$${v}${NBSP}${currency}`;
}

/** "$285K CAD" / "285 k$ CAD": for medians and bands. */
export function moneyShort(n: number, currency: "CAD" | "USD", lang: Locale): string {
  return `${compactDollars(n, lang)}${NBSP}${currency}`;
}

/** "14 months" under two years, else "3 years" (rounded). */
export function gapLabel(months: number, t: { months: { one: string; other: string }; years: { one: string; other: string } }): string {
  if (months < 24) return plural(Math.max(1, months), t.months);
  return plural(Math.round(months / 12), t.years);
}

/** "$120,000 to $180,000" / "From $120,000" / "Up to $180,000", from a stated budget. */
export function valueLabel(
  v: { min: number | null; max: number | null },
  currency: "CAD" | "USD",
  lang: Locale,
  t: { valueRange: string; valueFrom: string; valueUpTo: string },
): string {
  const lo = v.min !== null ? money(v.min, currency, lang) : null;
  const hi = v.max !== null ? money(v.max, currency, lang) : null;
  if (lo && hi) return v.min === v.max ? lo : fmt(t.valueRange, { min: lo, max: hi });
  if (lo) return fmt(t.valueFrom, { min: lo });
  return fmt(t.valueUpTo, { max: hi ?? "" });
}
