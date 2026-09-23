import { describe, expect, it } from "vitest";
import { buildTradeCityIndex, MIN_LISTINGS } from "@/lib/data/trade-city";
import type { RfpListItem } from "@/lib/data/types";

const categories = [
  { slug: "hvac", name: "HVAC", icon: null },
  { slug: "roofing", name: "Roofing", icon: null },
] as never[];
const regions = [
  ["canada", "Canada"],
  ["ontario", "Ontario"],
  ["greater-toronto-area", "Greater Toronto Area"],
  ["toronto", "Toronto"],
  ["vaughan", "Vaughan"],
  ["united-states", "United States"],
  ["us-texas", "Texas"],
].map(([slug, name]) => ({ slug, name, province: null, country: "Canada" }));
const tree = [
  { slug: "canada", name: "Canada", parentSlug: null },
  { slug: "ontario", name: "Ontario", parentSlug: "canada" },
  { slug: "greater-toronto-area", name: "Greater Toronto Area", parentSlug: "ontario" },
  { slug: "toronto", name: "Toronto", parentSlug: "greater-toronto-area" },
  { slug: "vaughan", name: "Vaughan", parentSlug: "greater-toronto-area" },
  { slug: "united-states", name: "United States", parentSlug: null },
  { slug: "us-texas", name: "Texas", parentSlug: "united-states" },
];

let n = 0;
function rfp(over: Partial<RfpListItem> & { region: string; past?: boolean }): RfpListItem {
  n++;
  const { region, past, ...rest } = over;
  return {
    slug: past ? `award-${n}-cba-cb-${n}` : `tender-${n}-cb-${n}`,
    title: `Tender ${n}`,
    summary: past ? `Awarded September 1, 2026 to Acme Mechanical Ltd — $${n * 1000} CAD.` : "x",
    categories: ["HVAC"],
    regionName: region,
    propertyTypeName: null,
    city: null,
    province: null,
    deadline: past ? "2026-09-01" : "2026-10-30",
    isDemo: false,
    photoUrls: [],
    status: past ? "closed" : "open",
    sourceType: "public_source",
    ...rest,
  };
}

const build = (rfps: RfpListItem[], vendorCounts = new Map<string, number>()) =>
  buildTradeCityIndex({ rfps, categories, regions, tree, vendorCounts });
const keys = (combos: ReturnType<typeof build>) => combos.map((c) => `${c.category.slug}|${c.region.slug}`).sort();

describe("trade × place pages", () => {
  it(`need ${MIN_LISTINGS}+ open or past tenders`, () => {
    expect(build([rfp({ region: "Toronto" }), rfp({ region: "Toronto", past: true })])).toEqual([]);
    const combos = build([rfp({ region: "Toronto" }), rfp({ region: "Toronto", past: true }), rfp({ region: "Toronto", past: true })]);
    expect(keys(combos)).toEqual(["hvac|toronto"]);
    expect(combos[0].open).toHaveLength(1);
    expect(combos[0].past).toHaveLength(2);
  });

  it("drops a parent identical to its child (GTA = Toronto), keeps it once it differs", () => {
    const toronto = [1, 2, 3].map(() => rfp({ region: "Toronto" }));
    expect(keys(build(toronto))).toEqual(["hvac|toronto"]);
    // A Vaughan tender makes GTA and Ontario different from Toronto — but GTA
    // and Ontario are still identical to each other, so only GTA stays.
    expect(keys(build([...toronto, rfp({ region: "Vaughan" })]))).toEqual(["hvac|greater-toronto-area", "hvac|toronto"]);
  });

  it("never makes country pages, and ignores closed tenders that were never awarded", () => {
    const tx = [1, 2, 3].map(() => rfp({ region: "Texas" }));
    expect(keys(build(tx))).toEqual(["hvac|us-texas"]);
    const closed = [1, 2, 3].map(() => rfp({ region: "Toronto", status: "closed" }));
    expect(build(closed)).toEqual([]);
  });

  it("keeps the vendor gate for cities only", () => {
    const vendors = new Map([["roofing|toronto", 2], ["roofing|ontario", 5]]);
    const combos = build([], vendors);
    expect(keys(combos)).toEqual(["roofing|toronto"]);
    expect(combos[0].open).toEqual([]);
  });

  it("sorts open by soonest deadline and past by most recent", () => {
    const combos = build([
      rfp({ region: "Toronto", deadline: "2026-11-30" }),
      rfp({ region: "Toronto", deadline: "2026-10-01" }),
      rfp({ region: "Toronto", past: true, deadline: "2026-01-01" }),
      rfp({ region: "Toronto", past: true, deadline: "2026-08-01" }),
    ]);
    const t = combos.find((c) => c.region.slug === "toronto")!;
    expect(t.open.map((r) => r.deadline)).toEqual(["2026-10-01", "2026-11-30"]);
    expect(t.past.map((r) => r.deadline)).toEqual(["2026-08-01", "2026-01-01"]);
  });
});

describe("open counts for the homepage finder", () => {
  it("rolls each open tender up to its province and country, never counts past or closed", async () => {
    const { openCountsByTradeRegion } = await import("@/lib/data/trade-city");
    const counts = openCountsByTradeRegion(
      [
        rfp({ region: "Toronto" }),
        rfp({ region: "Vaughan" }),
        rfp({ region: "Texas" }),
        rfp({ region: "Toronto", past: true }),
        rfp({ region: "Toronto", status: "closed" }),
      ],
      categories,
      tree,
    );
    expect(counts["hvac|toronto"]).toBe(1);
    expect(counts["hvac|greater-toronto-area"]).toBe(2);
    expect(counts["hvac|ontario"]).toBe(2);
    expect(counts["hvac|canada"]).toBe(2);
    expect(counts["hvac|united-states"]).toBe(1);
    expect(counts["hvac|*"]).toBe(3);
    expect(counts["roofing|*"]).toBeUndefined();
  });
});
