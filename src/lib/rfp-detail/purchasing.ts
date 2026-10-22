/**
 * "How this buyer buys" (depth plan, Step 2, block 7): purchasing thresholds
 * for the buyers we have researched, and nothing for the rest.
 *
 * Three kinds of statement, from strongest to weakest, each only when the
 * data is held:
 *  1. THIS buyer's own purchasing policy, when it is one of the 17 towns
 *     whose by-law or policy we read (briefs/research/2026-10-21-small-town-
 *     procurement.md, section 5, read 21 Oct 2026). Stated as that policy's
 *     numbers, with its name, year and link.
 *  2. Towns like this one, DERIVED: the range across the researched towns in
 *     the same province, only when at least MIN_TOWNS of them published
 *     thresholds, always with how many and "check this buyer's policy".
 *  3. The trade-agreement thresholds that bind municipalities, school
 *     boards, universities and hospitals (CFTA; NWPTA in AB, BC, SK, MB), and
 *     the official system a notice above them must be posted on, from the
 *     writer's clause data (lib/rfp-writer/municipal/clauses.ts). Not for
 *     Quebec, which has its own contracting law that we have not read.
 *
 * Pure. Policies change often (9 of the 21 towns rewrote theirs in
 * 2025–26): THRESHOLDS_AS_OF is the date to bump when this list is re-read.
 */
import { placeKey } from "@/lib/buyers/model";
import { DESIGNATED_SYSTEM, NWPTA, THRESHOLDS, provinceCodeOf, type MuniProvince } from "@/lib/rfp-writer/municipal/clauses";
import { MASH_KINDS, type BuyerKind } from "./facts";

/** When the town policies below were read. */
export const THRESHOLDS_AS_OF = "2026-10";
/** Fewest researched towns in a province before "towns like this one" is said. */
export const MIN_TOWNS = 3;
/**
 * The researched towns have at most about 48,000 people (the research caps at 30,000 and
 * keeps one county just above). "Towns like this one" is only said of a buyer that size
 * or smaller, and only when its population is known: Toronto is not like them.
 */
export const DERIVED_MAX_POPULATION = 50_000;

export interface TownPolicy {
  /** As the buyer is usually called; matched with placeKey, so "Municipality of Grey Highlands" finds it. */
  name: string;
  code: MuniProvince;
  /** The by-law or policy, as its own document names itself. */
  policy: string;
  /** Year adopted or last amended, as the research recorded it. */
  year: number;
  url: string;
  /** Purchases up to this amount are bought without competition. */
  directUpTo: number | null;
  /** From this amount the buyer asks for written quotes. */
  quotesFrom: number | null;
  /** A formal public tender starts here (goods and services, or every purchase when there is one number). */
  tenderFrom: number;
  /** Where construction has its own, higher number. */
  tenderFromConstruction?: number;
}

/**
 * The 17 researched towns whose thresholds are one clear set of numbers.
 * Pemberton, Springfield and Selkirk publish none; the County of Kings has
 * separate numbers for goods, services and construction that one field here
 * would blur, so it is left out rather than shown wrong. Figures are the
 * research's "direct / quotes / formal" columns; "above" and "at or above"
 * are both written as "starts at about".
 */
export const TOWN_POLICIES: readonly TownPolicy[] = [
  { name: "Grey Highlands", code: "ON", policy: "By-law 2022-050 (procurement)", year: 2022, url: "https://www.greyhighlands.ca/media/p2sfe1zm/by-law-no-2022-050-procurement-by-law-pdf.pdf", directUpTo: 20_000, quotesFrom: 20_000, tenderFrom: 50_000 },
  { name: "Wellington North", code: "ON", policy: "Procurement Policy 006-2026", year: 2026, url: "https://www.wellington-north.com/sites/default/files/2026-05/Procurement%20Policy.pdf", directUpTo: 5_000, quotesFrom: 5_000, tenderFrom: 100_000 },
  { name: "Smiths Falls", code: "ON", policy: "By-law 10644-2025 (procurement policy)", year: 2025, url: "https://media-003-ca.cdn.govstack.com/smithsfalls-ca/media/gtpbfkfn/bylaw-10644-2025-procurement-policy.pdf", directUpTo: 10_000, quotesFrom: 10_000, tenderFrom: 130_000 },
  { name: "Muskoka Lakes", code: "ON", policy: "By-law 2025-108, Policy C-FS-20", year: 2026, url: "https://muskokalakes.civicweb.net/document/211604", directUpTo: 10_000, quotesFrom: 10_000, tenderFrom: 100_000 },
  { name: "Selwyn", code: "ON", policy: "By-law 2025-076 (procurement policy)", year: 2025, url: "https://www.selwyntownship.ca/media/vt0fathi/procurement-policy-2026-revision.pdf", directUpTo: 15_000, quotesFrom: 15_000, tenderFrom: 50_000 },
  { name: "Merrickville-Wolford", code: "ON", policy: "Purchasing policy, By-law 24-2020", year: 2020, url: "https://www.merrickville-wolford.ca/component/edocman/purchasing-procurement-policy/viewdocument/86?Itemid=0", directUpTo: 2_500, quotesFrom: 2_500, tenderFrom: 50_000 },
  { name: "Haliburton County", code: "ON", policy: "Policy FN-04", year: 2026, url: "https://haliburton.civicweb.net/document/441634/Revised%20County%20Procurement%20Policy%20August%202023.pdf?handle=8574DD9592E44A008037FDF9B907D9C7", directUpTo: 10_000, quotesFrom: 10_000, tenderFrom: 50_000 },
  { name: "Tay", code: "ON", policy: "By-law 2014-67, revised 2018-84", year: 2018, url: "https://tay.ca/media/xehivloa/procurement-policy-by-law.pdf", directUpTo: 10_000, quotesFrom: 10_000, tenderFrom: 25_000 },
  { name: "Olds", code: "AB", policy: "Policy 218C (purchasing)", year: 2024, url: "https://www.olds.ca/media/plfjvgrn/218c_-_purchasing_policy_-_aprd_07_08_24.pdf", directUpTo: 5_000, quotesFrom: 10_000, tenderFrom: 75_000, tenderFromConstruction: 200_000 },
  { name: "Drumheller", code: "AB", policy: "Policy P0225C", year: 2025, url: "https://www.drumheller.ca/public/download/files/317437", directUpTo: 10_000, quotesFrom: 10_000, tenderFrom: 75_000 },
  { name: "Canmore", code: "AB", policy: "Policy FIN-006", year: 2025, url: "https://www.canmore.ca/public/download/files/276576", directUpTo: 10_000, quotesFrom: 10_000, tenderFrom: 75_000, tenderFromConstruction: 200_000 },
  { name: "Mountain View County", code: "AB", policy: "Procedure 1009-01", year: 2025, url: "https://mountainviewcounty.civicweb.net/document/44807/Procedure%201009-01%20Financial%20Controls.pdf?handle=DC61C9B7B4304BF8B20F8D4C602503B9", directUpTo: 25_000, quotesFrom: 25_000, tenderFrom: 75_000, tenderFromConstruction: 200_000 },
  { name: "Smithers", code: "BC", policy: "Policy FIN-027", year: 2024, url: "https://smithers.civicweb.net/document/192969", directUpTo: 1_000, quotesFrom: 1_000, tenderFrom: 25_000 },
  { name: "Revelstoke", code: "BC", policy: "Policy F-3", year: 2016, url: "https://revelstoke.civicweb.net/document/61937", directUpTo: 10_000, quotesFrom: 10_000, tenderFrom: 100_000 },
  { name: "Squamish", code: "BC", policy: "Procurement policy", year: 2020, url: "https://squamish.civicweb.net/document/194638", directUpTo: 10_000, quotesFrom: 10_000, tenderFrom: 75_000, tenderFromConstruction: 200_000 },
  { name: "Summerland", code: "BC", policy: "Policy 200.6", year: 2021, url: "https://summerland.ca/docs/default-source/your-city-hall/bylaws---policies/district-policies/200-6-procurement-policy.pdf", directUpTo: 5_000, quotesFrom: 5_000, tenderFrom: 75_000, tenderFromConstruction: 200_000 },
  { name: "Wolfville", code: "NS", policy: "Policy 140-001", year: 2012, url: "https://wolfville.ca/sites/default/files/2022-07/140-001_Procurement_2012-12-17.pdf", directUpTo: 1_000, quotesFrom: 1_000, tenderFrom: 25_000 },
];

/** The researched policy for this buyer in this province, or null. */
export function policyFor(buyerName: string | null | undefined, province: string | null | undefined): TownPolicy | null {
  const code = provinceCodeOf(province);
  if (!buyerName || !code) return null;
  const key = placeKey(buyerName);
  if (!key) return null;
  // "District of Squamish" is read as an upper tier ("district"); a town's own entry has no such marker.
  const bare = key.replace(/ upper$/, "");
  return TOWN_POLICIES.find((p) => p.code === code && (placeKey(p.name) === key || (!placeKey(p.name).endsWith(" upper") && placeKey(p.name) === bare))) ?? null;
}

export interface DerivedThresholds {
  code: MuniProvince;
  /** How many researched towns in the province the range rests on. */
  towns: number;
  min: number;
  median: number;
  max: number;
  /** Which number: construction's own where a town has one, else the single number. */
  construction: boolean;
}

/**
 * Where a formal tender starts across the researched towns of a province:
 * lowest, middle and highest, for "towns like this one". Null below
 * MIN_TOWNS towns, so a province with two towns says nothing.
 */
export function derivedThresholds(province: string | null | undefined, construction: boolean): DerivedThresholds | null {
  const code = provinceCodeOf(province);
  if (!code) return null;
  const nums = TOWN_POLICIES.filter((p) => p.code === code)
    .map((p) => (construction ? p.tenderFromConstruction ?? p.tenderFrom : p.tenderFrom))
    .sort((a, b) => a - b);
  if (nums.length < MIN_TOWNS) return null;
  const mid = Math.floor((nums.length - 1) / 2);
  const median = nums.length % 2 ? nums[mid] : Math.round((nums[mid] + nums[mid + 1]) / 2);
  return { code, towns: nums.length, min: nums[0], median, max: nums[nums.length - 1], construction };
}

export interface TradeAgreement {
  code: MuniProvince;
  agreement: "CFTA" | "NWPTA";
  goodsServices: number;
  construction: number;
  period: string;
  /** The official system a notice at or above these amounts must be posted on, where the province names one. */
  system: string | null;
}

/**
 * The trade-agreement threshold that binds this kind of buyer in this
 * province, or null: not a municipality, school board, university or
 * hospital; not Canada; or Quebec (own contracting law, not read).
 */
export function tradeAgreementFor(province: string | null | undefined, kind: BuyerKind | null): TradeAgreement | null {
  const code = provinceCodeOf(province);
  if (!code || code === "QC" || !kind || !MASH_KINDS.has(kind)) return null;
  const nw = NWPTA.has(code);
  const t = nw ? THRESHOLDS.nwpta : THRESHOLDS.cfta;
  return {
    code,
    agreement: nw ? "NWPTA" : "CFTA",
    goodsServices: t.goodsServices,
    construction: t.construction,
    period: THRESHOLDS.cfta.period,
    system: DESIGNATED_SYSTEM[code] ?? null,
  };
}

export interface PurchasingRules {
  policy: TownPolicy | null;
  derived: DerivedThresholds | null;
  agreement: TradeAgreement | null;
}

/** Everything the block can say about this buyer; the block hides itself when all three are null. */
export function purchasingRulesFor(a: {
  buyerName: string | null;
  province: string | null;
  kind: BuyerKind | null;
  construction: boolean;
  /** The buyer's population (2021 Census), when its municipality is known. */
  population?: number | null;
}): PurchasingRules {
  const policy = policyFor(a.buyerName, a.province);
  const municipal = a.kind === "municipal" || a.kind === "regional";
  const small = a.population != null && a.population <= DERIVED_MAX_POPULATION;
  return {
    policy,
    // A buyer with its own policy needs no "towns like this one"; a big city is not like them.
    derived: !policy && municipal && small ? derivedThresholds(a.province, a.construction) : null,
    agreement: tradeAgreementFor(a.province, a.kind),
  };
}

export const hasRules = (r: PurchasingRules) => Boolean(r.policy || r.derived || r.agreement);
