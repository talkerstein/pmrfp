import type { Locale } from "@/i18n/config";

/**
 * The province (or state) a form preselects. On the French site it is always
 * Québec: a French-speaking property manager is far more likely to be in
 * Québec than wherever their IP geolocates (persona QA 2026-10-21: the French
 * writer and trade popup both defaulted to Ontario). Elsewhere: the visitor's
 * own province when known, else Ontario.
 */
export function defaultProvinceFor(lang: Locale, visitorProvince?: string | null): string {
  if (lang === "fr") return "Quebec";
  return visitorProvince?.trim() || "Ontario";
}
