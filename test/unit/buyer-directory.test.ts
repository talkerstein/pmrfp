import { describe, expect, it } from "vitest";
import {
  COMMERCIAL_PLATFORMS,
  DIRECTORY,
  buildBuyerPages,
  buyerPageForRfp,
  coreKey,
  directoryIndex,
  findBuyerPage,
  isIndexableBuyer,
  linkOnly,
  municipalityOf,
  type DirectoryBuyer,
  type ProjectLike,
} from "@/lib/buyers/model";
import { buyerFaq, platformList } from "@/lib/buyers/faq";
import type { IntelAward } from "@/lib/intel/model";
import type { RfpListItem } from "@/lib/data/types";
import { getDictionary } from "@/i18n/dictionaries";
import { fmt } from "@/i18n/format";
import { groupOf, platformsOf, portalUrlOf, roleEmail } from "../../scripts/build-buyer-directory.mjs";

const t = getDictionary("en").buyers;

const buyer = (over: Partial<DirectoryBuyer>): DirectoryBuyer => ({
  name: "Town of Oakville",
  provinceCode: "ON",
  type: "municipality",
  group: "municipality",
  tendersUrl: "https://www.oakville.ca/business-development/business/purchasing/",
  platforms: ["bids-and-tenders"],
  portalUrl: "https://oakville.bidsandtenders.ca/",
  ownSiteList: false,
  email: "purchasing@oakville.ca",
  emailSource: "https://www.oakville.ca/business-development/business/purchasing/",
  checkedOn: "2026-10-15",
  slug: "town-of-oakville",
  ...over,
});

const award = (over: Partial<IntelAward>): IntelAward => ({
  slug: "roof-replacement-cba-abc",
  title: "Roof replacement, Town Hall",
  buyer: "Town of Oakville",
  buyerKey: "town of oakville",
  winner: "Acme Roofing Ltd",
  winnerKey: "acme roofing",
  winnerSlug: "acme-roofing-ltd",
  winnerPublic: true,
  amount: 250_000,
  date: "2026-05-01",
  country: "CA",
  currency: "CAD",
  province: "Ontario",
  city: "Oakville",
  trades: ["Roofing"],
  tradeSlugs: ["roofing"],
  sourceKey: "canadabuys",
  attribution: "Contains information licensed under the Open Government Licence – Canada.",
  noticeUrl: null,
  noticeExact: false,
  ...over,
});

const rfp = (over: Partial<RfpListItem>): RfpListItem => ({
  slug: "hvac-maintenance-gete-0123456789ab",
  title: "HVAC maintenance",
  summary: "Ontario. Town of Oakville: HVAC maintenance for 3 buildings",
  categories: ["HVAC"],
  regionName: "Ontario",
  propertyTypeName: null,
  city: null,
  province: "Ontario",
  deadline: "2026-11-20",
  isDemo: false,
  photoUrls: [],
  status: "open",
  sourceType: "public_source",
  ...over,
});

const project = (over: Partial<ProjectLike>): ProjectLike => ({
  slug: "tower-x",
  name: "Rezoning application: 50-storey mixed-use building — 118 Cross Ave",
  city: "Oakville",
  province: "Ontario",
  status: "application",
  estValueCad: null,
  stale: false,
  source: "apps-oakville",
  ...over,
});

describe("buyer directory data (generated from the feed-map CSVs)", () => {
  it("holds the researched Canadian buyers, one path each, never a U.S. one", () => {
    expect(DIRECTORY.length).toBeGreaterThanOrEqual(600);
    const paths = DIRECTORY.map((b) => `${b.provinceCode}/${b.slug}`);
    expect(new Set(paths).size).toBe(paths.length);
    for (const b of DIRECTORY) {
      expect(["ON", "BC", "AB", "NS", "MB", "SK", "QC", "NB", "PE", "NL", "YT", "NT", "NU"]).toContain(b.provinceCode);
      if (b.tendersUrl) expect(b.tendersUrl).toMatch(/^https?:\/\//);
      // Role inboxes only: never a person's address.
      if (b.email) expect(b.email.split("@")[0]).toMatch(/purchas|procure|bid|tender|suppl|vendor|contract|finance|buy|sourc|customerservice|info|general/);
    }
    expect(DIRECTORY.find((b) => b.name === "Guelph/Eramosa")?.platforms).toEqual(["own-site"]);
    expect(DIRECTORY.find((b) => b.name === "City of Guelph")?.portalUrl).toBe("https://guelph.bidsandtenders.ca/");
  });

  it("reads platforms, portals, groups and inboxes from the research wording", () => {
    expect(platformsOf("Bonfire (cambridge.bonfirehub.ca); co-op bids via Canoe bids&tenders", "no")).toEqual(["bonfire", "bids-and-tenders"]);
    expect(platformsOf("Own site (HTML table); no platform", "yes")).toEqual(["own-site"]);
    expect(platformsOf("Ontario Tenders Portal (Jaggaer), cross-posted to CanadaBuys", "no")).toEqual(["ontario-tenders-portal"]);
    expect(portalUrlOf("bids&tenders (guelph.bidsandtenders.ca)")).toBe("https://guelph.bidsandtenders.ca/");
    expect(portalUrlOf("Biddingo (biddingo.com/kingston)")).toBe("https://biddingo.com/kingston");
    expect(groupOf("upper-tier county")).toBe("regional");
    expect(groupOf("crown corp")).toBe("agency");
    expect(roleEmail("purchasing@barrie.ca")).toBe("purchasing@barrie.ca");
    expect(roleEmail("jperera@npca.ca")).toBeNull();
    expect(roleEmail("Zak.Lepage@confederationcollege.ca")).toBeNull();
  });
});

describe("buyer names", () => {
  it("matches 'Town of Oakville', 'Oakville' and 'Corporation of the Town of Oakville', but keeps upper tiers apart", () => {
    expect(coreKey("Town of Oakville")).toBe(coreKey("Oakville"));
    expect(coreKey("Corporation of the Town of Oakville")).toBe("oakville");
    expect(coreKey("Region of Waterloo")).not.toBe(coreKey("City of Waterloo"));
    expect(coreKey("Regional Municipality of Waterloo")).toBe(coreKey("Region of Waterloo"));
    expect(municipalityOf({ name: "Township of Guelph/Eramosa", group: "municipality" })).toBe("Guelph/Eramosa");
    expect(municipalityOf({ name: "Halton District School Board", group: "school" })).toBeNull();
  });
});

describe("buyer pages: content and indexing", () => {
  const oak = buyer({});
  const quiet = buyer({ name: "Town of Nowhere", slug: "town-of-nowhere", portalUrl: null, email: null });
  const awards = [
    award({}),
    award({ slug: "paving-cba-1", winner: "Acme Roofing Ltd", amount: 750_000, date: "2026-07-01", tradeSlugs: ["roofing"] }),
    award({ slug: "mowing-cba-2", winner: null, winnerKey: null, winnerSlug: null, amount: null, date: "2026-03-01", tradeSlugs: ["landscaping"] }),
    award({ slug: "us-cba-3", country: "US", currency: "USD", province: "Ohio" }),
    award({ slug: "bc-cba-4", province: "British Columbia" }),
  ];
  const pages = buildBuyerPages({
    directory: [oak, quiet],
    awards,
    rfps: [rfp({}), rfp({ slug: "closed-x", status: "closed" }), rfp({ slug: "pm-x", sourceType: null }), rfp({ slug: "other-town", summary: "Ontario. Town of Milton: roofing" })],
    projects: [project({}), project({ slug: "old", stale: true }), project({ slug: "elsewhere", city: "Burlington" })],
  });
  const p = findBuyerPage(pages, "ontario", "town-of-oakville")!;
  const q = findBuyerPage(pages, "ontario", "town-of-nowhere")!;

  it("joins only this buyer's Canadian, same-province awards; winners are business names, individuals counted", () => {
    expect(p.awards.count).toBe(3);
    expect(p.awards.valued).toBe(2);
    expect(p.awards.totalValue).toBe(1_000_000);
    expect(p.awards.topWinners).toEqual([{ name: "Acme Roofing Ltd", publicSlug: "acme-roofing-ltd", awards: 2, value: 1_000_000 }]);
    expect(p.awards.individuals).toBe(1);
    expect(p.awards.recent.map((a) => a.slug)).not.toContain("us-cba-3");
    expect(p.awards.recent.map((a) => a.slug)).not.toContain("bc-cba-4");
    expect(p.awards.tradeSlugs[0]).toBe("roofing");
  });

  it("lists only open public listings already on the board that name the buyer (link only, never platform tenders)", () => {
    expect(p.openBids.map((o) => o.slug)).toEqual(["hvac-maintenance-gete-0123456789ab"]);
    expect(linkOnly(p.buyer)).toBe(true);
    expect(COMMERCIAL_PLATFORMS.has("bids-and-tenders")).toBe(true);
    expect(linkOnly(buyer({ platforms: ["own-site"] }))).toBe(false);
    expect(linkOnly(buyer({ platforms: ["bids-and-tenders", "own-site"] }))).toBe(false);
  });

  it("shows live projects in the buyer's city only, and copes with no projects at all", () => {
    expect(p.projects.map((x) => x.slug)).toEqual(["tower-x"]);
    expect(p.projectsTotal).toBe(1);
    const none = buildBuyerPages({ directory: [oak], awards: [], rfps: [], projects: [] });
    expect(none[0].projects).toEqual([]);
    expect(isIndexableBuyer(none[0])).toBe(false);
  });

  it("indexes a page only when it has PMRFP data beyond the link", () => {
    expect(isIndexableBuyer(p)).toBe(true);
    expect(isIndexableBuyer(q)).toBe(false);
    expect(isIndexableBuyer({ awards: q.awards, openBids: [], projectsTotal: 2 })).toBe(true);
    // A research row with no bids page and no data gets no page at all.
    const gone = buildBuyerPages({ directory: [buyer({ name: "Ghost Board", slug: "ghost", tendersUrl: null, platforms: [] })], awards: [], rfps: [], projects: [] });
    expect(gone).toEqual([]);
  });

  it("gives board-only buyers (2+ awards) a page of their own, Canadian provinces only", () => {
    const extra = buildBuyerPages({
      directory: [],
      awards: [
        award({ buyer: "Public Services and Procurement Canada", buyerKey: "public services and procurement canada", slug: "a1" }),
        award({ buyer: "Public Services and Procurement Canada", buyerKey: "public services and procurement canada", slug: "a2" }),
        award({ buyer: "Lonely Agency", buyerKey: "lonely agency", slug: "a3" }),
      ],
      rfps: [],
      projects: [],
    });
    expect(extra.map((x) => x.path)).toEqual(["/buyers/ontario/public-services-and-procurement-canada"]);
    expect(extra[0].fromBoard).toBe(true);
    expect(extra[0].buyer.tendersUrl).toBeNull();
  });

  it("finds the buyer page for an RFP or award page", () => {
    expect(buyerPageForRfp(pages, { slug: "x", province: "Ontario" }, "Corporation of the Town of Oakville")?.path).toBe("/buyers/ontario/town-of-oakville");
    expect(buyerPageForRfp(pages, { slug: "hvac-maintenance-gete-0123456789ab", province: "Ontario" }, null)?.path).toBe("/buyers/ontario/town-of-oakville");
    expect(buyerPageForRfp(pages, { slug: "x", province: "Ontario" }, "City of Toronto")).toBeNull();
  });

  it("indexes by province then buyer type", () => {
    const idx = directoryIndex(pages);
    expect(idx[0].province).toBe("Ontario");
    expect(idx[0].groups.map((g) => g.group)).toEqual(["municipality"]);
  });

  it("writes a unique title and FAQ that say where the buyer posts and that PMRFP only links", () => {
    expect(fmt(t.meta.buyerTitle, { name: "City of Oakville" })).toBe("City of Oakville bids & tenders — where to find them, who wins");
    const faq = buyerFaq(p, t, "en");
    expect(faq.map((x) => x.q)).toEqual([
      "Where does Town of Oakville post bids and tenders?",
      "How do I register to bid on Town of Oakville work?",
      "Who wins Town of Oakville's contracts?",
      "Does PMRFP list Town of Oakville's tenders?",
    ]);
    expect(faq[0].a).toContain("bids&tenders");
    expect(faq[0].a).toContain("https://www.oakville.ca/");
    expect(faq[2].a).toContain("Acme Roofing Ltd (2)");
    expect(faq[3].a).toMatch(/doesn't copy/);
    expect(buyerFaq(q, t, "en")[2].a).toMatch(/no award notices/);
    expect(platformList(["bids-and-tenders", "own-site"], t, "and")).toBe("bids&tenders and its own website");
  });

  it("has registration tips for every platform in every language", () => {
    for (const lang of ["en", "fr", "es"] as const) {
      const d = getDictionary(lang).buyers;
      for (const k of [...new Set(DIRECTORY.flatMap((b) => b.platforms))]) {
        expect(d.tips[k].length, `${lang}:${k}`).toBeGreaterThan(0);
        expect(d.platforms[k]).toBeTruthy();
      }
    }
  });
});
