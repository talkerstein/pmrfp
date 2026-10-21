/**
 * Canadian municipalities from Statistics Canada's census subdivisions (CSDs,
 * 2021 Census): which CSD types are municipalities PMRFP gives a page, their
 * names in English, French and Spanish, and the stable page slugs.
 *
 * Pure, with no imports on purpose: the dataset generator
 * (scripts/build-town-dataset.mjs) loads this file directly with Node's
 * built-in TypeScript support, so the slugs it writes and the names pages
 * show come from the same rules.
 *
 * Which CSDs get a page (the rule, also in the PR):
 *  - Kept: every incorporated local government: cities, towns, villages,
 *    townships, municipalities, rural municipalities, municipal districts,
 *    counties, summer and resort villages, hamlets and community governments
 *    in the territories, northern villages, Quebec's municipalités, villes,
 *    paroisses and cantons, Cree and Naskapi villages, and the Eeyou Istchee
 *    James Bay Regional Government. Each one buys things under its own name.
 *  - Dropped: Indian reserves, Indian settlements and other First Nations or
 *    Inuit lands (reserves, treaty and self-government lands). The CSD is the
 *    land, not the band or nation that buys, and a page in the land's name
 *    would misname the buyer. First Nations can still list through
 *    /for-public-buyers.
 *  - Dropped: areas with no local government of their own: unorganized
 *    areas and their subdivisions, BC regional district electoral areas (the
 *    regional district buys), New Brunswick parishes (unincorporated local
 *    service districts in 2021), PEI fire districts, Yukon hamlets (advisory
 *    areas), settlements and the one Saskatchewan "Crown colony".
 *  - Merged: Nova Scotia's "Subdivision of county municipality" CSDs
 *    ("Annapolis, Subd. A" … "Subd. D") are statistical pieces of one county
 *    municipality, so they become one page: "Municipality of the County of
 *    Annapolis", population summed.
 */

export type TownLang = "en" | "fr" | "es";

/** Province / territory code from the first two digits of a CSD code. */
export const PROVINCE_BY_PRUID: Readonly<Record<string, string>> = {
  "10": "NL",
  "11": "PE",
  "12": "NS",
  "13": "NB",
  "24": "QC",
  "35": "ON",
  "46": "MB",
  "47": "SK",
  "48": "AB",
  "59": "BC",
  "60": "YT",
  "61": "NT",
  "62": "NU",
};

interface TypeDef {
  /** English label (StatCan's own type name). */
  en: string;
  /** French label: Statistics Canada's French name for the type (SGC 2021). */
  fr: string;
  es: string;
  /** "City of", "Town of"… (English formal name), or a suffix with a leading space. */
  enPrefix?: string;
  enSuffix?: string;
  /** "Ville", "Canton"… before "de <name>" (French formal name). */
  frPrefix: string;
}

/**
 * Municipal CSD types by Statistics Canada's English type name, as the 2021
 * Census Profile writes it. French labels follow the SGC 2021 French type
 * names ("Ville", "Canton", "Municipalité rurale"…). Quebec's types are French
 * in both languages, as StatCan publishes them.
 */
export const TOWN_TYPES: Readonly<Record<string, TypeDef>> = {
  City: { en: "City", fr: "Ville", es: "Ciudad", enPrefix: "City of", frPrefix: "Ville" },
  Town: { en: "Town", fr: "Ville", es: "Pueblo", enPrefix: "Town of", frPrefix: "Ville" },
  Village: { en: "Village", fr: "Village", es: "Villa", enPrefix: "Village of", frPrefix: "Village" },
  Township: { en: "Township", fr: "Canton", es: "Municipio (township)", enPrefix: "Township of", frPrefix: "Canton" },
  Municipality: { en: "Municipality", fr: "Municipalité", es: "Municipio", enPrefix: "Municipality of", frPrefix: "Municipalité" },
  "Rural municipality": { en: "Rural municipality", fr: "Municipalité rurale", es: "Municipio rural", enPrefix: "Rural Municipality of", frPrefix: "Municipalité rurale" },
  "Municipal district": { en: "Municipal district", fr: "District municipal", es: "Distrito municipal", enPrefix: "Municipal District of", frPrefix: "District municipal" },
  "Summer village": { en: "Summer village", fr: "Village d'été", es: "Villa de verano", enPrefix: "Summer Village of", frPrefix: "Village d'été" },
  "Specialized municipality": { en: "Specialized municipality", fr: "Municipalité spécialisée", es: "Municipio especializado", enPrefix: "Municipality of", frPrefix: "Municipalité" },
  "Improvement district": { en: "Improvement district", fr: "District d'amélioration", es: "Distrito de mejoras", enSuffix: " Improvement District", frPrefix: "District d'amélioration" },
  "Special area": { en: "Special area", fr: "Région spéciale", es: "Área especial", enPrefix: "Special Area", frPrefix: "Région spéciale" },
  "District municipality": { en: "District municipality", fr: "Municipalité de district", es: "Municipio de distrito", enPrefix: "District of", frPrefix: "District" },
  "Regional municipality": { en: "Regional municipality", fr: "Municipalité régionale", es: "Municipio regional", enSuffix: " Regional Municipality", frPrefix: "Municipalité régionale" },
  "Island municipality": { en: "Island municipality", fr: "Municipalité insulaire", es: "Municipio insular", enSuffix: " Municipality", frPrefix: "Municipalité" },
  "Resort municipality": { en: "Resort municipality", fr: "Municipalité de villégiature", es: "Municipio turístico", enPrefix: "Resort Municipality of", frPrefix: "Municipalité de villégiature" },
  "Resort village": { en: "Resort village", fr: "Village de villégiature", es: "Villa turística", enPrefix: "Resort Village of", frPrefix: "Village de villégiature" },
  "Northern village": { en: "Northern village", fr: "Village nordique", es: "Villa del norte", enPrefix: "Northern Village of", frPrefix: "Village nordique" },
  "Northern hamlet": { en: "Northern hamlet", fr: "Hameau nordique", es: "Caserío del norte", enPrefix: "Northern Hamlet of", frPrefix: "Hameau nordique" },
  Hamlet: { en: "Hamlet", fr: "Hameau", es: "Caserío", enPrefix: "Hamlet of", frPrefix: "Hameau" },
  "Community government": { en: "Community government", fr: "Gouvernement communautaire", es: "Gobierno comunitario", enPrefix: "Community Government of", frPrefix: "Gouvernement communautaire" },
  "Chartered community": { en: "Chartered community", fr: "Communauté à charte", es: "Comunidad con carta", enPrefix: "Charter Community of", frPrefix: "Communauté à charte" },
  "Local government district": { en: "Local government district", fr: "District d'administration locale", es: "Distrito de gobierno local", enPrefix: "Local Government District of", frPrefix: "District d'administration locale" },
  "Rural community": { en: "Rural community", fr: "Communauté rurale", es: "Comunidad rural", enPrefix: "Rural Community of", frPrefix: "Communauté rurale" },
  /** Nova Scotia county municipality, merged from its "Subd." CSDs (see the header). */
  "County municipality": { en: "County municipality", fr: "Municipalité de comté", es: "Municipio de condado", enPrefix: "Municipality of the County of", frPrefix: "Municipalité du comté" },
  // Quebec: French type names in both languages, as Statistics Canada publishes them.
  Ville: { en: "Ville", fr: "Ville", es: "Ciudad (ville)", frPrefix: "Ville" },
  "Municipalité": { en: "Municipalité", fr: "Municipalité", es: "Municipio (municipalité)", frPrefix: "Municipalité" },
  "Paroisse (municipalité de)": { en: "Parish municipality", fr: "Paroisse (municipalité de)", es: "Parroquia (municipio)", frPrefix: "Paroisse" },
  "Canton (municipalité de)": { en: "Township municipality", fr: "Canton (municipalité de)", es: "Cantón (municipio)", frPrefix: "Canton" },
  "Cantons unis (municipalité de)": { en: "United townships municipality", fr: "Cantons unis (municipalité de)", es: "Cantones unidos (municipio)", frPrefix: "Cantons unis" },
  "Village nordique": { en: "Northern village", fr: "Village nordique", es: "Villa del norte", frPrefix: "Village nordique" },
  "Village cri": { en: "Cree village", fr: "Village cri", es: "Villa cree", frPrefix: "Village cri" },
  "Village naskapi": { en: "Naskapi village", fr: "Village naskapi", es: "Villa naskapi", frPrefix: "Village naskapi" },
  "Gouvernement régional": { en: "Regional government", fr: "Gouvernement régional", es: "Gobierno regional", frPrefix: "Gouvernement régional" },
};

/** StatCan types that never get a page (see the header for why). */
export const EXCLUDED_TYPES: ReadonlySet<string> = new Set([
  "Indian reserve",
  "Indian settlement",
  "Indian government district",
  "Self-government",
  "Terre inuite",
  "Terres réservées aux Cris",
  "Terres réservées aux Naskapis",
  "Unorganized",
  "Subdivision of unorganized",
  "Regional district electoral area",
  "Parish",
  "Fire district",
  "Settlement",
  "Crown colony",
]);

/** "Nisga'a land", "Teslin land", "Tsawwassen Lands", "Tla'amin Lands": treaty / self-government lands. */
const LANDS = /\blands?$/i;

/** Nova Scotia CSD type merged into one county page. */
export const COUNTY_SUBDIVISION = "Subdivision of county municipality";
export const COUNTY_MUNICIPALITY = "County municipality";

export type CsdDecision = "keep" | "exclude" | "merge-county" | "unknown";

/** What happens to a CSD of this type in this province. */
export function csdDecision(type: string, provinceCode: string): CsdDecision {
  if (type === COUNTY_SUBDIVISION && provinceCode === "NS") return "merge-county";
  if (EXCLUDED_TYPES.has(type) || LANDS.test(type)) return "exclude";
  // Yukon hamlets are advisory areas, not municipalities (NWT and Nunavut hamlets are).
  if (type === "Hamlet" && provinceCode === "YT") return "exclude";
  return TOWN_TYPES[type] ? "keep" : "unknown";
}

/** "Annapolis, Subd. A" → "Annapolis" (null when it isn't a county subdivision name). */
export function countyOfSubdivision(name: string): string | null {
  const m = name.match(/^(.+?),\s*Subd\.\s*[A-Z]+$/);
  return m ? m[1].trim() : null;
}

/* ------------------------------------------------------------------ names */

/**
 * "Greater Sudbury / Grand Sudbury" → its English or French half; one-language
 * names unchanged. A city that straddles a border ("Lloydminster (Part)") is
 * just "Lloydminster" on its page in each province.
 */
export function nameIn(name: string, lang: TownLang): string {
  const clean = name.replace(/\s*\((part|partie)\)\s*$/i, "").trim();
  const parts = clean.split(" / ").map((s) => s.trim()).filter(Boolean);
  if (parts.length !== 2) return clean;
  return lang === "fr" ? parts[1] : parts[0];
}

/** Quebec types are French legal statuses: the formal name is French in every language. */
const QUEBEC_TYPES = new Set(["Ville", "Municipalité", "Paroisse (municipalité de)", "Canton (municipalité de)", "Cantons unis (municipalité de)", "Village nordique", "Village cri", "Village naskapi", "Gouvernement régional"]);

/** Names that already say what they are ("Wheatland County", "Special Area No. 2", "Improvement District No. 9 Banff"). */
const SELF_NAMED = /\b(county|counties|district|municipality|municipal|regional|special area)\b/i;

/**
 * "de Gatineau", "d'Ottawa". Place names starting with H keep "de" (Hearst,
 * Halifax, Hamilton), as Canadian French usage does; articles inside names
 * ("du Grand Sudbury") aren't rewritten: names stay as published.
 */
export function deName(name: string): string {
  return /^[aeiouyâàäéèêëîïôöûùüÿœæ]/i.test(name) ? `d'${name}` : `de ${name}`;
}

/** Statistics Canada's French type names, with the one missing accent restored. */
const FR_TYPE_FIX: Readonly<Record<string, string>> = { "Municipalité regionale": "Municipalité régionale" };
const fixFr = (s: string) => FR_TYPE_FIX[s] ?? s;

export interface TownNameInput {
  /** StatCan CSD name ("Cobourg", "Greater Sudbury / Grand Sudbury"). */
  name: string;
  /** StatCan English type name ("Town"). */
  type: string;
  /** StatCan French type name when it differs ("Ville" for Ottawa, "Cité" for Clarence-Rockland). */
  typeFr?: string | null;
  provinceCode: string;
}

const isQuebecStyle = (t: TownNameInput) => t.provinceCode === "QC" || QUEBEC_TYPES.has(t.type);

/** The French formal name: "Ville de Cobourg", "Canton de Russell", "Ville d'Ottawa", "Cité de Clarence-Rockland". */
export function formalNameFr(t: TownNameInput): string {
  const def = TOWN_TYPES[t.type];
  const name = nameIn(t.name, "fr");
  if (!def) return name;
  if (!isQuebecStyle(t) && SELF_NAMED.test(name)) return name;
  // Nova Scotia's municipal districts: "Municipalité du district de Chester".
  if (t.type === "Municipal district" && t.provinceCode === "NS") return `Municipalité du district ${deName(name)}`;
  // Statistics Canada's own French status (Ontario and New Brunswick municipalities with official French names).
  const prefix = t.typeFr && t.typeFr !== t.type && !/\(/.test(t.typeFr) ? fixFr(t.typeFr) : def.frPrefix;
  return `${prefix} ${deName(name)}`;
}

/** The English formal name: "Town of Cobourg", "Rural Municipality of Sherwood No. 159", "Wheatland County"; Quebec stays French. */
export function formalNameEn(t: TownNameInput): string {
  const def = TOWN_TYPES[t.type];
  const name = nameIn(t.name, "en");
  if (!def) return name;
  if (isQuebecStyle(t)) return formalNameFr(t);
  if (SELF_NAMED.test(name)) return name;
  // Nova Scotia's municipal districts are "Municipality of the District of Chester".
  if (t.type === "Municipal district" && t.provinceCode === "NS") return `Municipality of the District of ${name}`;
  // New Brunswick's one regional municipality is "Regional Municipality of Tracadie".
  if (t.type === "Regional municipality" && t.provinceCode === "NB") return `Regional Municipality of ${name}`;
  if (def.enSuffix) return `${name}${def.enSuffix}`;
  return `${def.enPrefix} ${name}`;
}

/** The formal name for a page in this language (Spanish uses the official English or Quebec French name). */
export function formalName(t: TownNameInput, lang: TownLang): string {
  return lang === "fr" ? formalNameFr(t) : formalNameEn(t);
}

/** The type label in this language ("Town" / "Ville" / "Pueblo"); StatCan's own French status wins in French. */
export function typeLabel(t: Pick<TownNameInput, "type" | "typeFr">, lang: TownLang): string {
  const def = TOWN_TYPES[t.type];
  if (!def) return t.type;
  if (lang === "fr") return t.typeFr && t.typeFr !== t.type ? fixFr(t.typeFr) : def.fr;
  return def[lang];
}

/**
 * "the Town of Cobourg" in an English sentence ("Work for the Town of
 * Cobourg?"); names that aren't "<status> of <place>" ("Wheatland County",
 * "Ville de Gatineau", "Cobourg") stay as they are.
 */
export function inSentence(name: string, lang: TownLang): string {
  if (lang === "fr") {
    // "la Ville de Cochrane", "le Canton de Russell", "les Cantons unis de…" (copy avoids "de" + article).
    if (/^(ville|cité|municipalité|paroisse|communauté|région)\b/i.test(name)) return `la ${name}`;
    if (/^(canton|village|district|hameau|gouvernement)\b/i.test(name)) return `le ${name}`;
    if (/^cantons unis\b/i.test(name)) return `les ${name}`;
    return name;
  }
  if (lang !== "en") return name;
  return /^(city|town|township|village|municipality|rural municipality|district|county|regional municipality|summer village|resort village|northern village|northern hamlet|hamlet|charter community|community government|local government district|rural community|resort municipality|municipal district|corporation|region|united counties|regional district|government|province) of\b/i.test(name)
    ? `the ${name}`
    : name;
}

/* ------------------------------------------------------------------ slugs */

/** Same rule as the buyer directory's slugs (lowercase ASCII, dashes, at most 80 characters). */
export function townSlugify(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/, "");
}

/** The page slug before any clash is resolved: the English formal name ("town-of-cobourg"). */
export function baseTownSlug(t: TownNameInput): string {
  return townSlugify(formalNameEn(t)) || "municipality";
}
