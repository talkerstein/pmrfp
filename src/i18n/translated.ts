import { ENABLED_LOCALES, type Locale } from "./config";

/**
 * THE list of English paths whose page copy is translated (the page sets
 * hreflang with alternatesFor). One list feeds both the language switcher
 * (links to the same page in French/Spanish) and the sitemap (pairs each
 * listed page with its /fr and /es versions), so the two can't disagree.
 * Everything else links to the language's home in the switcher and is listed
 * in English only (its /fr copy canonicalizes to English).
 *
 * Being here does NOT put a page in the sitemap: the sitemap still decides
 * what is indexable (noindex pages such as sign-in, sign-up or thin project
 * pages stay out). Add a pattern here when a page's translation ships.
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
  /^\/insights(\/[^/]+\/[^/]+)?$/,
  /^\/trades(\/[^/]+){0,2}$/,
  /^\/(regions|for|vs)(\/[^/]+)?$/,
  /^\/(rfp-templates|cost-guides)(\/[^/]+)?$/,
  /^\/resources(\/(grow|how-to-post-a-quality-rfp|how-to-write-a-commercial-property-maintenance-rfp|contractor-directories))?$/,
  /^\/projects$/,
  // Forum index and category pages (UI translated; member threads stay English).
  /^\/forum(\/[a-z-]+)?$/,
  /^\/(founding-500|reputation|weekly-email|gc-packages\/new)$/,
  /^\/major-projects(\/[^/]+)?$/,
  /^\/reports\/contract-winners(\/[^/]+)?$/,
  /^\/trusted\/[^/]+$/,
  // Sign-in/sign-up flows: translated, but noindex, so never in the sitemap.
  /^\/(sign-in|sign-up|forgot-password|reset-password|check-email|onboarding)$/,
];

// French and Spanish cover the same pages.
const TRANSLATED: Partial<Record<Locale, RegExp[]>> = { fr: PAGES, es: PAGES };

/**
 * Whether `path` (English path, no prefix; query and hash ignored) has a real
 * translated page in `lang`. English is always true.
 */
export function isTranslatedPath(path: string, lang: Locale): boolean {
  if (lang === "en") return true;
  if (!ENABLED_LOCALES.includes(lang)) return false;
  const bare = (path.split(/[?#]/)[0] || "/").replace(/(.)\/+$/, "$1");
  return (TRANSLATED[lang] ?? []).some((re) => re.test(bare));
}

/** Languages (besides English) this path is translated into: the switcher's rule. */
export function translationsOf(path: string): Locale[] {
  return ENABLED_LOCALES.filter((l) => l !== "en" && isTranslatedPath(path, l));
}
