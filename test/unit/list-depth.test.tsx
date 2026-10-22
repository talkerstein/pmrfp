import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { BuyerOfficeCard } from "@/components/buyers/buyer-office";
import { buyerOffice, contactAccess, officeWebsite } from "@/lib/buyers/office";
import { KNOWN_BIDS_PAGES, knownBidsPage, postedOn } from "@/lib/buyers/posting";
import { townBuyer, type DirectoryBuyer } from "@/lib/buyers/model";
import { cutTitle } from "@/lib/tenders/shared";
import { TORONTO_PORTAL_URL } from "@/lib/tenders/toronto";
import { getDictionary } from "@/i18n/dictionaries";
import { COMPETITORS } from "@/lib/seo/competitors";
import { competitorsFor } from "@/lib/seo/competitors.fr";

const buyer = (over: Partial<DirectoryBuyer> = {}): DirectoryBuyer => ({
  name: "Toronto DSB",
  provinceCode: "ON",
  type: "school board",
  group: "school",
  tendersUrl: "https://www.tdsb.on.ca/About-Us/Business-Services/Purchasing",
  platforms: ["bids-and-tenders"],
  portalUrl: "https://tdsb.bidsandtenders.ca/",
  ownSiteList: false,
  email: "purchasing@tdsb.on.ca",
  emailSource: null,
  checkedOn: "2026-10-15",
  slug: "toronto-dsb",
  domains: ["tdsb.on.ca"],
  ...over,
});

describe("buyer office details (free) vs the named contact (Trade Pro)", () => {
  it("assembles website, bids page and procurement inbox from the directory", () => {
    expect(buyerOffice(buyer())).toEqual({
      website: "https://tdsb.on.ca",
      bidsPage: "https://www.tdsb.on.ca/About-Us/Business-Services/Purchasing",
      procurementEmail: "purchasing@tdsb.on.ca",
      phone: null,
    });
  });

  it("adds the published procurement phone of a city source (Nanaimo) and a verified buyer's own contact", () => {
    const nanaimo = buyerOffice(buyer({ slug: "city-of-nanaimo", name: "City of Nanaimo", email: null, domains: [] }));
    expect(nanaimo?.phone).toBe("250-756-5319");
    expect(nanaimo?.procurementEmail).toBe("procurement@nanaimo.ca");
    const managed = buyerOffice(buyer({ email: null }), { contactEmail: "clerk@town.ca", contactPhone: "905-555-0100", bidsUrl: null });
    expect(managed?.phone).toBe("905-555-0100");
    expect(managed?.procurementEmail).toBe("clerk@town.ca");
  });

  it("never invents: a field we do not hold is null, and no data at all is null", () => {
    expect(buyerOffice(buyer({ tendersUrl: null, email: null, domains: [], portalUrl: null }))).toBeNull();
    expect(officeWebsite(["not a domain", ""])).toBeNull();
    expect(officeWebsite(undefined)).toBeNull();
    expect(buyerOffice(buyer())?.phone).toBeNull();
  });

  it("office is free for everyone; the named contact and the checklist need Trade Pro", () => {
    expect(contactAccess({ pro: false })).toEqual({ office: true, namedContact: false, bidChecklist: false });
    expect(contactAccess({ pro: true })).toEqual({ office: true, namedContact: true, bidChecklist: true });
  });

  it("renders the office for a free viewer, says the named contact is Pro, and carries no named person", () => {
    const t = getDictionary("en").listDepth.office;
    const office = buyerOffice(buyer())!;
    const html = renderToStaticMarkup(<BuyerOfficeCard name="Toronto DSB" office={office} t={t} proNote={!contactAccess({ pro: false }).namedContact} />);
    expect(html).toContain("tdsb.on.ca");
    expect(html).toContain("purchasing@tdsb.on.ca");
    expect(html).toContain(t.proNote);
    const pro = renderToStaticMarkup(<BuyerOfficeCard name="Toronto DSB" office={office} t={t} proNote={!contactAccess({ pro: true }).namedContact} />);
    expect(pro).not.toContain(t.proNote);
  });
});

describe("where a buyer posts", () => {
  it("the City of Toronto's bids page is known, and is the one the importer links", () => {
    expect(KNOWN_BIDS_PAGES["ON/city-of-toronto"].url).toBe(TORONTO_PORTAL_URL);
    expect(knownBidsPage("ON", "city-of-oshawa")).toBeNull();
    const t = townBuyer({ id: "3520005", name: "Toronto", type: "City", typeFr: null, provinceCode: "ON", province: "Ontario", population: 2794356, slug: "city-of-toronto" } as never);
    expect(t.tendersUrl).toBe(TORONTO_PORTAL_URL);
    expect(t.platforms).toEqual(["own-site"]);
  });

  it("reads where a buyer's own notices were posted, skipping the federal portal", () => {
    const p = {
      openBids: [{ slug: "toiture-qc-2026-001", title: "x", deadline: null }, { slug: "x-cb-123-45", title: "y", deadline: null }],
      awards: { recent: [] },
    } as never;
    expect(postedOn(p)).toEqual(["SEAO"]);
  });
});

describe("long titles", () => {
  it("cuts on a word boundary and never ends on a connector", () => {
    const t = cutTitle("Multiple State of Good Repair projects and capital construction works at various City of Toronto facilities and parks", 60);
    expect(t.length).toBeLessThanOrEqual(61);
    expect(t.endsWith("…")).toBe(true);
    expect(t).not.toMatch(/\b(?:and|at|of|for|the|to|in|with|various)…$/i);
    expect(cutTitle("Short title", 60)).toBe("Short title");
  });
});

describe("list page text", () => {
  const langs = ["en", "fr", "es"] as const;

  it("no list-page meta calls a public tender a property manager's", () => {
    for (const l of langs) {
      const d = getDictionary(l);
      for (const s of [d.board.meta.title, d.board.meta.description, d.seo.trade.meta.description, d.seo.tradeCity.meta.description, d.seo.tradesIndex.meta.description]) {
        expect(s).not.toMatch(/property[- ]manager tender|tender .*property manager|gestionnaire immobilier.*appel d'offres public/i);
      }
    }
  });

  it("French list and trade pages say 'appel d'offre' naturally", () => {
    const d = getDictionary("fr");
    expect(d.board.meta.description).toContain("appel d'offre ");
    expect(d.seo.trade.meta.description).toContain("appel d'offre ");
    expect(d.seo.tradeCity.meta.description).toContain("appel d'offre ");
  });

  it("a single open tender reads in the singular", () => {
    expect(getDictionary("en").seo.tradeCity.meta.partOpen.one).not.toMatch(/RFPs and tenders/);
  });
});

describe("/vs/constructconnect is corrected", () => {
  const text = (lang: "en" | "fr" | "es") => JSON.stringify(competitorsFor(lang).find((c) => c.slug === "constructconnect"));

  it("no longer says it has no directory or is new-build only", () => {
    for (const l of ["en", "fr", "es"] as const) {
      const s = text(l);
      expect(s).not.toMatch(/1,500|1 500|new-build preconstruction|Preconstrucción de obra nueva|Préconstruction de bâtiments neufs/);
    }
    const en = COMPETITORS.find((c) => c.slug === "constructconnect")!;
    expect(en.rows.find((r) => r.feature === "Company directory")?.them).toMatch(/^Yes/);
    expect(JSON.stringify(en)).toContain("Service, Maintenance & Supply");
    expect(JSON.stringify(en)).toContain("October 2026");
  });

  it("does not claim free private work as proof: it says none is open", () => {
    const en = text("en");
    expect(en).toMatch(/None is open right now/);
  });
});
