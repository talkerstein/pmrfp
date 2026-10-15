import { describe, expect, it } from "vitest";
import { bannerOffers, isQuebec, languageHref, languageLinks, parseAcceptLanguage, preferredLocale, readCookie } from "@/i18n/switch";
import { isTranslatedPath } from "@/i18n/translated";

const CHROME = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36";
const GOOGLEBOT = "Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";

describe("languageHref", () => {
  it("keeps the same page, query and hash across languages", () => {
    expect(languageHref("/rfps", "fr", "?country=us")).toBe("/fr/rfps?country=us");
    expect(languageHref("/fr/rfps", "en", "?country=us")).toBe("/rfps?country=us");
    expect(languageHref("/es/rfps", "fr", "?country=us&page=2", "#list")).toBe("/fr/rfps?country=us&page=2#list");
    expect(languageHref("/rfps", "es", "country=ca")).toBe("/es/rfps?country=ca");
  });

  it("handles the homepage", () => {
    expect(languageHref("/", "fr")).toBe("/fr");
    expect(languageHref("/fr", "en")).toBe("/");
    expect(languageHref("/es", "fr", "?x=1")).toBe("/fr?x=1");
    expect(languageHref("/", "es", "?ref=nav")).toBe("/es?ref=nav");
  });

  it("handles nested and dynamic paths", () => {
    expect(languageHref("/benchmarks/snow-removal/quebec", "fr")).toBe("/fr/benchmarks/snow-removal/quebec");
    expect(languageHref("/fr/benchmarks/snow-removal/quebec", "es")).toBe("/es/benchmarks/snow-removal/quebec");
    expect(languageHref("/major-projects/finch-west-lrt", "es")).toBe("/es/major-projects/finch-west-lrt");
    expect(languageHref("/es/major-projects/finch-west-lrt", "en")).toBe("/major-projects/finch-west-lrt");
    expect(languageHref("/directory/acme-roofing", "fr")).toBe("/fr/directory/acme-roofing");
    expect(languageHref("/trades/roofing/toronto", "fr")).toBe("/fr/trades/roofing/toronto");
    expect(languageHref("/reports/contract-winners/2026-09", "fr")).toBe("/fr/reports/contract-winners/2026-09");
  });

  it("strips the internal /en prefix of prerendered English pages", () => {
    expect(languageHref("/en/rfps", "fr")).toBe("/fr/rfps");
    expect(languageHref("/en/rfps", "en")).toBe("/rfps");
    expect(languageHref("/en", "es")).toBe("/es");
  });

  it("links an untranslated page to that language's home, never a 404", () => {
    expect(languageHref("/spotlight", "fr", "?x=1")).toBe("/fr");
    expect(languageHref("/forum/general/some-thread", "es")).toBe("/es");
    expect(languageHref("/toronto-contracts/abc", "fr")).toBe("/fr");
    // English always exists.
    expect(languageHref("/fr/spotlight", "en", "?x=1")).toBe("/spotlight?x=1");
    // The page being viewed is never swapped for a home page in its own language.
    expect(languageHref("/fr/spotlight", "fr", "?x=1")).toBe("/fr/spotlight?x=1");
    expect(languageHref("/fr/spotlight", "es")).toBe("/es");
  });

  it("ignores an empty query or hash", () => {
    expect(languageHref("/pricing", "fr", "?", "#")).toBe("/fr/pricing");
  });
});

describe("isTranslatedPath", () => {
  it("covers every v3 page that sets hreflang", () => {
    for (const p of ["/", "/rfps", "/rfps/some-rfp", "/pricing", "/major-projects", "/major-projects/x", "/benchmarks", "/benchmarks/snow-removal/quebec", "/sign-up", "/sign-in", "/reports/contract-winners/2026-09", "/reputation", "/forum", "/forum/general"]) {
      expect(isTranslatedPath(p, "fr"), p).toBe(true);
      expect(isTranslatedPath(p, "es"), p).toBe(true);
    }
  });
  it("ignores trailing slashes and queries; English is always there", () => {
    expect(isTranslatedPath("/rfps/", "fr")).toBe(true);
    expect(isTranslatedPath("/rfps?country=us", "fr")).toBe(true);
    expect(isTranslatedPath("/spotlight", "en")).toBe(true);
    expect(isTranslatedPath("/spotlight", "fr")).toBe(false);
  });
});

describe("languageLinks", () => {
  it("lists English, Français, Español with the active one marked", () => {
    const links = languageLinks("/fr/rfps", "fr", "?country=us");
    expect(links.map((l) => l.lang)).toEqual(["en", "fr", "es"]);
    expect(links.map((l) => l.href)).toEqual(["/rfps?country=us", "/fr/rfps?country=us", "/es/rfps?country=us"]);
    expect(links.filter((l) => l.current).map((l) => l.lang)).toEqual(["fr"]);
    expect(links.map((l) => l.name)).toEqual(["English", "Français", "Español"]);
    expect(links.map((l) => l.tag)).toEqual(["en-CA", "fr-CA", "es-US"]);
    expect(links.every((l) => l.samePage)).toBe(true);
  });
  it("flags links that fall back to a home page", () => {
    const links = languageLinks("/spotlight", "en");
    expect(links.find((l) => l.lang === "en")).toMatchObject({ current: true, samePage: true, href: "/spotlight" });
    expect(links.find((l) => l.lang === "fr")).toMatchObject({ current: false, samePage: false, href: "/fr" });
    const fr = languageLinks("/fr/spotlight", "fr");
    expect(fr.find((l) => l.current)).toMatchObject({ lang: "fr", samePage: true, href: "/fr/spotlight" });
  });
});

describe("Accept-Language", () => {
  it("parses headers with q-values, best first", () => {
    expect(parseAcceptLanguage("fr-CA,fr;q=0.9,en-US;q=0.8,en;q=0.7")).toEqual(["fr", "en"]);
    expect(parseAcceptLanguage("en;q=0.5, es-MX;q=0.9, *;q=0.1")).toEqual(["es", "en"]);
    expect(parseAcceptLanguage("de;q=0, fr")).toEqual(["fr"]);
    expect(parseAcceptLanguage("")).toEqual([]);
    expect(parseAcceptLanguage(null)).toEqual([]);
  });
  it("accepts navigator.languages arrays", () => {
    expect(parseAcceptLanguage(["es-US", "es", "en"])).toEqual(["es", "en"]);
  });
  it("picks the top language we serve", () => {
    expect(preferredLocale("de-DE,fr;q=0.8,en;q=0.5")).toBe("fr");
    expect(preferredLocale("en-US,en;q=0.9,es;q=0.8")).toBe("en");
    expect(preferredLocale("de,it")).toBeNull();
  });
});

describe("bannerOffers", () => {
  const base = { lang: "en" as const, userAgent: CHROME };

  it("offers the browser's French or Spanish on English pages", () => {
    expect(bannerOffers({ ...base, languages: "fr-CA,fr;q=0.9,en;q=0.8" })).toEqual(["fr"]);
    expect(bannerOffers({ ...base, languages: ["es-MX", "es", "en"] })).toEqual(["es"]);
  });

  it("stays quiet when English ranks first or the language isn't served", () => {
    expect(bannerOffers({ ...base, languages: "en-CA,en;q=0.9,fr;q=0.8" })).toEqual([]);
    expect(bannerOffers({ ...base, languages: "de-DE" })).toEqual([]);
  });

  it("never shows on French or Spanish pages", () => {
    expect(bannerOffers({ ...base, lang: "fr", languages: "fr" })).toEqual([]);
    expect(bannerOffers({ ...base, lang: "es", languages: "es" })).toEqual([]);
  });

  it("respects a dismissed banner and a language already chosen", () => {
    expect(bannerOffers({ ...base, languages: "fr", dismissed: true })).toEqual([]);
    expect(bannerOffers({ ...base, languages: "fr", chosen: "en" })).toEqual([]);
    expect(bannerOffers({ ...base, languages: "fr", chosen: "fr" })).toEqual([]);
    // A junk cookie is not a choice.
    expect(bannerOffers({ ...base, languages: "fr", chosen: "xx" })).toEqual(["fr"]);
  });

  it("never shows to bots", () => {
    expect(bannerOffers({ ...base, userAgent: GOOGLEBOT, languages: "fr" })).toEqual([]);
    expect(bannerOffers({ ...base, userAgent: "Mozilla/5.0 HeadlessChrome/141.0", languages: "fr" })).toEqual([]);
    expect(bannerOffers({ ...base, userAgent: "", languages: "fr" })).toEqual([]);
  });

  it("offers French first in Québec, even to an English browser", () => {
    expect(bannerOffers({ ...base, languages: "en-CA,en", geo: "CA-QC" })).toEqual(["fr"]);
    expect(bannerOffers({ ...base, languages: "es,en", geo: "CA-QC" })).toEqual(["fr", "es"]);
    expect(bannerOffers({ ...base, languages: "fr-CA", geo: "CA-QC" })).toEqual(["fr"]);
  });

  it("uses the resolved country: a Québec IP on the U.S. market is not Québec", () => {
    expect(isQuebec({ geo: "CA-QC" })).toBe(true);
    expect(isQuebec({ geo: "CA-ON" })).toBe(false);
    expect(isQuebec({ geo: "CA-QC", market: "US" })).toBe(false);
    expect(isQuebec({ geo: "CA-QC", account: "US-TX" })).toBe(false);
    expect(isQuebec({ geo: "US-NY" })).toBe(false);
    expect(bannerOffers({ ...base, languages: "en", geo: "CA-QC", market: "US" })).toEqual([]);
  });
});

describe("readCookie", () => {
  it("reads one cookie", () => {
    expect(readCookie("a=1; NEXT_LOCALE=fr; pmrfp_geo=CA-QC", "NEXT_LOCALE")).toBe("fr");
    expect(readCookie("a=1; pmrfp_geo=CA-QC", "pmrfp_geo")).toBe("CA-QC");
    expect(readCookie("a=1", "NEXT_LOCALE")).toBeNull();
    expect(readCookie("", "NEXT_LOCALE")).toBeNull();
  });
});
