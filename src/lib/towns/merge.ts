/**
 * One page per buyer: Statistics Canada's municipalities merged with the
 * researched buyer directory (src/lib/buyers/directory.json). Matched by
 * name + province; when both have a place, the directory entry wins (its
 * slug, bids page, platforms and inbox) and the town only adds its census
 * facts. Pure, so it's unit tested (test/unit/towns.test.ts).
 */
import { placeKey, townMatchKeys, type DirectoryBuyer } from "@/lib/buyers/model";
import type { TownEntry } from "./data";

/** Directory groups that can be a municipality (Nova Scotia's regional municipalities and Alberta's counties sit in "regional"). */
const MUNICIPAL_GROUPS = new Set(["municipality", "regional"]);

/** Directory entries no naming rule can pair: the census lists the County of Brant (a single-tier county) as a city. */
const ALIASES: Readonly<Record<string, string>> = { "ON/brant-county": "3529005" };

/** "City of" ↔ City, "Town of" ↔ Town…: breaks a tie between same-named places in one province. */
function typeAgrees(buyerName: string, t: Pick<TownEntry, "type">): boolean {
  const n = buyerName.toLowerCase();
  const word = t.type.toLowerCase().split(/[ (]/)[0];
  return word.length > 2 && n.includes(word);
}

export interface TownMerge {
  /** Directory buyer key ("<provinceCode>/<slug>") → the town it covers. */
  byDirectory: Map<string, TownEntry>;
  /** Towns no directory entry covers: they get pages of their own. */
  unmerged: TownEntry[];
}

export const directoryKeyOf = (b: Pick<DirectoryBuyer, "provinceCode" | "slug">) => `${b.provinceCode}/${b.slug}`;

/**
 * Pairs each municipal directory entry with at most one town (and each town
 * with at most one entry). Ties go to the town whose type the entry names,
 * then the most populous.
 */
export function mergeTownsWithDirectory(towns: readonly TownEntry[], directory: readonly DirectoryBuyer[]): TownMerge {
  const byKey = new Map<string, TownEntry[]>();
  for (const t of towns) {
    for (const k of townMatchKeys(t)) {
      const key = `${t.provinceCode}|${k}`;
      byKey.set(key, [...(byKey.get(key) ?? []), t]);
    }
  }
  const taken = new Set<string>();
  const byDirectory = new Map<string, TownEntry>();
  const byId = new Map(towns.map((t) => [t.id, t] as const));
  for (const b of directory) {
    if (!MUNICIPAL_GROUPS.has(b.group)) continue;
    const alias = byId.get(ALIASES[directoryKeyOf(b)] ?? "");
    const candidates = (alias ? [alias] : byKey.get(`${b.provinceCode}|${placeKey(b.name)}`) ?? []).filter((t) => !taken.has(t.id));
    if (!candidates.length) continue;
    const best = [...candidates].sort(
      (x, y) => Number(typeAgrees(b.name, y)) - Number(typeAgrees(b.name, x)) || (y.population ?? 0) - (x.population ?? 0) || x.slug.localeCompare(y.slug),
    )[0];
    taken.add(best.id);
    byDirectory.set(directoryKeyOf(b), best);
  }
  return { byDirectory, unmerged: towns.filter((t) => !taken.has(t.id)) };
}
