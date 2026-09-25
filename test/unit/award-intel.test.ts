import { describe, expect, it } from "vitest";
import { buildAwardIndex, intelFor } from "@/lib/data/award-intel";
import type { RfpListItem } from "@/lib/data/types";

// Past contracts carry the "-cba-" slug suffix (Government of Canada awards).
const award = (i: number, amount: number, winner: string, over: Partial<RfpListItem> = {}): RfpListItem => ({
  slug: `snow-removal-${i}-cba-w${i}`,
  title: `Snow removal ${i}`,
  summary: `Awarded 2026-0${(i % 9) + 1}-01 to ${winner} (Ottawa) — $${amount.toLocaleString("en-US")} CAD.`,
  categories: ["Snow Removal"],
  regionName: "Ontario",
  propertyTypeName: null,
  city: null,
  province: "ON",
  deadline: "2026-01-01",
  isDemo: false,
  photoUrls: [],
  status: "closed",
  sourceType: "public_source",
  ...over,
});

const open = (over: Partial<RfpListItem> = {}) =>
  ({ categories: ["Snow Removal"], regionName: "Ontario", province: "ON", ...over }) as RfpListItem;

describe("award intel", () => {
  it("quotes the middle half and the top winners for the tender's trade and region", () => {
    const rows = [
      award(1, 40_000, "Northern Snow Inc"),
      award(2, 60_000, "Northern Snow Inc"),
      award(3, 80_000, "Blizzard Ltd"),
      award(4, 100_000, "Northern Snow Inc"),
      award(5, 120_000, "Blizzard Ltd"),
      award(6, 400_000, "Big Co"),
    ];
    const intel = intelFor(open(), buildAwardIndex(rows));
    expect(intel).not.toBeNull();
    expect(intel!.scope).toBe("Ontario");
    expect(intel!.count).toBe(6);
    expect(intel!.low).toBe(65_000); // 25th percentile
    expect(intel!.high).toBe(115_000); // 75th percentile
    expect(intel!.median).toBe(90_000);
    expect(intel!.winners[0]).toMatchObject({ name: "Northern Snow Inc", wins: 3 });
  });

  it("widens to the country when the region has too few awards, and ignores other trades", () => {
    const rows = [
      award(1, 50_000, "A Co", { regionName: "Nova Scotia", province: "NS" }),
      award(2, 70_000, "B Co", { regionName: "Nova Scotia", province: "NS" }),
      award(3, 90_000, "C Co", { regionName: "Nova Scotia", province: "NS" }),
      award(4, 999_000, "Roofer", { categories: ["Roofing"] }),
    ];
    const intel = intelFor(open(), buildAwardIndex(rows));
    expect(intel!.scope).toBe("Canada");
    expect(intel!.count).toBe(3);
    expect([intel!.low, intel!.high]).toEqual([50_000, 90_000]); // under 6 awards: full range
  });

  it("says nothing without enough comparable awards", () => {
    expect(intelFor(open(), buildAwardIndex([award(1, 50_000, "A Co"), award(2, 60_000, "B Co")]))).toBeNull();
    expect(intelFor(open({ categories: [] }), buildAwardIndex([]))).toBeNull();
  });
});
