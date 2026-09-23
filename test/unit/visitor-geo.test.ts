import { describe, expect, it } from "vitest";
import { encodeGeo, geoFrom, parseGeoCookie, rfpMarket, visitorMarket, visitorRegionSlug } from "@/lib/visitor-geo";
import { approxUsd } from "@/lib/markets";

describe("visitor geolocation", () => {
  it("reads Vercel's country + region headers", () => {
    expect(geoFrom("US", "TX")).toEqual({ country: "US", province: "Texas" });
    expect(geoFrom("CA", "ON")).toEqual({ country: "CA", province: "Ontario" });
    expect(geoFrom("CA", "QC")).toEqual({ country: "CA", province: "Quebec" });
    expect(geoFrom("FR", "IDF")).toEqual({ country: "FR", province: null });
    expect(geoFrom(null, null)).toEqual({ country: null, province: null });
  });

  it("round-trips through the cookie and rejects junk", () => {
    expect(encodeGeo("us", "tx")).toBe("US-TX");
    expect(parseGeoCookie("US-TX")).toEqual({ country: "US", province: "Texas" });
    expect(encodeGeo("CA", "")).toBe("CA");
    expect(encodeGeo("", "TX")).toBeNull();
    expect(encodeGeo("USA", "TX")).toBeNull();
    expect(parseGeoCookie(undefined)).toEqual({ country: null, province: null });
  });

  it("maps to PMRFP markets and region slugs", () => {
    expect(visitorMarket(geoFrom("US", "NY"))).toBe("US");
    expect(visitorMarket(geoFrom("CA", "BC"))).toBe("CA");
    expect(visitorMarket(geoFrom("GB", null))).toBe("CA"); // default market
    expect(visitorRegionSlug(geoFrom("US", "NY"))).toBe("us-new-york");
    expect(visitorRegionSlug(geoFrom("CA", "NL"))).toBe("newfoundland-and-labrador");
    expect(visitorRegionSlug(geoFrom("CA", null))).toBeNull();
    expect(rfpMarket({ province: "Texas" })).toBe("US");
    expect(rfpMarket({ province: "Ontario" })).toBe("CA");
    expect(rfpMarket({ province: null })).toBe("CA");
  });

  it("rounds USD hints like a person would", () => {
    expect(approxUsd(249)).toBe(180);
    expect(approxUsd(29)).toBe(21);
    expect(approxUsd(599)).toBe(430);
  });
});
