import { describe, expect, it } from "vitest";
import { FREE_LIMIT, canAddTrade, handleFromName, normalizeHandle, telHref, visibleTrades } from "@/lib/trusted/rules";

describe("trusted-trades rules", () => {
  it("normalizes handles to the same shape the database enforces", () => {
    expect(normalizeHandle("Dana Cohen")).toBe("dana-cohen");
    expect(normalizeHandle("  Élise Tremblay-Roy! ")).toBe("elise-tremblay-roy");
    expect(normalizeHandle("ab")).toBeNull();
    expect(normalizeHandle("admin")).toBeNull();
    expect(normalizeHandle("x".repeat(60))).toHaveLength(40);
    // Same pattern as the trusted_lists.handle check constraint.
    for (const h of ["dana-cohen", "abc", "a1b"]) expect(h).toMatch(/^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/);
  });

  it("builds a first handle from the name, then the company", () => {
    expect(handleFromName("Dana Cohen", "RE/MAX Hallmark")).toBe("dana-cohen");
    expect(handleFromName(null, "RE/MAX Hallmark")).toBe("re-max-hallmark");
    expect(handleFromName("", "")).toBe("my-trusted-trades");
  });

  it("caps free pages and lets Realtor Pro go unlimited", () => {
    expect(canAddTrade(FREE_LIMIT - 1, false)).toBe(true);
    expect(canAddTrade(FREE_LIMIT, false)).toBe(false);
    expect(canAddTrade(40, true)).toBe(true);
    const items = Array.from({ length: 8 }, (_, i) => i);
    expect(visibleTrades(items, false)).toHaveLength(FREE_LIMIT);
    expect(visibleTrades(items, true)).toHaveLength(8);
  });

  it("only makes a call link from something that looks like a phone number", () => {
    expect(telHref("(416) 555-0199")).toBe("tel:4165550199");
    expect(telHref("+1 416 555 0199")).toBe("tel:+14165550199");
    expect(telHref("call me")).toBeNull();
  });
});
