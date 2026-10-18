import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Owner decisions 2026-10-18 (fix/claims-cleanup):
 *  1. SEO Listing is retired: never sold to a new buyer, but grandfathered
 *     subscribers keep exactly what they bought.
 *  2. No copy promises what the code doesn't grant (unlimited photos,
 *     priority placement for Trade Pro, ...).
 *  3. The homepage never shows made-up fallback numbers.
 */

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => "/", useSearchParams: () => new URLSearchParams(), redirect: vi.fn() }));
vi.mock("@/lib/waitlist/actions", () => ({ joinRegionalWaitlistAction: vi.fn() }));

import { PLAN_MATRIX, SOLD_TIERS, TIERS, RETIRED_TIERS, PROFILE_PHOTOS } from "@/lib/pricing/plan-matrix";
import { parsePlanIntent, signUpHrefForPlan } from "@/lib/billing/plan-intent";
import { isPaidStatus, tierGrantsTradeAccess } from "@/lib/access/access";
import { isSeoPriceId, tierForPrice } from "@/lib/stripe/server";
import v3Pages from "@/i18n/messages/v3Pages";
import homeV3 from "@/i18n/messages/homeV3";
import sales from "@/i18n/messages/sales";
import salesClient from "@/i18n/messages/salesClient";
import misc from "@/i18n/messages/misc";
import founding from "@/i18n/messages/founding";
import { PRICING } from "@/lib/site";
import { V3_FALLBACK } from "@/components/home-v3/fallback";
import { HomeV3 } from "@/components/home-v3/home-v3";

const LANGS = ["en", "fr", "es"] as const;
const SEO_NAME = /SEO Listing|Fiche SEO|Ficha SEO|Perfil SEO/;
const root = (p: string) => fileURLToPath(new URL(`../../${p}`, import.meta.url));

describe("SEO Listing is not sold to new buyers", () => {
  it("is out of the tiers /pricing shows, but still known to entitlement code", () => {
    expect(SOLD_TIERS).toEqual(["free", "pro", "featured"]);
    expect(SOLD_TIERS).not.toContain("seo");
    expect(TIERS).toContain("seo");
    expect(RETIRED_TIERS).toEqual(["seo"]);
  });

  it("has no plan card, compare column or tier block in any language", () => {
    for (const lang of LANGS) {
      const pricing = v3Pages[lang].pricing;
      expect(pricing.plans.plans.map((p) => p.name), lang).toHaveLength(3);
      expect(JSON.stringify(pricing), lang).not.toMatch(SEO_NAME);
      expect(JSON.stringify(homeV3[lang].plans), lang).not.toMatch(SEO_NAME);
      expect(homeV3[lang].plans.items, lang).toHaveLength(3);
      expect(JSON.stringify(sales[lang]), lang).not.toMatch(SEO_NAME);
      expect("seo" in sales[lang].becomeSupplier.plans, lang).toBe(false);
      expect("seo" in salesClient[lang], lang).toBe(false);
      expect("seo" in misc[lang].getFound.tiers, lang).toBe(false);
      expect(JSON.stringify(misc[lang].getFound), lang).not.toMatch(SEO_NAME);
    }
  });

  it("steers old plan=seo links to Trade Pro", () => {
    expect(parsePlanIntent("seo", "annual")?.plan).toBe("pro");
    expect(parsePlanIntent("seo", "monthly")).toMatchObject({ plan: "pro", interval: "monthly", name: "Trade Pro" });
    expect(signUpHrefForPlan("pro")).toContain("plan=pro");
  });

  it("checkout never sells the SEO price (env vars stay, unused for new checkouts)", () => {
    const route = readFileSync(root("src/app/api/stripe/checkout/route.ts"), "utf8");
    expect(route).not.toMatch(/STRIPE_PRICE_SEO/);
    expect(route).not.toMatch(/plan === "seo"/);
  });

  it("no page links to an SEO Listing sign-up", () => {
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const f of readdirSync(dir)) {
        const p = join(dir, f);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.tsx?$/.test(f) && /signUpHrefForPlan\("seo"|plan=seo|PRICING\.seo(Annual|Monthly)/.test(readFileSync(p, "utf8"))) hits.push(p);
      }
    };
    walk(root("src/app"));
    walk(root("src/components"));
    expect(hits).toEqual([]);
  });
});

describe("grandfathered SEO Listing subscribers keep what they bought", () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  it("renewals on the old SEO prices still sync as tier seo", () => {
    process.env.STRIPE_PRICE_SEO_ANNUAL = "price_seo_y";
    process.env.STRIPE_PRICE_SEO_MONTHLY = "price_seo_m";
    process.env.STRIPE_PRICE_FEATURED_ANNUAL = "price_feat";
    expect(isSeoPriceId("price_seo_y")).toBe(true);
    expect(isSeoPriceId("price_seo_m")).toBe(true);
    expect(tierForPrice("price_seo_y")).toBe("seo");
    expect(tierForPrice("price_seo_m")).toBe("seo");
    expect(tierForPrice("price_feat")).toBe("featured");
    expect(tierForPrice("price_pro")).toBe("pro");
    expect(isSeoPriceId(null)).toBe(false);
  });

  it("an active seo row gets the paid gallery but never Trade Pro (RFP) access", () => {
    expect(isPaidStatus("active")).toBe(true);
    expect(isPaidStatus("comped")).toBe(true);
    expect(isPaidStatus("canceled")).toBe(false);
    expect(tierGrantsTradeAccess({ status: "active", tier: "seo" })).toBe(false);
    expect(tierGrantsTradeAccess({ status: "active", tier: "pro" })).toBe(true);
    expect(tierGrantsTradeAccess({ status: "comped", tier: "featured" })).toBe(true);
    expect(tierGrantsTradeAccess({ status: "canceled", tier: "pro" })).toBe(false);
    const photos = PLAN_MATRIX.find((r) => r.id === "photos")!;
    const rfp = PLAN_MATRIX.find((r) => r.id === "rfp")!;
    expect(photos.value.seo).toBe(PROFILE_PHOTOS.paid);
    expect(rfp.value.seo).toBe(0);
    // Prices they still pay are kept for display.
    expect(PRICING.seoAnnual).toBe(120);
  });
});

/** Every message string under a namespace, flattened. */
function strings(v: unknown): string[] {
  if (typeof v === "string") return [v];
  if (Array.isArray(v)) return v.flatMap(strings);
  if (v && typeof v === "object") return Object.values(v).flatMap(strings);
  return [];
}

describe("no promises the code doesn't keep", () => {
  // The gallery is capped at PROFILE_PHOTOS.paid (12). Only Featured is ranked
  // ahead in the directory (tierRank in lib/data/directory.ts); Trade Pro is not.
  const UNLIMITED_PHOTOS = /unlimited (project )?(photo|gallery)|galerie (de photos )?(de projets )?illimit|photos? (de projets )?illimit|galer[ií]a ilimitada|fotos (de proyectos )?ilimitadas/i;
  const PRIORITY = /priority placement|placement prioritaire|ubicaci[oó]n prioritaria|priority (directory|in directory|over free|ordering)|directory priority|priorit[ée] (sur|dans)|prioridad (sobre|en|de orden)|posici[oó]n prioritaria|maximum visibility|visibilit[ée] maximale|m[aá]xima visibilidad|top search results/i;

  it("in every message namespace, in every language", async () => {
    const dir = root("src/i18n/messages");
    for (const f of readdirSync(dir).filter((x) => x.endsWith(".ts"))) {
      const mod = (await import(`@/i18n/messages/${f.replace(/\.ts$/, "")}`)).default as Record<string, unknown> | undefined;
      if (!mod) continue;
      for (const lang of LANGS) {
        const all = strings(mod[lang]);
        for (const s of all) {
          expect(s, `${f} ${lang}`).not.toMatch(UNLIMITED_PHOTOS);
          expect(s, `${f} ${lang}`).not.toMatch(PRIORITY);
        }
      }
    }
  });

  it("in site config, lifecycle and transactional emails", () => {
    for (const f of ["src/lib/site.ts", "src/lib/lifecycle/copy.ts", "src/lib/email/send.ts"]) {
      const src = readFileSync(root(f), "utf8");
      expect(src, f).not.toMatch(UNLIMITED_PHOTOS);
      expect(src, f).not.toMatch(PRIORITY);
    }
  });

  it("Founding 500 says lifetime as the Terms define it, never 'for life'", () => {
    const copy = readFileSync(root("src/lib/lifecycle/copy.ts"), "utf8");
    expect(copy).not.toMatch(/for life/i);
    expect(copy).toMatch(/for as long as PMRFP runs it/);
    expect(readFileSync(root("src/lib/email/send.ts"), "utf8")).not.toMatch(/Trade Pro for life/);
    expect(founding.en.meta.description).not.toMatch(/for life|priority/i);
    expect(founding.en.meta.description).toMatch(/for as long as we run Trade Pro/);
    // The Terms' definition this has to match.
    expect(founding.en.terms[0]).toMatch(/for as long as PMRFP operates the Trade Pro service/);
  });
});

describe("homepage shows no made-up numbers when live data can't load", () => {
  it("the fallback carries no counts and no sample listings", () => {
    expect(V3_FALLBACK.open).toBeNull();
    expect(V3_FALLBACK.closing7).toBeNull();
    expect(V3_FALLBACK.trades).toBeNull();
    expect(V3_FALLBACK.regions).toBeNull();
    expect(V3_FALLBACK.big.n).toBeNull();
    expect(V3_FALLBACK.tiles.every((x) => x.n === null)).toBe(true);
    expect(V3_FALLBACK.chips).toEqual([]);
    expect(V3_FALLBACK.closingCa).toEqual([]);
    expect(V3_FALLBACK.ticker).toEqual([]);
    expect(V3_FALLBACK.toast).toEqual([]);
    expect(V3_FALLBACK.alerts).toEqual([]);
    expect(V3_FALLBACK.awards).toEqual([]);
    expect(V3_FALLBACK.winners.top).toEqual([]);
    expect(JSON.stringify(V3_FALLBACK)).not.toMatch(/\$\d|534|523/);
  });

  it("the homepage page no longer injects a hard-coded award total", () => {
    const page = readFileSync(root("src/app/[lang]/(home)/page.tsx"), "utf8");
    expect(page).not.toMatch(/523e6|523_000_000/);
  });

  for (const lang of LANGS) {
    it(`renders no live-stat numbers from the fallback (${lang})`, async () => {
      const { getDictionary, clientMessages } = await import("@/i18n/dictionaries");
      const { I18nProvider } = await import("@/i18n/provider");
      const d = getDictionary(lang);
      const html = renderToStaticMarkup(
        <I18nProvider lang={lang} messages={clientMessages(lang)}>
          <HomeV3 data={structuredClone(V3_FALLBACK)} dataUs={null} where={d.common.market.where} t={d.homeV3} lang={lang} />
        </I18nProvider>,
      );
      const t = d.homeV3;
      // The neutral line stands in for the counts.
      expect(html).toContain(t.stats.loading);
      // No stats band, no "534"-style big number, no fake tenders or winners.
      expect(html).not.toContain("v3-stats");
      expect(html).not.toContain('class="big"');
      expect(html).not.toContain("v3-ticker");
      expect(html).not.toContain("v3-win");
      expect(html).not.toContain("v3-close ");
      expect(html).not.toMatch(/534|523/);
      // Trade tiles stay as navigation, without counts.
      expect(html).not.toMatch(/<span class="n">\d/);
      expect(html).not.toMatch(/class="c">\d/);
    });
  }
});
