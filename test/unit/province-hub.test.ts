import { describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn }));

import { buildProvinceHub, PROVINCES } from "@/lib/data/province-hub";
import type { RfpListItem } from "@/lib/data/types";

const rfp = (o: Partial<RfpListItem>): RfpListItem => ({
  slug: "x", title: "T", summary: null, categories: [], regionName: null, propertyTypeName: null, city: null,
  province: null, deadline: "2026-12-01", isDemo: false, photoUrls: [], status: "open", sourceType: null, ...o,
});

describe("buildProvinceHub", () => {
  const tree = [
    { slug: "canada", name: "Canada", parentSlug: null },
    { slug: "ontario", name: "Ontario", parentSlug: "canada" },
    { slug: "toronto", name: "Toronto", parentSlug: "ontario" },
    { slug: "alberta", name: "Alberta", parentSlug: "canada" },
    { slug: "calgary", name: "Calgary", parentSlug: "alberta" },
  ];
  const regions = tree.map((t) => ({ slug: t.slug, name: t.name, province: t.slug === "toronto" ? "Ontario" : null }));
  const categories = [{ slug: "roofing", name: "Roofing" }, { slug: "hvac", name: "HVAC" }];
  const rfps = [
    rfp({ slug: "a", regionName: "Toronto", categories: ["Roofing"] }),
    rfp({ slug: "b", regionName: "Calgary", categories: ["HVAC"] }),
    rfp({ slug: "c", province: "ON", categories: ["HVAC"] }),
    rfp({ slug: "d", regionName: "Toronto", categories: ["Roofing"], deadline: "2020-01-01" }),
    rfp({ slug: "e", regionName: "Toronto", isDemo: true }),
  ];
  const hub = buildProvinceHub({
    def: PROVINCES.ontario, rfps, tree, regions, categories, today: "2026-10-06",
    combos: [{ category: { slug: "roofing", name: "Roofing" }, region: { slug: "toronto", name: "Toronto" }, open: [1, 2, 3], past: [] }],
  });

  it("keeps only this province's live, non-demo listings", () => {
    expect(hub.open.map((r) => r.slug).sort()).toEqual(["a", "c"]);
  });
  it("ranks trades and links cities and trade×city pages", () => {
    expect(hub.trades.map((t) => t.slug).sort()).toEqual(["hvac", "roofing"]);
    expect(hub.places.map((p) => p.slug)).toEqual(["toronto"]);
    expect(hub.tradeCity[0].href).toBe("/trades/roofing/toronto");
  });
});
