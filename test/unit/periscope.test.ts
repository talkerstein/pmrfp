import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import {
  MAX_DETAILS,
  classifyPeriscope,
  detailUrl,
  exportForm,
  fetchPeriscopeOpenBids,
  parsePeriscopeCsv,
  parsePeriscopeDetail,
  periscopeDate,
  periscopeOpenTotal,
  periscopeToRfpInsert,
  repairPeriscopeText,
  type PeriscopeBid,
} from "@/lib/tenders/periscope";
import { COMMBUYS_ATTRIBUTION, ENABLED_PERISCOPE_SITES, PERISCOPE_SITES } from "@/lib/tenders/periscope-sites";
import { periscopeSource } from "@/lib/tenders/periscope-source";
import { publicTenderSource } from "@/lib/tenders/sources";
import { syncPublicSources, type ExistingRow } from "@/lib/tenders/sync";
import { getDictionary } from "@/i18n/dictionaries";

// Saved from the live COMMBUYS board on 2026-10-15 (trimmed).
const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
const CSV = fixture("commbuys-open-bids.csv");
const SEARCH = fixture("commbuys-search.html");
const DETAIL = fixture("commbuys-bid-detail.html");

const TODAY = "2026-10-15";
const COMMBUYS = PERISCOPE_SITES.find((s) => s.key === "commbuys")!;
const bids = parsePeriscopeCsv(CSV);
const byTitle = (part: string) => bids.find((b) => b.title.includes(part))!;

describe("Periscope sites", () => {
  it("only COMMBUYS is enabled", () => {
    expect(ENABLED_PERISCOPE_SITES.map((s) => s.key)).toEqual(["commbuys"]);
    expect(COMMBUYS).toMatchObject({ base: "https://www.commbuys.com", state: "Massachusetts", regionSlug: "us-massachusetts" });
    expect(new Set(PERISCOPE_SITES.map((s) => s.marker)).size).toBe(PERISCOPE_SITES.length);
  });

  it("credits COMMBUYS in en/fr/es", () => {
    expect(publicTenderSource("roof-replacement-commbuys-134090").attribution).toBe(
      "Source: COMMBUYS (Commonwealth of Massachusetts) — public bid notice",
    );
    expect(getDictionary("fr").board.detail.sources.commbuys.attribution).toBe(
      "Source : COMMBUYS (Commonwealth of Massachusetts) — avis d'appel d'offres public",
    );
    expect(getDictionary("es").board.detail.sources.commbuys.attribution).toBe(
      "Fuente: COMMBUYS (Commonwealth of Massachusetts) — aviso de licitación pública",
    );
  });
});

describe("COMMBUYS CSV export", () => {
  it("parses standard bids and drops legacy S-numbers", () => {
    expect(bids).toHaveLength(18);
    expect(bids.some((b) => b.number.startsWith("S"))).toBe(false);
    expect(bids[0]).toEqual({
      number: "BD-27-1167-PUR02-PUR01-134522",
      seq: "134522",
      organization: "City of Springfield",
      title: "27-058 Construction Management at Risk Services, German Gerena Community School – Prequal",
      closing: "2026-11-10",
      status: "Sent",
      alternateId: "",
    });
  });

  it("repairs the export's double-encoded punctuation", () => {
    expect(byTitle("Turnover").title).toBe("3-bedroom unit Turnover – #39, 9 Newtowne Ct, Cambridge, MA 02139");
    expect(byTitle("Madison Park").title).toMatch(/^Project 7365 Owner's Project Manager Services/);
    expect(repairPeriscopeText("Authority�??s Federally aided")).toBe("Authority's Federally aided");
    expect(repairPeriscopeText("Plain title, no damage")).toBe("Plain title, no damage");
  });

  it("reads dates in both list and detail formats", () => {
    expect(periscopeDate("11/10/2026 2:00 PM")).toBe("2026-11-10");
    expect(periscopeDate("10/29/2026 02:00:00 PM")).toBe("2026-10-29");
    expect(periscopeDate("1/5/2027")).toBe("2027-01-05");
    expect(periscopeDate("")).toBeNull();
    expect(periscopeDate("Continuous")).toBeNull();
  });

  it("finds the export command, view state and open count on the search page", () => {
    const body = exportForm(SEARCH)!;
    expect(body.get("javax.faces.ViewState")).toBeTruthy();
    expect(body.get("bidSearchResultsForm")).toBe("bidSearchResultsForm");
    expect(body.get("openBids")).toBe("true");
    expect(body.get("bidSearchResultsForm:bidResultId:j_idt403")).toBe("bidSearchResultsForm:bidResultId:j_idt403");
    expect(periscopeOpenTotal(SEARCH)).toBe(909);
    expect(exportForm("<html>maintenance page</html>")).toBeNull();
  });
});

describe("trade filter", () => {
  const trades = (part: string) => classifyPeriscope(byTitle(part), TODAY);

  it("keeps building and property work", () => {
    expect(trades("Plumbing and HVAC")).toEqual(["hvac", "plumbing"]);
    expect(trades("Replacement Windows")).toEqual(["glass-and-windows"]);
    expect(trades("Pest Control")).toEqual(["pest-control"]);
    expect(trades("Roof Replacement")).toEqual(["roofing"]);
    expect(trades("Snow and Ice Removal")).toEqual(["snow-removal"]);
    expect(trades("Turnover")).toEqual(["general-contracting"]);
  });

  it("is not fooled by place names or 'testing' in a maintenance contract", () => {
    // "Cambridge" holds "bridge", "Broadway" holds "roadway" (shared CIVIL words).
    expect(trades("Janitorial Services for Cambridge")).toEqual(["cleaning-janitorial"]);
    expect(trades("Broadway Sub Station Renovation")).toEqual(["general-contracting"]);
    expect(trades("Fire Alarm Testing")).toEqual(["fire-safety"]);
  });

  it("drops utilities, design, project management, goods and non-building work", () => {
    for (const t of ["Water Main", "architectural services", "Owner's Project Manager", "HOT MIX ASPHALT", "Hand Tub Fire Apparatus", "Third-Party Logistics"]) {
      expect(trades(t), t).toEqual([]);
    }
  });

  it("keeps only bids still open for responses with a future closing date", () => {
    // "Opened" (multi-year contract under award) and "Bid to PO" are not biddable.
    expect(trades("Vessel Support")).toEqual([]);
    // Status still "Sent", but the opening date has passed.
    expect(trades("LIFETIME ANNUITY")).toEqual([]);
    const roof = byTitle("Roof Replacement");
    expect(classifyPeriscope({ ...roof, closing: "2026-10-14" }, TODAY)).toEqual([]);
    expect(classifyPeriscope({ ...roof, closing: TODAY }, TODAY)).toEqual(["roofing"]);
    expect(classifyPeriscope({ ...roof, closing: null }, TODAY)).toEqual([]);
  });
});

describe("bid detail page", () => {
  const detail = parsePeriscopeDetail(DETAIL)!;

  it("reads the header fields", () => {
    expect(detail).toMatchObject({
      department: "Sandwich Housing Authority",
      bidType: "OPEN",
      purchaseMethod: "Open Market",
      available: "2026-10-15",
      preBid: "by appointment only",
    });
    expect(detail.bulletin).toMatch(/^The Sandwich Housing Authority, the Awarding Authority, invites written quotes/);
    expect(parsePeriscopeDetail("<html>Bid not found</html>")).toBeNull();
  });

  it("builds an attributed Massachusetts listing that links to the bid's own page", () => {
    const bid = byTitle("Plumbing and HVAC");
    const row = periscopeToRfpInsert(COMMBUYS, bid, TODAY, detail)!;
    expect(row.slug).toBe("plumbing-and-hvac-maintenance-and-repairs-service-contract-commbuys-134506");
    expect(row.source_url).toBe(
      "https://www.commbuys.com/bso/external/bidDetail.sda?docId=BD-26-1923-SHA00-SHA00-134506&external=true&parentUrl=close",
    );
    expect(row.province).toBe("Massachusetts");
    expect(row.deadline).toBe("2026-10-29");
    expect(row.source_type).toBe("public_source");
    expect(row.source_notes).toContain(COMMBUYS_ATTRIBUTION);
    expect(row.summary).toMatch(/^Massachusetts\. Sandwich Housing Authority: The Sandwich Housing Authority, the Awarding Authority/);
    expect(row.scope).toContain("Bid type: Open bid · Open Market.");
    expect(row.scope).toContain("Pre-bid conference: by appointment only.");
    expect(row.published_at).toBe(`${TODAY}T00:00:00Z`);
    expect(row.contact_email).toBeNull();
    expect(publicTenderSource(row.slug)).toMatchObject({ key: "commbuys", past: false, badge: "Public tender · Massachusetts" });
  });

  it("still builds a listing from the CSV row alone", () => {
    const row = periscopeToRfpInsert(COMMBUYS, byTitle("Roof Replacement"), TODAY)!;
    expect(row.summary).toBe("Massachusetts. Town of Brookline: Roof Replacement");
    expect(row.scope).toBe("Bid BD-25-1250-1560-1560-134090 — Roof Replacement.");
  });
});

describe("source suffix: rightmost marker", () => {
  const key = (slug: string) => publicTenderSource(slug).key;

  it("a COMMBUYS slug keeps its source whatever its title says", () => {
    expect(key("roof-replacement-commbuys-134090")).toBe("commbuys");
    expect(key("tor-qc-cb-yk-nsa-roof-scbo-commbuys-134090")).toBe("commbuys");
    expect(key("us-border-debid-roof-commbuys-134090")).toBe("commbuys");
  });

  it("'commbuys' in another importer's title never claims it", () => {
    expect(key("commbuys-style-roof-scbo-69032")).toBe("scbo");
    expect(key("roof-commbuys-replacement-cb-cw2466670")).toBe("canadabuys");
    expect(key("commbuys-renovation-qc-ao-21243")).toBe("seao");
    // The reference must be the all-digit sequence.
    expect(key("roof-commbuys-bd-27-1167")).toBe("canadabuys");
  });

  it("disabled sites already have their own markers", () => {
    expect(key("roof-orbuys-123456")).toBe("oregonbuys");
    expect(key("roof-arbuy-123456")).toBe("arbuy");
  });
});

describe("fetching (polite, two requests)", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("GETs the search page, then POSTs its CSV export with the session cookie", async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const search = SEARCH.replace("1-25 of 909", "1-25 of 19");
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      if (calls.length === 1) return new Response(search, { headers: { "Set-Cookie": "JSESSIONID=abc; Path=/bso" } });
      return new Response(CSV, { headers: { "Content-Type": "text/csv;charset=UTF-8" } });
    });
    const { bids: got, total } = await fetchPeriscopeOpenBids(COMMBUYS, undefined, 0);
    expect(got).toHaveLength(18);
    expect(total).toBe(19);
    expect(calls).toHaveLength(2);
    expect(calls[0].url).toBe("https://www.commbuys.com/bso/view/search/external/advancedSearchBid.xhtml?openBids=true");
    expect(calls[1].init?.method).toBe("POST");
    const headers = calls[1].init?.headers as Record<string, string>;
    expect(headers["User-Agent"]).toMatch(/^PMRFP tender indexer/);
    expect(headers.Cookie).toContain("JSESSIONID=abc");
    expect(String(calls[1].init?.body)).toContain("javax.faces.ViewState=");
  });

  it("refuses a short export so the run can't archive the rest", async () => {
    vi.stubGlobal("fetch", async (url: string) =>
      url.includes("openBids") ? new Response(SEARCH) : new Response(CSV, { headers: { "Content-Type": "text/csv" } }),
    );
    await expect(fetchPeriscopeOpenBids(COMMBUYS, undefined, 0)).rejects.toThrow(/CSV has 18 bids, search page says 909/);
  });

  it("refuses an HTML error page in place of the CSV", async () => {
    vi.stubGlobal("fetch", async (url: string) => (url.includes("openBids") ? new Response(SEARCH) : new Response("<html>error</html>", { headers: { "Content-Type": "text/html" } })));
    await expect(fetchPeriscopeOpenBids(COMMBUYS, undefined, 0)).rejects.toThrow(/returned text\/html/);
  });
});

describe("sync: enrichment and archive scoping", () => {
  const roofBid = (seq: number): PeriscopeBid => ({
    number: `BD-27-1000-ABC01-ABC01-${seq}`,
    seq: String(seq),
    organization: "Town of Example",
    title: `Roof Replacement ${seq}`,
    closing: "2026-11-20",
    status: "Sent",
    alternateId: "",
  });
  const feed = Array.from({ length: 25 }, (_, i) => roofBid(200000 + i));
  const existing = (slug: string, url: string): ExistingRow => ({ id: slug, slug, title: "t", region_id: null, source_url: url, status: "published", deadline: "2026-11-20", summary: "s" });

  function fakeDb(rows: ExistingRow[]) {
    const result = (data: unknown) => {
      const q = { eq: () => q, order: () => q, range: () => Promise.resolve({ data, error: null }), then: (f: (v: unknown) => unknown) => Promise.resolve({ data, error: null }).then(f) };
      return q;
    };
    return {
      from: (table: string) => ({
        select: () => result(table === "rfp_posts" ? rows : table === "regions" ? [{ id: "ma", slug: "us-massachusetts" }] : [{ id: "r", slug: "roofing" }]),
      }),
    } as unknown as Parameters<typeof syncPublicSources>[0];
  }

  it("reads detail pages only for new bids, and archives only COMMBUYS rows that left the feed", async () => {
    const listed = feed[0];
    const db = fakeDb([
      existing(`roof-replacement-${listed.seq}-commbuys-${listed.seq}`, detailUrl(COMMBUYS, listed.number)),
      existing("old-roof-commbuys-100001", detailUrl(COMMBUYS, "BD-26-1000-ABC01-ABC01-100001")),
      existing("northwester-high-school-roof-replacement-scbo-69032", "https://scbo.sc.gov/printad?a=69032"),
    ]);
    const detailCalls: string[] = [];
    const src = periscopeSource(COMMBUYS, {
      delayMs: 0,
      fetchOpen: async () => ({ bids: feed, total: feed.length }),
      fetchDetail: async (_site, number) => {
        detailCalls.push(number);
        return parsePeriscopeDetail(DETAIL);
      },
    });
    const { body } = await syncPublicSources(db, [src], { today: TODAY, dry: true });
    expect(body).toMatchObject({ matched: { commbuys: 25 }, wouldInsert: 24, wouldArchive: 1 });
    expect((body as { archiveSample: { slug: string }[] }).archiveSample.map((s) => s.slug)).toEqual(["old-roof-commbuys-100001"]);
    // A dry run reads a small sample, never the listed bid that already exists.
    expect(detailCalls).toHaveLength(3);
    expect(detailCalls).not.toContain(listed.number);
  });

  it("a real run inserts enriched bids up to the cap; the rest wait for the next day", async () => {
    const many = Array.from({ length: MAX_DETAILS + 5 }, (_, i) => roofBid(300000 + i));
    const src = periscopeSource(COMMBUYS, {
      delayMs: 0,
      fetchOpen: async () => ({ bids: many, total: many.length }),
      fetchDetail: async (_site, number) => (number.endsWith("300001") ? Promise.reject(new Error("HTTP 500")) : parsePeriscopeDetail(DETAIL)),
    });
    const fresh = await src.collect(TODAY);
    const ready = await src.enrich!(fresh, { today: TODAY, dry: false });
    expect(ready).toHaveLength(MAX_DETAILS);
    expect(ready[0].insert.scope).toContain("Bid type: Open bid");
    // A failed detail page still yields the plain list listing.
    expect(ready.find((c) => c.insert.slug.endsWith("-300001"))!.insert.scope).not.toContain("Bid type");
  });
});

// Live dry run (one polite pass, two requests): PERISCOPE_DRY_RUN=1 npx vitest run test/unit/periscope
describe.runIf(process.env.PERISCOPE_DRY_RUN === "1")("COMMBUYS live dry run", () => {
  it("reports what would import", async () => {
    const { bids: live, total } = await fetchPeriscopeOpenBids(COMMBUYS);
    const today = new Date().toISOString().slice(0, 10);
    const open = live.filter((b) => b.status === "Sent" && b.closing && b.closing >= today);
    const kept = live.filter((b) => classifyPeriscope(b, today).length);
    const buyers = new Map<string, number>();
    for (const b of kept) buyers.set(b.organization, (buyers.get(b.organization) ?? 0) + 1);
    const trades = new Map<string, number>();
    for (const b of kept) for (const t of classifyPeriscope(b, today)) trades.set(t, (trades.get(t) ?? 0) + 1);
    const report = [
      `COMMBUYS: search says ${total} open; CSV ${live.length} BD bids; ${open.length} open for responses; ${kept.length} building-trade bids kept`,
      `Top buyers: ${JSON.stringify([...buyers].sort((a, b) => b[1] - a[1]).slice(0, 10))}`,
      `Trades: ${JSON.stringify([...trades].sort((a, b) => b[1] - a[1]))}`,
    ].join("\n");
    process.stdout.write(`${report}\n`);
    expect(live.length).toBeGreaterThan(0);
  }, 60_000);
});
