import { describe, expect, it } from "vitest";
import { buildRegionIndex, listingRegionSlugs, matchesRegion, type RollupRegion } from "@/lib/regions/rollup";
import { filterAndSort } from "@/lib/data/rfps";
import type { RfpListItem } from "@/lib/data/types";

/** The production tree shape (supabase/migrations 20260529000004 + 20260923000001/5). */
const REGIONS: RollupRegion[] = [
  { id: "ca", slug: "canada", name: "Canada", province: null, country: "Canada", parent_id: null },
  { id: "on", slug: "ontario", name: "Ontario", province: "Ontario", country: "Canada", parent_id: "ca" },
  { id: "qc", slug: "quebec", name: "Quebec", province: "Quebec", country: "Canada", parent_id: "ca" },
  { id: "gta", slug: "greater-toronto-area", name: "Greater Toronto Area", province: "Ontario", country: "Canada", parent_id: "on" },
  { id: "to", slug: "toronto", name: "Toronto", province: "Ontario", country: "Canada", parent_id: "gta" },
  { id: "vau", slug: "vaughan", name: "Vaughan", province: "Ontario", country: "Canada", parent_id: "gta" },
  { id: "ott", slug: "ottawa", name: "Ottawa", province: "Ontario", country: "Canada", parent_id: "on" },
  { id: "lon", slug: "london", name: "London", province: "Ontario", country: "Canada", parent_id: "on" },
  { id: "mtl", slug: "montreal", name: "Montreal", province: "Quebec", country: "Canada", parent_id: "ca" },
  { id: "us", slug: "united-states", name: "United States", province: null, country: "USA", parent_id: null },
  { id: "tx", slug: "us-texas", name: "Texas", province: null, country: "USA", parent_id: "us" },
  { id: "ky", slug: "us-kentucky", name: "Kentucky", province: null, country: "USA", parent_id: "us" },
];
const idx = () => buildRegionIndex(REGIONS);

let n = 0;
function rfp(p: Partial<RfpListItem>): RfpListItem {
  n++;
  return {
    slug: `rfp-${n}`,
    title: p.title ?? `Listing ${n}`,
    summary: null,
    categories: p.categories ?? ["HVAC"],
    regionName: p.regionName ?? null,
    propertyTypeName: null,
    city: p.city ?? null,
    province: p.province ?? null,
    deadline: "2099-01-01",
    isDemo: false,
    photoUrls: [],
    status: "open",
    sourceType: "public_source",
    ...p,
  } as RfpListItem;
}

describe("region rollup (lib/regions/rollup)", () => {
  it("rolls a Toronto job up into the GTA, Ontario and Canada", () => {
    const york = rfp({ title: "Replacement and renewal of the existing rooftop HVAC systems at York Civic Centre", regionName: "Toronto", city: "Toronto", province: "Ontario" });
    expect([...listingRegionSlugs(york, idx())].sort()).toEqual(["canada", "greater-toronto-area", "ontario", "toronto"]);
  });

  it("uses the city when the region is only the province (or missing)", () => {
    const i = idx();
    const vaughan = rfp({ regionName: "Ontario", city: "Vaughan", province: "Ontario" });
    expect(matchesRegion(vaughan, "vaughan", i)).toBe(true);
    expect(matchesRegion(vaughan, "greater-toronto-area", i)).toBe(true);
    const noRegion = rfp({ regionName: null, city: "City of Toronto", province: "Ontario" });
    expect(matchesRegion(noRegion, "toronto", i)).toBe(true);
    // GTA municipalities that aren't regions of their own.
    const pickering = rfp({ regionName: null, city: "Pickering", province: "Ontario" });
    expect(matchesRegion(pickering, "greater-toronto-area", i)).toBe(true);
    expect(matchesRegion(pickering, "ontario", i)).toBe(true);
    expect(matchesRegion(pickering, "toronto", i)).toBe(false);
  });

  it("puts a province-only listing under the province, not under its cities", () => {
    const i = idx();
    const ontario = rfp({ regionName: "Canada", city: null, province: "Ontario" });
    expect(matchesRegion(ontario, "ontario", i)).toBe(true);
    expect(matchesRegion(ontario, "greater-toronto-area", i)).toBe(false);
    const ottawa = rfp({ regionName: "Ottawa", city: "Ottawa", province: "Ontario" });
    expect(matchesRegion(ottawa, "ontario", i)).toBe(true);
    expect(matchesRegion(ottawa, "greater-toronto-area", i)).toBe(false);
  });

  it("never mixes Canada and the U.S.", () => {
    const i = idx();
    const kentucky = rfp({ regionName: "Kentucky", city: "London", province: "Kentucky" });
    expect(matchesRegion(kentucky, "london", i)).toBe(false);
    expect(matchesRegion(kentucky, "ontario", i)).toBe(false);
    expect(matchesRegion(kentucky, "canada", i)).toBe(false);
    expect(matchesRegion(kentucky, "united-states", i)).toBe(true);
    const texas = rfp({ regionName: null, city: "Austin", province: "Texas" });
    expect(matchesRegion(texas, "us-texas", i)).toBe(true);
    expect(matchesRegion(texas, "canada", i)).toBe(false);
    expect(matchesRegion(rfp({ regionName: "Montreal", city: "Montréal", province: "Quebec" }), "quebec", i)).toBe(true);
  });

  it("filters the board: a province includes its cities, GTA includes Toronto (persona QA counts)", () => {
    const board = [
      rfp({ regionName: "Toronto", city: "Toronto", province: "Ontario", categories: ["HVAC"] }),
      rfp({ regionName: "Toronto", city: "Toronto", province: "Ontario", categories: ["Roofing"] }),
      rfp({ regionName: "Ontario", city: null, province: "Ontario", categories: ["Electrical"] }),
      rfp({ regionName: "Ottawa", city: "Ottawa", province: "Ontario", categories: ["HVAC"] }),
      rfp({ regionName: "Montreal", city: "Montréal", province: "Quebec", categories: ["HVAC"] }),
    ];
    const m = {
      regionBySlug: new Map(REGIONS.map((r) => [r.slug, r.name])),
      propBySlug: new Map<string, string>(),
      tradeBySlug: new Map([["hvac", "HVAC"], ["roofing", "Roofing"]]),
      regionIndex: idx(),
    };
    expect(filterAndSort(board, { region: "toronto" }, m)).toHaveLength(2);
    expect(filterAndSort(board, { region: "greater-toronto-area" }, m)).toHaveLength(2);
    expect(filterAndSort(board, { region: "ontario" }, m)).toHaveLength(4);
    expect(filterAndSort(board, { region: "vaughan" }, m)).toHaveLength(0);
    expect(filterAndSort(board, { region: "canada" }, m)).toHaveLength(5);
    expect(filterAndSort(board, { region: "greater-toronto-area", category: "hvac" }, m)).toHaveLength(1);
    expect(filterAndSort(board, { region: "ontario", category: "hvac" }, m)).toHaveLength(2);
    // Without an index (older callers): the exact-name match, as before.
    const { regionIndex: _drop, ...exact } = m;
    void _drop;
    expect(filterAndSort(board, { region: "ontario" }, exact)).toHaveLength(1);
  });
});
