import { expect, it } from "vitest";
import { matchingTaxonomy } from "@/lib/data/taxonomy-cloudflare";

const fields = ["id", "slug", "name", "active"];
const source = [{ id: "fixture", slug: "roofing", name: "Roofing", active: true }];

it("serves only Cloudflare rows with exactly the same public fields as the source", () => {
  const copy = { ...source[0], upstreamOnly: "omit" };
  const matched = matchingTaxonomy(source, { items: [copy], next: null }, fields);
  expect(matched).toEqual(source);
  expect(matched).not.toBe(source);
});

it("preserves the source path for stale, incomplete, or malformed Cloudflare data", () => {
  for (const candidate of [
    null, { items: [], next: null }, { items: source, next: "extra-page" },
    { items: [{ ...source[0], name: "Old name" }], next: null },
    { items: [{ ...source[0], active: 1 }], next: null },
    { items: [{ id: "fixture", slug: "roofing", name: "Roofing" }], next: null },
  ]) expect(matchingTaxonomy(source, candidate, fields)).toBeNull();
});
