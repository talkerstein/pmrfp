import { describe, expect, it } from "vitest";
import {
  PLAN_MATRIX,
  PROFILE_PHOTOS,
  TIERS,
  countCell,
  cumulativeViolations,
  tierIncludes,
  type MatrixRow,
} from "@/lib/pricing/plan-matrix";
import { amountLabel, marketMoney, priceLine } from "@/lib/pricing/money";
import { canAddProject, FREE_PROJECT_LIMIT } from "@/lib/projects/limits";
import { canSaveRfps } from "@/lib/access/free-actions";
import { FOUNDING } from "@/lib/founding/config";
import { toUsd } from "@/lib/markets";
import v3Pages from "@/i18n/messages/v3Pages";
import misc from "@/i18n/messages/misc";
import founding from "@/i18n/messages/founding";
import sales from "@/i18n/messages/sales";

const LANGS = ["en", "fr", "es"] as const;
const row = (id: MatrixRow["id"]) => PLAN_MATRIX.find((r) => r.id === id)!;

describe("plan matrix: each higher tier includes everything below it", () => {
  it("has no tier that gets less than a cheaper one", () => {
    expect(cumulativeViolations()).toEqual([]);
    for (let i = 1; i < TIERS.length; i++) {
      const lower = tierIncludes(TIERS[i - 1]);
      const higher = tierIncludes(TIERS[i]);
      expect(higher).toEqual(expect.arrayContaining(lower));
    }
  });

  it("catches a higher tier that drops a lower tier's feature", () => {
    const broken: MatrixRow[] = [{ id: "listing", group: "found", kind: "check", value: { free: 1, seo: 0, pro: 1, featured: 1 } }];
    expect(cumulativeViolations(broken)).toEqual([{ row: "listing", lower: "free", higher: "seo" }]);
    expect(cumulativeViolations(broken, [{ row: "listing", lower: "free", higher: "seo", why: "test" }])).toEqual([]);
  });

  it("matches what the entitlement code actually grants", () => {
    // Projects: 1 without Trade Pro access (Free and SEO Listing), no cap with it.
    expect(row("projects").value.free).toBe(FREE_PROJECT_LIMIT);
    expect(row("projects").value.seo).toBe(FREE_PROJECT_LIMIT);
    expect(canAddProject(false, FREE_PROJECT_LIMIT)).toBe(false);
    expect(canAddProject(true, 999)).toBe(true);
    expect(row("projects").value.pro).toBe(Infinity);
    // Saving RFPs is free for any trade or supplier account.
    expect(canSaveRfps({ primaryRole: "trade", hasTradeAccess: false })).toBe(true);
    expect(row("save").value.free).toBe(1);
    // RFP access is Trade Pro and up only; SEO Listing is directory-only.
    expect(row("rfp").value).toEqual({ free: 0, seo: 0, pro: 1, featured: 1 });
    // The gallery is "up to 12", never sold as unlimited.
    expect(row("photos").value).toEqual({ free: PROFILE_PHOTOS.free, seo: 12, pro: 12, featured: 12 });
  });

  it("has a label for every row and a count text in every language", () => {
    for (const lang of LANGS) {
      const c = v3Pages[lang].pricing.compare;
      for (const r of PLAN_MATRIX) expect(c.rows[r.id], `${lang} ${r.id}`).toBeTruthy();
      const num = String;
      expect(countCell(row("photos"), "free", c.count, num)).toBe(c.count.photoOne);
      expect(countCell(row("photos"), "seo", c.count, num)).toBe(c.count.photosUpTo.replace("{n}", "12"));
      expect(countCell(row("projects"), "pro", c.count, num)).toBe(c.count.unlimited);
      expect(countCell(row("rfp"), "pro", c.count, num)).toBeNull();
    }
  });

  it("never sells the gallery as unlimited or a Trade Pro ranking boost the directory doesn't give", () => {
    for (const lang of LANGS) {
      const t = v3Pages[lang].pricing;
      const copy = [...t.plans.plans.flatMap((p) => [p.blurb, ...p.features]), ...t.founding.included, ...Object.values(t.compare.rows)].join("\n");
      expect(copy, lang).not.toMatch(/unlimited project photo|galerie de photos de projets illimitée|galería ilimitada/i);
      expect(copy, lang).not.toMatch(/priority placement|placement prioritaire|ubicación prioritaria|maximum visibility|visibilité maximale|máxima visibilidad/i);
    }
  });
});

/** Words that mean "not refundable" in each language. */
const NON_REFUNDABLE: Record<(typeof LANGS)[number], RegExp> = {
  en: /non-refundable/i,
  fr: /pas remboursables/i,
  es: /no son reembolsables/i,
};
const FOUNDING_NAME: Record<(typeof LANGS)[number], RegExp> = {
  en: /Founding 500/,
  fr: /Fondateurs 500/,
  es: /Founding 500|Fundadores 500/,
};

describe("refund policy: /pricing says what the Terms say", () => {
  it("one policy in every language: subscriptions non-refundable (law aside), Founding 500 refundable for its window", () => {
    for (const lang of LANGS) {
      const terms = misc[lang].terms.billing;
      const termsText = [terms.withMonthly, terms.annualOnly, ...terms.body].join(" ");
      const pricing = v3Pages[lang].pricing;
      const faq = pricing.faq.refund.a;

      // Terms: regular fees non-refundable, with the Founding 500 exception.
      expect(termsText, lang).toMatch(NON_REFUNDABLE[lang]);
      expect(termsText, lang).toMatch(FOUNDING_NAME[lang]);
      // The pricing FAQ says the same, names the same exception, and takes the window from FOUNDING.refundDays.
      expect(faq, lang).toMatch(NON_REFUNDABLE[lang]);
      expect(faq, lang).toMatch(FOUNDING_NAME[lang]);
      expect(faq, lang).toContain("{days}");
      // Every refund window on the page is the Founding one, from the same constant.
      expect(pricing.founding.fine, lang).toContain("{days}");
      for (const f of founding[lang].faq) if (/refund|rembours|reembols/i.test(f.q)) expect(f.a, lang).toContain("{days}");
      // The "Cancelling" band agrees: no refund on cancelling.
      expect(sales[lang].plans.guarantee, lang).toMatch(NON_REFUNDABLE[lang]);
    }
    expect(FOUNDING.refundDays).toBe(30);
  });

  it("no pricing copy promises a refund on a monthly or annual plan", () => {
    for (const lang of LANGS) {
      const all = JSON.stringify(v3Pages[lang].pricing);
      expect(all, lang).not.toMatch(/(subscriptions?|monthly|annual) (plans? )?(are|is) refundable/i);
      expect(all, lang).not.toMatch(/money.back|satisfait ou rembours|devoluci[oó]n del dinero/i);
    }
  });
});

describe("server price formatting", () => {
  it("formats one currency per market", () => {
    const ca = marketMoney("CA", 0.7, "en");
    expect(ca.currency).toBe("CAD");
    expect(ca.money(249)).toBe("$249");
    expect(ca.founding()).toBe(`$${FOUNDING.priceCad}`);
    const us = marketMoney("US", 0.7, "en");
    expect(us.currency).toBe("USD");
    expect(us.money(249)).toBe(`$${toUsd(249, 0.7)}`);
    expect(us.money(249)).toBe("$174");
    // The Founding 500 has its own fixed USD price, not a converted one.
    expect(us.founding()).toBe(`$${FOUNDING.priceUsd}`);
  });

  it("puts the dollar sign where each language writes it", () => {
    expect(amountLabel(249, "fr")).toBe("249 $");
    expect(amountLabel(249, "es")).toBe("$249");
    expect(marketMoney("CA", 0.7, "fr").money(1200)).toMatch(/^1\s200 \$$/);
  });

  it("fills a price sentence, never mixing currencies", () => {
    const line = priceLine("{annual}/year, or {monthly}/month, {currency}.", { annual: 249, monthly: 29 }, marketMoney("US", 0.72, "en"));
    expect(line).toBe(`$${toUsd(249, 0.72)}/year, or $${toUsd(29, 0.72)}/month, USD.`);
    expect(line).not.toContain("CAD");
    expect(priceLine("{founding} {currency}, paid once", {}, marketMoney("CA", 0.72, "en"))).toBe("$250 CAD, paid once");
  });
});
