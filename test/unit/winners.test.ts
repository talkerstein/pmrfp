import { describe, expect, it } from "vitest";
import { isPublishableWinner, winnerKey, winnersFromRfps } from "@/lib/data/winners";
import type { RfpListItem } from "@/lib/data/types";

function award(slug: string, winner: string, value: string, date: string, categories = ["Paving"]): RfpListItem {
  return {
    slug,
    title: `Contract ${slug}`,
    summary: `Awarded ${date} to ${winner} (Halifax) — ${value}. Past public contract issued by a Nova Scotia public body.`,
    categories,
    regionName: "Nova Scotia",
    propertyTypeName: null,
    city: null,
    province: "Nova Scotia",
    deadline: date,
    isDemo: false,
    photoUrls: [],
    status: "awarded",
    sourceType: "public_source",
  };
}

describe("contract winners", () => {
  it("merges spelling variants of the same company", () => {
    expect(winnerKey("DEXTER CONSTRUCTION CO. LTD.")).toBe(winnerKey("Dexter Construction Company Ltd"));
    expect(winnerKey("Metro Roofing Inc.")).toBe(winnerKey("Metro Roofing Limited"));
  });

  it("never publishes people's names or placeholder text", () => {
    expect(isPublishableWinner("Alain Roy")).toBe(false);
    expect(isPublishableWinner("No Bids")).toBe(false);
    expect(isPublishableWinner("Multiple bidders")).toBe(false);
    expect(isPublishableWinner("Metro Roofing Ltd.")).toBe(true);
    expect(isPublishableWinner("TK Elevator")).toBe(true);
    // Two capitalized words, but a business — must not be mistaken for a person.
    expect(isPublishableWinner("Dexter Construction")).toBe(true);
    expect(isPublishableWinner("Metro Roofing")).toBe(true);
    expect(isPublishableWinner("ALAIN ROY")).toBe(false);
  });

  it("only makes pages for 2+ awards, totals value, prefers the mixed-case name", () => {
    const rfps = [
      award("a-nsa-1", "ABERDEEN PAVING LTD.", "$100,000 CAD", "2026-05-01"),
      award("b-nsa-2", "Aberdeen Paving Ltd.", "$250,000 CAD", "2026-07-01"),
      award("c-nsa-3", "Solo Builders Inc.", "$90,000 CAD", "2026-06-01"),
      award("d-nsa-4", "Alain Roy", "$5,000 CAD", "2026-06-01"),
      award("e-nsa-5", "Alain Roy", "$6,000 CAD", "2026-06-02"),
    ];
    const winners = winnersFromRfps(rfps);
    expect(winners).toHaveLength(1);
    expect(winners[0].name).toBe("Aberdeen Paving Ltd.");
    expect(winners[0].slug).toBe("aberdeen-paving-ltd");
    expect(winners[0].totalValue).toBe(350000);
    expect(winners[0].awards[0].date).toBe("2026-07-01");
  });
});
