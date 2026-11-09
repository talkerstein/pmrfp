import { describe, expect, it } from "vitest";
import { matchingBoard } from "@/lib/data/board-cloudflare";
import type { BoardRow } from "@/lib/data/board-snapshot";

const listing: BoardRow = {
  id: "example", slug: "example", title: "Example", summary: null,
  regionId: null, propertyTypeId: null, city: null, province: null,
  deadline: null, isDemo: false, sourceType: null, gcProjectName: null,
  awardedRfpId: null, publishedAt: null, createdAt: null, categoryIds: ["trade"],
};

describe("public board replica", () => {
  it("keeps only fields in the matching public projection", () => {
    const candidate = { ...listing, privateContact: "must not be returned" };
    expect(matchingBoard([listing], { items: [candidate], next: null })).toEqual([listing]);
  });

  it("rejects unpublished, missing, revised, reordered and incomplete listings", () => {
    const another = { ...listing, id: "another" };
    expect(matchingBoard([], { items: [listing], next: null })).toBeNull();
    expect(matchingBoard([listing], { items: [], next: null })).toBeNull();
    expect(matchingBoard([listing], { items: [{ ...listing, title: "Stale" }], next: null })).toBeNull();
    expect(matchingBoard([listing], { items: [{ ...listing, categoryIds: [] }], next: null })).toBeNull();
    expect(matchingBoard([listing, another], { items: [another, listing], next: null })).toBeNull();
    expect(matchingBoard([listing], { items: [listing], next: listing.id })).toBeNull();
  });
});
