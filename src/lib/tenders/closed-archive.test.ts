import { describe, expect, it } from "vitest";
import { publicTenderSource } from "./sources";
import { closedArchiveAward, closedArchiveNoticeUrl } from "./closed-archive";
import { priorFor, syncPublicSources, type Candidate, type ExistingRow, type Source } from "./sync";
import { classifyYukonClosed, yukonClosedToRfpInsert } from "./yukon-closed";
import type { TenderInsert } from "./canadabuys";
import { yukonTitle, type YukonRow } from "./yukon";
import { isClosedArchive, isIndexableRfp } from "@/lib/seo/rfp-indexing";
import { boardStats, isPastContract } from "@/lib/data/fomo";
import { toDigestAward } from "@/lib/alerts/awards";
import { buildAutoThread } from "@/lib/forum/auto-threads";
import type { RfpListItem } from "@/lib/data/types";

const TODAY = "2026-10-09";
const CLOSED_SLUG = "hot-water-tank-replacements-hsc-borden-cbc-cb-161-43955128";
const AWARDED_SUMMARY =
  "Public tender from Department of National Defence (DND), closed August 20, 2026. Contract awarded September 29, 2026 to Crystal Mechanical Inc (Barrie) — $84,500 CAD (CanadaBuys award cb-161-43955128).";

const item = (extra: Partial<RfpListItem> = {}): RfpListItem => ({
  slug: CLOSED_SLUG,
  title: "Hot Water Tank Replacements HSC Borden",
  summary: AWARDED_SUMMARY,
  categories: ["Plumbing"],
  regionName: "Ontario",
  propertyTypeName: null,
  city: null,
  province: "Ontario",
  deadline: "2026-08-20",
  isDemo: false,
  photoUrls: [],
  status: "closed",
  sourceType: "public_source",
  ...extra,
});

describe("closed-archive sources", () => {
  it("maps slug suffixes to the closed-archive sources, never to an open feed", () => {
    expect(publicTenderSource(CLOSED_SLUG)).toMatchObject({ key: "canadabuys-closed", closedArchive: true, past: false });
    // A Quebec title would otherwise match the looser SEAO "-qc-" suffix.
    expect(publicTenderSource("boiler-replacement-mont-joli-qc-cbc-ws5725524894-doc5725524961").key).toBe("canadabuys-closed");
    expect(publicTenderSource("standing-offer-fire-alarm-technician-services-ykc-rso-rfb-2026-9-5560").key).toBe("yukon-closed");
    // Open feeds unchanged.
    expect(publicTenderSource("janitorial-services-cb-ws123-doc456").key).toBe("canadabuys");
    expect(publicTenderSource("generator-repair-yk-rfb-2026-9-5555").key).toBe("yukon");
  });

  it("links the official notice publicly", () => {
    expect(closedArchiveNoticeUrl(CLOSED_SLUG)).toBe("https://canadabuys.canada.ca/en/tender-opportunities/tender-notice/cb-161-43955128");
    expect(closedArchiveNoticeUrl("x-ykc-rfb-2026-9-5555")).toBe("https://yukon.bidsandtenders.ca/Module/Tenders/en");
    expect(closedArchiveNoticeUrl("janitorial-services-cb-ws123-doc456")).toBeNull();
  });

  it("reads the award back out for the page", () => {
    expect(closedArchiveAward(AWARDED_SUMMARY)).toEqual({
      winner: "Crystal Mechanical Inc",
      value: "$84,500 CAD",
      date: "September 29, 2026",
      noticeUrl: "https://canadabuys.canada.ca/en/tender-opportunities/award-notice/cb-161-43955128",
      listingSuffix: "-cba-cb-161-43955128",
    });
    expect(closedArchiveAward("Public tender from X, closed May 1, 2026.")).toBeNull();
  });
});

describe("closed vs open — never shown or counted as open", () => {
  it("is not open, not a past contract, and not in open stats", () => {
    const closed = item();
    expect(isClosedArchive(closed)).toBe(true);
    expect(isPastContract(closed)).toBe(false);
    const open = item({ slug: "roof-repairs-cb-ws1-doc2", status: "open", deadline: "2026-11-01", summary: "x" });
    expect(boardStats([closed, open])).toMatchObject({ open: 1, pastContracts: 0, awardedValue: 0 });
  });

  it("is indexable only when it carries a real award", () => {
    expect(isIndexableRfp(item())).toBe(true);
    expect(isIndexableRfp(item({ summary: "Public tender from DND, closed August 20, 2026." }))).toBe(false);
    // A closed-archive row is never indexed as if open.
    expect(isIndexableRfp(item({ status: "open" }))).toBe(false);
    // Unchanged: open tenders yes, award notices and other closed tenders no.
    expect(isIndexableRfp(item({ slug: "roof-cb-ws1-doc2", status: "open" }))).toBe(true);
    expect(isIndexableRfp(item({ slug: "roof-cb-ws1-doc2", status: "closed" }))).toBe(false);
    expect(isIndexableRfp(item({ slug: "roof-cba-cb-1-2", status: "closed", summary: "Awarded May 1, 2026 to X — $5 CAD." }))).toBe(false);
  });

  it("never reaches the award digest or forum auto-threads", () => {
    expect(
      toDigestAward(
        { id: "1", slug: CLOSED_SLUG, title: "t", summary: AWARDED_SUMMARY, deadline: "2026-09-29", region_id: "r", source_type: "public_source", categories: [] },
        TODAY,
      ),
    ).toBeNull();
    expect(
      buildAutoThread({
        id: "1", slug: CLOSED_SLUG, title: "Hot Water Tank Replacements HSC Borden", summary: AWARDED_SUMMARY, city: null, province: "Ontario",
        deadline: "2026-08-20", publishedAt: "2026-10-08T00:00:00Z", createdAt: "2026-10-09T00:00:00Z", sourceType: "public_source",
        isDemo: false, status: "published", tradeSlugs: ["plumbing"], tradeNames: ["Plumbing"],
      }),
    ).toBeNull();
  });
});

describe("Yukon closed tenders", () => {
  const row = (extra: Partial<YukonRow> = {}): YukonRow => ({
    "Project Number": "RFB-2026-7-5480",
    "Project Description": "The Government of Yukon is seeking a contractor for roof replacement at the Whitehorse Correctional Centre. Community: Whitehorse.",
    Department: "Highways & Public Works",
    "Published Date": "2026-07-02 12:00:00 PM",
    "Closing Date": "2026-07-29 11:00:00 PM",
    "Project Type": "Request for Bids",
    "Project Classification": "Construction",
    "Project Status": "Awarded",
    ...extra,
  });

  it("keeps closed and awarded building calls in the window", () => {
    expect(classifyYukonClosed(row(), TODAY)).toEqual(["roofing"]);
    expect(classifyYukonClosed(row({ "Project Status": "Closed" }), TODAY)).toEqual(["roofing"]);
  });

  it("drops RFIs, sole-source notices, goods, and out-of-window dates", () => {
    expect(classifyYukonClosed(row({ "Project Type": "Request for Information" }), TODAY)).toEqual([]);
    expect(classifyYukonClosed(row({ "Project Type": "Advanced Contract Award Notice" }), TODAY)).toEqual([]);
    expect(classifyYukonClosed(row({ "Project Classification": "Goods" }), TODAY)).toEqual([]);
    expect(classifyYukonClosed(row({ "Closing Date": "2024-01-10 11:00:00 PM" }), TODAY)).toEqual([]);
    expect(classifyYukonClosed(row({ "Closing Date": "2026-10-08 11:00:00 PM" }), TODAY)).toEqual([]);
    expect(classifyYukonClosed(row({ "Project Status": "Open" }), TODAY)).toEqual([]);
  });

  it("titles the work, not the community header (real descriptions)", () => {
    expect(
      yukonTitle("Community: Carcross Traditional Territory: Carcross/Tagish First Nation To provide routine maintenance, equipment and snow removal services to the Carcross Solid Waste Facility.     "),
    ).toBe("Provide routine maintenance, equipment and snow removal services to the Carcross Solid Waste Facility.");
    expect(
      yukonTitle("Community: Carmacks Traditional Territory: Little Salmon/Carmacks First Nation  This project consists of the removal and replacement of two (2) outhouses at the Columbian Disaster/Eagle Rock Rest Area.   "),
    ).toBe("Removal and replacement of two (2) outhouses at the Columbian Disaster/Eagle Rock Rest Area.");
    expect(yukonTitle("Phase 6 Park &amp; Greenstreet landscaping")).toBe("Phase 6 Park & Greenstreet landscaping");
  });

  it("leaves wildfire fuel-break work out (not hazmat abatement)", () => {
    expect(
      classifyYukonClosed(row({ "Project Description": "Community: Whitehorse Traditional Territory: Kwanlin Dün First Nation The Contractor is to apply a mechanized treatment on 3.6 hectares of forested land in 3 separate fuel abatement blocks." }), TODAY),
    ).toEqual([]);
  });

  it("states the portal's status but no invented winner", () => {
    const ins = yukonClosedToRfpInsert(row())!;
    expect(ins.deadline).toBe("2026-07-29");
    expect(ins.slug).toMatch(/-ykc-rfb-2026-7-5480$/);
    expect(ins.summary).toMatch(/^Public tender from the Government of Yukon \(Highways & Public Works\), closed July 29, 2026\. Project RFB-2026-7-5480\. Status on the Yukon portal: awarded\./);
    expect(ins.summary).not.toMatch(/awarded to/i);
    expect(publicTenderSource(ins.slug).key).toBe("yukon-closed");
  });
});

// ── sync: a closed archive shares notice URLs with old open-feed rows ──

const existingRow = (slug: string, status: string, url = "https://x/notice/1"): ExistingRow => ({
  id: slug,
  slug,
  title: "t",
  region_id: null,
  source_url: url,
  status,
  deadline: "2026-08-20",
  summary: "s",
});

describe("sync identity for closed archives", () => {
  const history = { key: "canadabuys-closed", history: true } as const;
  const openSrc = { key: "canadabuys" } as const;
  const keys = new Set(["canadabuys-closed"]);

  it("re-lists a notice the open feed archived, but never duplicates a published one", () => {
    expect(priorFor([existingRow("roof-cb-cb-1-2", "archived")], history, keys)).toBeNull();
    expect(priorFor([existingRow("roof-cb-cb-1-2", "published")], history, keys)).toBe("skip");
    const own = existingRow("roof-cbc-cb-1-2", "published");
    expect(priorFor([existingRow("roof-cb-cb-1-2", "archived"), own], history, keys)).toBe(own);
  });

  it("open feeds ignore closed-archive rows", () => {
    const closed = existingRow("roof-cbc-cb-1-2", "published");
    expect(priorFor([closed], openSrc, new Set())).toBeNull();
    const open = existingRow("roof-cb-cb-1-2", "archived");
    expect(priorFor([open, closed], openSrc, keys)).toBe(open);
  });

  // Minimal stand-in for the Supabase client: just the reads a dry run makes.
  function fakeDb(rows: ExistingRow[]) {
    const result = (data: unknown) => {
      const q = { eq: () => q, order: () => q, range: () => Promise.resolve({ data, error: null }), then: (f: (v: unknown) => unknown) => Promise.resolve({ data, error: null }).then(f) };
      return q;
    };
    return {
      from: (table: string) => ({
        select: () =>
          table === "rfp_posts"
            ? result(rows)
            : table === "regions"
              ? result([{ id: "on", slug: "ontario" }, { id: "ca", slug: "canada" }])
              : result([{ id: "p", slug: "plumbing" }]),
      }),
    } as unknown as Parameters<typeof syncPublicSources>[0];
  }

  const candidate = (slug: string, url: string): Candidate => ({
    insert: { slug, title: "t", summary: "s", source_url: url, deadline: "2026-08-20" } as TenderInsert,
    categories: ["plumbing"],
    regionSlug: "ontario",
  });

  it("dry run: inserts closed rows for archived notices and archives only its own stale rows", async () => {
    const db = fakeDb([
      existingRow("roof-cb-cb-1-1", "archived", "https://x/1"), // open-feed row, closed long ago
      existingRow("boiler-cb-cb-1-2", "published", "https://x/2"), // still published by the open feed
      existingRow("old-cbc-cb-1-3", "published", "https://x/3"), // aged out of the archive
      existingRow("keep-cbc-cb-1-4", "published", "https://x/4"),
    ]);
    const src: Source = {
      key: "canadabuys-closed",
      history: true,
      minMatchesToArchive: 1,
      collect: async () => [
        candidate("roof-cbc-cb-1-1", "https://x/1"),
        candidate("boiler-cbc-cb-1-2", "https://x/2"),
        candidate("keep-cbc-cb-1-4", "https://x/4"),
      ],
    };
    const { body } = await syncPublicSources(db, [src], { today: TODAY, dry: true });
    expect(body).toMatchObject({ dry: true, wouldInsert: 1, wouldArchive: 1 });
    expect((body as { sample: { slug: string }[] }).sample.map((s) => s.slug)).toEqual(["roof-cbc-cb-1-1"]);
    expect((body as { archiveSample: { slug: string }[] }).archiveSample.map((s) => s.slug)).toEqual(["old-cbc-cb-1-3"]);
  });

  it("dry run: the open feed still archives its row even when the archive lists the same URL", async () => {
    const db = fakeDb([existingRow("boiler-cb-cb-1-2", "published", "https://x/2"), existingRow("x-cb-cb-1-9", "published", "https://x/9")]);
    const open: Source = { key: "canadabuys", minMatchesToArchive: 1, collect: async () => [candidate("x-cb-cb-1-9", "https://x/9")] };
    const hist: Source = { key: "canadabuys-closed", history: true, minMatchesToArchive: 1, collect: async () => [candidate("boiler-cbc-cb-1-2", "https://x/2")] };
    const { body } = await syncPublicSources(db, [open, hist], { today: TODAY, dry: true });
    // boiler left the open feed → archived; the archive waits for it (published elsewhere → skip this run).
    expect((body as { archiveSample: { slug: string }[] }).archiveSample.map((s) => s.slug)).toEqual(["boiler-cb-cb-1-2"]);
    expect(body).toMatchObject({ wouldInsert: 0 });
  });
});
