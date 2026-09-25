import { describe, expect, it } from "vitest";
import { orderPlaces } from "@/lib/data/place-order";

const tree = [
  { slug: "canada", name: "Canada", parentSlug: null },
  { slug: "ontario", name: "Ontario", parentSlug: "canada" },
  { slug: "quebec", name: "Quebec", parentSlug: "canada" },
  { slug: "greater-toronto-area", name: "Greater Toronto Area", parentSlug: "ontario" },
  { slug: "toronto", name: "Toronto", parentSlug: "greater-toronto-area" },
  { slug: "london", name: "London", parentSlug: "ontario" },
  { slug: "laval", name: "Laval", parentSlug: "quebec" },
  { slug: "united-states", name: "United States", parentSlug: null },
  { slug: "us-texas", name: "Texas", parentSlug: "united-states" },
];

describe("area picker order", () => {
  it("puts every city under its own province, countries first", () => {
    const out = orderPlaces(tree.map(({ slug, name }) => ({ slug, name })), tree);
    expect(out.map((p) => `${p.depth}:${p.slug}`)).toEqual([
      "0:canada",
      "1:ontario",
      "2:greater-toronto-area",
      "3:toronto",
      "2:london",
      "1:quebec",
      "2:laval",
      "0:united-states",
      "1:us-texas",
    ]);
    expect(out.find((p) => p.slug === "laval")?.root).toBe("canada");
  });

  it("hangs a place off its nearest listed ancestor when its parent is inactive", () => {
    const active = tree.filter((t) => t.slug !== "greater-toronto-area").map(({ slug, name }) => ({ slug, name }));
    const out = orderPlaces(active, tree);
    expect(out.find((p) => p.slug === "toronto")?.depth).toBe(2);
  });
});
