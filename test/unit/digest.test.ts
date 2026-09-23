import { describe, expect, it } from "vitest";
import { buildDigests, digestSubject, type DigestRfp } from "@/lib/alerts/digest";

const rfp = (id: string, over: Partial<DigestRfp> = {}): DigestRfp => ({
  id,
  slug: `rfp-${id}`,
  title: `RFP ${id}`,
  deadline: "2026-10-20",
  regionId: "toronto",
  regionName: "Toronto",
  categoryIds: ["hvac"],
  categoryNames: ["HVAC"],
  summary: null,
  ...over,
});

const base = {
  paidOrgIds: ["org1", "org2"],
  catsByOrg: new Map([
    ["org1", new Set(["hvac"])],
    ["org2", new Set(["hvac", "roofing"])],
  ]),
  regionsByOrg: new Map([
    ["org1", new Set(["ontario", "gta", "toronto"])],
    ["org2", new Set(["us-texas"])],
  ]),
  usersByOrg: new Map([
    ["org1", new Set(["u1", "u2"])],
    ["org2", new Set(["u3"])],
  ]),
  emailByUser: new Map([
    ["u1", "a@x.com"],
    ["u2", "b@x.com"],
    ["u3", "c@x.com"],
  ]),
  optedOut: new Set<string>(),
  alreadySent: new Set<string>(),
};

describe("daily match digest", () => {
  it("sends ONE email per member with every match, soonest deadline first", () => {
    const d = buildDigests({
      ...base,
      rfps: [rfp("1", { deadline: "2026-11-01" }), rfp("2", { deadline: "2026-10-05" }), rfp("3", { categoryIds: ["roofing"], categoryNames: ["Roofing"] })],
    });
    const u1 = d.find((x) => x.userId === "u1")!;
    expect(u1.items.map((i) => i.id)).toEqual(["2", "1"]);
    expect(u1.tradeLabel).toBe("HVAC");
    expect(digestSubject(u1)).toBe("2 new HVAC matches on PMRFP today");
    expect(d.filter((x) => x.userId === "u1")).toHaveLength(1);
  });

  it("matches region and trade, and national/unregioned RFPs reach everyone in the trade", () => {
    const d = buildDigests({ ...base, rfps: [rfp("tx", { regionId: "us-texas", regionName: "Texas" }), rfp("any", { regionId: null })] });
    expect(d.find((x) => x.userId === "u3")!.items.map((i) => i.id).sort()).toEqual(["any", "tx"]);
    expect(d.find((x) => x.userId === "u1")!.items.map((i) => i.id)).toEqual(["any"]);
  });

  it("skips opted-out members and RFPs already sent", () => {
    const d = buildDigests({
      ...base,
      optedOut: new Set(["u2"]),
      alreadySent: new Set(["u1|rfp-1"]),
      rfps: [rfp("1"), rfp("2")],
    });
    expect(d.map((x) => x.userId).sort()).toEqual(["u1"]);
    expect(d[0].items.map((i) => i.id)).toEqual(["2"]);
  });

  it("sends nothing when nothing new matches", () => {
    expect(buildDigests({ ...base, rfps: [rfp("x", { categoryIds: ["painting"], categoryNames: ["Painting"] })] })).toEqual([]);
    expect(digestSubject({ items: [rfp("1")], tradeLabel: "HVAC" })).toBe("1 new HVAC match on PMRFP today");
  });
});
