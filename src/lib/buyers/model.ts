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
import type { TownFacts } from "@/lib/towns/data";
import { formalNameEn, formalNameFr, nameIn } from "@/lib/towns/names";
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
  /**
   * The buyer's own web and email domains (its bids page first), for
   * verifying a clerk's work email (lib/towns/domains). Absent on buyers
   * known only from the board.
   */
  domains?: string[];
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

/** "Ville de Saint-Hyacinthe" → "Saint-Hyacinthe", "Municipalité d'Ayer's Cliff" → "Ayer's Cliff". */
const FRENCH_PREFIX = /^(la |le )?(ville|cite|cité|municipalite|municipalité|paroisse|canton|cantons unis|village|village nordique|village cri|village naskapi|gouvernement regional|gouvernement régional|municipalite regionale|municipalité régionale|communaute rurale|communauté rurale)( de la| de| d'| du| des)\s*/i;

/** Statuses coreKey doesn't strip ("Resort Municipality of Whistler", "RM of Hanover"). */
const MORE_PREFIX = /^(the )?(corporation of (the )?)?(resort municipality|rm|r\.m\.|summer village|resort village|northern village|northern hamlet|hamlet|charter community|community government|local government district|rural community|island municipality|specialized municipality) of (the )?/i;

/**
 * coreKey that also drops a French status and the statuses coreKey keeps
 * ("Ville de Gatineau" ≡ "City of Gatineau" ≡ "Gatineau", "King Township" ≡
 * "Township of King", "RM of Hanover" ≡ "Hanover").
 */
export function placeKey(name: string): string {
  return coreKey(name.trim().replace(FRENCH_PREFIX, "").replace(MORE_PREFIX, "").replace(/\s+township$/i, ""));
}

/** Census types that are counties or regional governments in all but name: they also answer to "<place> County / Region". */
const UPPER_LIKE = new Set(["Specialized municipality", "Municipal district", "County municipality", "Regional municipality", "District municipality", "Rural municipality", "Island municipality"]);

/** The keys a municipality answers to: its formal name and its bare place name in each language. */
export function townMatchKeys(t: Pick<TownFacts, "name" | "type" | "typeFr" | "provinceCode">): string[] {
  const bare = [nameIn(t.name, "en"), nameIn(t.name, "fr")].map(placeKey);
  const keys = [placeKey(formalNameEn(t)), ...bare];
  // "Grande Prairie County No. 1" ≡ "County of Grande Prairie".
  keys.push(...keys.map((k) => k.replace(/ no \d+( upper)?$/, "$1")));
  if (UPPER_LIKE.has(t.type)) keys.push(...bare.map((k) => (k.endsWith(" upper") ? k : `${k} upper`)));
  return [...new Set(keys)].filter(Boolean);
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
  /**
   * "directory": a researched buyer; "town": a municipality known only from
   * Statistics Canada's census subdivisions (lib/towns); "board": a buyer
   * known only from awards on the board. Absent = "directory" or "board"
   * (from `fromBoard`), as before towns.
   */
  kind?: "directory" | "town" | "board";
  /** The municipality's 2021 Census facts, when the buyer is one (a town page, or a directory municipality matched to its census subdivision). */
  town?: TownFacts | null;
  municipality: string | null;
  openBids: BuyerOpenBid[];
  awards: BuyerAwards;
  projects: BuyerProject[];
  projectsTotal: number;
  /** The buyer's Award Intelligence slug, when it has one. */
  intelSlug: string | null;
}

export const pageKind = (p: Pick<BuyerPage, "kind" | "fromBoard">): "directory" | "town" | "board" => p.kind ?? (p.fromBoard ? "board" : "directory");

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

/** What a page has beyond its own data: a verified public buyer manages it, or the buyer said yes to listing its tenders. */
export interface PageSignals {
  managed: boolean;
  permissionYes: boolean;
}

/**
 * The one indexing rule for every buyer page. A claimed (managed) page or a
 * buyer that gave permission is always indexable. A municipality known only
 * from the census (a town page) is indexable once it has tenders on PMRFP
 * (open bids or past awards); until then it is noindex,follow and out of the
 * sitemap, so 3,500 empty pages never count as thin content. Directory and
 * board buyers keep their rule (isIndexableBuyer).
 */
export function isIndexablePage(p: Pick<BuyerPage, "awards" | "openBids" | "projectsTotal" | "kind" | "fromBoard">, s: PageSignals): boolean {
  if (s.managed || s.permissionYes) return true;
  if (pageKind(p) === "town") return p.openBids.length > 0 || p.awards.count > 0;
  return isIndexableBuyer(p);
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
  /**
   * Municipalities (lib/towns, merged with the directory by lib/towns/merge):
   * `byDirectory` adds census facts to a directory entry ("<provinceCode>/<slug>"
   * keys), `unmerged` towns get pages of their own. Absent: no town pages
   * (the directory and board buyers only, as before).
   */
  towns?: { byDirectory: ReadonlyMap<string, TownFacts>; unmerged: readonly TownFacts[] };
}

/** Words that never anchor a town name in free text ("town of", "ville de", "no 159"…). */
const ANCHOR_STOP = new Set([
  "of", "the", "de", "d", "du", "des", "la", "le", "les", "and", "no", "city", "town", "township", "village", "villages", "municipality",
  "municipal", "rural", "district", "county", "regional", "region", "summer", "resort", "northern", "hamlet", "community", "government",
  "chartered", "charter", "local", "island", "improvement", "specialized", "special", "area", "ville", "cite", "municipalite", "paroisse",
  "canton", "cantons", "unis", "nordique", "cri", "naskapi", "gouvernement", "regionale", "regional", "comte", "rurale", "communaute",
  "saint", "sainte", "st", "ste", "lac", "lake", "river", "north", "south", "east", "west", "mount", "port", "fort", "grand", "new",
]);

interface TownNeedle {
  key: string;
  province: string;
  needle: string;
}

/**
 * Open board bids naming each town ("Town of Cobourg" / "Ville de Cobourg" in
 * the title, summary or issuer), same province. One pass over the board for
 * all 3,500 towns: each name is anchored on its most distinctive word, so a
 * bid is only checked against the few towns whose word it contains. A bid
 * naming a longer town ("Township of Wellington North") isn't also given to
 * a shorter one inside it.
 */
export function townOpenBids(needles: readonly TownNeedle[], open: readonly OpenText[]): Map<string, BuyerOpenBid[]> {
  const byAnchor = new Map<string, TownNeedle[]>();
  for (const n of needles) {
    const words = n.needle.trim().split(" ");
    if (words.length < 2) continue;
    const anchor = [...words].filter((w) => !ANCHOR_STOP.has(w) && !/^\d+$/.test(w)).sort((a, b) => b.length - a.length)[0] ?? words[words.length - 1];
    byAnchor.set(anchor, [...(byAnchor.get(anchor) ?? []), n]);
  }
  const out = new Map<string, BuyerOpenBid[]>();
  for (const { r, text } of open) {
    const hits: TownNeedle[] = [];
    for (const word of new Set(text.trim().split(" "))) {
      for (const n of byAnchor.get(word) ?? []) {
        if (r.province && r.province !== n.province) continue;
        if (text.includes(n.needle)) hits.push(n);
      }
    }
    for (const n of hits) {
      if (hits.some((m) => m.key !== n.key && m.needle.length > n.needle.length && m.needle.includes(n.needle.trim()))) continue;
      const list = out.get(n.key) ?? [];
      if (!list.some((b) => b.slug === r.slug)) list.push({ slug: r.slug, title: r.title, deadline: r.deadline });
      out.set(n.key, list);
    }
  }
  for (const [k, list] of out) out.set(k, list.sort((x, y) => (x.deadline ?? "9999").localeCompare(y.deadline ?? "9999")).slice(0, 12));
  return out;
}

/** The directory-shaped buyer a town page renders (no research yet: no bids page, platforms or inbox). */
export function townBuyer(t: TownFacts): DirectoryBuyer {
  return {
    name: formalNameEn(t),
    provinceCode: t.provinceCode,
    type: "municipality",
    group: "municipality",
    tendersUrl: null,
    platforms: [],
    portalUrl: null,
    ownSiteList: false,
    email: null,
    emailSource: null,
    checkedOn: "",
    slug: t.slug,
    domains: [],
  };
}

/** Every buyer page: the research directory, the municipalities (when given), then buyers known only from board awards. */
export function buildBuyerPages(input: BuildInput): BuyerPage[] {
  const directory = input.directory ?? DIRECTORY;
  const awardsCa = input.awards.filter((a) => a.country === "CA");
  const open = openTexts(input.rfps);
  const byCity = projectsByCity(input.projects);
  // Awards grouped by full key and by core key + province.
  const byFull = new Map<string, IntelAward[]>();
  const byCore = new Map<string, IntelAward[]>();
  const byPlace = new Map<string, IntelAward[]>();
  for (const a of awardsCa) {
    if (!a.buyer || !a.buyerKey) continue;
    byFull.set(a.buyerKey, [...(byFull.get(a.buyerKey) ?? []), a]);
    const ck = `${coreKey(a.buyer)}|${a.province ?? ""}`;
    byCore.set(ck, [...(byCore.get(ck) ?? []), a]);
    if (input.towns) {
      const pk = `${placeKey(a.buyer)}|${a.province ?? ""}`;
      byPlace.set(pk, [...(byPlace.get(pk) ?? []), a]);
    }
  }
  const claimed = new Set<IntelAward>();
  const pages: BuyerPage[] = [];
  const usedPaths = new Set<string>();

  const page = (
    buyer: DirectoryBuyer,
    province: string,
    matched: IntelAward[],
    fromBoard: boolean,
    extra: { kind?: BuyerPage["kind"]; town?: TownFacts | null; openBids?: BuyerOpenBid[] } = {},
  ): BuyerPage => {
    const provinceSlug = provinceSlugOf(province);
    // A town's own place name ("Gatineau", not "Ville de Gatineau"), so its projects match.
    const municipality = extra.town ? nameIn(extra.town.name, "en") : municipalityOf(buyer);
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
      ...(extra.kind ? { kind: extra.kind } : {}),
      ...(extra.town !== undefined ? { town: extra.town } : {}),
      municipality,
      openBids: extra.openBids ?? openBidsFor(buyer, province, open),
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
    const town = input.towns?.byDirectory.get(`${b.provinceCode}/${b.slug}`) ?? null;
    const p = page(b, province, matched, false, input.towns ? { kind: "directory", town } : {});
    // A research row with no bids page and no data says nothing: skip it
    // (unless it is a municipality: every municipality has a page).
    if (!b.tendersUrl && !isIndexableBuyer(p) && !town) {
      usedPaths.delete(p.path);
      continue;
    }
    pages.push(p);
  }

  // Municipalities the directory doesn't cover (Statistics Canada's census subdivisions, lib/towns).
  if (input.towns) {
    const towns = [...input.towns.unmerged]
      .filter((t) => PROVINCE_NAMES[t.provinceCode])
      // Two same-named places in one province: the bigger one gets an award that names neither more precisely.
      .sort((a, b) => (b.population ?? 0) - (a.population ?? 0) || a.slug.localeCompare(b.slug));
    const needles: TownNeedle[] = [];
    for (const t of towns) {
      const key = `${t.provinceCode}/${t.slug}`;
      const province = PROVINCE_NAMES[t.provinceCode];
      for (const n of new Set([buyerKeyOf(formalNameEn(t)), buyerKeyOf(formalNameFr(t))])) needles.push({ key, province, needle: ` ${n} ` });
    }
    const bids = townOpenBids(needles, open);
    for (const t of towns) {
      const province = PROVINCE_NAMES[t.provinceCode];
      const buyer = townBuyer(t);
      if (usedPaths.has(buyerPath(provinceSlugOf(province), buyer.slug))) buyer.slug = `${t.slug}-${t.id}`;
      const keys = new Set(townMatchKeys(t).map((k) => `${k}|${province}`));
      const matched = [...new Set([...keys].flatMap((k) => byPlace.get(k) ?? []))].filter((a) => !claimed.has(a));
      for (const a of matched) claimed.add(a);
      pages.push(page(buyer, province, matched, false, { kind: "town", town: t, openBids: bids.get(`${t.provinceCode}/${t.slug}`) ?? [] }));
    }
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
    pages.push(page(buyer, province, rows, true, input.towns ? { kind: "board" } : {}));
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
