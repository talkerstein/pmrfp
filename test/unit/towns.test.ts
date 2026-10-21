import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { allTowns, TOWN_SOURCE } from "@/lib/towns/data";
import { baseTownSlug, csdDecision, formalNameEn, formalNameFr, inSentence, nameIn, typeLabel } from "@/lib/towns/names";
import { mergeTownsWithDirectory } from "@/lib/towns/merge";
import { decideClaim, domainOwners, isFreeMail, registrableOf, type DomainHolder } from "@/lib/towns/domains";
import { domainHolderOf, searchBuyerPages } from "@/lib/towns/claimable";
import { cleanUpcoming, managedPageSchema, ownLogoUrl, permissionFor, readManagedForm, changedFields } from "@/lib/towns/managed";
import { nearbyOpenBids, townWidgetData } from "@/lib/towns/nearby";
import { claimSignUpHref } from "@/lib/towns/paths";
import { followIntentPath, followSignUpHref } from "@/lib/follows/rules";
import { DIRECTORY, buildBuyerPages, isIndexablePage, type DirectoryBuyer } from "@/lib/buyers/model";
import { mergePermissions, type BuyerPermission } from "@/lib/buyers/permissions";
import { WIDGET_PATH_RE, fallbackHref, scriptSnippet, widgetPath } from "@/lib/embed/widgets";
import { roleHome } from "@/lib/access/access";
import type { RfpListItem } from "@/lib/data/types";
import { buildTowns, parseCodelist, parsePopulation, toDataset, typeFromDescription } from "../../scripts/build-town-dataset.mjs";
import { buyerDomains, registrableDomain } from "../../scripts/build-buyer-directory.mjs";

/**
 * PMRFP for Towns, Part A: the census-subdivision import and its stable
 * slugs, the merge with the buyer directory, the noindex rule, verification
 * by government email domain, the town-bids widget's data and path, and
 * roleHome for public buyers.
 */

const towns = allTowns();
const town = (name: string, province: string) => {
  const t = towns.find((x) => x.name === name && x.provinceCode === province);
  if (!t) throw new Error(`no ${name} ${province}`);
  return t;
};

describe("the municipality dataset (Statistics Canada 2021 census subdivisions)", () => {
  it("has every municipality and none of the reserves or unorganized areas", () => {
    expect(towns.length).toBe(3501);
    const types = new Set(towns.map((t) => t.type));
    for (const no of ["Indian reserve", "Indian settlement", "Unorganized", "Subdivision of unorganized", "Regional district electoral area", "Parish", "Fire district", "Settlement"]) {
      expect(types.has(no)).toBe(false);
    }
    expect(town("Cobourg", "ON")).toMatchObject({ type: "Town", population: 20519, slug: "town-of-cobourg" });
    expect(town("Gatineau", "QC")).toMatchObject({ type: "Ville", slug: "ville-de-gatineau" });
    // Nova Scotia's county subdivisions are merged into one county page, population summed.
    expect(town("Annapolis", "NS")).toMatchObject({ id: "1205", type: "County municipality", slug: "municipality-of-the-county-of-annapolis" });
    expect(towns.some((t) => /Subd\./.test(t.name))).toBe(false);
  });

  it("records where the data comes from and its licence", () => {
    expect(TOWN_SOURCE.census).toBe(2021);
    expect(TOWN_SOURCE.licence).toBe("Open Government Licence – Canada");
    expect(TOWN_SOURCE.urls.population).toMatch(/^https:\/\/api\.statcan\.gc\.ca\//);
    expect(TOWN_SOURCE.attribution).toBe("Contains information licensed under the Open Government Licence – Canada.");
  });

  it("gives every page a slug that's unique in its province and matches its formal name", () => {
    const seen = new Set<string>();
    for (const t of towns) {
      const key = `${t.provinceCode}/${t.slug}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
      expect(t.slug).toMatch(/^[a-z0-9][a-z0-9-]*$/);
      // Same-named places in one province get their census division's name; nothing else changes.
      expect(t.slug.startsWith(baseTownSlug(t))).toBe(true);
    }
    // Two Quebec municipalities called L'Ange-Gardien: told apart by their MRC.
    const ange = towns.filter((t) => t.name === "L'Ange-Gardien" && t.provinceCode === "QC").map((t) => t.slug).sort();
    expect(ange).toEqual(["municipalite-de-l-ange-gardien-la-cote-de-beaupre", "municipalite-de-l-ange-gardien-les-collines-de-l-outaouais"]);
  });

  it("keeps a published slug when the data is rebuilt, and only new places get new ones", () => {
    const struct = readFileSync(join(process.cwd(), "test/unit/fixtures/towns/dsd_csd.xml"), "utf8");
    const csds = parseCodelist(struct, "CL_GEO_CSD");
    const divisions = parseCodelist(readFileSync(join(process.cwd(), "test/unit/fixtures/towns/cl_geo_cd.xml"), "utf8"), "CL_GEO_CD");
    const population = parsePopulation(readFileSync(join(process.cwd(), "test/unit/fixtures/towns/pop.csv"), "utf8"));
    const first = buildTowns({ csds, divisions, population });
    const bySlug = (r: { towns: { id: string; slug: string }[] }) => Object.fromEntries(r.towns.map((t) => [t.id, t.slug]));
    expect(bySlug(first)).toEqual({
      "3514021": "town-of-cobourg",
      "3553005": "city-of-greater-sudbury",
      "1205": "municipality-of-the-county-of-annapolis",
      "2420025": "municipalite-de-saint-louis-lotbiniere",
      "2454030": "municipalite-de-saint-louis-les-maskoutains",
    });
    expect(first.towns.find((t) => t.id === "1205")?.population).toBe(1500 + 2500);
    expect(first.skipped).toEqual({ "Indian reserve": 1, Unorganized: 1 });
    // Rebuild with a published slug that no longer matches today's rule: it stays.
    const again = buildTowns({ csds, divisions, population, kept: new Map([["3514021", "cobourg-old"]]) });
    expect(bySlug(again)["3514021"]).toBe("cobourg-old");
    expect(bySlug(again)["3553005"]).toBe("city-of-greater-sudbury");
    const data = toDataset(first.towns);
    expect(data.columns).toEqual(["id", "name", "type", "province", "population", "slug"]);
    expect(data.rows).toHaveLength(5);
  });

  it("reads a CSD's type from its description, even when the name has commas", () => {
    expect(typeFromDescription("Murray River, Part 1, Fire district [Census subdivision], Prince Edward Island", " [Census subdivision]")).toBe("Fire district");
    expect(typeFromDescription("Ottawa, Ville [Subdivision de recensement], Ontario", " [Subdivision de recensement]")).toBe("Ville");
  });

  it("keeps municipalities, drops reserves and areas with no local government", () => {
    expect(csdDecision("Town", "ON")).toBe("keep");
    expect(csdDecision("Village cri", "QC")).toBe("keep");
    expect(csdDecision("Hamlet", "NU")).toBe("keep");
    expect(csdDecision("Hamlet", "YT")).toBe("exclude");
    expect(csdDecision("Indian reserve", "SK")).toBe("exclude");
    expect(csdDecision("Nisga'a land", "BC")).toBe("exclude");
    expect(csdDecision("Unorganized", "ON")).toBe("exclude");
    expect(csdDecision("Subdivision of county municipality", "NS")).toBe("merge-county");
    expect(csdDecision("Something new", "ON")).toBe("unknown");
  });
});

describe("names in English, French and Spanish", () => {
  it("writes formal names the way each province does", () => {
    expect(formalNameEn(town("Cobourg", "ON"))).toBe("Town of Cobourg");
    expect(formalNameFr(town("Cobourg", "ON"))).toBe("Ville de Cobourg");
    expect(formalNameFr(town("Ottawa", "ON"))).toBe("Ville d'Ottawa");
    expect(formalNameFr(town("Clarence-Rockland", "ON"))).toBe("Cité de Clarence-Rockland");
    expect(formalNameFr(town("Hearst", "ON"))).toBe("Ville de Hearst");
    expect(formalNameEn(town("Sherwood No. 159", "SK"))).toBe("Rural Municipality of Sherwood No. 159");
    expect(formalNameEn(town("Wheatland County", "AB"))).toBe("Wheatland County");
    expect(formalNameEn(town("Halifax", "NS"))).toBe("Halifax Regional Municipality");
    expect(formalNameEn(town("Chester", "NS"))).toBe("Municipality of the District of Chester");
    // Quebec's names are French in every language.
    expect(formalNameEn(town("Gatineau", "QC"))).toBe("Ville de Gatineau");
    expect(nameIn("Greater Sudbury / Grand Sudbury", "fr")).toBe("Grand Sudbury");
    expect(nameIn("Lloydminster (Part)", "en")).toBe("Lloydminster");
  });

  it("uses Statistics Canada's French type names on French pages", () => {
    expect(typeLabel(town("Russell", "ON"), "fr")).toBe("Canton");
    expect(typeLabel(town("Cobourg", "ON"), "fr")).toBe("Ville");
    expect(typeLabel(town("Kincardine", "ON"), "fr")).toBe("Municipalité");
    expect(typeLabel(town("Tracadie", "NB"), "fr")).toBe("Municipalité régionale");
    expect(typeLabel(town("Cobourg", "ON"), "es")).toBe("Pueblo");
    expect(typeLabel(town("Gatineau", "QC"), "en")).toBe("Ville");
  });

  it("adds the article a sentence needs (the Town of…, la Ville de…)", () => {
    expect(inSentence("Town of Cobourg", "en")).toBe("the Town of Cobourg");
    expect(inSentence("Wheatland County", "en")).toBe("Wheatland County");
    expect(inSentence("Ville de Cobourg", "fr")).toBe("la Ville de Cobourg");
    expect(inSentence("Canton de Russell", "fr")).toBe("le Canton de Russell");
    expect(inSentence("Cantons unis de Stoneham-et-Tewkesbury", "fr")).toBe("les Cantons unis de Stoneham-et-Tewkesbury");
    expect(inSentence("Wheatland County", "fr")).toBe("Wheatland County");
  });
});

describe("one page per buyer: towns merged with the directory", () => {
  const merged = mergeTownsWithDirectory(towns, DIRECTORY);
  const dir = (name: string) => DIRECTORY.find((b) => b.name === name)!;

  it("lets the directory entry win, matched by name and province", () => {
    expect(merged.byDirectory.get(`ON/${dir("Cobourg").slug}`)?.id).toBe(town("Cobourg", "ON").id);
    expect(merged.byDirectory.get(`ON/${dir("King Township").slug}`)?.name).toBe("King");
    expect(merged.byDirectory.get(`BC/${dir("Resort Municipality of Whistler").slug}`)?.name).toBe("Whistler");
    expect(merged.byDirectory.get(`AB/${dir("County of Grande Prairie").slug}`)?.name).toBe("Grande Prairie County No. 1");
    // Merged towns don't get a second page.
    expect(merged.unmerged.some((t) => t.id === town("Cobourg", "ON").id)).toBe(false);
    expect(merged.byDirectory.size + merged.unmerged.length).toBe(towns.length);
  });

  it("never pairs a city with its region, or two provinces", () => {
    const waterlooRegion = DIRECTORY.find((b) => b.name === "Region of Waterloo");
    if (waterlooRegion) expect(merged.byDirectory.has(`ON/${waterlooRegion.slug}`)).toBe(false);
    for (const [k, t] of merged.byDirectory) expect(k.split("/")[0]).toBe(t.provinceCode);
  });

  it("pairs a same-named place by its type, then its size", () => {
    const fake: DirectoryBuyer = { ...dir("Cobourg"), name: "Township of Langley", provinceCode: "BC", slug: "township-of-langley-test" };
    const m = mergeTownsWithDirectory(towns, [fake]);
    expect(m.byDirectory.get("BC/township-of-langley-test")?.type).toBe("District municipality");
  });

  it("builds a town page for every municipality the directory doesn't cover", () => {
    const pages = buildBuyerPages({ awards: [], rfps: [], projects: [], towns: merged });
    const townPages = pages.filter((p) => p.kind === "town");
    expect(townPages).toHaveLength(merged.unmerged.length);
    const paths = new Set(pages.map((p) => p.path));
    expect(paths.size).toBe(pages.length);
    expect(pages.find((p) => p.path === "/buyers/ontario/town-of-cochrane")?.kind).toBe("town");
    // The directory page for a merged town carries its census facts.
    expect(pages.find((p) => p.buyer.name === "Cobourg")?.town?.population).toBe(20519);
    // Without towns, nothing changes (directory + board buyers only).
    expect(buildBuyerPages({ awards: [], rfps: [], projects: [] }).some((p) => p.kind === "town")).toBe(false);
  });

  it("finds a town's open bids by its formal name, and not a shorter name inside a longer one", () => {
    const rfp = (slug: string, title: string, province = "Ontario"): RfpListItem => ({
      slug, title, summary: null, categories: [], regionName: null, propertyTypeName: null, city: null, province, deadline: "2099-01-15",
      isDemo: false, photoUrls: [], status: "open", sourceType: "public_source",
    });
    const pages = buildBuyerPages({
      awards: [],
      rfps: [rfp("a", "Town of Cochrane: arena roof"), rfp("b", "Township of Wellington North road salt"), rfp("c", "Town of Cochrane snow", "Alberta")],
      projects: [],
      towns: merged,
    });
    const cochrane = pages.find((p) => p.path === "/buyers/ontario/town-of-cochrane")!;
    expect(cochrane.openBids.map((b) => b.slug)).toEqual(["a"]);
    const wn = pages.find((p) => p.path === "/buyers/ontario/township-of-wellington-north")!;
    expect(wn.openBids.map((b) => b.slug)).toEqual(["b"]);
  });
});

describe("noindex until a town has bids, a claim or permission", () => {
  const merged = mergeTownsWithDirectory(towns, DIRECTORY);
  const pages = buildBuyerPages({ awards: [], rfps: [], projects: [], towns: merged });
  const empty = pages.find((p) => p.kind === "town")!;
  const none = { managed: false, permissionYes: false };

  it("keeps an empty town page out of the index", () => {
    expect(isIndexablePage(empty, none)).toBe(false);
  });
  it("indexes it once it's claimed, has permission, or has bids", () => {
    expect(isIndexablePage(empty, { managed: true, permissionYes: false })).toBe(true);
    expect(isIndexablePage(empty, { managed: false, permissionYes: true })).toBe(true);
    expect(isIndexablePage({ ...empty, openBids: [{ slug: "x", title: "x", deadline: null }] }, none)).toBe(true);
    // A major project in town isn't enough for a town page (it is for a researched buyer).
    expect(isIndexablePage({ ...empty, projectsTotal: 3 }, none)).toBe(false);
    expect(isIndexablePage({ ...empty, kind: "directory", projectsTotal: 3 }, none)).toBe(true);
  });
  it("reads permission for the right province only (slugs repeat across provinces)", () => {
    const registry = mergePermissions([]);
    expect(permissionFor(registry, "town-of-cochrane", "AB")?.status).toBe("no");
    expect(permissionFor(registry, "town-of-cochrane", "ON")).toBeNull();
    const yes: BuyerPermission = { buyerSlug: "town-of-cobourg", buyerName: "Town of Cobourg", provinceCode: "ON", country: "CA", scope: "buyer", status: "yes", method: "email_notices", grantedOn: "2026-10-21", contact: null, quote: null, origin: "db" };
    expect(permissionFor(mergePermissions([yes]), "town-of-cobourg", "ON")?.status).toBe("yes");
  });
});

describe("verification by government email domain", () => {
  const cobourg: DomainHolder = { identity: "ON|cobourg", website: "cobourg.ca", domains: ["cobourg.ca"] };
  const calgary: DomainHolder = { identity: "AB|calgary", website: "calgary.ca", domains: ["calgary.ca"] };
  const housing: DomainHolder = { identity: "AB|calgary housing company", website: "calgaryhousingcompany.org", domains: ["calgaryhousingcompany.org", "calgary.ca"] };
  const province1: DomainHolder = { identity: "AB|alberta", website: "alberta.ca", domains: ["alberta.ca"] };
  const province2: DomainHolder = { identity: "AB|alberta infrastructure goa", website: "alberta.ca", domains: ["alberta.ca"] };
  const owners = domainOwners([cobourg, calgary, housing, province1, province2]);
  const decide = (email: string, buyer: DomainHolder, extra: Partial<Parameters<typeof decideClaim>[0]> = {}) =>
    decideClaim({ email, emailConfirmed: true, buyer, owners, managedBy: null, ...extra });

  it("verifies a confirmed work email on the buyer's own domain (subdomains too)", () => {
    expect(decide("clerk@cobourg.ca", cobourg)).toEqual({ kind: "verified", domain: "cobourg.ca" });
    expect(decide("Clerk@Town.Cobourg.ca", cobourg)).toEqual({ kind: "verified", domain: "cobourg.ca" });
  });
  it("sends a mismatched or unknown domain to review", () => {
    expect(decide("clerk@port-hope.ca", cobourg)).toMatchObject({ kind: "pending", reason: "domain_mismatch" });
    expect(decide("clerk@cobourg.ca", { identity: "ON|x", website: null, domains: [] })).toMatchObject({ kind: "pending", reason: "no_domain_on_file" });
    expect(decide("clerk@cobourg.ca", cobourg, { emailConfirmed: false })).toMatchObject({ kind: "pending", reason: "email_unconfirmed" });
  });
  it("never verifies a free or personal mailbox", () => {
    for (const e of ["clerk@gmail.com", "clerk@hotmail.ca", "clerk@sasktel.net", "clerk@nb.sympatico.ca", "c.lerk+town@googlemail.com"]) {
      expect(isFreeMail(e)).toBe(true);
      // Even if a free domain somehow sat on the buyer's list.
      expect(decide(e, { ...cobourg, domains: [registrableOf(e)!] })).toMatchObject({ kind: "pending", reason: "free_mail" });
    }
  });
  it("doesn't let a shared domain prove which buyer it is; a website beats an inbox", () => {
    expect(decide("x@alberta.ca", province1)).toMatchObject({ kind: "pending", reason: "shared_domain" });
    expect(decide("x@calgary.ca", calgary)).toEqual({ kind: "verified", domain: "calgary.ca" });
    expect(decide("x@calgary.ca", housing)).toMatchObject({ kind: "pending", reason: "shared_domain" });
  });
  it("an admin-trusted domain counts like the buyer's website", () => {
    const h = { ...housing, trusted: ["calgary.ca"] };
    // Now two owners claim calgary.ca as their own: neither proves anything alone.
    const o = domainOwners([calgary, h]);
    expect(decideClaim({ email: "x@calgary.ca", emailConfirmed: true, buyer: h, owners: o, managedBy: null })).toMatchObject({ kind: "pending", reason: "shared_domain" });
  });
  it("turns any claim of an already managed page into a join request", () => {
    expect(decide("clerk@cobourg.ca", cobourg, { managedBy: "org-1" })).toEqual({ kind: "join", organizationId: "org-1", domainMatch: true });
    expect(decide("clerk@gmail.com", cobourg, { managedBy: "org-1" })).toEqual({ kind: "join", organizationId: "org-1", domainMatch: false });
  });
  it("seeds directory domains from bids pages and inboxes, never platforms", () => {
    expect(registrableDomain("https://www.city.oakville.on.ca/x")).toBe("oakville.on.ca");
    expect(registrableDomain("buyandsell@tpsgc-pwgsc.gc.ca")).toBe("tpsgc-pwgsc.gc.ca");
    expect(buyerDomains({ tendersUrl: "https://nanaimo.bidsandtenders.ca/", email: "procurement@nanaimo.ca", emailSource: "https://www.nanaimo.ca/bids" })).toEqual(["nanaimo.ca"]);
    expect(DIRECTORY.find((b) => b.slug === "city-of-nanaimo")?.domains).toEqual(["nanaimo.ca"]);
    const holder = domainHolderOf({ buyer: DIRECTORY.find((b) => b.slug === "city-of-nanaimo")! });
    expect(holder).toMatchObject({ website: "nanaimo.ca", domains: ["nanaimo.ca"] });
  });
});

describe("managed pages", () => {
  it("validates the edit form; blank fields clear", () => {
    const fd = new FormData();
    fd.set("contactEmail", " Purchasing@Cobourg.ca ");
    fd.set("contactPhone", "905-372-4301");
    fd.set("showContact", "on");
    fd.set("bidsUrl", "https://www.cobourg.ca/bids");
    fd.set("platformUrl", "");
    fd.set("vendorRegistrationUrl", "");
    fd.set("intro", "We buy snow plowing and arena maintenance.");
    for (const [title, month] of [["Arena roof", "2027-04"], ["", ""], ["Sidewalk plow", "2026-11"]]) {
      fd.append("upcomingTitle", title);
      fd.append("upcomingMonth", month);
    }
    const r = managedPageSchema.safeParse(readManagedForm(fd));
    expect(r.success).toBe(true);
    expect(r.data).toMatchObject({ contactEmail: "purchasing@cobourg.ca", showContact: true, platformUrl: null, upcoming: [{ title: "Sidewalk plow", month: "2026-11" }, { title: "Arena roof", month: "2027-04" }] });
  });
  it("rejects bad links and half-filled upcoming rows", () => {
    const base = { contactEmail: "", contactPhone: "", showContact: false, bidsUrl: "", platformUrl: "", vendorRegistrationUrl: "", intro: "", upcoming: [] };
    expect(managedPageSchema.safeParse({ ...base, bidsUrl: "javascript:alert(1)" }).error?.issues[0]?.message).toBe("url");
    expect(managedPageSchema.safeParse({ ...base, upcoming: [{ title: "Roof", month: "" }] }).error?.issues[0]?.message).toBe("upcoming");
    expect(managedPageSchema.safeParse({ ...base, intro: "x".repeat(601) }).error?.issues[0]?.message).toBe("intro");
  });
  it("only keeps a logo from our own storage bucket", () => {
    const sb = "https://abc.supabase.co";
    expect(ownLogoUrl("https://abc.supabase.co/storage/v1/object/public/logos/org/logo.webp", sb)).not.toBeNull();
    expect(ownLogoUrl("https://evil.example/logo.png", sb)).toBeNull();
  });
  it("logs which fields changed, never their values", () => {
    expect(changedFields({ intro: "a", show_contact: false }, { intro: "b", show_contact: false, updated_at: "now" })).toEqual(["intro"]);
    expect(cleanUpcoming([{ title: "x", month: "bad" }, { title: "y", month: "2027-01" }])).toEqual([{ title: "y", month: "2027-01" }]);
  });
});

describe("the town-bids widget and the town page's lists", () => {
  const rfp = (over: Partial<RfpListItem>): RfpListItem => ({
    slug: "s", title: "t", summary: null, categories: [], regionName: null, propertyTypeName: null, city: null, province: "Ontario", deadline: "2099-01-01",
    isDemo: false, photoUrls: [], status: "open", sourceType: "public_source", ...over,
  });

  it("has one cacheable path per buyer and language, framed by the loader", () => {
    const w = { kind: "town-bids", province: "ontario", slug: "town-of-cobourg", lang: "fr" } as const;
    expect(widgetPath(w)).toBe("town-bids/fr/ontario/town-of-cobourg");
    expect(WIDGET_PATH_RE.test("town-bids/fr/ontario/town-of-cobourg")).toBe(true);
    expect(WIDGET_PATH_RE.test("town-bids/de/ontario/town-of-cobourg")).toBe(false);
    expect(WIDGET_PATH_RE.test("town-bids/en/ontario")).toBe(false);
    expect(fallbackHref("https://pmrfp.com", w)).toBe("https://pmrfp.com/fr/buyers/ontario/town-of-cobourg");
    const code = scriptSnippet("https://pmrfp.com", w, { theme: "dark", limit: 3 });
    expect(code).toContain('data-pmrfp="town-bids/fr/ontario/town-of-cobourg"');
    expect(code).toContain('data-theme="dark"');
    expect(code).toContain("Nos appels d'offres en cours sur PMRFP");
    const loader = readFileSync(join(process.cwd(), "public", "embed.js"), "utf8");
    expect(loader).toContain(`var PATH = /${WIDGET_PATH_RE.source}/;`);
  });

  it("shows the buyer's current bids, soonest first, with its official bids page", () => {
    const page = {
      buyer: { ...DIRECTORY.find((b) => b.slug === "city-of-nanaimo")! },
      openBids: [{ slug: "late", title: "Late", deadline: "2099-03-01" }, { slug: "soon", title: "Soon", deadline: "2099-01-01" }],
    };
    const data = townWidgetData(page, null);
    expect(data.bids.map((b) => b.slug)).toEqual(["soon", "late"]);
    expect(data.total).toBe(2);
    // The city-flow config's official page for Nanaimo; a managing buyer's own link wins.
    expect(data.official).toBe("https://www.nanaimo.ca/doing-business/procurement-services/bid-opportunities");
    expect(townWidgetData(page, { bidsUrl: "https://www.nanaimo.ca/x", platformUrl: null }).official).toBe("https://www.nanaimo.ca/x");
  });

  it("lists nearby bids from the snapshot: in town first, same province only, never awards or its own", () => {
    const rows = [
      rfp({ slug: "far", city: "Toronto", deadline: "2099-01-02" }),
      rfp({ slug: "here", city: "Cobourg", deadline: "2099-05-01" }),
      rfp({ slug: "bc", city: "Victoria", province: "British Columbia" }),
      rfp({ slug: "closed", status: "closed" }),
      rfp({ slug: "own", city: "Cobourg" }),
    ];
    expect(nearbyOpenBids(rows, { province: "Ontario", place: "Cobourg", exclude: new Set(["own"]) }).map((r) => r.slug)).toEqual(["here", "far"]);
  });

  it("links the claim and follow calls to action", () => {
    expect(claimSignUpHref("ontario/town-of-cobourg")).toBe("/sign-up?role=public_buyer&claim=ontario%2Ftown-of-cobourg");
    // Follow is a real follow now (Part B1): sign-up keeps it in `next` (/follow?buyer=…).
    expect(followSignUpHref(followIntentPath("ontario/town-of-cobourg"), "ontario")).toBe("/sign-up?role=trade&region=ontario&next=%2Ffollow%3Fbuyer%3Dontario%252Ftown-of-cobourg");
    expect(followSignUpHref(followIntentPath("ontario/town-of-cobourg"), null)).toBe("/sign-up?role=trade&next=%2Ffollow%3Fbuyer%3Dontario%252Ftown-of-cobourg");
  });

  it("finds a buyer page by name for the claim step", () => {
    const pages = buildBuyerPages({ awards: [], rfps: [], projects: [], towns: mergeTownsWithDirectory(towns, DIRECTORY) });
    expect(searchBuyerPages(pages, "cobourg")[0]?.buyer.name).toBe("Cobourg");
    expect(searchBuyerPages(pages, "Ville de Gatineau")[0]?.path).toBe("/buyers/quebec/ville-de-gatineau");
    expect(searchBuyerPages(pages, "x")).toEqual([]);
  });
});

describe("roleHome", () => {
  it("sends public buyers to their dashboard", () => {
    expect(roleHome("public_buyer")).toBe("/buyer-dashboard");
    expect(roleHome("property_manager")).toBe("/pm-dashboard");
  });
});
