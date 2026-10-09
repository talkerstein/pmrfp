import { ENABLED_LOCALES, type Locale } from "./config";

/**
 * Which English paths have their page copy translated, per language. The
 * sitemap pairs these with their /fr (etc.) versions via hreflang; everything
 * else is listed in English only (its /fr copy canonicalizes to English).
 * Add a pattern here when a page's translation ships.
 */
const PAGES: RegExp[] = [
  /^\/$/,
  /^\/rfps(\/[^/]+)?$/,
  /^\/directory(\/[^/]+)?$/,
  /^\/suppliers$/,
  /^\/pricing$/,
  /^\/for-trades$/,
  /^\/for-property-managers$/,
  /^\/for-agencies$/,
  /^\/become-a-supplier$/,
  /^\/rfp-writer$/,
  /^\/jobs(\/[^/]+)?$/,
  /^\/talent(\/[^/]+)?$/,
  /^\/marketplace(\/rules|\/category\/[^/]+(\/[^/]+)?|\/[^/]+)?$/,
  /^\/(about|contact|terms|privacy|disclaimer|refer|refer-a-trade|refer-a-project|get-found|services-for-trades)$/,
  /^\/(advertise|widgets|badge|reports\/public-building-contracts)$/,
  /^\/contract-winners(\/[^/]+)?$/,
  /^\/gc-hub$/,
  /^\/trades(\/[^/]+){0,2}$/,
  /^\/(regions|for|vs)(\/[^/]+)?$/,
  /^\/(rfp-templates|cost-guides)(\/[^/]+)?$/,
  /^\/resources(\/(grow|how-to-post-a-quality-rfp|how-to-write-a-commercial-property-maintenance-rfp|contractor-directories))?$/,
  /^\/case-studies$/,
  // Forum index and category pages (UI translated; member threads stay English).
  /^\/forum(\/[a-z-]+)?$/,
];

// French and Spanish cover the same pages.
const TRANSLATED: Partial<Record<Locale, RegExp[]>> = { fr: PAGES, es: PAGES };

/** Languages (besides English) this path is translated into. */
export function translationsOf(path: string): Locale[] {
  return ENABLED_LOCALES.filter((l) => l !== "en" && (TRANSLATED[l] ?? []).some((re) => re.test(path)));
}
