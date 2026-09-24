import { describe, expect, it } from "vitest";
import {
  awardLine,
  recentAwardsByUser,
  recentAwardsFor,
  recentAwardsHtml,
  toDigestAward,
  type AwardRow,
  type DigestAward,
} from "@/lib/alerts/awards";

const today = "2026-09-24";

const row = (over: Partial<AwardRow> = {}): AwardRow => ({
  id: "r1",
  slug: "school-roof-cba-ws1",
  title: "School roof replacement",
  summary: "Awarded September 20, 2026 to Metro Roofing Ltd. (Toronto) — $1,200,000 CAD. Past public contract issued by the Government of Canada.",
  deadline: "2026-09-20",
  region_id: "toronto",
  source_type: "public_source",
  categories: [{ id: "cat-roof", slug: "roofing" }],
  ...over,
});

const award = (id: string, over: Partial<DigestAward> = {}): DigestAward => ({
  id,
  slug: `award-${id}-cba-${id}`,
  title: `Award ${id}`,
  winner: "Dexter Construction",
  value: "$100,000 CAD",
  amount: 100_000,
  date: "2026-09-20",
  regionId: "toronto",
  categoryIds: ["cat-gc"],
  categorySlugs: ["general-contracting"],
  ...over,
});

describe("recently awarded near you", () => {
  it("turns an award notice into a digest award", () => {
    const a = toDigestAward(row(), today)!;
    expect(a.winner).toBe("Metro Roofing Ltd.");
    expect(a.value).toBe("$1,200,000 CAD");
    expect(a.amount).toBe(1_200_000);
    expect(a.categorySlugs).toEqual(["roofing"]);
  });

  it("skips open tenders, old backfill, unplaced awards and people's names", () => {
    expect(toDigestAward(row({ slug: "arena-roof-tor-123" }), today)).toBeNull(); // open tender
    expect(toDigestAward(row({ deadline: "2026-07-01" }), today)).toBeNull(); // older than 30 days
    expect(toDigestAward(row({ deadline: "2026-10-01" }), today)).toBeNull(); // future-dated
    expect(toDigestAward(row({ region_id: null }), today)).toBeNull();
    expect(
      toDigestAward(row({ summary: "Awarded September 20, 2026 to Alain Roy — $5,000 CAD. Past public contract from X." }), today),
    ).toBeNull();
  });

  it("picks awards in the member's regions that are general contracting or their trade, biggest first, max 3", () => {
    const awards = [
      award("small", { amount: 10_000 }),
      award("big", { amount: 900_000 }),
      award("mid", { amount: 300_000 }),
      award("fourth", { amount: 50_000 }),
      award("far", { amount: 5_000_000, regionId: "vancouver" }),
      award("hvac", { amount: 2_000_000, categoryIds: ["cat-hvac"], categorySlugs: ["hvac"] }),
      award("roof", { amount: 400_000, categoryIds: ["cat-roof"], categorySlugs: ["roofing"] }),
    ];
    const picked = recentAwardsFor(awards, { cats: new Set(["cat-roof"]), regions: new Set(["ontario", "toronto"]) });
    expect(picked.map((a) => a.id)).toEqual(["big", "roof", "mid"]);
  });

  it("maps awards to each paying member across their orgs", () => {
    const byUser = recentAwardsByUser({
      awards: [award("gc"), award("hvac", { categoryIds: ["cat-hvac"], categorySlugs: ["hvac"] })],
      paidOrgIds: ["o1", "o2"],
      catsByOrg: new Map([
        ["o1", new Set(["cat-hvac"])],
        ["o2", new Set(["cat-paint"])],
      ]),
      regionsByOrg: new Map([
        ["o1", new Set(["toronto"])],
        ["o2", new Set(["us-texas"])],
      ]),
      usersByOrg: new Map([
        ["o1", new Set(["u1"])],
        ["o2", new Set(["u2"])],
      ]),
    });
    expect(byUser.get("u1")!.map((a) => a.id).sort()).toEqual(["gc", "hvac"]);
    expect(byUser.has("u2")).toBe(false);
  });

  it("says it plainly", () => {
    const a = award("x", { winner: "Metro Roofing Ltd.", title: "School roof replacement", value: "$1,200,000 CAD" });
    expect(awardLine(a, "HVAC")).toBe(
      "Metro Roofing Ltd. won School roof replacement ($1,200,000 CAD). The winning contractor may need HVAC subcontractors.",
    );
    expect(awardLine({ ...a, value: null }, "EV Charging")).toBe(
      "Metro Roofing Ltd. won School roof replacement. The winning contractor may need EV charging subcontractors.",
    );
    expect(awardLine(a, "commercial")).toMatch(/may need subcontractors\.$/);
  });

  it("renders an escaped email section, or nothing", () => {
    expect(recentAwardsHtml([], "https://pmrfp.com")).toBe("");
    const html = recentAwardsHtml([{ slug: "a-cba-1", line: "A & B <won>" }], "https://pmrfp.com");
    expect(html).toContain("Recently awarded near you");
    expect(html).toContain("A &amp; B &lt;won&gt;");
    expect(html).toContain('href="https://pmrfp.com/rfps/a-cba-1"');
  });
});
