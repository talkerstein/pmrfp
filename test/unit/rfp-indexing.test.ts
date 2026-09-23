import { describe, expect, it } from "vitest";
import { isIndexableRfp } from "@/lib/seo/rfp-indexing";

const base = { isDemo: false, sourceType: "public_source" as string | null };

describe("isIndexableRfp", () => {
  it("indexes open tenders", () => {
    expect(isIndexableRfp({ ...base, slug: "roof-repair-12345", status: "open" })).toBe(true);
  });
  it("drops closed public tenders", () => {
    expect(isIndexableRfp({ ...base, slug: "roof-repair-12345", status: "closed" })).toBe(false);
    expect(isIndexableRfp({ ...base, slug: "hvac-service-tor-998", status: "closed" })).toBe(false);
  });
  it("keeps past public contracts (award notices)", () => {
    expect(isIndexableRfp({ ...base, slug: "paving-cba-ab12", status: "closed" })).toBe(true);
    expect(isIndexableRfp({ ...base, slug: "toiture-qca-77", status: "awarded" })).toBe(true);
  });
  it("keeps property-manager RFPs even after closing", () => {
    expect(isIndexableRfp({ ...base, sourceType: null, slug: "lobby-refresh", status: "closed" })).toBe(true);
  });
  it("never indexes demo listings", () => {
    expect(isIndexableRfp({ ...base, isDemo: true, slug: "demo-roof", status: "open" })).toBe(false);
  });
});
