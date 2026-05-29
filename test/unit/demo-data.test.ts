import { describe, expect, it } from "vitest";
import {
  DEMO_CATEGORIES,
  DEMO_PROPERTY_TYPES,
  DEMO_REGIONS,
  DEMO_RFPS,
  DEMO_VENDORS,
} from "@/lib/demo-data";

const catSlugs = new Set(DEMO_CATEGORIES.map((c) => c.slug));
const regionSlugs = new Set(DEMO_REGIONS.map((r) => r.slug));
const propSlugs = new Set(DEMO_PROPERTY_TYPES.map((p) => p.slug));

describe("taxonomy counts match the spec", () => {
  it("41 categories, 21 regions, 21 property types", () => {
    expect(DEMO_CATEGORIES).toHaveLength(41);
    expect(DEMO_REGIONS).toHaveLength(21);
    expect(DEMO_PROPERTY_TYPES).toHaveLength(21);
  });
  it("has unique slugs", () => {
    expect(catSlugs.size).toBe(DEMO_CATEGORIES.length);
    expect(regionSlugs.size).toBe(DEMO_REGIONS.length);
    expect(propSlugs.size).toBe(DEMO_PROPERTY_TYPES.length);
  });
});

describe("demo vendors reference valid taxonomy", () => {
  it("every vendor's categories/regions/property types exist", () => {
    for (const v of DEMO_VENDORS) {
      for (const c of v.categories) expect(catSlugs.has(c), `vendor ${v.slug} category ${c}`).toBe(true);
      for (const r of v.regions) expect(regionSlugs.has(r), `vendor ${v.slug} region ${r}`).toBe(true);
      for (const p of v.propertyTypes) expect(propSlugs.has(p), `vendor ${v.slug} propertyType ${p}`).toBe(true);
    }
  });
  it("vendor slugs are unique", () => {
    const slugs = DEMO_VENDORS.map((v) => v.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });
});

describe("demo RFPs reference valid taxonomy", () => {
  it("every RFP's category/region/property type exists", () => {
    for (const r of DEMO_RFPS) {
      expect(catSlugs.has(r.category), `rfp ${r.slug} category`).toBe(true);
      expect(regionSlugs.has(r.region), `rfp ${r.slug} region`).toBe(true);
      expect(propSlugs.has(r.propertyType), `rfp ${r.slug} propertyType`).toBe(true);
    }
  });
  it("rfp slugs are unique and deadlines are valid dates", () => {
    const slugs = DEMO_RFPS.map((r) => r.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const r of DEMO_RFPS) expect(Number.isNaN(Date.parse(r.deadline))).toBe(false);
  });
});
