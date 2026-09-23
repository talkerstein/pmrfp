/**
 * Regions form a tree (canada → ontario → greater-toronto-area → toronto;
 * united-states → us-texas). A trade serving a region serves everything
 * under it: "Ontario" covers Toronto tenders, "United States" covers Texas.
 * Alert matching used to be exact-id only, so a trade tagged "Ontario" never
 * heard about a Toronto RFP.
 */
export interface RegionNode {
  id: string;
  parent_id: string | null;
}

/** The selected region ids plus every descendant. */
export function expandRegionIds(selected: Iterable<string>, regions: RegionNode[]): Set<string> {
  const children = new Map<string, string[]>();
  for (const r of regions) {
    if (!r.parent_id) continue;
    const list = children.get(r.parent_id);
    if (list) list.push(r.id);
    else children.set(r.parent_id, [r.id]);
  }
  const out = new Set<string>();
  const stack = [...selected];
  while (stack.length) {
    const id = stack.pop()!;
    if (out.has(id)) continue; // also guards against a cycle in bad data
    out.add(id);
    stack.push(...(children.get(id) ?? []));
  }
  return out;
}
