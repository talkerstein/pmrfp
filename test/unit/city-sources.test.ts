import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CITY_SOURCES, NANAIMO, methodFor, type CitySourceConfig } from "@/lib/tenders/city-sources";
import {
  cityHosts,
  cityRowToRfpInsert,
  citySourceGate,
  classifyCityRow,
  inspectBidsPage,
  parseCityList,
  parseHtmlList,
  readDate,
  robotsAllows,
  type CityRow,
} from "@/lib/tenders/city-list";
import { citySyncSources, fetchCityList } from "@/lib/tenders/city-run";
import {
  PERMISSION_SEED,
  buyerPageCta,
  buyerPermission,
  hostOf,
  importAllowed,
  isBlockedUrl,
  mergePermissions,
  seedRefused,
  seedRegistry,
  type BuyerPermission,
} from "@/lib/buyers/permissions";
import { canOpenOfficialLink } from "@/lib/access/free-actions";
import { publicTenderSource } from "@/lib/tenders/sources";
import { buyerFromSummary } from "@/lib/seo/rfp-meta";
import { creditFor } from "@/lib/data-credits";
import DIRECTORY from "@/lib/buyers/directory.json";

/**
 * The city flow (lib/tenders/city-sources): Nanaimo against a saved copy of
 * its real bid page, the generic parsers against small pages in the shapes
 * municipal sites use, and the permission gate (a "no" never imports).
 */

const fixture = (f: string) => readFileSync(join(process.cwd(), "test/unit/fixtures", f), "utf8");
const today = "2026-10-21";

describe("Nanaimo (page saved 2026-10-21)", () => {
  const html = fixture("nanaimo-bid-opportunities.html");
  const robots = fixture("nanaimo-robots.txt");

  it("robots.txt allows the bid page (and the parser reads its real rules)", () => {
    expect(robotsAllows(robots, NANAIMO.officialUrl)).toBe(true);
    expect(robotsAllows(robots, "https://www.nanaimo.ca/user/profile")).toBe(false);
    expect(robotsAllows(robots, "https://www.nanaimo.ca/bylaws/Search")).toBe(false);
  });

  it("the page lists no bids of its own: they're on bids&tenders", () => {
    const check = inspectBidsPage(html);
    expect(check.hostedOn).toBe("bids-and-tenders");
    expect(check.bidTables).toBe(0);
    expect(check.closingDates).toBe(0);
    expect(check.platformLinks[0]).toEqual({ platform: "bids-and-tenders", url: NANAIMO.list.kind === "platform" ? NANAIMO.list.portalUrl : "" });
    expect(check.emails).toContain("procurement@nanaimo.ca");
  });

  it("the config matches the page and the directory", () => {
    expect(NANAIMO.list.kind).toBe("platform");
    expect(methodFor(NANAIMO.list)).toBeNull();
    expect(inspectBidsPage(html).emails).toContain(NANAIMO.contact.email);
    const row = (DIRECTORY as { slug: string; tendersUrl: string | null; provinceCode: string; name: string }[]).find((b) => b.slug === NANAIMO.buyerSlug);
    expect(row).toMatchObject({ tendersUrl: NANAIMO.officialUrl, provinceCode: "BC", name: NANAIMO.buyer });
    expect(html).toContain(NANAIMO.contact.phone!);
  });

  it("nothing on the page would import, and nothing points us at the platform", () => {
    expect(parseCityList(html, NANAIMO)).toEqual([]);
    // Even read as a generic list, the only links are the City's own navigation: no dates, no platform URLs.
    const guess = parseHtmlList(html, { kind: "html-list", url: NANAIMO.officialUrl, item: /<li\b[^>]*>([\s\S]*?)<\/li>/gi }, cityHosts(NANAIMO));
    expect(guess.every((r) => hostOf(r.url)?.endsWith("nanaimo.ca"))).toBe(true);
    expect(guess.filter((r) => classifyCityRow(r, today).length)).toEqual([]);
  });

  it("is never read: permission yes, but bids&tenders is link-out only", () => {
    const gate = citySourceGate(NANAIMO, seedRegistry());
    expect(gate).toMatchObject({ run: false });
    expect(gate.run ? "" : gate.reason).toMatch(/bids-and-tenders/);
    const fetcher = vi.fn();
    const plan = citySyncSources(seedRegistry(), CITY_SOURCES, fetcher);
    expect(plan.sources).toEqual([]);
    expect(plan.skipped).toEqual([{ key: "nanaimo", reason: expect.stringMatching(/link only/) }]);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("a Nanaimo row reads 'Listed with permission from the City of Nanaimo · View and bid on the official posting'", () => {
    const src = publicTenderSource("arena-roof-replacement-nnmo-0123456789ab");
    expect(src.key).toBe("nanaimo");
    expect(src.permission).toMatchObject({ buyerSlug: "city-of-nanaimo", issuer: "the City of Nanaimo", contactEmail: "procurement@nanaimo.ca" });
    expect(src.bidLabel).toBe("View and bid on the official posting");
    expect(src.attribution).toMatch(/^Listed with permission from the City of Nanaimo\./);
    // Its credit has French and Spanish versions (lib/data-credits).
    expect(creditFor(src.attribution)?.fr).toMatch(/autorisation de la Ville de Nanaimo/);
    expect(creditFor(src.attribution)?.es).toMatch(/permiso de la Ciudad de Nanaimo/);
  });

  it("follows the rightmost-marker rule", () => {
    expect(publicTenderSource("nnmo-hall-roof-tor-qc-cb-cw2466670").key).toBe("canadabuys");
    expect(publicTenderSource("roof-cb-tor-qc-nnmo-0123456789ab").key).toBe("nanaimo");
    // A non-hex ref isn't a Nanaimo row.
    expect(publicTenderSource("roof-nnmo-not-a-hex-ref").key).toBe("canadabuys");
  });
});

describe("city configs", () => {
  it("each has a unique marker, a directory buyer and French and Spanish copy", () => {
    const markers = new Set<string>();
    for (const c of CITY_SOURCES) {
      expect(c.marker).toMatch(/^[a-z]{3,6}$/);
      expect(markers.has(c.marker)).toBe(false);
      markers.add(c.marker);
      expect((DIRECTORY as { slug: string }[]).some((b) => b.slug === c.buyerSlug), c.buyerSlug).toBe(true);
      for (const lang of ["fr", "es"] as const) expect(c.copy[lang].attribution).not.toBe(c.copy.en.attribution);
    }
  });
});

/* ------------------------------------------------------------------ generic parsers */

// Small pages in the shapes municipal bid lists come in (made up for the test, modelled on the
// feed-map notes: a "Title | No. | Posted | Closing | Status" table, dated blocks, an RSS feed).
const TABLE_PAGE = `<html><body><nav><a href="/x">Menu</a></nav><main>
<table class="bids">
  <thead><tr><th>Title</th><th>No.</th><th>Posted</th><th>Closing</th><th>Status</th></tr></thead>
  <tbody>
    <tr><td><a href="/business/bids/roof-replacement-fire-hall-2">Roof Replacement &amp; Repairs &ndash; Fire Hall 2</a></td><td>RFT 2026-14</td><td>Oct 14, 2026</td><td data-sort-value="20261112140000">Nov 12, 2026 2:00 PM</td><td>Open</td></tr>
    <tr><td><a href="https://www.testville.ca/business/bids/janitorial">Janitorial Services – City Hall</a></td><td>RFP 2026-15</td><td>2026-10-01</td><td>2026-11-20</td><td>Open</td></tr>
    <tr><td><a href="/business/bids/hvac-old">HVAC Maintenance</a></td><td>2026-02</td><td>Feb 1, 2026</td><td>Mar 3, 2026</td><td>Awarded</td></tr>
    <tr><td><a href="https://testville.bidsandtenders.ca/Module/Tenders/en/Tender/Detail/abc">Elevator Modernization</a></td><td>2026-16</td><td></td><td>Nov 30, 2026</td><td>Open</td></tr>
    <tr><td><a href="/business/bids/salt">Supply of Road Salt</a></td><td>2026-17</td><td></td><td>Nov 9, 2026</td><td>Open</td></tr>
  </tbody>
</table></main></body></html>`;

const LIST_PAGE = `<main><div class="intro">Bid opportunities. Closing dates are local time.</div>
<article class="bid"><h3><a href="/bids/123">Arena Boiler Replacement</a></h3><p>Bid No. ITT-26-031</p><p>Closing Date: Tuesday, November 17, 2026 at 2:00 PM</p></article>
<article class="bid"><h3><a href="/bids/124">Parks Washroom Renovation</a></h3><p>Bid No. ITT-26-032</p><p>Closes 3 December 2026</p></article>
<article class="bid"><h3><a href="mailto:purchasing@testville.ca">Ask a question</a></h3></article>
</main>`;

const RSS = `<?xml version="1.0"?><rss version="2.0"><channel><title>Bids</title>
<item><title><![CDATA[Library Flooring Replacement]]></title><link>https://www.testville.ca/bids/200</link>
<description>&lt;p&gt;Bid No. 2026-40. Closing Date: November 25, 2026&lt;/p&gt;</description><pubDate>Mon, 19 Oct 2026 15:00:00 GMT</pubDate></item>
<item><title>Painting of Community Centre (closes 2026-12-04)</title><link>https://www.testville.ca/bids/201</link><description>Exterior painting.</description></item>
<item><title>Off-site notice</title><link>https://www.merx.com/x/1</link><description>Closing Date: November 25, 2026</description></item>
</channel></rss>`;

const base = (list: CitySourceConfig["list"], over: Partial<CitySourceConfig> = {}): CitySourceConfig => ({
  key: "testville",
  marker: "tstv",
  buyerSlug: "city-of-testville",
  buyer: "City of Testville",
  issuer: "the City of Testville",
  provinceCode: "BC",
  province: "British Columbia",
  regionSlug: "british-columbia",
  officialUrl: "https://www.testville.ca/business/bids",
  contact: { name: "City of Testville Purchasing", email: "purchasing@testville.ca", phone: null },
  list,
  copy: { en: NANAIMO.copy.en, fr: NANAIMO.copy.fr, es: NANAIMO.copy.es },
  checkedOn: today,
  ...over,
});

const TABLE = base({ kind: "html-table", url: "https://www.testville.ca/business/bids", columns: { title: /^title/i, closing: /closing/i, reference: /^no/i, posted: /posted/i, status: /status/i } });
const LIST = base({ kind: "html-list", url: "https://www.testville.ca/business/bids", item: /<article class="bid">([\s\S]*?)<\/article>/g, reference: /Bid No\.\s*([A-Z0-9-]+)/ });
const FEED = base({ kind: "rss", url: "https://www.testville.ca/bids/rss.xml", reference: /Bid No\.\s*([A-Z0-9-]+)/ });

describe("generic parsers", () => {
  it("reads the dates municipal pages write", () => {
    expect(readDate("2026-11-03")).toBe("2026-11-03");
    expect(readDate("2026/11/3")).toBe("2026-11-03");
    expect(readDate("Nov 3, 2026")).toBe("2026-11-03");
    expect(readDate("Tuesday, November 17, 2026 at 2:00 PM")).toBe("2026-11-17");
    expect(readDate("Sept. 3 2026")).toBe("2026-09-03");
    expect(readDate("3rd December 2026")).toBe("2026-12-03");
    expect(readDate("Date 4 2026")).toBeNull();
    expect(readDate("03/11/2026")).toBeNull(); // ambiguous: not guessed
    expect(readDate("February 30, 2026")).toBeNull();
  });

  it("html-table: columns by header, own-site links only, machine dates first", () => {
    const rows = parseCityList(TABLE_PAGE, TABLE);
    expect(rows.map((r) => r.title)).toEqual(["Roof Replacement & Repairs – Fire Hall 2", "Janitorial Services – City Hall", "HVAC Maintenance", "Supply of Road Salt"]);
    expect(rows[0]).toEqual({ url: "https://www.testville.ca/business/bids/roof-replacement-fire-hall-2", title: "Roof Replacement & Repairs – Fire Hall 2", reference: "RFT 2026-14", closing: "2026-11-12", posted: "2026-10-14", status: "Open" });
    // The bids&tenders row is dropped: never a platform URL.
    expect(rows.some((r) => r.url.includes("bidsandtenders"))).toBe(false);
    // Awarded, past and supply calls don't import; building work does.
    expect(rows.map((r) => classifyCityRow(r, today))).toEqual([["roofing"], ["cleaning-janitorial"], [], []]);
  });

  it("html-list: one notice per item, closing date from the text", () => {
    const rows = parseCityList(LIST_PAGE, LIST);
    expect(rows).toEqual([
      { url: "https://www.testville.ca/bids/123", title: "Arena Boiler Replacement", reference: "ITT-26-031", closing: "2026-11-17", posted: null, status: null },
      { url: "https://www.testville.ca/bids/124", title: "Parks Washroom Renovation", reference: "ITT-26-032", closing: "2026-12-03", posted: null, status: null },
    ]);
    expect(classifyCityRow(rows[0], today)).toEqual(["hvac"]);
    expect(classifyCityRow(rows[1], today)).toEqual(["general-contracting"]);
  });

  it("rss: CDATA and escaped descriptions, closing date from the description or title", () => {
    const rows = parseCityList(RSS, FEED);
    expect(rows).toEqual([
      { url: "https://www.testville.ca/bids/200", title: "Library Flooring Replacement", reference: "2026-40", closing: "2026-11-25", posted: "2026-10-19", status: null },
      { url: "https://www.testville.ca/bids/201", title: "Painting of Community Centre (closes 2026-12-04)", reference: null, closing: "2026-12-04", posted: null, status: null },
    ]);
  });

  it("rows become rfp_posts in the municipal shape: our summary, closing date, contact, official link", () => {
    const row: CityRow = parseCityList(TABLE_PAGE, TABLE)[0];
    const ins = cityRowToRfpInsert(row, TABLE, today)!;
    expect(ins.slug).toMatch(/^roof-replacement-repairs-fire-hall-2-tstv-[a-f0-9]{12}$/);
    expect(ins).toMatchObject({
      province: "British Columbia",
      deadline: "2026-11-12",
      source_type: "public_source",
      source_url: row.url,
      contact_email: "purchasing@testville.ca",
      contact_visibility: "public_contact",
      status: "published",
      is_demo: false,
    });
    expect(ins.summary).toBe("Public tender from City of Testville (RFT 2026-14), British Columbia: Roof Replacement & Repairs – Fire Hall 2. Closes November 12, 2026.");
    expect(buyerFromSummary(ins.summary)).toBe("City of Testville");
    expect(ins.source_notes).toContain("Listed with permission");
    // Stable identity: the same posting URL always gives the same slug.
    expect(cityRowToRfpInsert({ ...row, title: row.title }, TABLE, "2026-10-30")!.slug).toBe(ins.slug);
    expect(cityRowToRfpInsert({ ...row, closing: null }, TABLE, today)).toBeNull();
  });
});

/* ------------------------------------------------------------------ gating */

const yes = (buyerSlug: string, method: BuyerPermission["method"] = "read_public_page"): BuyerPermission => ({
  buyerSlug,
  buyerName: buyerSlug,
  provinceCode: "BC",
  country: "CA",
  scope: "buyer",
  status: "yes",
  method,
  grantedOn: today,
  contact: null,
  quote: null,
  origin: "db",
});

describe("permission gating", () => {
  it("seeds every logged reply (Canada only)", () => {
    const by = new Map(PERMISSION_SEED.map((p) => [p.buyerSlug, p]));
    // Yes to being listed; no method yet (no list on its own page), so nothing can import.
    expect(by.get("city-of-nanaimo")).toMatchObject({ status: "yes", method: null, grantedOn: "2026-10-20", provinceCode: "BC", scope: "buyer" });
    for (const m of ["read_public_page", "email_notices", "feed"] as const) expect(importAllowed(seedRegistry(), "city-of-nanaimo", m)).toBe(false);
    expect(by.get("nbon")).toMatchObject({ status: "link_only", scope: "platform" });
    for (const slug of ["town-of-cochrane", "bc-bid", "city-of-kawartha-lakes", "town-of-newmarket", "edmonton-public-schools"]) {
      expect(by.get(slug)?.status, slug).toBe("no");
      expect(seedRefused(slug)).toBe(true);
    }
    // COMMBUYS (Massachusetts) is a U.S. permission: not in the Canadian registry.
    expect([...by.keys()].some((k) => /commbuys/.test(k))).toBe(false);
    // Cochrane AB is not the Cochrane District Services Board (ON).
    expect(seedRefused("cochrane-district-services-board-cdsb-formerly-cochrane-dssab")).toBe(false);
  });

  it("the migration seeds the same rows", () => {
    const sql = readFileSync(join(process.cwd(), "supabase/migrations/20261021000010_buyer_sources.sql"), "utf8");
    for (const p of PERMISSION_SEED) expect(sql, p.buyerSlug).toMatch(new RegExp(`\\('${p.buyerSlug}',[^\\n]*'${p.status}'`));
  });

  const NEWMARKET = base({ kind: "html-table", url: "https://www.newmarket.ca/business-development/procurement", columns: { title: /title/i, closing: /closing/i } }, { key: "newmarket", marker: "nwmk", buyerSlug: "town-of-newmarket", buyer: "Town of Newmarket", officialUrl: "https://www.newmarket.ca/business-development/procurement" });

  it("a 'no' buyer never imports, even if a database row says yes", () => {
    const registry = mergePermissions([yes("town-of-newmarket")]);
    expect(buyerPermission(registry, "town-of-newmarket")?.status).toBe("no");
    expect(importAllowed(registry, "town-of-newmarket", "read_public_page")).toBe(false);
    expect(citySourceGate(NEWMARKET, registry)).toEqual({ run: false, reason: "permission: no" });
    const fetcher = vi.fn(async () => TABLE_PAGE);
    const plan = citySyncSources(registry, [NEWMARKET], fetcher);
    expect(plan.sources).toEqual([]);
    expect(fetcher).not.toHaveBeenCalled();
    expect(buyerPageCta(buyerPermission(registry, "town-of-newmarket"))).toBe("none");
  });

  it("pending, link-only, unknown and wrong-method buyers don't import", () => {
    expect(citySourceGate(TABLE, seedRegistry())).toEqual({ run: false, reason: "no permission on file" });
    expect(citySourceGate(TABLE, mergePermissions([{ ...yes("city-of-testville"), status: "pending", method: null }]))).toMatchObject({ run: false, reason: "permission: pending" });
    expect(citySourceGate(TABLE, mergePermissions([{ ...yes("city-of-testville"), status: "link_only", method: null }]))).toMatchObject({ run: false });
    expect(citySourceGate(TABLE, mergePermissions([yes("city-of-testville", "email_notices")]))).toMatchObject({ run: false, reason: expect.stringMatching(/method/) });
    expect(citySourceGate(FEED, mergePermissions([yes("city-of-testville", "read_public_page")]))).toMatchObject({ run: false });
    expect(buyerPageCta(null)).toBe("invite");
    expect(buyerPageCta({ ...yes("x"), status: "link_only" })).toBe("invite");
    expect(buyerPageCta(yes("x"))).toBe("listed");
  });

  it("never reads a bid platform or BC Bid, whatever the permission says", () => {
    const registry = mergePermissions([yes("city-of-testville")]);
    for (const url of ["https://testville.bidsandtenders.ca/Module/Tenders/en", "https://testville.bonfirehub.ca/portal", "https://www.bcbid.gov.bc.ca/page.aspx/en/rfp/request_browse_public", "https://www.merx.com/x"]) {
      expect(isBlockedUrl(url, registry), url).toBe(true);
      const cfg = base({ kind: "html-table", url, columns: TABLE.list.kind === "html-table" ? TABLE.list.columns : { title: /t/, closing: /c/ } }, { hosts: [hostOf(url)!] });
      expect(citySourceGate(cfg, registry).run, url).toBe(false);
    }
    expect(isBlockedUrl("https://www.saanich.ca/EN/main/business/selling-to-saanich/bid-opportunities.html", registry)).toBe(false);
    expect(isBlockedUrl("ftp://www.testville.ca/x", registry)).toBe(true);
  });

  it("a 'yes' with the matching method runs: one read, Canadian rows", async () => {
    const registry = mergePermissions([yes("city-of-testville")]);
    const fetcher = vi.fn(async () => TABLE_PAGE);
    const plan = citySyncSources(registry, [TABLE], fetcher);
    expect(plan.skipped).toEqual([]);
    expect(plan.sources.map((s) => s.key)).toEqual(["testville"]);
    const candidates = await plan.sources[0].collect(today);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(candidates.map((c) => [c.insert.title, c.categories, c.regionSlug])).toEqual([
      ["Roof Replacement & Repairs – Fire Hall 2", ["roofing"], "british-columbia"],
      ["Janitorial Services – City Hall", ["cleaning-janitorial"], "british-columbia"],
    ]);
    expect(plan.sources[0].fallbackRegion).toBe("canada");
  });
});

describe("polite fetch (robots.txt, one list read, own-site redirects only)", () => {
  const registry = mergePermissions([yes("city-of-testville")]);
  afterEach(() => vi.unstubAllGlobals());

  function stubFetch(routes: Record<string, () => Response>) {
    const calls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      calls.push(url);
      expect((init?.headers as Record<string, string>)["User-Agent"]).toMatch(/^PMRFP tender indexer/);
      expect(init?.redirect).toBe("manual");
      const route = routes[url];
      return route ? route() : new Response("not found", { status: 404 });
    }));
    return calls;
  }

  it("reads robots.txt, then the list once", async () => {
    const calls = stubFetch({ "https://www.testville.ca/business/bids": () => new Response(TABLE_PAGE, { status: 200 }) });
    const body = await fetchCityList(TABLE, registry, AbortSignal.timeout(5000));
    expect(body).toContain("Fire Hall 2");
    expect(calls).toEqual(["https://www.testville.ca/robots.txt", "https://www.testville.ca/business/bids"]);
  });

  it("stops when robots.txt disallows the page or can't be read", async () => {
    stubFetch({ "https://www.testville.ca/robots.txt": () => new Response("User-agent: *\nDisallow: /business/", { status: 200 }) });
    await expect(fetchCityList(TABLE, registry, AbortSignal.timeout(5000))).rejects.toThrow(/robots\.txt disallows/);
    vi.unstubAllGlobals();
    stubFetch({ "https://www.testville.ca/robots.txt": () => new Response("", { status: 503 }) });
    await expect(fetchCityList(TABLE, registry, AbortSignal.timeout(5000))).rejects.toThrow(/robots\.txt unavailable/);
  });

  it("honours a rule written for PMRFP over the * group", () => {
    const txt = "User-agent: *\nDisallow: /\n\nUser-agent: PMRFP\nAllow: /business/bids\nDisallow: /";
    expect(robotsAllows(txt, "https://www.testville.ca/business/bids")).toBe(true);
    expect(robotsAllows(txt, "https://www.testville.ca/other")).toBe(false);
    expect(robotsAllows("User-agent: *\nDisallow: /*.pdf$", "https://www.testville.ca/a.pdf")).toBe(false);
    expect(robotsAllows("User-agent: *\nDisallow: /*.pdf$", "https://www.testville.ca/a.pdf?x=1")).toBe(true);
  });

  it("never follows a redirect onto a bid platform", async () => {
    const calls = stubFetch({
      "https://www.testville.ca/business/bids": () => new Response(null, { status: 302, headers: { location: "https://testville.bidsandtenders.ca/Module/Tenders/en" } }),
    });
    await expect(fetchCityList(TABLE, registry, AbortSignal.timeout(5000))).rejects.toThrow(/refusing to read/);
    expect(calls.some((u) => u.includes("bidsandtenders"))).toBe(false);
  });

  it("a platform-hosted city is never fetched at all", async () => {
    const calls = stubFetch({});
    await expect(fetchCityList(NANAIMO, seedRegistry(), AbortSignal.timeout(5000))).rejects.toThrow(/nothing is read/);
    expect(calls).toEqual([]);
  });
});

describe("the official link of a public-buyer listing never needs a paid plan", () => {
  const free = { primaryRole: "trade", hasTradeAccess: false };
  it("any account opens it; a listing with the buyer's permission opens for everyone", () => {
    expect(canOpenOfficialLink(free, "public_source", false)).toBe(true);
    expect(canOpenOfficialLink(null, "public_source", true)).toBe(true);
    expect(canOpenOfficialLink(null, "public_source", false)).toBe(false); // free account first (unchanged)
    expect(canOpenOfficialLink(null, "pm_posted", true)).toBe(false);
  });

  it("the RFP page links the official posting and shows the permission line", () => {
    const page = readFileSync(join(process.cwd(), "src/app/[lang]/(v3)/rfps/[slug]/page.tsx"), "utf8");
    expect(page).toContain("canOpenOfficialLink(viewer, teaser.sourceType, Boolean(permission))");
    expect(page).toContain("t.permission.listed");
    expect(page).toContain('data-cta="official-posting"');
  });
});
