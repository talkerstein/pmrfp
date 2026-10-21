/**
 * Province pages (/buyers/<province>): every town and public buyer in one
 * province, grouped by kind, as a compact list the page filters in the
 * browser. Pure (test/unit/buyer-follows.test.ts): the page feeds it the
 * shared snapshots (buyer pages, managed pages, permissions), so a province
 * page never loads anything per request of its own. Canada only.
 */
import { PROVINCE_NAMES, provinceSlugOf, type BuyerPage } from "./model";
import { PROVINCE_GROUPS, searchKey, type CompactBuyer, type ProvinceGroup } from "./province-list";

export { PROVINCE_GROUPS, filterBuyers, searchKey, type CompactBuyer, type ProvinceGroup } from "./province-list";

/** Statistics Canada municipal statuses → group (a Québec "Ville" depends on its size). */
const CENSUS_GROUP: Record<string, ProvinceGroup> = {
  City: "cities",
  Town: "towns",
  Township: "townships",
  Municipality: "townships",
  "Rural municipality": "townships",
  "Rural community": "townships",
  "District municipality": "townships",
  "Island municipality": "townships",
  "Municipal district": "townships",
  "Canton (municipalité de)": "townships",
  "Cantons unis (municipalité de)": "townships",
  "Paroisse (municipalité de)": "townships",
  "Municipalité": "townships",
  Village: "villages",
  "Summer village": "villages",
  "Resort village": "villages",
  "Resort municipality": "villages",
  Hamlet: "villages",
  "Northern hamlet": "villages",
  "Northern village": "villages",
  "Village nordique": "villages",
  "Village cri": "villages",
  "Village naskapi": "villages",
  "Chartered community": "villages",
  "Community government": "villages",
  "Local government district": "villages",
  "Improvement district": "villages",
  "Special area": "villages",
  "County municipality": "counties",
  "Regional municipality": "counties",
  "Specialized municipality": "counties",
  "Gouvernement régional": "counties",
};

/** A Québec "Ville" this big reads as a city; smaller ones as towns. */
export const VILLE_CITY_POPULATION = 10_000;

const BUYER_GROUP: Record<string, ProvinceGroup> = {
  province: "provincial",
  regional: "counties",
  school: "school",
  "post-secondary": "postSecondary",
  health: "health",
  housing: "housing",
  conservation: "conservation",
  agency: "agencies",
};

/** Which list a buyer page sits in on its province page. */
export function provinceGroupOf(p: Pick<BuyerPage, "buyer" | "town">): ProvinceGroup {
  if (p.town) {
    if (p.town.type === "Ville") return (p.town.population ?? 0) >= VILLE_CITY_POPULATION ? "cities" : "towns";
    const g = CENSUS_GROUP[p.town.type];
    if (g) return g;
  }
  if (p.buyer.group !== "municipality") return BUYER_GROUP[p.buyer.group] ?? "agencies";
  const n = p.buyer.name.toLowerCase();
  if (/^(the )?(city|ville|cité) (of|de)\b/.test(n)) return "cities";
  if (/^(the )?town of\b/.test(n)) return "towns";
  if (/^(the )?(village|hamlet|summer village|resort village) of\b/.test(n)) return "villages";
  if (/\b(county|counties|region|regional)\b/.test(n)) return "counties";
  return "townships";
}

export interface ProvinceDirectory {
  province: string;
  provinceSlug: string;
  provinceCode: string;
  total: number;
  withOpen: number;
  verified: number;
  /** Groups that have buyers, in page order. */
  groups: { group: ProvinceGroup; count: number }[];
  items: CompactBuyer[];
}

/** Sort key: the place without "City of" / "Ville de", no accents. */
export function sortKey(name: string): string {
  return searchKey(name.replace(/^(the\s+)?((corporation of the\s+)?(city|town|township|village|municipality|county|united counties|region|regional municipality|district|rural municipality|municipal district|summer village|resort village|ville|cité|municipalité|canton|cantons unis|paroisse|village nordique|regional district)\s+(of|de|d'|du|des)\s+(the\s+)?)/i, ""));
}

/** Every page in one province as the compact list, with the badges from the snapshots. */
export function provinceDirectory(
  pages: readonly BuyerPage[],
  provinceSlug: string,
  signals: {
    /** Is this page managed by a verified buyer? */
    managed: (p: BuyerPage) => boolean;
    /** Did this buyer say yes to listing its tenders? */
    listed: (p: BuyerPage) => boolean;
    /** The name shown (lib/towns/claimable buyerDisplayName in the page's language). */
    name: (p: BuyerPage) => string;
  },
): ProvinceDirectory | null {
  const province = Object.values(PROVINCE_NAMES).find((n) => provinceSlugOf(n) === provinceSlug);
  if (!province) return null;
  const provinceCode = Object.entries(PROVINCE_NAMES).find(([, n]) => n === province)![0];
  const mine = pages.filter((p) => p.provinceSlug === provinceSlug);
  const order = new Map(PROVINCE_GROUPS.map((g, i) => [g, i]));
  const rows = mine.map((p) => {
    const n = signals.name(p);
    const item: CompactBuyer = { n, s: p.buyer.slug, g: provinceGroupOf(p) };
    if (p.town?.population != null) item.p = p.town.population;
    if (signals.managed(p)) item.v = 1;
    if (signals.listed(p)) item.l = 1;
    if (p.openBids.length) item.o = p.openBids.length;
    return { item, key: sortKey(n) };
  });
  rows.sort((a, b) => order.get(a.item.g)! - order.get(b.item.g)! || a.key.localeCompare(b.key) || a.item.s.localeCompare(b.item.s));
  const items = rows.map((r) => r.item);
  const counts = new Map<ProvinceGroup, number>();
  for (const it of items) counts.set(it.g, (counts.get(it.g) ?? 0) + 1);
  return {
    province,
    provinceSlug,
    provinceCode,
    total: items.length,
    withOpen: items.filter((i) => i.o).length,
    verified: items.filter((i) => i.v).length,
    groups: PROVINCE_GROUPS.filter((g) => counts.has(g)).map((group) => ({ group, count: counts.get(group)! })),
    items,
  };
}

/** Provinces and territories that have buyer pages, biggest first (Ontario leads), for /buyers and the sitemap. */
export function provinceList(pages: readonly Pick<BuyerPage, "province" | "provinceSlug">[]): { province: string; provinceSlug: string; total: number }[] {
  const counts = new Map<string, number>();
  for (const p of pages) counts.set(p.province, (counts.get(p.province) ?? 0) + 1);
  return [...counts.entries()]
    .filter(([province]) => Object.values(PROVINCE_NAMES).includes(province))
    .map(([province, total]) => ({ province, provinceSlug: provinceSlugOf(province), total }))
    .sort((a, b) => Number(b.province === "Ontario") - Number(a.province === "Ontario") || b.total - a.total || a.province.localeCompare(b.province));
}

/** French takes "au", "aux", "à" or "en" by province ("au Québec", "en Ontario"). */
const IN_FR: Record<string, string> = {
  Ontario: "en Ontario",
  Quebec: "au Québec",
  "British Columbia": "en Colombie-Britannique",
  Alberta: "en Alberta",
  Manitoba: "au Manitoba",
  Saskatchewan: "en Saskatchewan",
  "Nova Scotia": "en Nouvelle-Écosse",
  "New Brunswick": "au Nouveau-Brunswick",
  "Prince Edward Island": "à l'Île-du-Prince-Édouard",
  "Newfoundland and Labrador": "à Terre-Neuve-et-Labrador",
  Yukon: "au Yukon",
  "Northwest Territories": "dans les Territoires du Nord-Ouest",
  Nunavut: "au Nunavut",
};

/** "in Ontario" / "au Québec" / "en Ontario": `province` is the English name, `localized` its name in `lang`. */
export function inProvince(province: string, lang: "en" | "fr" | "es", localized: string): string {
  if (lang === "fr") return IN_FR[province] ?? `en ${localized}`;
  return `${lang === "es" ? "en" : "in"} ${localized}`;
}

/** /buyers/<province> */
export const provincePath = (provinceSlug: string) => `/buyers/${provinceSlug}`;
