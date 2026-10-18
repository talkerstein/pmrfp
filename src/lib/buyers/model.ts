/**
 * "Where every buyer posts bids": the public buyer directory (/buyers and
 * /buyers/<province>/<slug>). Pure, so it's unit tested
 * (test/unit/buyer-directory.test.ts); the loader (./load.ts) feeds it the
 * shared board snapshot and the major-projects snapshot (no queries of its own).
 *
 * Rules:
 *  - Canada only (the directory research covers Canadian buyers). Every
 *    award, open bid and project joined to a buyer is Canadian and in CAD.
 *  - Link only: for a buyer that posts on a commercial bid platform
 *    (bids&tenders, Bonfire, Biddingo, MERX, Jaggaer/Ontario Tenders Portal)
 *    the page names the platform and links to the buyer's official bids page
 *    and portal. It never copies or lists that platform's tenders. Open bids
 *    shown are ones already on the PMRFP board from licensed / own-site
 *    feeds, each linking to its own /rfps page.
 *  - Business names only: award winners come from the board's publishable
 *    winners (individuals are counted, never named).
 *  - Thin pages stay out of the index: a buyer page is indexable only when it
 *    has PMRFP data beyond the link (at least one past award, open bid or
 *    major project / permit in its municipality). Link-and-tips-only pages
 *    render (they help a contractor) but are noindex,follow.
 */
import { slugify } from "@/lib/tenders/shared";
import { buyerKeyOf, type IntelAward } from "@/lib/intel/model";
import { publicTenderSource } from "@/lib/tenders/sources";
import type { RfpListItem } from "@/lib/data/types";
import DIRECTORY_JSON from "./directory.json";

export const BUYERS_PATH = "/buyers";

export const PLATFORM_KEYS = [
  "bids-and-tenders",
  "bonfire",
  "biddingo",
  "merx",
  "ontario-tenders-portal",
  "bc-bid",
  "apc",
  "ns-portal",
  "sasktenders",
  "nbon",
  "sap-ariba",
  "civicinfo-bc",
  "own-site",
] as const;
export type PlatformKey = (typeof PLATFORM_KEYS)[number];

/** Commercial bid platforms: PMRFP links to them, never republishes their tenders. */
export const COMMERCIAL_PLATFORMS: ReadonlySet<PlatformKey> = new Set(["bids-and-tenders", "bonfire", "biddingo", "merx", "ontario-tenders-portal", "sap-ariba"]);

export const BUYER_GROUPS = ["province", "municipality", "regional", "school", "post-secondary", "health", "housing", "conservation", "agency"] as const;
export type BuyerGroup = (typeof BUYER_GROUPS)[number];

export interface DirectoryBuyer {
  name: string;
  provinceCode: string;
  type: string;
  group: BuyerGroup;
  /** The buyer's official bids / purchasing page. */
  tendersUrl: string | null;
  platforms: PlatformKey[];
  /** The buyer's own portal on the platform (guelph.bidsandtenders.ca), when known. */
  portalUrl: string | null;
  portalName?: string | null;
  /** The buyer lists bids on its own site (not only on a platform). */
  ownSiteList: boolean;
  /** Role-based procurement inbox shown on the buyer's own page. */
  email: string | null;
  emailSource: string | null;
  checkedOn: string;
  slug: string;
}

export const DIRECTORY: readonly DirectoryBuyer[] = DIRECTORY_JSON as DirectoryBuyer[];

export const PROVINCE_NAMES: Record<string, string> = {
  ON: "Ontario",
  BC: "British Columbia",
  AB: "Alberta",
  NS: "Nova Scotia",
  MB: "Manitoba",
  SK: "Saskatchewan",
  QC: "Quebec",
  NB: "New Brunswick",
  PE: "Prince Edward Island",
  NL: "Newfoundland and Labrador",
  YT: "Yukon",
  NT: "Northwest Territories",
  NU: "Nunavut",
};
const CODE_BY_NAME = new Map(Object.entries(PROVINCE_NAMES).map(([k, v]) => [v, k]));

export const provinceSlugOf = (province: string) => slugify(province);
export const buyerPath = (provinceSlug: string, slug: string) => `${BUYERS_PATH}/${provinceSlug}/${slug}`;

/* ------------------------------------------------------------------ names */

const MUNI_PREFIX = /^(the )?(corporation of (the )?)?(city|town|township|municipality|village|district|county|region|regional municipality|united counties|municipal district|rural municipality|regional district) of (the )?/;
const UPPER = /\b(region|regional|county|counties|district)\b/;

/**
 * Matching key that ignores "City of" / "Town of" / "Corporation of the":
 * "Town of Oakville" ≡ "Oakville" ≡ "Corporation of the Town of Oakville".
 * Upper tiers keep a marker so "Region of Waterloo" ≠ "City of Waterloo".
 */
export function coreKey(name: string): string {
  // A division in brackets ("the City of Toronto (Toronto Water)") is still the city.
  // Nova Scotia's "Municipality of the District of East Hants" is the municipality, not an upper tier.
  let k = buyerKeyOf(name.replace(/\([^)]*\)/g, " ")).replace(/^(the )?municipality of (the )?(district|county) of /, "");
  const upper = UPPER.test(k);
  for (let prev = ""; prev !== k; ) {
    prev = k;
    k = k.replace(MUNI_PREFIX, "").replace(/^(the )?(government|province) of (the )?/, "").trim();
  }
  const place = k.replace(/\b(region|regional municipality|county|district)( of)?\b/g, "").replace(/\s+/g, " ").trim();
  return upper ? `${place} upper` : place;
}

/** "Ville de Saint-Hyacinthe ." → "Ville de Saint-Hyacinthe"; "the City of Toronto (…)" keeps its division. */
export const tidyBuyerName = (s: string) => s.replace(/^the\s+(?=[A-Z])/, "").replace(/[\s.]+$/, "").trim();

/** The place a municipal buyer governs ("Town of Oakville" → "Oakville"), else null. */
export function municipalityOf(b: Pick<DirectoryBuyer, "name" | "group">): string | null {
  if (b.group !== "municipality") return null;
  const n = b.name.replace(/^(the )?(corporation of (the )?)?(city|town|township|municipality|village|district|rural municipality|municipal district) of (the )?/i, "").trim();
  return n || null;
}

/* ------------------------------------------------------------------ page data */

export interface BuyerOpenBid {
  slug: string;
  title: string;
  deadline: string | null;
}

export interface BuyerWinner {
  name: string;
  /** /contract-winners/<slug> when the company has a public page. */
  publicSlug: string | null;
  awards: number;
  value: number;
}

export interface BuyerAwards {
  count: number;
  /** Awards with a disclosed value. */
  valued: number;
  /** Sum of disclosed values, CAD. */
  totalValue: number;
  first: string | null;
  last: string | null;
  topWinners: BuyerWinner[];
  /** Awards to individuals (counted, never named). */
  individuals: number;
  recent: { slug: string; title: string; date: string; winner: string | null; amount: number | null }[];
  /** Trade slugs by award count. */
  tradeSlugs: string[];
}

export interface BuyerProject {
  slug: string;
  name: string;
  status: string;
  value: number | null;
  source: string;
}

export interface ProjectLike {
  slug: string;
  name: string;
  city: string | null;
  province: string | null;
  status: string;
  estValueCad: number | null;
  stale: boolean;
  source: string;
}

export interface BuyerPage {
  buyer: DirectoryBuyer;
  province: string;
  provinceSlug: string;
  path: string;
  /** Not in the research file: a buyer known only from awards on the board. */
  fromBoard: boolean;
  municipality: string | null;
  openBids: BuyerOpenBid[];
  awards: BuyerAwards;
  projects: BuyerProject[];
  projectsTotal: number;
  /** The buyer's Award Intelligence slug, when it has one. */
  intelSlug: string | null;
}

const emptyAwards = (): BuyerAwards => ({ count: 0, valued: 0, totalValue: 0, first: null, last: null, topWinners: [], individuals: 0, recent: [], tradeSlugs: [] });

export function summarizeAwards(rows: readonly IntelAward[]): BuyerAwards {
  if (!rows.length) return emptyAwards();
  const winners = new Map<string, BuyerWinner>();
  const trades = new Map<string, number>();
  let individuals = 0;
  let valued = 0;
  let total = 0;
  for (const a of rows) {
    if (a.amount != null) {
      valued++;
      total += a.amount;
    }
    for (const t of a.tradeSlugs) trades.set(t, (trades.get(t) ?? 0) + 1);
    if (!a.winner || !a.winnerKey) {
      individuals++;
      continue;
    }
    const w = winners.get(a.winnerKey) ?? { name: a.winner, publicSlug: a.winnerPublic ? a.winnerSlug : null, awards: 0, value: 0 };
    w.awards++;
    w.value += a.amount ?? 0;
    winners.set(a.winnerKey, w);
  }
  const dates = rows.map((a) => a.date).sort();
  return {
    count: rows.length,
    valued,
    totalValue: Math.round(total),
    first: dates[0] ?? null,
    last: dates[dates.length - 1] ?? null,
    topWinners: [...winners.values()].sort((a, b) => b.awards - a.awards || b.value - a.value || a.name.localeCompare(b.name)).slice(0, 5),
    individuals,
    recent: [...rows]
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 8)
      .map((a) => ({ slug: a.slug, title: a.title, date: a.date, winner: a.winner, amount: a.amount })),
    tradeSlugs: [...trades.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([s]) => s),
  };
}

/** Padded, normalized text for whole-phrase matching. */
const pad = (s: string) => ` ${buyerKeyOf(s)} `;

export interface OpenText {
  r: RfpListItem;
  /** Normalized title + summary + issuer, padded for whole-phrase matching. */
  text: string;
}

/** Open public listings with their match text, computed once per build. */
export function openTexts(rfps: readonly RfpListItem[]): OpenText[] {
  return rfps
    .filter((r) => r.status === "open" && r.sourceType === "public_source")
    .map((r) => ({ r, text: `${pad(r.title)}${pad(r.summary ?? "")}${pad(publicTenderSource(r.slug).issuer ?? "")}` }));
}

/** Open board bids that name this buyer (title, summary or the source's issuer), same province. */
export function openBidsFor(b: DirectoryBuyer, province: string, open: readonly RfpListItem[] | readonly OpenText[]): BuyerOpenBid[] {
  const full = buyerKeyOf(b.name);
  // A one-word name ("Oakville") is too loose to match free text: require the full name.
  if (!full || full.split(" ").length < 2) return [];
  const needle = ` ${full} `;
  const rows: readonly OpenText[] = open.length && "text" in open[0] ? (open as readonly OpenText[]) : openTexts(open as readonly RfpListItem[]);
  const out: BuyerOpenBid[] = [];
  for (const { r, text } of rows) {
    if (r.province && r.province !== province) continue;
    if (!text.includes(needle)) continue;
    out.push({ slug: r.slug, title: r.title, deadline: r.deadline });
  }
  return out.sort((x, y) => (x.deadline ?? "9999").localeCompare(y.deadline ?? "9999")).slice(0, 12);
}

/** Projects grouped by "<province>|<city core key>", live rows only. */
export function projectsByCity(projects: readonly ProjectLike[]): Map<string, ProjectLike[]> {
  const out = new Map<string, ProjectLike[]>();
  for (const p of projects) {
    if (p.stale || !p.city || !p.province) continue;
    const k = `${p.province}|${coreKey(p.city)}`;
    out.set(k, [...(out.get(k) ?? []), p]);
  }
  return out;
}

/** Major projects / permits / applications in a municipal buyer's city (live rows only). */
export function projectsFor(municipality: string | null, province: string, projects: readonly ProjectLike[] | Map<string, ProjectLike[]>): { rows: BuyerProject[]; total: number } {
  if (!municipality) return { rows: [], total: 0 };
  const byCity = projects instanceof Map ? projects : projectsByCity(projects);
  const mine = byCity.get(`${province}|${coreKey(municipality)}`) ?? [];
  const rows = [...mine]
    .sort((a, b) => (b.estValueCad ?? 0) - (a.estValueCad ?? 0) || a.name.localeCompare(b.name))
    .slice(0, 8)
    .map((p) => ({ slug: p.slug, name: p.name, status: p.status, value: p.estValueCad, source: p.source }));
  return { rows, total: mine.length };
}

/** Indexable only with PMRFP data beyond the link: an award, an open bid or a project in its city. */
export function isIndexableBuyer(p: Pick<BuyerPage, "awards" | "openBids" | "projectsTotal">): boolean {
  return p.awards.count > 0 || p.openBids.length > 0 || p.projectsTotal > 0;
}

/** True when every platform this buyer uses is a commercial one (we link, never list). */
export function linkOnly(b: Pick<DirectoryBuyer, "platforms">): boolean {
  return b.platforms.length > 0 && b.platforms.every((p) => COMMERCIAL_PLATFORMS.has(p));
}

export interface BuildInput {
  directory?: readonly DirectoryBuyer[];
  /** Canadian board awards (intelAwards over the board snapshot, no award history). */
  awards: readonly IntelAward[];
  /** Board RFPs (only open, Canadian ones are used). */
  rfps: readonly RfpListItem[];
  projects: readonly ProjectLike[];
  /** Award Intelligence buyer slugs by buyerKey (Canada). */
  intelSlugs?: ReadonlyMap<string, string>;
  /** A board buyer needs at least this many awards to get a page of its own. */
  boardMin?: number;
}

/** Every buyer page: the research directory plus buyers known only from board awards. */
export function buildBuyerPages(input: BuildInput): BuyerPage[] {
  const directory = input.directory ?? DIRECTORY;
  const awardsCa = input.awards.filter((a) => a.country === "CA");
  const open = openTexts(input.rfps);
  const byCity = projectsByCity(input.projects);
  // Awards grouped by full key and by core key + province.
  const byFull = new Map<string, IntelAward[]>();
  const byCore = new Map<string, IntelAward[]>();
  for (const a of awardsCa) {
    if (!a.buyer || !a.buyerKey) continue;
    byFull.set(a.buyerKey, [...(byFull.get(a.buyerKey) ?? []), a]);
    const ck = `${coreKey(a.buyer)}|${a.province ?? ""}`;
    byCore.set(ck, [...(byCore.get(ck) ?? []), a]);
  }
  const claimed = new Set<IntelAward>();
  const pages: BuyerPage[] = [];
  const usedPaths = new Set<string>();

  const page = (buyer: DirectoryBuyer, province: string, matched: IntelAward[], fromBoard: boolean): BuyerPage => {
    const provinceSlug = provinceSlugOf(province);
    const municipality = municipalityOf(buyer);
    const proj = projectsFor(municipality, province, byCity);
    const intelSlug = matched.map((a) => a.buyerKey && input.intelSlugs?.get(a.buyerKey)).find(Boolean) ?? null;
    const path = buyerPath(provinceSlug, buyer.slug);
    usedPaths.add(path);
    return {
      buyer,
      province,
      provinceSlug,
      path,
      fromBoard,
      municipality,
      openBids: openBidsFor(buyer, province, open),
      awards: summarizeAwards(matched),
      projects: proj.rows,
      projectsTotal: proj.total,
      intelSlug,
    };
  };

  for (const b of directory) {
    const province = PROVINCE_NAMES[b.provinceCode];
    if (!province) continue;
    const full = buyerKeyOf(b.name);
    const matched = [...new Set([...(byFull.get(full) ?? []), ...(byCore.get(`${coreKey(b.name)}|${province}`) ?? [])])].filter(
      (a) => !claimed.has(a) && (a.province == null || a.province === province),
    );
    for (const a of matched) claimed.add(a);
    const p = page(b, province, matched, false);
    // A research row with no bids page and no data says nothing: skip it.
    if (!b.tendersUrl && !isIndexableBuyer(p)) {
      usedPaths.delete(p.path);
      continue;
    }
    pages.push(p);
  }

  // Buyers on the board that the research file doesn't cover (federal departments, agencies, cities elsewhere).
  const boardMin = input.boardMin ?? 2;
  const rest = new Map<string, IntelAward[]>();
  for (const a of awardsCa) {
    if (claimed.has(a) || !a.buyer || !a.buyerKey || !a.province || !CODE_BY_NAME.has(a.province)) continue;
    // Divisions of one buyer ("City of Toronto (Toronto Water)", "(Transportation Services)") share a page.
    const k = `${coreKey(a.buyer)}|${a.province}`;
    rest.set(k, [...(rest.get(k) ?? []), a]);
  }
  for (const rows of rest.values()) {
    if (rows.length < boardMin) continue;
    const province = rows[0].province!;
    const names = new Map<string, number>();
    for (const a of rows) names.set(a.buyer!, (names.get(a.buyer!) ?? 0) + 1);
    const top = [...names.entries()].sort((a, b) => Number(/[a-z]/.test(b[0])) - Number(/[a-z]/.test(a[0])) || b[1] - a[1])[0][0];
    const name = tidyBuyerName(names.size > 1 ? top.replace(/\s*\([^)]*\)\s*$/, "") : top);
    const base = slugify(name).slice(0, 80) || "buyer";
    let slug = base;
    for (let i = 2; usedPaths.has(buyerPath(provinceSlugOf(province), slug)); i++) slug = `${base}-${i}`;
    const buyer: DirectoryBuyer = {
      name,
      provinceCode: CODE_BY_NAME.get(province)!,
      type: "public buyer",
      group: guessGroup(name),
      tendersUrl: null,
      platforms: [],
      portalUrl: null,
      ownSiteList: false,
      email: null,
      emailSource: null,
      checkedOn: "",
      slug,
    };
    pages.push(page(buyer, province, rows, true));
  }
  return pages;
}

function guessGroup(name: string): BuyerGroup {
  const n = name.toLowerCase();
  if (/school|board of education|conseil scolaire/.test(n)) return "school";
  if (/universit|college|coll[eè]ge/.test(n)) return "post-secondary";
  if (/hospital|health|sant[ée]/.test(n)) return "health";
  if (/housing|habitation/.test(n)) return "housing";
  if (/\b(region|county|district)\b/.test(n)) return "regional";
  if (/^(city|town|township|village|municipality|ville|municipalit[ée])\b/.test(n)) return "municipality";
  return "agency";
}

/* ------------------------------------------------------------------ index */

export interface ProvinceGroupIndex {
  province: string;
  provinceSlug: string;
  groups: { group: BuyerGroup; buyers: BuyerPage[] }[];
  total: number;
}

/** Index by province (most buyers first, Ontario leads), then by buyer group, names A–Z. */
export function directoryIndex(pages: readonly BuyerPage[]): ProvinceGroupIndex[] {
  const byProv = new Map<string, BuyerPage[]>();
  for (const p of pages) byProv.set(p.province, [...(byProv.get(p.province) ?? []), p]);
  return [...byProv.entries()]
    .map(([province, rows]) => ({
      province,
      provinceSlug: provinceSlugOf(province),
      total: rows.length,
      groups: BUYER_GROUPS.map((group) => ({ group, buyers: rows.filter((r) => r.buyer.group === group).sort((a, b) => a.buyer.name.localeCompare(b.buyer.name)) })).filter((g) => g.buyers.length > 0),
    }))
    .sort((a, b) => Number(b.province === "Ontario") - Number(a.province === "Ontario") || b.total - a.total || a.province.localeCompare(b.province));
}

export function findBuyerPage(pages: readonly BuyerPage[], provinceSlug: string, slug: string): BuyerPage | null {
  return pages.find((p) => p.provinceSlug === provinceSlug && p.buyer.slug === slug) ?? null;
}

/** The buyer page for a board RFP / award (its issuer or "Past public contract issued by …"), for cross-links. */
export function buyerPageForRfp(pages: readonly BuyerPage[], r: Pick<RfpListItem, "slug" | "province">, buyerName: string | null): BuyerPage | null {
  if (buyerName) {
    const full = buyerKeyOf(buyerName);
    const core = coreKey(buyerName);
    const hit =
      pages.find((p) => buyerKeyOf(p.buyer.name) === full && (!r.province || p.province === r.province)) ??
      pages.find((p) => coreKey(p.buyer.name) === core && r.province != null && p.province === r.province);
    if (hit) return hit;
  }
  return pages.find((p) => p.openBids.some((o) => o.slug === r.slug) || p.awards.recent.some((a) => a.slug === r.slug)) ?? null;
}
