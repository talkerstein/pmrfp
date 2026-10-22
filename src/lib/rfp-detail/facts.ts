/**
 * Key facts for a listing's detail page (depth plan, Step 2, block 1).
 * Pure: every fact comes from data the listing already carries, or is left
 * out. Nothing here is invented: a value nobody stated is not shown, and a
 * work type that the title does not make clear is not guessed.
 */
import type { BuyerGroup } from "@/lib/buyers/model";

export type BuyerKind =
  | "municipal"
  | "regional"
  | "provincial"
  | "territorial"
  | "federal"
  | "school"
  | "health"
  | "postSecondary"
  | "housing"
  | "agency"
  | "public"
  | "gc"
  | "private";

export type WorkType = "construction" | "service" | "consulting" | "supply";

/** Words that name a buyer of a certain kind (English and French; the notice may be either). */
const NAME_KIND: [RegExp, BuyerKind][] = [
  [/\b(school board|school division|school district|conseil scolaire|commission scolaire|centre de services scolaire|board of education)\b/i, "school"],
  [/\b(hospital|health authority|health services|health sciences|health care|healthcare|health centre|health center|h[oô]pital|sant[eé]|cisss|ciusss)\b/i, "health"],
  [/\b(universit|college|c[eé]gep)/i, "postSecondary"],
  [/\b(housing|habitation)\b/i, "housing"],
  [/\b(region of|regional (municipality|district)|county of|united counties|municipal district|mrc|municipalit[eé] r[eé]gionale)\b/i, "regional"],
  [/^(the )?(corporation of (the )?)?(city|town|township|village|municipality|district|rural municipality|ville|municipalit[eé]|village|canton|paroisse)\b/i, "municipal"],
  [/\b(government of canada|gouvernement du canada|public services and procurement canada|canada border|national defence|parks canada)\b/i, "federal"],
  [/\b(government of (yukon|the northwest territories|nunavut))\b/i, "territorial"],
  [/\b(province of|government of (ontario|alberta|british columbia|manitoba|saskatchewan|nova scotia|new brunswick|prince edward island|newfoundland)|gouvernement du qu[eé]bec|ministry of|minist[eè]re)\b/i, "provincial"],
];

const GROUP_KIND: Record<BuyerGroup, BuyerKind> = {
  province: "provincial",
  municipality: "municipal",
  regional: "regional",
  school: "school",
  "post-secondary": "postSecondary",
  health: "health",
  housing: "housing",
  conservation: "agency",
  agency: "agency",
};

/**
 * Importer feeds whose issuer is one specific kind of buyer (the feed's own
 * label says so). CanadaBuys is not here: it also carries notices from
 * other levels of government, so its tenders are "public buyer" until the
 * buyer's own name says more.
 */
const SOURCE_KIND: Record<string, BuyerKind> = {
  toronto: "municipal",
  nyc: "municipal",
  sam: "federal",
  yukon: "territorial",
};

/**
 * What kind of buyer this is, from the buyer directory when the buyer has a
 * page, else from its name, else from a feed that has only one kind of issuer.
 * Null when none of these says: better blank than a guess.
 */
export function buyerKindOf(a: {
  isPublicTender: boolean;
  isGc?: boolean;
  isTown?: boolean;
  group?: BuyerGroup | null;
  buyerName?: string | null;
  sourceKey?: string | null;
}): BuyerKind | null {
  if (a.isGc) return "gc";
  if (!a.isPublicTender && !a.isTown) return "private";
  if (a.group && a.group !== "agency") return GROUP_KIND[a.group];
  if (a.buyerName) for (const [re, kind] of NAME_KIND) if (re.test(a.buyerName.trim())) return kind;
  if (a.group) return GROUP_KIND[a.group];
  if (a.isTown) return "municipal";
  if (a.sourceKey && SOURCE_KIND[a.sourceKey]) return SOURCE_KIND[a.sourceKey];
  return a.isPublicTender ? "public" : null;
}

/** Buyers a trade agreement treats as municipalities, school boards, academic, health and social-service bodies. */
export const MASH_KINDS: ReadonlySet<BuyerKind> = new Set(["municipal", "regional", "school", "health", "postSecondary"]);

/* ------------------------------------------------------------------ work type */

const WORD = (list: string[]) => new RegExp(`(?:^|[^a-z])(?:${list.join("|")})`, "i");

const CONSULTING = WORD(["consult", "design", "engineering services", "architect", "feasibility", "condition assessment", "building condition", "assessment", "study", "studies", "inspection services", "project management", "geotechnical", "surveying", "etude", "étude", "ingénierie", "ingenierie", "services professionnels", "estudio", "diseño", "consultor"]);
const SERVICE = WORD(["maintenance", "janitorial", "cleaning", "snow", "ice control", "mowing", "grass cutting", "lawn", "landscap", "waste collection", "pest control", "servicing", "service contract", "entretien", "nettoyage", "déneigement", "deneigement", "tonte", "mantenimiento", "limpieza", "remoción de nieve"]);
const CONSTRUCTION = WORD(["construction", "reconstruction", "rehabilitat", "renovation", "replacement", "installation", "upgrade", "retrofit", "addition", "expansion", "resurfacing", "repaving", "paving", "demolition", "new building", "roof", "repair", "refurbish", "rénovation", "renovation", "remplacement", "réfection", "refection", "construcción", "renovación"]);
const SUPPLY = WORD(["supply of", "supply and deliver", "purchase of", "purchase and", "rental of", "fourniture", "achat de", "location de", "suministro de"]);

/**
 * "Construction", "service or maintenance", "consulting or design" or
 * "supply", from the TITLE only (the one reliable line). When the title fits
 * more than one (a design-build job, "maintenance and repair"), or none,
 * returns null: the page shows no work type rather than a guess.
 */
export function workTypeOf(title: string | null | undefined): WorkType | null {
  const t = (title ?? "").trim();
  if (!t) return null;
  // "Design-build" is construction, however the rest of the title reads.
  if (/design[\s-]?build|conception[\s-]construction/i.test(t)) return "construction";
  const hits: WorkType[] = [];
  if (CONSULTING.test(t)) hits.push("consulting");
  if (SERVICE.test(t)) hits.push("service");
  if (CONSTRUCTION.test(t)) hits.push("construction");
  if (SUPPLY.test(t)) hits.push("supply");
  // "maintenance and repair": repair is a service here.
  if (hits.length === 2 && hits.includes("service") && hits.includes("construction") && /\b(repair|r[eé]paration)s?\b/i.test(t) && !/\b(roof|replacement|reconstruction|rehabilitat|installation|renovation)/i.test(t)) return "service";
  return hits.length === 1 ? hits[0] : null;
}

/* ------------------------------------------------------------------ countdown */

export interface Countdown {
  kind: "today" | "tomorrow" | "days" | "past" | "none";
  days: number | null;
}

/** Days from `daysUntil` (negative = past, null = no date) into a label kind. */
export function countdownOf(days: number | null): Countdown {
  if (days === null) return { kind: "none", days: null };
  if (days < 0) return { kind: "past", days };
  if (days === 0) return { kind: "today", days };
  if (days === 1) return { kind: "tomorrow", days };
  return { kind: "days", days };
}

/* ------------------------------------------------------------------ value */

/** A budget the poster made public, as one line ("$120,000 to $180,000"), or null. */
export function statedValue(b: { min: number | null; max: number | null; isPublic: boolean } | null | undefined): { min: number | null; max: number | null } | null {
  if (!b || !b.isPublic) return null;
  const min = b.min && b.min > 0 ? b.min : null;
  const max = b.max && b.max > 0 ? b.max : null;
  return min || max ? { min, max } : null;
}
