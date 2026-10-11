import { describe, expect, it } from "vitest";
import { resolveBoardCountry } from "@/lib/data/board-country";

describe("board and metadata use the same market", () => {
  it("uses the US count when a Canadian visitor switches to the US", () => {
    expect(resolveBoardCountry({ country: "us" }, "CA")).toBe("us");
  });
  it("uses the Canada count for a US visitor's explicit Canada filter", () => {
    expect(resolveBoardCountry({ country: "ca" }, "US")).toBe("ca");
  });
  it("preserves all-market and region navigation", () => {
    expect(resolveBoardCountry({ country: "all" }, "US")).toBe("all");
    expect(resolveBoardCountry({ region: "ontario" }, "US")).toBe("all");
    expect(resolveBoardCountry({ country: "us", region: "ontario" }, "CA")).toBe("us");
  });
  it("falls back to the visitor's market for absent or invalid filters", () => {
    expect(resolveBoardCountry({}, "US")).toBe("us");
    expect(resolveBoardCountry({ country: "invalid" }, "CA")).toBe("ca");
  });
});
