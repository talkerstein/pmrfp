/**
 * The area picker's list, in map order: each country, then each province or
 * state with its own cities directly beneath it (A→Z at every level). A flat
 * "provinces, then every city" list put Laval between Kitchener and London.
 */
export interface PlaceNode {
  slug: string;
  name: string;
  parentSlug: string | null;
}

export interface OrderedPlace {
  slug: string;
  name: string;
  /** 0 = country, 1 = province/state, 2+ = regions and cities inside it. */
  depth: number;
  /** The top-level ancestor's slug ("canada", "united-states"). */
  root: string;
}

/** Only `active` places are listed; a place whose parent isn't listed hangs off its nearest listed ancestor. */
export function orderPlaces(active: { slug: string; name: string }[], tree: PlaceNode[]): OrderedPlace[] {
  const listed = new Set(active.map((a) => a.slug));
  const name = new Map(active.map((a) => [a.slug, a.name]));
  const parent = new Map(tree.map((n) => [n.slug, n.parentSlug]));
  const listedParent = (slug: string): string | null => {
    const seen = new Set<string>();
    let p = parent.get(slug) ?? null;
    while (p && !listed.has(p) && !seen.has(p)) {
      seen.add(p);
      p = parent.get(p) ?? null;
    }
    return p && listed.has(p) ? p : null;
  };
  const kids = new Map<string | null, string[]>();
  for (const a of active) {
    const p = listedParent(a.slug);
    kids.set(p, [...(kids.get(p) ?? []), a.slug]);
  }
  const byName = (x: string, y: string) => name.get(x)!.localeCompare(name.get(y)!);
  const out: OrderedPlace[] = [];
  const walk = (slug: string, depth: number, root: string) => {
    out.push({ slug, name: name.get(slug)!, depth, root });
    for (const c of (kids.get(slug) ?? []).sort(byName)) walk(c, depth + 1, root);
  };
  // Canada first, then the U.S., then anything else.
  const rank = (s: string) => (s === "canada" ? 0 : s === "united-states" ? 1 : 2);
  for (const r of (kids.get(null) ?? []).sort((a, b) => rank(a) - rank(b) || byName(a, b))) walk(r, 0, r);
  return out;
}
