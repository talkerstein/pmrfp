/**
 * The municipality dataset (src/lib/towns/csd.json, built by
 * scripts/build-town-dataset.mjs from Statistics Canada's 2021 Census
 * subdivisions). Static: zero database reads, parsed once per server
 * process. Canada only.
 */
import CSD from "./csd.json";
import { formalName, nameIn, typeLabel, type TownLang } from "./names";

export interface TownEntry {
  /** 7-digit CSD code (a Nova Scotia county merged from its subdivisions keeps its 4-digit census division code). */
  id: string;
  /** Statistics Canada's name ("Cobourg", "Greater Sudbury / Grand Sudbury"). */
  name: string;
  /** Statistics Canada's English type ("Town"). */
  type: string;
  /** Statistics Canada's French status when it differs ("Ville" for Ottawa). */
  typeFr: string | null;
  provinceCode: string;
  /** 2021 Census population. */
  population: number | null;
  /** Stable page slug, unique within the province. */
  slug: string;
}

interface Dataset {
  census: number;
  source: { name: string; licence: string; licenceUrl: string; attribution: string; urls: Record<string, string> };
  types: [string, string | null][];
  rows: [string, string, number, string, number | null, string][];
}

const DATA = CSD as unknown as Dataset;

/** Where the town facts come from (shown on every town page). */
export const TOWN_SOURCE = { census: DATA.census, ...DATA.source };

let parsed: TownEntry[] | null = null;

/** Every municipality with a page (3,501 in the 2021 Census). */
export function allTowns(): readonly TownEntry[] {
  if (!parsed) {
    parsed = DATA.rows.map(([id, name, ti, provinceCode, population, slug]) => {
      const [type, typeFr] = DATA.types[ti];
      return { id, name, type, typeFr, provinceCode, population, slug };
    });
  }
  return parsed;
}

/** The facts a buyer page shows for a municipality. */
export interface TownFacts {
  id: string;
  name: string;
  type: string;
  typeFr: string | null;
  provinceCode: string;
  population: number | null;
  /** The town's own slug (the page URL when no directory entry covers it). */
  slug: string;
}

export const townFacts = (t: TownEntry): TownFacts => ({ ...t });

/** "Town of Cobourg" / "Ville de Cobourg". */
export const townName = (t: Pick<TownEntry, "name" | "type" | "typeFr" | "provinceCode">, lang: TownLang) => formalName(t, lang);

/** "Cobourg" (the bare place name, for "near Cobourg"). */
export const townPlace = (t: Pick<TownEntry, "name">, lang: TownLang) => nameIn(t.name, lang);

/** "Town" / "Ville" / "Pueblo". */
export const townType = (t: Pick<TownEntry, "type" | "typeFr">, lang: TownLang) => typeLabel(t, lang);
