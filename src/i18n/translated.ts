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
  /^\/benchmarks(\/[^/]+\/[^/]+)?$/,
  /^\/trades(\/[^/]+){0,2}$/,
  /^\/(regions|for|vs)(\/[^/]+)?$/,
  /^\/(rfp-templates|cost-guides)(\/[^/]+)?$/,
  /^\/resources(\/(grow|how-to-post-a-quality-rfp|how-to-write-a-commercial-property-maintenance-rfp|contractor-directories))?$/,
  /^\/projects$/,
  // Forum index and category pages (UI translated; member threads stay English).
  /^\/forum(\/[a-z-]+)?$/,
];

// French and Spanish cover the same pages.
const TRANSLATED: Partial<Record<Locale, RegExp[]>> = { fr: PAGES, es: PAGES };

/**
 * Pages whose copy is translated (they set hreflang with alternatesFor) but
 * that the sitemap doesn't pair yet: sign-in/sign-up flows, and newer pages.
 * The language switcher links straight to their /fr and /es versions.
 */
const ALSO_TRANSLATED: RegExp[] = [
  /^\/(sign-in|sign-up|forgot-password|reset-password|check-email|onboarding)$/,
  /^\/(founding-500|reputation|weekly-email|gc-packages\/new)$/,
  /^\/major-projects(\/[^/]+)?$/,
  /^\/reports\/contract-winners(\/[^/]+)?$/,
  /^\/trusted\/[^/]+$/,
];

/**
 * Whether `path` (English path, no prefix; query and hash ignored) has a real
 * translated page in `lang`. English is always true.
 */
export function isTranslatedPath(path: string, lang: Locale): boolean {
  if (lang === "en") return true;
  if (!ENABLED_LOCALES.includes(lang)) return false;
  const bare = (path.split(/[?#]/)[0] || "/").replace(/(.)\/+$/, "$1");
  return (TRANSLATED[lang] ?? []).some((re) => re.test(bare)) || ALSO_TRANSLATED.some((re) => re.test(bare));
}

/** Languages (besides English) this path is translated into. */
export function translationsOf(path: string): Locale[] {
  return ENABLED_LOCALES.filter((l) => l !== "en" && (TRANSLATED[l] ?? []).some((re) => re.test(path)));
}
