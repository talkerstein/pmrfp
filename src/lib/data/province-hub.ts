import { getCategories, getRegions } from "@/lib/data/taxonomy";
import { listAllRfpsCached, listQualifyingCombos, regionTree, type RegionNodeLite } from "@/lib/data/trade-city";
import { isPastContract, parseAward } from "@/lib/data/fomo";
import { winnersFromRfps, isPublishableWinner } from "@/lib/data/winners";
import { publicTenderSource } from "@/lib/tenders/sources";
import type { RfpListItem } from "@/lib/data/types";

/**
 * Province / state hub pages (/ontario, /alberta …). One definition per place;
 * the page component is generic. Everything shown is computed from the live
 * board, so two hubs never share copy beyond the frame.
 */
export interface ProvinceDef {
  /** Region slug in the taxonomy and the URL path ("/ontario"). */
  slug: string;
  name: string;
  /** Postal abbreviation, also accepted in rfp.province. */
  code: string;
  country: "Canada" | "United States";
  /** "Government of Ontario" — for the not-affiliated line. */
  government: string;
  /** Pull City of Toronto TOBids awards into the recent-awards section. */
  torontoAwards?: boolean;
}

export const PROVINCES: Record<string, ProvinceDef> = {
  ontario: { slug: "ontario", name: "Ontario", code: "ON", country: "Canada", government: "Government of Ontario", torontoAwards: true },
  alberta: { slug: "alberta", name: "Alberta", code: "AB", country: "Canada", government: "Government of Alberta" },
};

export interface ProvinceHubData {
  open: RfpListItem[];
  past: RfpListItem[];
  trades: { slug: string; name: string; open: number; total: number; href: string }[];
  places: { slug: string; name: string; open: number; total: number }[];
  tradeCity: { href: string; trade: string; place: string; count: number }[];
  buyers: { name: string; count: number }[];
  awards: { slug: string; title: string; winner: string; amount: number | null; date: string | null }[];
  winners: { slug: string; name: string; count: number; total: number }[];
}

/** Region slugs/names under (and including) the province. Pure. */
export function provincePlaces(def: ProvinceDef, tree: RegionNodeLite[], regions: { slug: string; name: string; province: string | null }[]) {
  const children = new Map<string, string[]>();
  for (const n of tree) if (n.parentSlug) children.set(n.parentSlug, [...(children.get(n.parentSlug) ?? []), n.slug]);
  const slugs = new Set<string>();
  const stack = [def.slug];
  while (stack.length) {
    const s = stack.pop()!;
    if (slugs.has(s)) continue;
    slugs.add(s);
    stack.push(...(children.get(s) ?? []));
  }
  for (const r of regions) if (r.province === def.name || r.province === def.code) slugs.add(r.slug);
  const nameOf = new Map([...tree.map((n) => [n.slug, n.name] as const), ...regions.map((r) => [r.slug, r.name] as const)]);
  const names = new Set([...slugs].map((s) => nameOf.get(s)).filter((x): x is string => Boolean(x)));
  return { slugs, names, nameOf };
}

export function inProvince(r: RfpListItem, def: ProvinceDef, names: Set<string>): boolean {
  if (r.isDemo) return false;
  if (r.regionName && names.has(r.regionName)) return true;
  const p = (r.province ?? "").trim().toLowerCase();
  return p === def.name.toLowerCase() || p === def.code.toLowerCase();
}

const count = <K,>(keys: K[]) => {
  const m = new Map<K, number>();
  for (const k of keys) m.set(k, (m.get(k) ?? 0) + 1);
  return m;
};

/** Pure assembly, exported for tests. */
export function buildProvinceHub(input: {
  def: ProvinceDef;
  rfps: RfpListItem[];
  tree: RegionNodeLite[];
  regions: { slug: string; name: string; province: string | null }[];
  categories: { slug: string; name: string }[];
  combos: { category: { slug: string; name: string }; region: { slug: string; name: string }; open: unknown[]; past: unknown[] }[];
  today?: string;
}): ProvinceHubData {
  const { def, rfps, tree, regions, categories, combos } = input;
  const today = input.today ?? new Date().toISOString().slice(0, 10);
  const { slugs, names } = provincePlaces(def, tree, regions);
  const local = rfps.filter((r) => inProvince(r, def, names));
  const open = local
    .filter((r) => r.status === "open" && !isPastContract(r) && (!r.deadline || r.deadline.slice(0, 10) >= today))
    .sort((a, b) => (a.deadline ?? "9999").localeCompare(b.deadline ?? "9999"));
  const past = local.filter(isPastContract).sort((a, b) => (b.deadline ?? "").localeCompare(a.deadline ?? ""));

  const catSlug = new Map(categories.map((c) => [c.name, c.slug]));
  const comboKeys = new Set(combos.map((c) => `${c.category.slug}|${c.region.slug}`));
  const openByTrade = count(open.flatMap((r) => r.categories));
  const allByTrade = count([...open, ...past].flatMap((r) => r.categories));
  const trades = [...allByTrade.entries()]
    .filter(([n]) => catSlug.has(n))
    .map(([name, total]) => {
      const slug = catSlug.get(name)!;
      return {
        slug,
        name,
        open: openByTrade.get(name) ?? 0,
        total,
        href: comboKeys.has(`${slug}|${def.slug}`) ? `/trades/${slug}/${def.slug}` : `/trades/${slug}`,
      };
    })
    .sort((a, b) => b.open - a.open || b.total - a.total || a.name.localeCompare(b.name))
    .slice(0, 12);

  const openByPlace = count(open.map((r) => r.regionName));
  const allByPlace = count([...open, ...past].map((r) => r.regionName));
  const places = regions
    .filter((r) => slugs.has(r.slug) && r.slug !== def.slug)
    .map((r) => ({ slug: r.slug, name: r.name, open: openByPlace.get(r.name) ?? 0, total: allByPlace.get(r.name) ?? 0 }))
    .sort((a, b) => b.open - a.open || b.total - a.total || a.name.localeCompare(b.name));

  const tradeCity = combos
    .filter((c) => slugs.has(c.region.slug) && c.region.slug !== def.slug)
    .map((c) => ({
      href: `/trades/${c.category.slug}/${c.region.slug}`,
      trade: c.category.name,
      place: c.region.name,
      count: c.open.length + c.past.length,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 24);

  const buyers = [...count(local.filter((r) => r.sourceType === "public_source").map((r) => publicTenderSource(r.slug).issuer)).entries()]
    .map(([name, n]) => ({ name, count: n }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 12);

  const awards = past
    .map((r) => ({ r, ...parseAward(r.summary) }))
    .filter((x) => x.winner && isPublishableWinner(x.winner))
    .slice(0, 8)
    .map(({ r, winner, amount }) => ({ slug: r.slug, title: r.title, winner: winner!, amount, date: r.deadline }));

  const winners = winnersFromRfps(rfps)
    .filter((w) => w.awards.some((a) => a.regionName && names.has(a.regionName)))
    .slice(0, 10)
    .map((w) => ({ slug: w.slug, name: w.name, count: w.awards.length, total: w.totalValue }));

  return { open, past, trades, places, tradeCity, buyers, awards, winners };
}

export async function getProvinceHub(def: ProvinceDef): Promise<ProvinceHubData> {
  const [rfps, tree, regions, categories, combos] = await Promise.all([
    listAllRfpsCached().catch(() => [] as RfpListItem[]),
    regionTree().catch(() => []),
    getRegions().catch(() => []),
    getCategories().catch(() => []),
    listQualifyingCombos().catch(() => []),
  ]);
  return buildProvinceHub({ def, rfps, tree, regions, categories, combos });
}
