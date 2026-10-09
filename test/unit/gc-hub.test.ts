import { describe, expect, it } from "vitest";
import { filterWins, hubFilterOptions, hubTotals, hubWins, openPackages, sourceKeys } from "@/lib/gc/hub";
import { AWARD_PORTALS, isOfficialUrl, officialNoticeFromSlug, officialNotices } from "@/lib/gc/official";
import { winnersFromRfps } from "@/lib/data/winners";
import { isPublicBody } from "@/lib/gc/leads";
import type { RfpListItem } from "@/lib/data/types";
import gcHub from "@/i18n/messages/gcHub";

function award(slug: string, winner: string, value: string, date: string, extra: Partial<RfpListItem> = {}): RfpListItem {
  return {
    slug,
    title: `Contract ${slug}`,
    summary: `Awarded ${date} to ${winner} (Halifax) — ${value}. Past public contract from Halifax Water.`,
    categories: ["General Contracting"],
    regionName: "Nova Scotia",
    propertyTypeName: null,
    city: null,
    province: "Nova Scotia",
    deadline: date,
    isDemo: false,
    photoUrls: [],
    status: "closed",
    sourceType: "public_source",
    ...extra,
  };
}

function pkg(slug: string, deadline: string, extra: Partial<RfpListItem> = {}): RfpListItem {
  return {
    slug,
    title: `Roofing package — ${slug}`,
    summary: "Roof replacement",
    categories: ["Roofing"],
    regionName: "Toronto",
    propertyTypeName: null,
    city: null,
    province: "Ontario",
    deadline,
    isDemo: false,
    photoUrls: [],
    status: "open",
    sourceType: "gc_package",
    gcProjectName: "School renovation",
    ...extra,
  };
}

const today = "2026-10-08";

describe("GC Hub: who just won", () => {
  const rfps = [
    award("a-nsa-1", "Metro Roofing Ltd.", "$100,000 CAD", "2026-10-01", { categories: ["Roofing"] }),
    award("b-nsa-2", "METRO ROOFING LTD", "$50,000 CAD", "2026-09-01", { categories: ["Roofing"] }),
    award("c-qca-3", "Constructions Lévis inc.", "$900,000 CAD", "2026-10-01", { province: "Quebec", regionName: "Quebec" }),
    award("d-nsa-4", "Alain Roy", "$5,000 CAD", "2026-10-02"), // a person: never named
    award("e-nsa-5", "City of Halifax", "$5,000 CAD", "2026-10-02"), // a public body as "winner"
    award("f-nsa-6", "Old Builders Inc.", "$5,000 CAD", "2026-06-01"), // older than 90 days
    award("g-nsa-7", "Future Builders Inc.", "$5,000 CAD", "2026-10-20"), // after today
    award("h-tora-8", "Lakeshore Paving Inc.", "value not disclosed", "2026-09-15", { province: "Ontario", regionName: "Toronto", categories: ["Concrete and Asphalt"] }),
    pkg("open-pkg-1", "2026-10-20"),
  ];
  const winners = winnersFromRfps(rfps, 1);
  const wins = hubWins(rfps, winners, { today });

  it("keeps the last 90 days of named companies, newest first, largest first within a day", () => {
    expect(wins.map((w) => w.slug)).toEqual(["c-qca-3", "a-nsa-1", "h-tora-8", "b-nsa-2"]);
  });

  it("never names a person or a public body, and drops future-dated rows", () => {
    const names = wins.map((w) => w.winner);
    expect(names).not.toContain("Alain Roy");
    expect(names).not.toContain("City of Halifax");
    expect(names).not.toContain("Future Builders Inc.");
    expect(isPublicBody("Town of Truro")).toBe(true);
    expect(isPublicBody("Metro Roofing Ltd.")).toBe(false);
  });

  it("labels each row with its source and links the winner's profile", () => {
    const quebec = wins.find((w) => w.slug === "c-qca-3")!;
    expect(quebec.sourceKey).toBe("seao");
    expect(quebec.jurisdiction).toBe("Quebec (SEAO)");
    expect(quebec.attribution).toMatch(/SEAO/);
    expect(quebec.buyer).toBe("Halifax Water");
    const metro = wins.find((w) => w.slug === "a-nsa-1")!;
    expect(metro.winnerSlug).toBe("metro-roofing-ltd");
    expect(wins.find((w) => w.slug === "h-tora-8")!.amount).toBeNull();
  });

  it("filters by trade and province, and counts the options", () => {
    expect(filterWins(wins, { trade: "Roofing" }).map((w) => w.slug)).toEqual(["a-nsa-1", "b-nsa-2"]);
    expect(filterWins(wins, { province: "Quebec" }).map((w) => w.slug)).toEqual(["c-qca-3"]);
    expect(filterWins(wins, { trade: "Roofing", province: "Quebec" })).toEqual([]);
    const o = hubFilterOptions(wins);
    expect(o.trades[0]).toEqual(["Roofing", 2]);
    expect(o.provinces).toEqual([["Nova Scotia", 2], ["Ontario", 1], ["Quebec", 1]]);
  });

  it("totals count companies once across spelling variants", () => {
    expect(hubTotals(wins)).toEqual({ awards: 4, companies: 3, value: 1_050_000 });
  });

  it("lists sources in a stable order", () => {
    expect(sourceKeys(wins)).toEqual(["seao", "toronto-awards", "ns-awards"]);
  });
});

describe("GC Hub: open packages", () => {
  it("shows only real, open GC packages, soonest quotes-due first", () => {
    const rfps = [
      pkg("p-late", "2026-11-01"),
      pkg("p-soon", "2026-10-12"),
      pkg("p-closed", "2026-09-01", { status: "closed" }),
      pkg("p-demo", "2026-10-15", { isDemo: true }),
      { ...pkg("pm-rfp", "2026-10-10"), sourceType: "property_manager_direct" },
    ];
    expect(openPackages(rfps).map((r) => r.slug)).toEqual(["p-soon", "p-late"]);
  });

  it("is empty when nobody has posted — no placeholder packages", () => {
    expect(openPackages([award("a-nsa-1", "Metro Roofing Ltd.", "$1 CAD", "2026-10-01")])).toEqual([]);
  });
});

describe("contract-winner profiles for every winner", () => {
  it("gives one-award companies a page without moving a repeat winner's URL", () => {
    // "A B Roofing" (one award) comes first and slugifies exactly like the
    // repeat winner "A&B Roofing" (a different company) — the repeat winner
    // must keep the plain slug it is indexed under.
    const rfps = [
      award("x-nsa-1", "A B Roofing", "$1,000 CAD", "2026-01-01"),
      award("y-nsa-2", "A&B Roofing", "$2,000 CAD", "2026-02-01"),
      award("z-nsa-3", "A&B Roofing", "$3,000 CAD", "2026-03-01"),
    ];
    const repeat = winnersFromRfps(rfps);
    const all = winnersFromRfps(rfps, 1);
    expect(repeat).toHaveLength(1);
    expect(all).toHaveLength(2);
    const same = all.find((w) => w.awards.length === 2)!;
    expect(repeat[0].slug).toBe("a-b-roofing");
    expect(same.slug).toBe(repeat[0].slug);
    const single = all.find((w) => w.awards.length === 1)!;
    expect(single.slug).not.toBe(same.slug);
    expect(new Set(all.map((w) => w.slug)).size).toBe(all.length);
  });
});

describe("official notice links", () => {
  it("rebuilds CanadaBuys award URLs exactly", () => {
    expect(officialNoticeFromSlug("roof-repair-cba-pw-23-01234567")).toEqual({
      url: "https://canadabuys.canada.ca/en/tender-opportunities/award-notice/pw-23-01234567",
      exact: true,
    });
  });

  it("falls back to the official portal for SEAO, Toronto and Nova Scotia", () => {
    expect(officialNoticeFromSlug("toiture-qca-1234567")).toEqual({ url: AWARD_PORTALS.seao, exact: false });
    expect(officialNoticeFromSlug("paving-tora-doc123")).toEqual({ url: AWARD_PORTALS["toronto-awards"], exact: false });
    expect(officialNoticeFromSlug("roof-nsa-abc-1")).toEqual({ url: AWARD_PORTALS["ns-awards"], exact: false });
  });

  it("never treats an open tender as an award notice", () => {
    expect(officialNoticeFromSlug("toiture-qc-1234567")).toBeNull();
    expect(officialNoticeFromSlug("paving-tor-doc123")).toBeNull();
    expect(officialNoticeFromSlug("roof-repair-pw-23-01234567")).toBeNull();
  });

  it("only accepts links on the feed's own official host", () => {
    expect(isOfficialUrl("https://seao.gouv.qc.ca/avis-resultat?ItemId=1#award", "toiture-qca-1")).toBe(true);
    expect(isOfficialUrl("https://www.seao.gouv.qc.ca/x", "toiture-qca-1")).toBe(true);
    expect(isOfficialUrl("https://evil.example/seao.gouv.qc.ca", "toiture-qca-1")).toBe(false);
    expect(isOfficialUrl("javascript:alert(1)", "toiture-qca-1")).toBe(false);
    expect(isOfficialUrl("undefined#award", "toiture-qca-1")).toBe(false);
  });

  it("returns slug-only links when there is no database", async () => {
    const m = await officialNotices(["toiture-qca-1", "roof-repair-cba-pw-1", "toiture-qc-2"]);
    expect(m.get("toiture-qca-1")).toEqual({ url: AWARD_PORTALS.seao, exact: false });
    expect(m.get("roof-repair-cba-pw-1")?.exact).toBe(true);
    expect(m.has("toiture-qc-2")).toBe(false);
  });
});

describe("GC Hub copy", () => {
  it("has the same steps in every language", () => {
    expect(gcHub.fr.gc.steps).toHaveLength(gcHub.en.gc.steps.length);
    expect(gcHub.es.gc.steps).toHaveLength(gcHub.en.gc.steps.length);
  });
});
