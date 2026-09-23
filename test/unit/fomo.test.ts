import { describe, expect, it } from "vitest";
import { closingLabel, compactDollars, daysUntil, parseAward } from "@/lib/data/fomo";

describe("fomo helpers (real data only)", () => {
  it("parses winner and value from award summaries", () => {
    expect(parseAward("Awarded August 12, 2026 to Ultralite Overhead Doors ULC (Calgary) — $84,500 CAD. Past public contract issued by Parks Canada.")).toEqual({
      winner: "Ultralite Overhead Doors ULC",
      amount: 84500,
      value: "$84,500 CAD",
    });
    expect(parseAward("Awarded July 1, 2026 to ACME INC. — value not disclosed. Past public contract from X.").amount).toBeNull();
    expect(parseAward("Public tender from Ville de Montréal").winner).toBeNull();
  });
  it("counts days in Toronto time, not UTC", () => {
    // 02:30 UTC on Sept 23 is still Sept 22 in Toronto.
    const now = new Date("2026-09-23T02:30:00Z");
    expect(daysUntil("2026-09-23", now)).toBe(1);
    expect(closingLabel(daysUntil("2026-09-23", now))).toBe("Closes tomorrow");
    expect(closingLabel(daysUntil("2026-10-30", now))).toBeNull();
    expect(closingLabel(daysUntil("2026-09-20", now))).toBeNull();
  });
  it("formats headline totals", () => {
    expect(compactDollars(184_442_480)).toBe("$184M");
    expect(compactDollars(1_250_000)).toBe("$1.3M");
    expect(compactDollars(84_500)).toBe("$85K");
  });
});
