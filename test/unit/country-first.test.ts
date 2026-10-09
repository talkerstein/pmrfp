import { describe, expect, it } from "vitest";
import {
  accountGeo,
  countryOf,
  encodeAccountGeo,
  geoFrom,
  inCountry,
  parseAccountCookie,
  parseCountryParam,
  provinceFirst,
  regionCountry,
  regionsInCountry,
  resolveCountry,
} from "@/lib/visitor-geo";
import { freeDigestMatches, listingCountry, orgCountries, regionCountryMap } from "@/lib/alerts/country";
import { buildDigests, type DigestRfp } from "@/lib/alerts/digest";
import { recentAwardsByUser, type DigestAward } from "@/lib/alerts/awards";
import { boardStatsByCountry } from "@/lib/data/fomo";
import { listRfps } from "@/lib/data/rfps";
import { listVendors, vendorCountries } from "@/lib/data/directory";
import { filterGallery, galleryCountry, type GalleryItem } from "@/lib/projects/gallery";
import { similarAwards, type PastAward } from "@/lib/forum/tender-facts";
import { embedFeedCountry } from "@/lib/embed/widgets";
import type { RfpListItem } from "@/lib/data/types";

const TX = geoFrom("US", "TX");
const ON = geoFrom("CA", "ON");

describe("country resolver precedence", () => {
  it("defaults to Canada with no signals", () => {
    expect(resolveCountry({})).toEqual({ country: "CA", province: null, source: "default" });
  });

  it("uses the IP country when nothing else says", () => {
    expect(resolveCountry({ geo: TX })).toEqual({ country: "US", province: "Texas", source: "geo" });
    // Anywhere outside the U.S. browses the Canadian market, without a province.
    expect(resolveCountry({ geo: geoFrom("FR", "IDF") })).toMatchObject({ country: "CA", source: "geo", province: null });
  });

  it("the CA|US switch beats the IP country", () => {
    const r = resolveCountry({ cookie: "CA", geo: TX });
    expect(r).toMatchObject({ country: "CA", source: "cookie" });
    // The Texas IP region is not a Canadian province, so nothing sorts first.
    expect(r.province).toBeNull();
  });

  it("the signed-in company's country beats the switch and the IP", () => {
    expect(resolveCountry({ account: ON, cookie: "US", geo: TX })).toEqual({ country: "CA", province: "Ontario", source: "account" });
    expect(resolveCountry({ account: { country: "US", province: null }, cookie: "CA", geo: ON })).toEqual({ country: "US", province: null, source: "account" });
  });

  it("an explicit ?country= view beats everything for that page", () => {
    expect(resolveCountry({ param: "us", account: ON, cookie: "CA", geo: ON })).toMatchObject({ country: "US", source: "param" });
    // "all" or junk is not a country: fall through.
    expect(resolveCountry({ param: "all", cookie: "US" })).toMatchObject({ country: "US", source: "cookie" });
    expect(parseCountryParam("xx")).toBeNull();
  });

  it("takes the province from the account, else from the IP when it is in the resolved country", () => {
    expect(resolveCountry({ account: { country: "CA", province: null }, geo: geoFrom("CA", "BC") }).province).toBe("British Columbia");
    expect(resolveCountry({ cookie: "US", geo: TX }).province).toBe("Texas");
  });
});

describe("account location", () => {
  it("reads the company's province/state first", () => {
    expect(accountGeo({ province: "Texas", country: "Canada" })).toEqual({ country: "US", province: "Texas" });
    expect(accountGeo({ province: "ON", country: "Canada" })).toEqual({ country: "CA", province: "Ontario" });
  });

  it("then an explicit U.S. country, then its service regions", () => {
    expect(accountGeo({ province: null, country: "United States" })).toEqual({ country: "US", province: null });
    // "Canada" is the column default: not proof on its own.
    expect(accountGeo({ province: null, country: "Canada" })).toBeNull();
    expect(accountGeo({ province: null, country: "Canada" }, [{ country: "USA", province: "New York" }])).toEqual({ country: "US", province: "New York" });
    expect(accountGeo({ province: null }, [{ country: "USA" }, { country: "Canada" }])).toBeNull();
    expect(accountGeo(null)).toBeNull();
  });

  it("round-trips through the account cookie", () => {
    expect(encodeAccountGeo({ country: "CA", province: "Ontario" })).toBe("CA-ON");
    expect(encodeAccountGeo({ country: "US", province: "Texas" })).toBe("US-TX");
    expect(encodeAccountGeo({ country: "US", province: null })).toBe("US");
    expect(parseAccountCookie("US-TX")).toEqual({ country: "US", province: "Texas" });
    expect(parseAccountCookie("FR")).toBeNull();
    expect(encodeAccountGeo(null)).toBeNull();
  });
});

describe("country helpers", () => {
  it("puts the visitor's province first, otherwise keeps the order", () => {
    const rows = [{ p: "Quebec" }, { p: "Ontario" }, { p: "Alberta" }, { p: "ontario" }];
    expect(provinceFirst(rows, "Ontario", (r) => r.p).map((r) => r.p)).toEqual(["Ontario", "ontario", "Quebec", "Alberta"]);
    expect(provinceFirst(rows, null, (r) => r.p)).toEqual(rows);
  });

  it("splits rows and regions by country", () => {
    const rows = [{ province: "Texas" }, { province: "Ontario" }, { province: null }];
    expect(inCountry(rows, "US")).toEqual([{ province: "Texas" }]);
    expect(inCountry(rows, "CA")).toEqual([{ province: "Ontario" }, { province: null }]);
    expect(regionsInCountry([{ country: "USA" }, { country: "Canada" }], "US")).toEqual([{ country: "USA" }]);
    expect(regionCountry({ country: "United States" })).toBe("US");
    expect(countryOf({ province: "NY" })).toBe("US");
  });
});

const listItem = (slug: string, province: string | null, over: Partial<RfpListItem> = {}): RfpListItem => ({
  slug,
  title: slug,
  summary: null,
  categories: ["HVAC"],
  regionName: null,
  propertyTypeName: null,
  city: null,
  province,
  deadline: "2099-01-01",
  isDemo: false,
  photoUrls: [],
  status: "open",
  sourceType: null,
  ...over,
});

describe("lists and counts never cross the border", () => {
  it("board stats are per country and add up", () => {
    const rfps = [listItem("a", "Ontario"), listItem("b", "Texas"), listItem("c", "Quebec"), listItem("d", "Ohio", { status: "closed" })];
    const s = boardStatsByCountry(rfps);
    expect(s.CA.open).toBe(2);
    expect(s.US.open).toBe(1);
    expect(s.CA.open + s.US.open).toBe(rfps.filter((r) => r.status === "open").length);
  });

  it("listRfps filters by country (demo board is all Canadian)", async () => {
    const all = await listRfps();
    const ca = await listRfps({ country: "CA" });
    const us = await listRfps({ country: "US" });
    expect(ca.length + us.length).toBe(all.length);
    expect(us.every((r) => countryOf(r) === "US")).toBe(true);
    expect(ca.every((r) => countryOf(r) === "CA")).toBe(true);
  });

  it("listVendors filters by the countries a company works in", async () => {
    const us = await listVendors({ country: "US" });
    const ca = await listVendors({ country: "CA" });
    expect(us.every((v) => v.countries?.includes("US"))).toBe(true);
    expect(ca.every((v) => v.countries?.includes("CA"))).toBe(true);
    expect(vendorCountries({ province: "Ontario" }, [{ country: "USA" }])).toEqual(["CA", "US"]);
    expect(vendorCountries({ province: null }, [])).toEqual(["CA"]);
  });

  it("the projects gallery filters by country", () => {
    const item = (slug: string, province: string | null, regionSlug: string | null) => ({ slug, province, regionSlug }) as GalleryItem;
    const items = [item("a", "Ontario", "toronto"), item("b", null, "us-texas"), item("c", "Florida", null)];
    expect(filterGallery(items, { country: "US" }).map((i) => i.slug)).toEqual(["b", "c"]);
    expect(filterGallery(items, { country: "CA" }).map((i) => i.slug)).toEqual(["a"]);
    expect(galleryCountry({ province: null, regionSlug: "united-states" })).toBe("US");
  });

  it("similar past contracts stay in the listing's country", () => {
    const award = (slug: string, province: string): PastAward => ({
      slug, title: slug, categories: ["HVAC"], province, regionName: null, date: "2026-09-01", winner: "Acme Mechanical Ltd", amount: 1000, winnerSlug: null,
    });
    const pool = [award("on", "Ontario"), award("tx", "Texas"), award("bc", "British Columbia")];
    expect(similarAwards({ slug: "x", categories: ["HVAC"], province: "Ontario" }, pool).map((a) => a.slug)).toEqual(["on", "bc"]);
    expect(similarAwards({ slug: "x", categories: ["HVAC"], province: "Ohio" }, pool).map((a) => a.slug)).toEqual(["tx"]);
  });

  it("the embed feed's country wildcards", () => {
    expect(embedFeedCountry("all")).toBe("CA");
    expect(embedFeedCountry("canada")).toBe("CA");
    expect(embedFeedCountry("united-states")).toBe("US");
    expect(embedFeedCountry("us")).toBe("US");
    expect(embedFeedCountry("toronto")).toBeNull();
  });
});

describe("emails only carry the recipient's country", () => {
  const regions = regionCountryMap([
    { id: "canada", country: "Canada" },
    { id: "ontario", country: "Canada" },
    { id: "united-states", country: "USA" },
    { id: "us-texas", country: "USA" },
  ]);

  it("decides a listing's and a company's country", () => {
    expect(listingCountry({ region_id: "canada", province: "Texas" }, regions)).toBe("US"); // mis-filed: the state wins
    expect(listingCountry({ region_id: "us-texas", province: null }, regions)).toBe("US");
    expect(listingCountry({ region_id: null, province: null }, regions)).toBe("CA");
    expect(orgCountries({ province: "Ontario" }, ["us-texas"], regions)).toEqual(new Set(["US"]));
    expect(orgCountries({ province: "Texas" }, [], regions)).toEqual(new Set(["US"]));
    expect(orgCountries({}, ["ontario", "us-texas"], regions)).toEqual(new Set(["CA", "US"]));
  });

  it("weekly free digest: no national or region-less tender crosses the border", () => {
    const tender = (id: string, region_id: string | null, province: string | null) => ({ id, region_id, province, rfp_categories: [{ category_id: "hvac" }] });
    const rfps = [
      tender("ca-national", "canada", null),
      tender("us-national", "united-states", null),
      tender("ca-none", null, "Ontario"),
      tender("us-none", null, "Texas"),
      tender("on", "ontario", "Ontario"),
      tender("tx", "us-texas", "Texas"),
    ];
    const nationals = new Set(["canada", "united-states"]);
    const usOrg = { categories: new Set(["hvac"]), regions: new Set(["us-texas"]), countries: orgCountries({}, ["us-texas"], regions) };
    const caOrg = { categories: new Set(["hvac"]), regions: new Set(["ontario"]), countries: orgCountries({}, ["ontario"], regions) };
    expect(freeDigestMatches(rfps, usOrg, nationals, regions).map((r) => r.id)).toEqual(["us-national", "us-none", "tx"]);
    expect(freeDigestMatches(rfps, caOrg, nationals, regions).map((r) => r.id)).toEqual(["ca-national", "ca-none", "on"]);
  });

  it("daily paid digest: a region-less listing only reaches its own country", () => {
    const rfp = (id: string, country: "CA" | "US"): DigestRfp => ({
      id, slug: id, title: id, deadline: "2099-01-01", regionId: null, regionName: null, categoryIds: ["hvac"], categoryNames: ["HVAC"], summary: null, country,
    });
    const digests = buildDigests({
      rfps: [rfp("ca", "CA"), rfp("us", "US")],
      paidOrgIds: ["caOrg", "usOrg"],
      catsByOrg: new Map([["caOrg", new Set(["hvac"])], ["usOrg", new Set(["hvac"])]]),
      regionsByOrg: new Map(),
      countriesByOrg: new Map<string, Set<"CA" | "US">>([["caOrg", new Set(["CA"])], ["usOrg", new Set(["US"])]]),
      usersByOrg: new Map([["caOrg", new Set(["u1"])], ["usOrg", new Set(["u2"])]]),
      emailByUser: new Map([["u1", "a@x.com"], ["u2", "b@x.com"]]),
      optedOut: new Set(),
      alreadySent: new Set(),
    });
    const by = new Map(digests.map((d) => [d.userId, d.items.map((i) => i.id)]));
    expect(by.get("u1")).toEqual(["ca"]);
    expect(by.get("u2")).toEqual(["us"]);
  });

  it("recently awarded: never the other country's awards", () => {
    const award = (id: string, country: "CA" | "US"): DigestAward => ({
      id, slug: id, title: id, winner: "Acme Ltd", value: null, amount: 1, date: "2026-10-01", regionId: "r", categoryIds: ["hvac"], categorySlugs: ["hvac"], country,
    });
    const out = recentAwardsByUser({
      awards: [award("ca", "CA"), award("us", "US")],
      paidOrgIds: ["o"],
      catsByOrg: new Map([["o", new Set(["hvac"])]]),
      regionsByOrg: new Map([["o", new Set(["r"])]]),
      usersByOrg: new Map([["o", new Set(["u"])]]),
      countriesByOrg: new Map([["o", new Set(["US" as const])]]),
    });
    expect(out.get("u")?.map((a) => a.id)).toEqual(["us"]);
  });
});
