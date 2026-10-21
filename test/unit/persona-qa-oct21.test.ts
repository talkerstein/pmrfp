import { describe, expect, it } from "vitest";
import { matchesSource, parseBoardSource, sourceLinkTarget } from "@/lib/data/board-source";
import { boardStats } from "@/lib/data/site-counters";
import { mayInterrupt, mayToast, quietEnough, readCookie, type InterruptContext } from "@/lib/growth/interruptions";
import { audienceForRole, audienceFromCookie, isPmAudiencePath } from "@/lib/audience/pm";
import { COMMON_TRADE_SLUGS, orderTrades } from "@/lib/trades/order";
import { defaultProvinceFor } from "@/lib/geo-defaults";
import { RULES, tradesFor } from "@/lib/tenders/shared";
import { RULES_FR } from "@/lib/tenders/seao";
import { DEMO_CATEGORIES } from "@/lib/demo-data";
import { tradeName } from "@/i18n/terms";
import type { RfpListItem } from "@/lib/data/types";

/** Persona QA, pmrfp.com, 2026-10-21 (Dana, Gary, Marco, Sophie). */

const item = (p: Partial<RfpListItem>): RfpListItem =>
  ({
    slug: "x",
    title: "x",
    summary: null,
    categories: [],
    regionName: null,
    propertyTypeName: null,
    city: null,
    province: "Ontario",
    deadline: "2099-01-01",
    isDemo: false,
    photoUrls: [],
    status: "open",
    sourceType: "public_source",
    ...p,
  }) as RfpListItem;

describe("#5 /rfps Source filter: each label shows its own source", () => {
  const tender = item({ sourceType: "public_source" });
  const pmRfp = item({ sourceType: "property_manager_direct" });

  it("'Public tender' links to public tenders, 'Property-manager RFP' to PM RFPs (they were swapped)", () => {
    // From the unfiltered board, each option links to itself (the old checkbox unticked it: public → ?source=pm).
    expect(sourceLinkTarget("all", "public")).toBe("public");
    expect(sourceLinkTarget("all", "pm")).toBe("pm");
    // Switching straight from one to the other.
    expect(sourceLinkTarget("public", "pm")).toBe("pm");
    expect(sourceLinkTarget("pm", "public")).toBe("public");
    // The active option goes back to all.
    expect(sourceLinkTarget("public", "public")).toBe("all");
    expect(sourceLinkTarget("pm", "all")).toBe("all");
  });

  it("filters to the source the URL names", () => {
    expect(matchesSource(tender, parseBoardSource("public"))).toBe(true);
    expect(matchesSource(pmRfp, parseBoardSource("public"))).toBe(false);
    expect(matchesSource(pmRfp, parseBoardSource("pm"))).toBe(true);
    expect(matchesSource(tender, parseBoardSource("pm"))).toBe(false);
    expect(parseBoardSource("junk")).toBe("all");
    expect(matchesSource(tender, "all") && matchesSource(pmRfp, "all")).toBe(true);
  });
});

describe("#6 honest counters", () => {
  it("counts property-manager RFPs apart from public tenders (demo listings never count)", () => {
    const s = boardStats([
      item({ sourceType: "public_source" }),
      item({ sourceType: "public_source" }),
      item({ sourceType: "property_manager_direct" }),
      item({ sourceType: null, isDemo: true }),
      item({ sourceType: "property_manager_direct", status: "closed", deadline: "2000-01-01" }),
    ]);
    expect(s.open).toBe(4);
    expect(s.openPm).toBe(1);
    expect(s.open - s.openPm).toBe(3);
  });
});

describe("#2 no trade popup or toasts for property managers", () => {
  const ctx = (p: Partial<InterruptContext>): InterruptContext => ({ path: "/", audience: null, alreadyShown: false, pageViews: 2, interacted: true, ...p });

  it("never on property-manager, landlord, condo-board, writer or public-buyer pages", () => {
    for (const path of ["/for-property-managers", "/for/condo-boards", "/rfp-writer", "/for-public-buyers", "/rfp-templates/flat-roof-replacement"]) {
      expect(isPmAudiencePath(path), path).toBe(true);
      expect(mayInterrupt(ctx({ path })), path).toBe(false);
    }
    expect(isPmAudiencePath("/rfps")).toBe(false);
    expect(isPmAudiencePath("/for/tradesmen")).toBe(false);
  });

  it("never to a visitor who chose a property-manager role", () => {
    expect(mayInterrupt(ctx({ audience: "pm" }))).toBe(false);
    expect(audienceFromCookie("a=1; pmrfp_aud=pm; b=2")).toBe("pm");
    expect(audienceFromCookie("pmrfp_aud=trade")).toBe("trade");
    expect(audienceForRole("property_manager")).toBe("pm");
    expect(audienceForRole("landlord")).toBe("pm");
    expect(audienceForRole("trade")).toBe("trade");
  });

  it("at most once per visitor, never on a first page view before the visitor interacts", () => {
    expect(mayInterrupt(ctx({}))).toBe(true);
    expect(mayInterrupt(ctx({ alreadyShown: true }))).toBe(false);
    expect(mayInterrupt(ctx({ pageViews: 1, interacted: false }))).toBe(false);
    expect(mayInterrupt(ctx({ pageViews: 1, interacted: true }))).toBe(true);
    expect(readCookie("pmrfp_tp=1; x=y", "pmrfp_tp")).toBe("1");
  });

  it("never opens right under a click, and toasts stay off phones", () => {
    expect(quietEnough(10_000, 9_500)).toBe(false);
    expect(quietEnough(10_000, 8_000)).toBe(true);
    expect(quietEnough(10_000, null)).toBe(true);
    expect(mayToast(ctx({}), 390)).toBe(false);
    expect(mayToast(ctx({}), 1440)).toBe(true);
  });

  it("defaults the province to Québec on the French site", () => {
    expect(defaultProvinceFor("fr", "Ontario")).toBe("Quebec");
    expect(defaultProvinceFor("en", "Ontario")).toBe("Ontario");
    expect(defaultProvinceFor("es", null)).toBe("Ontario");
  });
});

describe("#10 trade lists: common trades first, in every language", () => {
  it("French starts Toiture, CVC, Électricité, Plomberie, Entretien ménager, Déneigement", () => {
    const fr = orderTrades(DEMO_CATEGORIES, (c) => tradeName(c.name, "fr"), "fr").map((c) => c.slug);
    expect(fr.slice(0, 6)).toEqual(["roofing", "hvac", "electrical", "plumbing", "cleaning-janitorial", "snow-removal"]);
    expect(tradeName("Roofing", "fr")).toBe("Toiture");
  });

  it("same order in English and Spanish; the rest A–Z by the translated name", () => {
    const order = (lang: "en" | "es" | "fr") => orderTrades(DEMO_CATEGORIES, (c) => tradeName(c.name, lang), lang).map((c) => c.slug);
    const common = new Set<string>(COMMON_TRADE_SLUGS);
    const n = DEMO_CATEGORIES.filter((c) => common.has(c.slug)).length;
    expect(order("en").slice(0, n)).toEqual(order("fr").slice(0, n));
    expect(order("es").slice(0, n)).toEqual(order("fr").slice(0, n));
    const rest = orderTrades(DEMO_CATEGORIES, (c) => tradeName(c.name, "fr"), "fr").slice(n).map((c) => tradeName(c.name, "fr"));
    expect(rest).toEqual([...rest].sort((a, b) => a.localeCompare(b, "fr", { sensitivity: "base" })));
  });
});

describe("#7 classifier: HVAC terms win over 'rooftop'", () => {
  const slugs = (title: string) => RULES.filter(([, p]) => p.test(title)).map(([s]) => s);

  it("York Civic Centre rooftop HVAC is HVAC, not roofing", () => {
    expect(tradesFor("replacement and renewal of the existing rooftop hvac systems at york civic centre")).toEqual(["hvac"]);
    expect(slugs("rooftop unit replacement, building 4")).toEqual(["hvac"]);
    expect(slugs("roof top units and make-up air units")).toEqual(["hvac"]);
  });

  it("still reads real roofing work as roofing", () => {
    expect(slugs("flat roof replacement")).toContain("roofing");
    expect(slugs("rooftop hvac replacement and roof membrane repairs")).toEqual(["hvac", "roofing"]);
    expect(slugs("roofing services")).toEqual(["roofing"]);
  });

  it("French: 'unités de toit' is HVAC, 'réfection de la toiture' roofing", () => {
    const fr = (title: string) => RULES_FR.filter(([, p]) => p.test(title)).map(([s]) => s);
    expect(fr("remplacement des unites de toit")).toEqual(["hvac"]);
    expect(fr("refection de la toiture")).toContain("roofing");
  });
});
