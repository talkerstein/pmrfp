import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn, revalidatePath: vi.fn(), revalidateTag: vi.fn() }));

import { buyerKindOf, countdownOf, statedValue, workTypeOf } from "@/lib/rfp-detail/facts";
import { prepareFor, type PrepareKey } from "@/lib/rfp-detail/prepare";
import { TOWN_POLICIES, derivedThresholds, policyFor, purchasingRulesFor, tradeAgreementFor } from "@/lib/rfp-detail/purchasing";
import { GUIDE_PLATFORMS, PLATFORM_LINKS, platformForListing, platformFromUrl } from "@/lib/rfp-detail/platforms";
import { moreFromBuyer, sameTradeNearby } from "@/lib/rfp-detail/related";
import { valueLabel } from "@/lib/rfp-detail/format";
import { MUNI_PROVINCES, packFor, provinceCodeOf, THRESHOLDS } from "@/lib/rfp-writer/municipal/clauses";
import { getDictionary } from "@/i18n/dictionaries";
import type { Locale } from "@/i18n/config";

const LANGS: Locale[] = ["en", "fr", "es"];
const keys = (r: ReturnType<typeof prepareFor>): PrepareKey[] => r.items.map((i) => i.key);

describe("key facts", () => {
  it("reads the work type from the title and leaves it out when the title does not say", () => {
    expect(workTypeOf("Roof replacement at the Memorial Arena")).toBe("construction");
    expect(workTypeOf("Janitorial services for the municipal office")).toBe("service");
    expect(workTypeOf("Winter snow clearing, 2026-2027")).toBe("service");
    expect(workTypeOf("Building condition assessment of four fire halls")).toBe("consulting");
    expect(workTypeOf("Supply and delivery of road salt")).toBe("supply");
    expect(workTypeOf("Maintenance and repair of lift stations")).toBe("service");
    expect(workTypeOf("Design-build of a new salt storage dome")).toBe("construction");
    // Two readings, or none: no guess.
    expect(workTypeOf("Design and replacement of the transit shelter")).toBeNull();
    expect(workTypeOf("RFP 2026-14")).toBeNull();
    expect(workTypeOf("")).toBeNull();
    expect(workTypeOf(null)).toBeNull();
  });

  it("names the buyer type from the directory first, then the name, then a single-issuer feed", () => {
    expect(buyerKindOf({ isPublicTender: true, group: "school", buyerName: "X" })).toBe("school");
    expect(buyerKindOf({ isPublicTender: true, buyerName: "Town of Cobourg" })).toBe("municipal");
    expect(buyerKindOf({ isPublicTender: true, buyerName: "Region of Waterloo" })).toBe("regional");
    expect(buyerKindOf({ isPublicTender: true, buyerName: "Toronto District School Board" })).toBe("school");
    expect(buyerKindOf({ isPublicTender: true, buyerName: "Cégep régional de Lanaudière" })).toBe("postSecondary");
    expect(buyerKindOf({ isPublicTender: true, buyerName: "Sunnybrook Health Sciences Centre" })).toBe("health");
    expect(buyerKindOf({ isPublicTender: true, buyerName: null, sourceKey: "toronto" })).toBe("municipal");
    expect(buyerKindOf({ isPublicTender: true, buyerName: null, sourceKey: "sam" })).toBe("federal");
    // CanadaBuys also carries other governments' notices: it does not say "federal".
    expect(buyerKindOf({ isPublicTender: true, buyerName: null, sourceKey: "canadabuys" })).toBe("public");
    expect(buyerKindOf({ isPublicTender: false })).toBe("private");
    expect(buyerKindOf({ isPublicTender: false, isGc: true })).toBe("gc");
    expect(buyerKindOf({ isPublicTender: false, isTown: true })).toBe("municipal");
  });

  it("counts down to the closing date", () => {
    expect(countdownOf(0).kind).toBe("today");
    expect(countdownOf(1).kind).toBe("tomorrow");
    expect(countdownOf(12)).toEqual({ kind: "days", days: 12 });
    expect(countdownOf(-3).kind).toBe("past");
    expect(countdownOf(null).kind).toBe("none");
  });

  it("shows a value only when the poster made one public", () => {
    expect(statedValue({ min: 120_000, max: 180_000, isPublic: true })).toEqual({ min: 120_000, max: 180_000 });
    expect(statedValue({ min: 120_000, max: null, isPublic: true })).toEqual({ min: 120_000, max: null });
    expect(statedValue({ min: 120_000, max: 180_000, isPublic: false })).toBeNull();
    expect(statedValue({ min: 0, max: null, isPublic: true })).toBeNull();
    expect(statedValue(null)).toBeNull();
    const t = getDictionary("en").rfpDepth.facts;
    const plain = (s: string) => s.replace(/ /g, " ");
    expect(plain(valueLabel({ min: 120_000, max: 180_000 }, "CAD", "en", t))).toBe("$120,000 CAD to $180,000 CAD");
    expect(plain(valueLabel({ min: null, max: 90_000 }, "USD", "en", t))).toBe("Up to $90,000 USD");
  });
});

describe("what to prepare, by province or state", () => {
  it("Ontario: WSIB, COR, the constructor role and the Ontario extras", () => {
    const r = prepareFor({ province: "Ontario" });
    expect(r.country).toBe("CA");
    expect(r.items.find((i) => i.key === "workersComp")?.code).toBe("ON");
    expect(keys(r)).toEqual(expect.arrayContaining(["insurance", "bonding", "corOntario", "licences", "forms", "formsOntario", "formsConstructor"]));
    expect(keys(r)).not.toContain("licenceQuebec");
    expect(keys(r)).not.toContain("qcTax");
  });

  it("Quebec: CNESST, the RBQ licence, the tax attestation, the AMP authorization and French documents", () => {
    const r = prepareFor({ province: "Quebec" });
    expect(r.items.find((i) => i.key === "workersComp")?.code).toBe("QC");
    expect(keys(r)).toEqual(expect.arrayContaining(["licenceQuebec", "qcTax", "qcAmp", "formsQuebec"]));
    expect(keys(r)).not.toContain("licences");
    expect(prepareFor({ province: "Québec" }).items.find((i) => i.key === "workersComp")?.code).toBe("QC");
  });

  it("a private job gets the general items only, none drawn from public tenders or public-contract rules", () => {
    const on = keys(prepareFor({ province: "Ontario", publicBuyer: false }));
    expect(on).toEqual(expect.arrayContaining(["insurance", "workersComp", "bonding", "corOntario", "forms", "formsConstructor"]));
    expect(on).not.toContain("formsOntario");
    const qc = keys(prepareFor({ province: "Quebec", publicBuyer: false }));
    expect(qc).toContain("licenceQuebec");
    for (const k of ["qcTax", "qcAmp", "formsQuebec"] as const) expect(qc).not.toContain(k);
    const ab = keys(prepareFor({ province: "Alberta", publicBuyer: false }));
    expect(ab).toContain("safety");
    expect(ab).not.toContain("corAlberta");
    expect(keys(prepareFor({ province: "Manitoba", publicBuyer: false }))).not.toContain("corTowns");
  });

  it("Alberta, Manitoba and Nova Scotia get the COR line, the prime-contractor role where the writer has one", () => {
    expect(keys(prepareFor({ province: "Alberta" }))).toEqual(expect.arrayContaining(["corAlberta", "formsPrime"]));
    expect(keys(prepareFor({ province: "Manitoba" }))).toEqual(expect.arrayContaining(["corTowns", "formsPrime"]));
    expect(keys(prepareFor({ province: "Nova Scotia" }))).toContain("corTowns");
    expect(keys(prepareFor({ province: "Nova Scotia" }))).not.toContain("formsPrime");
    expect(keys(prepareFor({ province: "British Columbia" }))).toEqual(expect.arrayContaining(["safety", "formsPrime"]));
  });

  it("every province and territory gets a checklist with a workers' compensation board", () => {
    for (const code of MUNI_PROVINCES) {
      const r = prepareFor({ province: code });
      expect(r.country).toBe("CA");
      expect(r.items.find((i) => i.key === "workersComp")?.code).toBe(code);
      expect(keys(r)).toEqual(expect.arrayContaining(["insurance", "bonding", "forms"]));
    }
  });

  it("the board names stay in step with the municipal RFP writer's province packs", () => {
    const en = getDictionary("en").rfpDepth.prepare.boards;
    const word = (code: string) => (code === "ON" ? "WSIB" : code === "QC" ? "CNESST" : code === "AB" ? "WCB-Alberta" : code === "BC" ? "WorkSafeBC" : code === "MB" ? "WCB Manitoba" : code === "SK" ? "WCB Saskatchewan" : code === "NS" ? "WCB Nova Scotia" : code === "NB" ? "WorkSafeNB" : code === "PE" ? "WCB PEI" : code === "NL" ? "WorkplaceNL" : null);
    for (const code of MUNI_PROVINCES) {
      const w = word(code);
      if (!w) continue;
      expect(packFor(code).workersComp.en).toContain(w);
      expect(en[code]).toContain(w);
    }
  });

  it("U.S. listings get U.S. items, never Canadian boards; federal ones add SAM.gov and the construction acts", () => {
    const state = prepareFor({ province: "Texas" });
    expect(state.country).toBe("US");
    expect(keys(state)).toEqual(expect.arrayContaining(["insurance", "workersCompUs", "licenceUs"]));
    expect(keys(state)).not.toContain("workersComp");
    expect(keys(state)).not.toContain("samGov");
    const federal = prepareFor({ province: "Virginia", federal: true });
    expect(keys(federal)).toEqual(expect.arrayContaining(["samGov", "usFederalConstruction"]));
    // A federal service contract is not under the Miller or Davis-Bacon Acts.
    expect(keys(prepareFor({ province: "Virginia", federal: true, workType: "service" }))).not.toContain("usFederalConstruction");
  });

  it("no known place and no federal notice: no checklist", () => {
    expect(prepareFor({ province: null })).toEqual({ country: null, items: [] });
    expect(prepareFor({ province: "Atlantis" }).country).toBe("CA");
  });

  it("says in every language that it is a general guide to confirm, and leaves every dollar limit as a blank", () => {
    for (const lang of LANGS) {
      const t = getDictionary(lang).rfpDepth.prepare;
      expect(t.confirm.length).toBeGreaterThan(40);
      const insurance = t.items.insurance.b;
      expect(insurance).toMatch(/\[[^\]]+\]/);
      expect(insurance).not.toMatch(/\$\s?\d/);
      expect(t.items.bonding.b).toMatch(/\[[^\]]+\]/);
    }
    expect(getDictionary("en").rfpDepth.prepare.items.insurance.b).toContain("[confirm with the tender documents]");
  });
});

describe("how this buyer buys", () => {
  it("finds a researched town by its name, in any of its forms", () => {
    expect(policyFor("Town of Smiths Falls", "Ontario")?.tenderFrom).toBe(130_000);
    expect(policyFor("Municipality of Grey Highlands", "Ontario")?.name).toBe("Grey Highlands");
    expect(policyFor("County of Haliburton", "Ontario")?.name).toBe("Haliburton County");
    expect(policyFor("District of Squamish", "British Columbia")?.tenderFromConstruction).toBe(200_000);
    // Same name, different province: not the same buyer.
    expect(policyFor("Town of Smiths Falls", "Alberta")).toBeNull();
    expect(policyFor("City of Toronto", "Ontario")).toBeNull();
    expect(policyFor(null, "Ontario")).toBeNull();
  });

  it("each researched policy has a link, a year, and thresholds that rise with the step", () => {
    expect(TOWN_POLICIES.length).toBe(17);
    for (const p of TOWN_POLICIES) {
      expect(p.url).toMatch(/^https:\/\//);
      expect(p.year).toBeGreaterThanOrEqual(2012);
      expect(p.tenderFrom).toBeGreaterThan(p.directUpTo ?? 0);
      if (p.tenderFromConstruction) expect(p.tenderFromConstruction).toBeGreaterThan(p.tenderFrom);
      expect(provinceCodeOf(p.code)).toBe(p.code);
    }
  });

  it("says 'towns like this one' only with enough researched towns, and says how many", () => {
    const on = derivedThresholds("Ontario", false)!;
    expect(on.towns).toBe(8);
    expect(on.min).toBe(25_000);
    expect(on.max).toBe(130_000);
    expect(on.median).toBe(50_000);
    const ab = derivedThresholds("Alberta", true)!;
    expect(ab.towns).toBe(4);
    // Drumheller has no separate construction tier, so its one number (75,000) is its construction number too.
    expect(ab.min).toBe(75_000);
    expect(ab.max).toBe(200_000);
    expect(derivedThresholds("Nova Scotia", false)).toBeNull(); // 1 town
    expect(derivedThresholds("Manitoba", false)).toBeNull(); // none published
    expect(derivedThresholds("Quebec", false)).toBeNull();
  });

  it("a buyer with its own policy gets that, not the range; a city with neither gets only what applies to it", () => {
    const own = purchasingRulesFor({ buyerName: "Town of Tay", province: "Ontario", kind: "municipal", construction: false });
    expect(own.policy?.name).toBe("Tay");
    expect(own.derived).toBeNull();
    const other = purchasingRulesFor({ buyerName: "Town of Cobourg", province: "Ontario", kind: "municipal", construction: false, population: 19_000 });
    expect(other.policy).toBeNull();
    expect(other.derived?.towns).toBe(8);
    // A big city is not like the researched towns, and a buyer of unknown size gets no guess.
    expect(purchasingRulesFor({ buyerName: "City of Toronto", province: "Ontario", kind: "municipal", construction: false, population: 2_794_356 }).derived).toBeNull();
    expect(purchasingRulesFor({ buyerName: "Town of Cobourg", province: "Ontario", kind: "municipal", construction: false }).derived).toBeNull();
    expect(purchasingRulesFor({ buyerName: "Town of Cobourg", province: "Ontario", kind: "municipal", construction: false, population: 48_461 }).derived).not.toBeNull();
    expect(purchasingRulesFor({ buyerName: "Town of Cobourg", province: "Ontario", kind: "municipal", construction: false, population: 60_000 }).derived).toBeNull();
    // A school board: no 'towns like this one', but the trade agreement binds it.
    const school = purchasingRulesFor({ buyerName: "Toronto District School Board", province: "Ontario", kind: "school", construction: false });
    expect(school.policy).toBeNull();
    expect(school.derived).toBeNull();
    expect(school.agreement?.agreement).toBe("CFTA");
    // A federal department: nothing we hold.
    const federal = purchasingRulesFor({ buyerName: "Public Services and Procurement Canada", province: "Ontario", kind: "federal", construction: false });
    expect(federal).toEqual({ policy: null, derived: null, agreement: null });
  });

  it("trade-agreement thresholds come from the writer's data: CFTA, or NWPTA in the four western provinces; never Quebec", () => {
    const on = tradeAgreementFor("Ontario", "municipal")!;
    expect([on.goodsServices, on.construction]).toEqual([THRESHOLDS.cfta.goodsServices, THRESHOLDS.cfta.construction]);
    expect(on.system).toBeNull();
    const ab = tradeAgreementFor("Alberta", "municipal")!;
    expect(ab.agreement).toBe("NWPTA");
    expect([ab.goodsServices, ab.construction]).toEqual([75_000, 200_000]);
    expect(ab.system).toBe("Alberta Purchasing Connection (APC)");
    expect(tradeAgreementFor("British Columbia", "health")?.system).toBe("BC Bid");
    expect(tradeAgreementFor("Nova Scotia", "municipal")?.system).toContain("Nova Scotia");
    expect(tradeAgreementFor("Quebec", "municipal")).toBeNull();
    expect(tradeAgreementFor("Ontario", "provincial")).toBeNull();
    expect(tradeAgreementFor("Ontario", null)).toBeNull();
  });
});

describe("how to bid on this platform", () => {
  it("finds the platform from where the official link goes", () => {
    expect(platformFromUrl("https://nanaimo.bidsandtenders.ca/Module/Tenders/en")).toBe("bids-and-tenders");
    expect(platformFromUrl("https://www.merx.com/public/solicitations/123")).toBe("merx");
    expect(platformFromUrl("https://canadabuys.canada.ca/en/tender-opportunities/tender-notice/ws1")).toBe("canadabuys");
    expect(platformFromUrl("https://city.bonfirehub.ca/portal/?tab=openOpportunities")).toBe("bonfire");
    expect(platformFromUrl("https://www.bcbid.gov.bc.ca/page.aspx/en/bpm/process_manage_extranet/123")).toBe("bc-bid");
    expect(platformFromUrl("https://purchasing.alberta.ca/api/opportunity/public/2026/865")).toBe("apc");
    expect(platformFromUrl("https://evil-merx.com.example.org/x")).toBeNull();
    expect(platformFromUrl("https://notmerx.com/")).toBeNull();
    expect(platformFromUrl("not a url")).toBeNull();
    expect(platformFromUrl(null)).toBeNull();
  });

  it("falls back to the feed, then the permission city's platform, then a buyer with exactly one platform we have verified", () => {
    expect(platformForListing({ sourceKey: "seao" })).toBe("seao");
    expect(platformForListing({ sourceKey: "canadabuys" })).toBe("canadabuys");
    expect(platformForListing({ sourceKey: "sam" })).toBe("sam");
    expect(platformForListing({ sourceKey: "nanaimo", officialUrl: "https://www.nanaimo.ca/doing-business/procurement-services/bid-opportunities" })).toBe("bids-and-tenders");
    expect(platformForListing({ sourceKey: "toronto", buyerPlatforms: ["merx"] })).toBe("merx");
    // Two platforms, or one we haven't verified: no guide rather than a guess.
    expect(platformForListing({ sourceKey: "toronto", buyerPlatforms: ["merx", "bonfire"] })).toBeNull();
    expect(platformForListing({ sourceKey: "toronto", buyerPlatforms: ["biddingo"] })).toBeNull();
    expect(platformForListing({ sourceKey: "toronto", buyerPlatforms: ["own-site"] })).toBeNull();
    // The link wins over the feed.
    expect(platformForListing({ sourceKey: "canadabuys", officialUrl: "https://x.bidsandtenders.ca/a" })).toBe("bids-and-tenders");
  });

  it("every verified platform has https links on its own domain and a guide in all three languages, and none says PMRFP hosts anything", () => {
    for (const p of GUIDE_PLATFORMS) {
      const { home, help } = PLATFORM_LINKS[p];
      expect(home).toMatch(/^https:\/\//);
      expect(help).toMatch(/^https:\/\//);
      for (const lang of LANGS) {
        const g = getDictionary(lang).rfpDepth.platform.guides[p];
        expect(g.name.length).toBeGreaterThan(2);
        expect(g.facts.length).toBeGreaterThanOrEqual(3);
        for (const f of g.facts) expect(f).not.toMatch(/PMRFP/);
        expect(getDictionary(lang).rfpDepth.platform.hosting).toContain("PMRFP");
      }
    }
    // Platforms we could not verify have no guide.
    expect(GUIDE_PLATFORMS).not.toContain("biddingo");
    expect(GUIDE_PLATFORMS).not.toContain("ns-portal");
    expect(getDictionary("en").rfpDepth.platform.asOf).toContain("Oct 2026");
  });
});

describe("related", () => {
  const row = (slug: string, o: Partial<Parameters<typeof sameTradeNearby>[1]> = {}) => ({
    slug,
    title: slug,
    status: "open" as const,
    categories: ["Roofing"],
    regionName: "Toronto",
    province: "Ontario",
    city: "Toronto",
    deadline: "2026-11-10",
    sourceType: "public_source",
    ...o,
  });
  const regions = new Map<string, string | null>([["Toronto", "Ontario"]]);

  it("same trade, same province: the same city first, then the soonest to close; never itself, never the other country", () => {
    const me = row("me");
    const board = [
      row("far-soon", { city: "Ottawa", regionName: "Ottawa", deadline: "2026-10-30" }),
      row("near-late", { deadline: "2026-12-01" }),
      row("near-soon", { deadline: "2026-11-05" }),
      row("me"),
      row("other-trade", { categories: ["HVAC"] }),
      row("closed", { status: "closed" as never }),
      row("us", { province: "Texas", regionName: "Texas", city: "Austin" }),
      row("other-province", { province: "Alberta", regionName: "Alberta", city: "Calgary" }),
    ];
    expect(sameTradeNearby(board, me, regions).map((r) => r.slug)).toEqual(["near-soon", "near-late", "far-soon"]);
    expect(sameTradeNearby(board, row("lost", { province: null, regionName: null, city: null }), regions)).toEqual([]);
  });

  it("the buyer's other open bids, never this one", () => {
    const bids = [1, 2, 3, 4, 5].map((n) => ({ slug: `b${n}`, title: `Bid ${n}`, deadline: null }));
    expect(moreFromBuyer(bids, "b2").map((b) => b.slug)).toEqual(["b1", "b3", "b4"]);
    expect(moreFromBuyer([], "x")).toEqual([]);
  });
});
