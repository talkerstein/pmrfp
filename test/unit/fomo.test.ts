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
  it("updates the Toronto date at midnight and handles daylight-saving boundaries", () => {
    expect(daysUntil("2026-11-02", new Date("2026-11-02T04:59:59Z"))).toBe(1);
    expect(daysUntil("2026-11-02", new Date("2026-11-02T05:00:00Z"))).toBe(0);
    expect(daysUntil("2026-03-08", new Date("2026-03-08T06:59:59Z"))).toBe(0);
    expect(daysUntil("2026-03-08", new Date("2026-03-08T07:00:00Z"))).toBe(0);
    expect(daysUntil(null)).toBeNull();
  });
  it("formats headline totals", () => {
    expect(compactDollars(184_442_480)).toBe("$184M");
    expect(compactDollars(1_250_000)).toBe("$1.3M");
    expect(compactDollars(84_500)).toBe("$85K");
  });
  it("formats headline totals and countdowns in French and Spanish", () => {
    expect(compactDollars(1_250_000, "fr")).toBe("1,3 M$");
    expect(compactDollars(1_437_000_000, "es")).toBe("$1,400 M");
    expect(compactDollars(184_442_480, "es")).toBe("$184 M");
    expect(compactDollars(1_250_000, "es")).toBe("$1.3 M");
    expect(compactDollars(84_500, "es")).toBe("$85 mil");
    expect(compactDollars(420, "es")).toBe("$420");
    expect(closingLabel(0, "es")).toBe("Cierra hoy");
    expect(closingLabel(3, "es")).toBe("Cierra en 3 días");
  });
});
