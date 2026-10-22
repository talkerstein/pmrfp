/**
 * "What to prepare to bid" (depth plan, Step 2, block 6): a general
 * checklist by province or state. Free for everyone.
 *
 * It is NOT read from this notice and it is not legal advice: the page says
 * so, and every dollar limit stays a blank to confirm against the tender
 * documents. What it does state comes from three places we hold:
 *  - the workers' compensation board, safety role, accessibility and RBQ
 *    facts in the municipal RFP writer's province packs
 *    (lib/rfp-writer/municipal/clauses.ts, checked to CLAUSES_AS_OF);
 *  - the small-town procurement research (briefs/research, 21 Oct 2026:
 *    what 21 towns' tenders actually ask for), always worded "in the
 *    tenders we reviewed";
 *  - official government pages read on 22 Oct 2026 (Revenu Québec and the
 *    Quebec government for the tax attestation and AMP authorization; the
 *    Ontario IHSA and Alberta for COR; the FAR and the U.S. Department of
 *    Labor for the Miller and Davis-Bacon Acts; SAM.gov).
 *
 * Pure: returns which items apply; the words (en/fr/es) are in
 * i18n/messages/rfpDepth.ts under `prepare`.
 */
import { packFor, provinceCodeOf, type MuniProvince } from "@/lib/rfp-writer/municipal/clauses";
import { isUsState } from "@/lib/geo";
import type { WorkType } from "./facts";

export type PrepareKey =
  | "insurance"
  | "workersComp"
  | "workersCompUs"
  | "bonding"
  | "safety"
  | "corOntario"
  | "corAlberta"
  | "corTowns"
  | "licences"
  | "licenceQuebec"
  | "licenceUs"
  | "qcTax"
  | "qcAmp"
  | "forms"
  | "formsOntario"
  | "formsConstructor"
  | "formsPrime"
  | "formsQuebec"
  | "samGov"
  | "usFederalConstruction";

export interface PrepareItem {
  key: PrepareKey;
  /** Province code for items whose words differ by province (the workers' compensation board). */
  code?: MuniProvince;
}

export interface PrepareInput {
  /** The listing's province/state: full name, code, or null. */
  province: string | null | undefined;
  /** The notice came from SAM.gov (U.S. federal). */
  federal?: boolean;
  workType?: WorkType | null;
  /** A public buyer's tender (the default). A private job gets the general items, not the public-contract ones. */
  publicBuyer?: boolean;
}

export interface PrepareResult {
  country: "CA" | "US" | null;
  items: PrepareItem[];
}

/** Provinces whose towns, in the tenders we reviewed, asked about or scored a COR (Alberta, Manitoba, Nova Scotia). */
const COR_TOWNS: ReadonlySet<MuniProvince> = new Set(["AB", "MB", "NS"]);

/**
 * The items that apply to a listing in this province/state. Null country when
 * the place is unknown: the page then shows nothing rather than a guess.
 */
export function prepareFor(input: PrepareInput): PrepareResult {
  const raw = input.province?.trim() || null;
  const workType = input.workType ?? null;
  const construction = workType === null || workType === "construction";

  if (raw && isUsState(raw)) {
    const items: PrepareItem[] = [{ key: "insurance" }, { key: "workersCompUs" }, { key: "bonding" }, { key: "licenceUs" }, { key: "safety" }];
    if (input.federal) {
      items.unshift({ key: "samGov" });
      if (construction) items.push({ key: "usFederalConstruction" });
    }
    items.push({ key: "forms" });
    return { country: "US", items };
  }

  const code = provinceCodeOf(raw);
  if (!code) {
    // Canada, but no province we can name (a national or unspecified notice): the general items only.
    return raw === null && !input.federal
      ? { country: null, items: [] }
      : { country: "CA", items: [{ key: "insurance" }, { key: "bonding" }, { key: "safety" }, { key: "licences" }, { key: "forms" }] };
  }

  const pack = packFor(code);
  const items: PrepareItem[] = [{ key: "insurance" }, { key: "workersComp", code }, { key: "bonding" }];
  // The lines drawn from municipal tenders and public-contract rules are for a public buyer only.
  const publicBuyer = input.publicBuyer !== false;
  items.push({ key: code === "ON" ? "corOntario" : code === "AB" && publicBuyer ? "corAlberta" : COR_TOWNS.has(code) && publicBuyer ? "corTowns" : "safety" });
  items.push({ key: pack.rbq ? "licenceQuebec" : "licences" });
  if (code === "QC" && publicBuyer) items.push({ key: "qcTax" }, { key: "qcAmp" });
  items.push({ key: "forms" });
  if (code === "ON" && publicBuyer) items.push({ key: "formsOntario" });
  if (pack.safetyRole === "constructor") items.push({ key: "formsConstructor" });
  if (pack.safetyRole === "prime") items.push({ key: "formsPrime" });
  if (code === "QC" && publicBuyer) items.push({ key: "formsQuebec" });
  return { country: "CA", items };
}
