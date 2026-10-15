import { describe, expect, it } from "vitest";
import { publicTenderSource } from "./sources";
import { toRfpInsert, type TenderInsert } from "./canadabuys";
import { syncPublicSources, type Candidate, type ExistingRow, type Source } from "./sync";

const key = (slug: string) => publicTenderSource(slug).key;

describe("publicTenderSource: real slugs keep their source", () => {
  // Sampled from rfp_posts (source_type = public_source), one or more per importer.
  const REAL: [slug: string, key: string, past: boolean][] = [
    ["w6898-270825-riso-video-inspection-clean-oil-interceptors-and-sewer-sy-cb-ws5846022405-doc5846123481", "canadabuys", false],
    ["open-construction-source-list-for-cfb-calgary-cb-mx-443840130567", "canadabuys", false],
    ["roof-cb-cb-1-2", "canadabuys", false],
    ["hot-water-tank-replacements-hsc-borden-cbc-cb-161-43955128", "canadabuys-closed", false],
    ["ew038-261322-observation-cell-renovation-cba-cw2436120", "awards", true],
    ["regional-waste-management-cba-cb-169-93373734", "awards", true],
    ["service-d-un-entrepreneur-general-qc-ao-21243", "seao", false],
    ["acquisition-et-installation-d-une-tour-d-eau-et-travaux-de-toiture-qc-daw-2627-012", "seao", false],
    ["renovation-de-la-cage-d-escalier-arriere-au-pavillon-e5-qc-us-24-e5-1125-00", "seao", false],
    ["revision-de-programme-de-technologie-du-genie-electrique-qca-26156", "seao", true],
    ["location-d-equipements-avec-operateurs-pour-operations-de-de-qca-2026-115-tp-aop", "seao", true],
    ["replacement-and-renewal-of-the-existing-rooftop-hvac-systems-at-york-c-tor-5830241025", "toronto", false],
    ["scarborough-transfer-station-pavement-rehabilitation-tora-5454504834", "toronto-awards", true],
    ["asphalt-milling-nsa-tot26-003", "ns-awards", true],
    ["new-haven-waste-management-facility-waterline-extension-prel-nsa-vic-rfp-04-02-26", "ns-awards", true],
    ["standing-offer-generator-repair-services-yk-rso-rfb-2026-9-5567", "yukon", false],
    ["community-whitehorse-traditional-territory-kwanlin-dun-first-yk-rfp-2026-6-5394", "yukon", false],
    ["standing-offer-fire-alarm-technician-services-ykc-rso-rfb-2026-9-5560", "yukon-closed", false],
    ["air-handler-air-conditioning-units-us-8cb49ce183704467a68c9f7f84fb22e7", "sam", false],
    ["csb-151-20-jamaica-roof-rep-wp-nyc-20260814014", "nyc", false],
    ["atlantic-union-bank-convention-center-roof-repair-ncevp-bbbd9a8151bbf111aaae001dd80d92a5", "nc-evp", false],
    ["northwester-high-school-roof-replacement-scbo-69032", "scbo", false],
    ["brockton-es-roofing-lacr-232048", "la-city", false],
    ["campus-perimeter-fencing-rfp-27-046-flvbs-17090", "florida-vbs", false],
    ["roof-repair-fs-73-job-walk-lacb-50399", "la-county", false],
    ["customs-house-renovation-addition-debid-9336", "delaware", false],
    ["plumbing-and-hvac-maintenance-and-repairs-service-contract-commbuys-134506", "commbuys", false],
  ];

  it.each(REAL)("%s → %s", (slug, k, past) => {
    expect(publicTenderSource(slug)).toMatchObject({ key: k, past });
  });
});

describe("publicTenderSource: title words never claim the source", () => {
  it("the reported bug: an open CanadaBuys tender in Mont-Joli, QC", () => {
    const slug = "replacement-of-electric-boilers-iml-mont-joli-qc-cb-cw2466670";
    expect(publicTenderSource(slug)).toMatchObject({ key: "canadabuys", past: false, badge: "Public tender · Gov. of Canada" });
  });

  it("built by the real CanadaBuys slug builder", () => {
    const row = toRfpInsert(
      {
        "title-titre-eng": "Replacement of electric boilers - IML Mont-Joli, QC",
        "referenceNumber-numeroReference": "cw2466670",
        "noticeURL-URLavis-eng": "https://canadabuys.canada.ca/en/tender-opportunities/tender-notice/cw2466670",
      },
      "2026-10-12",
    );
    expect(row?.slug).toBe("replacement-of-electric-boilers-iml-mont-joli-qc-cb-cw2466670");
    expect(key(row!.slug)).toBe("canadabuys");
  });

  // Every other importer's marker (and look-alikes) inside an open CanadaBuys title.
  it.each([
    "hvac-maintenance-gatineau-qc-cb-cb-650-24879168",
    "roofing-qca-building-cb-ws5846022405-doc5846123481",
    "fire-alarm-inspection-downsview-toronto-tor-cb-mx-443841876264",
    "elevator-repairs-tora-site-cb-cb-161-43955128",
    "snow-removal-whitehorse-yk-cb-cw2466670",
    "standing-offer-ykc-region-cb-cw2466670",
    "janitorial-cfb-halifax-nsa-cb-ws123-doc456",
    "painting-cba-hangar-cb-cw2440006",
    "paving-cbc-yard-cb-mx-1234567",
    "us-border-crossing-hvac-us-cb-cb-1-2",
    "nyc-office-cleaning-nyc-cb-cb-1-2",
  ])("open CanadaBuys: %s", (slug) => {
    expect(publicTenderSource(slug)).toMatchObject({ key: "canadabuys", past: false });
  });

  it("other importers with misleading titles", () => {
    // SEAO open with "cb"/"tor"/"yk" in the title.
    expect(key("travaux-cb-cb-1-2-pavillon-qc-ao-21243")).toBe("seao");
    expect(key("tor-yk-nsa-reamenagement-qc-2026-115-tp-aop")).toBe("seao");
    // SEAO past contract whose title has an open marker in it.
    expect(publicTenderSource("refection-qc-toiture-qca-12-01-06-01-010-002-1")).toMatchObject({ key: "seao", past: true });
    // Toronto with "qc"/"nsa" in the title; Toronto award with "tor".
    expect(key("lachine-qc-style-roof-tor-5830241025")).toBe("toronto");
    expect(publicTenderSource("tor-hvac-nsa-renewal-tora-5454504834")).toMatchObject({ key: "toronto-awards", past: true });
    // Nova Scotia award with "qc"/"tor" in the title.
    expect(key("qc-tor-asphalt-milling-nsa-tot26-003")).toBe("ns-awards");
    // CanadaBuys award with "qc" in the title; its ref starts with "cb-".
    expect(publicTenderSource("boilers-mont-joli-qc-cba-cb-161-43955128")).toMatchObject({ key: "awards", past: true });
    // Closed archive with "qc" in the title.
    expect(key("boiler-replacement-mont-joli-qc-cbc-ws5725524894-doc5725524961")).toBe("canadabuys-closed");
    // Yukon with "qc" in the title.
    expect(key("generator-repair-qc-yk-rfb-2026-9-5555")).toBe("yukon");
    // SAM with "qc"/"cb" in the title.
    expect(key("quebec-qc-cb-border-station-us-2a46798d54e34a12b83e614ef37cade8")).toBe("sam");
    // US state feed with a Canadian marker in the title.
    expect(key("tor-qc-roofing-scbo-69395")).toBe("scbo");
    // Periscope (COMMBUYS) with other markers in the title, and the other way round.
    expect(key("tor-qc-cb-roof-scbo-commbuys-134506")).toBe("commbuys");
    expect(key("commbuys-roof-cb-cw2466670")).toBe("canadabuys");
  });

  it("anything unrecognised falls back to CanadaBuys", () => {
    expect(key("some-tender-without-a-marker")).toBe("canadabuys");
  });
});

describe("archiving scope follows the corrected source", () => {
  const MONT_JOLI = "replacement-of-electric-boilers-iml-mont-joli-qc-cb-cw2466670";
  const row = (slug: string, url: string): ExistingRow => ({ id: slug, slug, title: "t", region_id: null, source_url: url, status: "published", deadline: "2026-09-01", summary: "s" });

  function fakeDb(rows: ExistingRow[]) {
    const result = (data: unknown) => {
      const q = { eq: () => q, order: () => q, range: () => Promise.resolve({ data, error: null }), then: (f: (v: unknown) => unknown) => Promise.resolve({ data, error: null }).then(f) };
      return q;
    };
    return {
      from: (table: string) => ({
        select: () => result(table === "rfp_posts" ? rows : table === "regions" ? [{ id: "ca", slug: "canada" }] : [{ id: "p", slug: "plumbing" }]),
      }),
    } as unknown as Parameters<typeof syncPublicSources>[0];
  }
  const candidate = (slug: string, url: string): Candidate => ({
    insert: { slug, title: "t", summary: "s", source_url: url, deadline: "2026-12-01" } as TenderInsert,
    categories: ["plumbing"],
    regionSlug: "canada",
  });

  it("the CanadaBuys run archives a Quebec-titled CanadaBuys tender that left its feed", async () => {
    const db = fakeDb([row(MONT_JOLI, "https://cb/1"), row("still-listed-cb-cw1", "https://cb/2")]);
    const cb: Source = { key: "canadabuys", minMatchesToArchive: 1, collect: async () => [candidate("still-listed-cb-cw1", "https://cb/2")] };
    const { body } = await syncPublicSources(db, [cb], { today: "2026-10-12", dry: true });
    expect((body as { archiveSample: { slug: string }[] }).archiveSample.map((s) => s.slug)).toEqual([MONT_JOLI]);
  });

  it("the SEAO run leaves it alone", async () => {
    const db = fakeDb([row(MONT_JOLI, "https://cb/1"), row("travaux-qc-ao-1", "https://seao/1")]);
    const seao: Source = { key: "seao", minMatchesToArchive: 1, collect: async () => [candidate("travaux-qc-ao-1", "https://seao/1")] };
    const { body } = await syncPublicSources(db, [seao], { today: "2026-10-12", dry: true });
    expect(body).toMatchObject({ wouldArchive: 0 });
  });
});
