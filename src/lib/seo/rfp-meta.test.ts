import { describe, expect, it } from "vitest";
import { buyerFromSummary, cleanTenderTitle, clip, placeLabel } from "./rfp-meta";
import { normalizeIndexNowUrls } from "./indexnow";

describe("rfp-meta", () => {
  it("pulls the buyer out of public-tender summaries", () => {
    expect(buyerFromSummary("Public tender from Cégep régional de Lanaudière (Repentigny), posted on SEAO. Documents are in French.")).toBe(
      "Cégep régional de Lanaudière",
    );
    expect(buyerFromSummary("Public tender from City of Toronto, posted on the city's portal.")).toBe("City of Toronto");
    expect(buyerFromSummary("Michigan. 10/5/2026 This Amendment is to provide…")).toBeNull();
    expect(buyerFromSummary(null)).toBeNull();
  });

  it("drops US classification prefixes", () => {
    expect(cleanTenderTitle("NAICS 237990 PSC Y1PZ--CONS: 909CM3030 Fort Custer NC - Cemetery Expansion")).toBe(
      "909CM3030 Fort Custer NC - Cemetery Expansion",
    );
    expect(cleanTenderTitle("Snow removal at 1 Dufferin St")).toBe("Snow removal at 1 Dufferin St");
  });

  it("clips at a word boundary", () => {
    expect(clip("short", 10)).toBe("short");
    const c = clip("Snow removal and winter maintenance services for the north yard", 30);
    expect(c.length).toBeLessThanOrEqual(30);
    expect(c.endsWith("…")).toBe(true);
    expect(c).not.toMatch(/\s…$/);
  });

  it("builds a place label without repeats", () => {
    expect(placeLabel("Toronto", "Ontario")).toBe("Toronto, Ontario");
    expect(placeLabel(null, "Ontario")).toBe("Ontario");
    expect(placeLabel("Yukon", "Yukon")).toBe("Yukon");
    expect(placeLabel(null, null)).toBe("");
  });
});

describe("indexnow", () => {
  it("keeps same-host absolute URLs, de-duplicated", () => {
    expect(
      normalizeIndexNowUrls(["/rfps/a", "https://pmrfp.com/rfps/a", "https://evil.com/x", "/rfps/b"], "https://pmrfp.com"),
    ).toEqual(["https://pmrfp.com/rfps/a", "https://pmrfp.com/rfps/b"]);
  });
});
