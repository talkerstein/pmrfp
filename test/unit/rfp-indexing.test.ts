import { describe, expect, it } from "vitest";
import { isIndexableRfp } from "@/lib/seo/rfp-indexing";

const pub = { slug: "roof-repair-12345", sourceType: "public_source" as string | null };

describe("isIndexableRfp", () => {
  it("indexes open RFPs, public or property-manager", () => {
    expect(isIndexableRfp({ ...pub, isDemo: false, status: "open" })).toBe(true);
  });
  it("drops closed tenders and past contracts (they live on the winner and trade pages)", () => {
    expect(isIndexableRfp({ ...pub, isDemo: false, status: "closed" })).toBe(false);
    expect(isIndexableRfp({ ...pub, isDemo: false, status: "awarded" })).toBe(false);
  });
  it("never indexes an award notice, whatever its status says", () => {
    expect(isIndexableRfp({ slug: "paving-cba-ab12", sourceType: "public_source", isDemo: false, status: "open" })).toBe(false);
  });
  it("indexes an open property-manager RFP", () => {
    expect(isIndexableRfp({ slug: "lobby-refresh", sourceType: null, isDemo: false, status: "open" })).toBe(true);
  });
  it("never indexes demo listings", () => {
    expect(isIndexableRfp({ ...pub, isDemo: true, status: "open" })).toBe(false);
  });
});
