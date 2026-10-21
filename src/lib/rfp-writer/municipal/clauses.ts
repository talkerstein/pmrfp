/**
 * Province clause packs for the municipal RFP writer (PMRFP for Towns, Part
 * B2). Plain language for a department head, in English, French and
 * Spanish. Pure data plus small helpers; the composer is ./compose.ts.
 *
 * ── UPDATE HERE ──────────────────────────────────────────────────────
 * Every clause below is current as of CLAUSES_AS_OF. Policies change often
 * (9 of 21 towns in the research rewrote theirs in 2025–26; Ontario's for
 * Buy Ontario), so this file is the one place to update: bump the date,
 * edit the pack, and the writer, its "clauses current as of" note and the
 * tests follow. Sources: briefs/research/2026-10-21-small-town-procurement.md
 * (CFTA and NWPTA notices, provincial statutes, 21 towns' by-laws).
 *
 * Rules the writer keeps:
 *  - Never a local preference by default. Prohibited for Ontario
 *    municipalities; elsewhere only an explicit, explained option, and only
 *    below the trade-agreement thresholds.
 *  - Insurance amounts are defaults the buyer confirms ([Confirm: …]).
 *  - Anything the writer can't know (the by-law number, the contract form,
 *    the holdback outside Ontario) is a visible [Confirm: …] blank.
 */
import type { WriterLang } from "@/lib/rfp-writer/postprocess";

/** The month these clause packs were last checked. The one date to bump when they change. */
export const CLAUSES_AS_OF = "2026-10";

export const MUNI_PROVINCES = ["ON", "QC", "AB", "BC", "MB", "SK", "NS", "NB", "PE", "NL", "YT", "NT", "NU"] as const;
export type MuniProvince = (typeof MUNI_PROVINCES)[number];

/** The ten provinces with a full pack (territories get the general pack with blanks). */
export const PACK_PROVINCES = ["ON", "QC", "AB", "BC", "MB", "SK", "NS", "NB", "PE", "NL"] as const;

export function isMuniProvince(v: unknown): v is MuniProvince {
  return typeof v === "string" && (MUNI_PROVINCES as readonly string[]).includes(v);
}

export const PROVINCE_NAME: Record<MuniProvince, Record<WriterLang, string>> = {
  ON: { en: "Ontario", fr: "Ontario", es: "Ontario" },
  QC: { en: "Quebec", fr: "Québec", es: "Quebec" },
  AB: { en: "Alberta", fr: "Alberta", es: "Alberta" },
  BC: { en: "British Columbia", fr: "Colombie-Britannique", es: "Columbia Británica" },
  MB: { en: "Manitoba", fr: "Manitoba", es: "Manitoba" },
  SK: { en: "Saskatchewan", fr: "Saskatchewan", es: "Saskatchewan" },
  NS: { en: "Nova Scotia", fr: "Nouvelle-Écosse", es: "Nueva Escocia" },
  NB: { en: "New Brunswick", fr: "Nouveau-Brunswick", es: "Nuevo Brunswick" },
  PE: { en: "Prince Edward Island", fr: "Île-du-Prince-Édouard", es: "Isla del Príncipe Eduardo" },
  NL: { en: "Newfoundland and Labrador", fr: "Terre-Neuve-et-Labrador", es: "Terranova y Labrador" },
  YT: { en: "Yukon", fr: "Yukon", es: "Yukón" },
  NT: { en: "Northwest Territories", fr: "Territoires du Nord-Ouest", es: "Territorios del Noroeste" },
  NU: { en: "Nunavut", fr: "Nunavut", es: "Nunavut" },
};

/** "Ontario" / "Québec" / "Quebec" → "ON" / "QC". */
export function provinceCodeOf(v: string | null | undefined): MuniProvince | null {
  if (!v) return null;
  if (isMuniProvince(v.toUpperCase())) return v.toUpperCase() as MuniProvince;
  const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  const want = fold(v);
  for (const code of MUNI_PROVINCES) if (Object.values(PROVINCE_NAME[code]).some((n) => fold(n) === want)) return code;
  return null;
}

/* ------------------------------------------------------------- thresholds */

/** Trade-agreement thresholds for municipalities, 1 Jan 2026 to 31 Dec 2027 (CFTA Art. 504.3(b); NWPTA, not indexed). */
export const THRESHOLDS = {
  cfta: { goodsServices: 139_000, construction: 347_400, period: "2026–2027" },
  nwpta: { goodsServices: 75_000, construction: 200_000 },
} as const;

/** Provinces in the New West Partnership (AB, BC, SK, MB): lower thresholds. */
export const NWPTA: ReadonlySet<MuniProvince> = new Set(["AB", "BC", "SK", "MB"]);

/** Where an above-threshold notice must go (the buyer's official system). Null: the town's by-law says. */
export const DESIGNATED_SYSTEM: Partial<Record<MuniProvince, string>> = {
  AB: "Alberta Purchasing Connection (APC)",
  BC: "BC Bid",
  SK: "SaskTenders",
  MB: "MERX",
  NS: "the Nova Scotia Procurement Portal",
};

export interface ThresholdCheck {
  /** The value is at or above a trade-agreement threshold: post it on the official system and mirror it here. */
  over: boolean;
  threshold: number | null;
  agreement: "CFTA" | "NWPTA" | null;
  system: string | null;
}

/** Is a purchase of this estimated value covered by a trade agreement (so PMRFP can only mirror it)? */
export function thresholdCheck(province: MuniProvince, estimated: number | null | undefined, kind: "goodsServices" | "construction"): ThresholdCheck {
  const system = DESIGNATED_SYSTEM[province] ?? null;
  if (estimated == null || !Number.isFinite(estimated) || estimated <= 0) return { over: false, threshold: null, agreement: null, system };
  const nw = NWPTA.has(province) ? THRESHOLDS.nwpta[kind] : null;
  const cf = THRESHOLDS.cfta[kind];
  const threshold = nw ?? cf;
  return { over: estimated >= threshold, threshold, agreement: nw ? "NWPTA" : "CFTA", system };
}

/* ------------------------------------------------------------- the packs */

type L = Record<WriterLang, string>;

export interface ProvincePack {
  /** Workers' compensation: the clearance the bidder shows. */
  workersComp: L;
  /** The province's accessibility law, where one applies to the work; null = the town's own policy (a blank). */
  accessibility: L | null;
  /** Who runs the site for safety on a construction job. */
  safetyRole: "constructor" | "prime" | null;
  /** Holdback and payment on a construction job. */
  payment: L;
  /** Local preference: never in Ontario; elsewhere an explicit option below the thresholds. */
  localPreference: "prohibited" | "optional_below_thresholds";
  /** Construction licence (Quebec: RBQ). */
  rbq: boolean;
  /** The language the document is written in: Quebec in French; New Brunswick may issue it in both. */
  language: "fr" | "bilingual_option" | "page";
  /** The construction contract form, as a blank with a sensible example. */
  contractForm: L;
}

const ccdc: L = {
  en: "Contract form: CCDC 2 – 2020 Stipulated Price Contract [Confirm: contract form].",
  fr: "Formulaire de contrat : CCDC 2 – 2020, contrat à forfait [À confirmer : formulaire de contrat].",
  es: "Formulario de contrato: CCDC 2 – 2020, contrato a precio fijo [Por confirmar: formulario de contrato].",
};

const lienBlank = (act: L): L => ({
  en: `Payment and holdback follow ${act.en} [Confirm: holdback percentage and payment terms].`,
  fr: `Le paiement et la retenue suivent ${act.fr} [À confirmer : pourcentage de retenue et modalités de paiement].`,
  es: `El pago y la retención siguen ${act.es} [Por confirmar: porcentaje de retención y condiciones de pago].`,
});

const wc = (en: string, fr: string, es: string): L => ({ en, fr, es });

export const PACKS: Record<(typeof PACK_PROVINCES)[number], ProvincePack> = {
  ON: {
    workersComp: wc(
      "A WSIB clearance certificate in good standing (Workplace Safety and Insurance Board), kept valid for the whole contract.",
      "Un certificat de décharge de la WSIB (Commission de la sécurité professionnelle et de l'assurance contre les accidents du travail) valide pendant tout le contrat.",
      "Un certificado de autorización de la WSIB (Workplace Safety and Insurance Board) vigente durante todo el contrato.",
    ),
    accessibility: wc(
      "Accessibility: staff who deal with the public on Town property complete the training required by the Accessibility for Ontarians with Disabilities Act (AODA) and its Integrated Accessibility Standards (O. Reg. 191/11), with proof on request. Construction work meets the Ontario Building Code and, for public spaces, the AODA Design of Public Spaces standards, where they apply.",
      "Accessibilité : le personnel en contact avec le public sur les terrains de la municipalité suit la formation exigée par la Loi sur l'accessibilité pour les personnes handicapées de l'Ontario (LAPHO) et ses normes d'accessibilité intégrées (Règl. de l'Ont. 191/11), preuve à l'appui sur demande. Les travaux de construction respectent le Code du bâtiment de l'Ontario et, pour les espaces publics, les normes de conception des espaces publics de la LAPHO, s'il y a lieu.",
      "Accesibilidad: el personal que trate con el público en propiedad municipal completa la capacitación que exige la Accessibility for Ontarians with Disabilities Act (AODA) y sus Integrated Accessibility Standards (O. Reg. 191/11), con prueba a solicitud. Las obras cumplen el Código de Construcción de Ontario y, en espacios públicos, las normas de diseño de espacios públicos de la AODA, cuando correspondan.",
    ),
    safetyRole: "constructor",
    payment: wc(
      "Payment follows the prompt payment rules of Ontario's Construction Act: the Town pays a proper invoice within 28 days or gives a notice of non-payment, keeps the 10% statutory holdback until it can be released under the Act, and either party can refer a payment dispute to adjudication.",
      "Le paiement suit les règles de paiement rapide de la Loi sur la construction de l'Ontario : la municipalité paie une facture en bonne et due forme dans les 28 jours ou remet un avis de non-paiement, conserve la retenue légale de 10 % jusqu'à sa libération en vertu de la Loi, et chaque partie peut soumettre un différend de paiement à l'arbitrage (adjudication).",
      "El pago sigue las reglas de pago oportuno de la Construction Act de Ontario: el municipio paga una factura correcta dentro de 28 días o entrega un aviso de no pago, conserva la retención legal del 10 % hasta que pueda liberarse según la ley, y cualquiera de las partes puede llevar una disputa de pago a adjudicación.",
    ),
    localPreference: "prohibited",
    rbq: false,
    language: "page",
    contractForm: {
      en: "Contract form: [Confirm: contract form, e.g. OPS General Conditions of Contract or CCDC 2 – 2020].",
      fr: "Formulaire de contrat : [À confirmer : formulaire de contrat, p. ex. conditions générales OPS ou CCDC 2 – 2020].",
      es: "Formulario de contrato: [Por confirmar: formulario de contrato, p. ej., condiciones generales OPS o CCDC 2 – 2020].",
    },
  },
  QC: {
    workersComp: wc(
      "A CNESST certificate of compliance (attestation de conformité) in good standing, kept valid for the whole contract.",
      "Une attestation de conformité de la CNESST valide pendant tout le contrat.",
      "Un certificado de conformidad de la CNESST (attestation de conformité) vigente durante todo el contrato.",
    ),
    accessibility: null,
    safetyRole: null,
    payment: lienBlank({ en: "the Civil Code of Québec and the contract", fr: "le Code civil du Québec et le contrat", es: "el Código Civil de Quebec y el contrato" }),
    localPreference: "optional_below_thresholds",
    rbq: true,
    language: "fr",
    contractForm: ccdc,
  },
  AB: {
    workersComp: wc("A WCB-Alberta clearance letter in good standing, kept valid for the whole contract.", "Une lettre de conformité de la WCB-Alberta valide pendant tout le contrat.", "Una carta de autorización de la WCB-Alberta vigente durante todo el contrato."),
    accessibility: null,
    safetyRole: "prime",
    payment: lienBlank({ en: "Alberta's Prompt Payment and Construction Lien Act", fr: "la Prompt Payment and Construction Lien Act de l'Alberta", es: "la Prompt Payment and Construction Lien Act de Alberta" }),
    localPreference: "optional_below_thresholds",
    rbq: false,
    language: "page",
    contractForm: ccdc,
  },
  BC: {
    workersComp: wc("A WorkSafeBC clearance letter in good standing, kept valid for the whole contract.", "Une lettre de conformité de WorkSafeBC valide pendant tout le contrat.", "Una carta de autorización de WorkSafeBC vigente durante todo el contrato."),
    accessibility: wc(
      "Accessibility: meet the Town's accessibility plan under the Accessible British Columbia Act, where it applies to this work.",
      "Accessibilité : respecter le plan d'accessibilité de la municipalité adopté en vertu de l'Accessible British Columbia Act, s'il s'applique à ces travaux.",
      "Accesibilidad: cumplir el plan de accesibilidad del municipio según la Accessible British Columbia Act, cuando se aplique a este trabajo.",
    ),
    safetyRole: "prime",
    payment: lienBlank({ en: "British Columbia's Builders Lien Act", fr: "la Builders Lien Act de la Colombie-Britannique", es: "la Builders Lien Act de Columbia Británica" }),
    localPreference: "optional_below_thresholds",
    rbq: false,
    language: "page",
    contractForm: ccdc,
  },
  MB: {
    workersComp: wc("A WCB Manitoba clearance letter in good standing, kept valid for the whole contract.", "Une lettre de conformité de la WCB du Manitoba valide pendant tout le contrat.", "Una carta de autorización de la WCB de Manitoba vigente durante todo el contrato."),
    accessibility: wc(
      "Accessibility: staff who deal with the public follow the Customer Service Standard under the Accessibility for Manitobans Act, where it applies.",
      "Accessibilité : le personnel en contact avec le public respecte la norme de service à la clientèle de la Loi sur l'accessibilité pour les Manitobains, s'il y a lieu.",
      "Accesibilidad: el personal que trate con el público sigue la norma de servicio al cliente de la Accessibility for Manitobans Act, cuando corresponda.",
    ),
    safetyRole: "prime",
    payment: lienBlank({ en: "Manitoba's Builders' Liens Act", fr: "la Loi sur les privilèges du constructeur du Manitoba", es: "la Builders' Liens Act de Manitoba" }),
    localPreference: "optional_below_thresholds",
    rbq: false,
    language: "page",
    contractForm: ccdc,
  },
  SK: {
    workersComp: wc("A WCB Saskatchewan clearance letter in good standing, kept valid for the whole contract.", "Une lettre de conformité de la WCB de la Saskatchewan valide pendant tout le contrat.", "Una carta de autorización de la WCB de Saskatchewan vigente durante todo el contrato."),
    accessibility: wc(
      "Accessibility: meet the Town's accessibility plan under The Accessible Saskatchewan Act, where it applies to this work.",
      "Accessibilité : respecter le plan d'accessibilité de la municipalité adopté en vertu de The Accessible Saskatchewan Act, s'il s'applique à ces travaux.",
      "Accesibilidad: cumplir el plan de accesibilidad del municipio según The Accessible Saskatchewan Act, cuando se aplique a este trabajo.",
    ),
    safetyRole: "prime",
    payment: lienBlank({ en: "Saskatchewan's The Builders' Lien Act", fr: "The Builders' Lien Act de la Saskatchewan", es: "The Builders' Lien Act de Saskatchewan" }),
    localPreference: "optional_below_thresholds",
    rbq: false,
    language: "page",
    contractForm: ccdc,
  },
  NS: {
    workersComp: wc("A WCB Nova Scotia clearance letter in good standing, kept valid for the whole contract.", "Une lettre de conformité de la WCB de la Nouvelle-Écosse valide pendant tout le contrat.", "Una carta de autorización de la WCB de Nueva Escocia vigente durante todo el contrato."),
    accessibility: wc(
      "Accessibility: meet the Town's accessibility plan under Nova Scotia's Accessibility Act, where it applies to this work.",
      "Accessibilité : respecter le plan d'accessibilité de la municipalité adopté en vertu de l'Accessibility Act de la Nouvelle-Écosse, s'il s'applique à ces travaux.",
      "Accesibilidad: cumplir el plan de accesibilidad del municipio según la Accessibility Act de Nueva Escocia, cuando se aplique a este trabajo.",
    ),
    safetyRole: null,
    payment: lienBlank({ en: "Nova Scotia's Builders' Lien Act", fr: "la Builders' Lien Act de la Nouvelle-Écosse", es: "la Builders' Lien Act de Nueva Escocia" }),
    localPreference: "optional_below_thresholds",
    rbq: false,
    language: "page",
    contractForm: ccdc,
  },
  NB: {
    workersComp: wc("A WorkSafeNB clearance certificate in good standing, kept valid for the whole contract.", "Un certificat de décharge de Travail sécuritaire NB valide pendant tout le contrat.", "Un certificado de autorización de WorkSafeNB vigente durante todo el contrato."),
    accessibility: null,
    safetyRole: null,
    payment: lienBlank({ en: "New Brunswick's Construction Remedies Act", fr: "la Loi sur les recours dans l'industrie de la construction du Nouveau-Brunswick", es: "la Construction Remedies Act de Nuevo Brunswick" }),
    localPreference: "optional_below_thresholds",
    rbq: false,
    language: "bilingual_option",
    contractForm: ccdc,
  },
  PE: {
    workersComp: wc("A WCB PEI clearance letter in good standing, kept valid for the whole contract.", "Une lettre de conformité de la WCB de l'Île-du-Prince-Édouard valide pendant tout le contrat.", "Una carta de autorización de la WCB de la Isla del Príncipe Eduardo vigente durante todo el contrato."),
    accessibility: null,
    safetyRole: null,
    payment: lienBlank({ en: "Prince Edward Island's Mechanics' Lien Act", fr: "la Mechanics' Lien Act de l'Île-du-Prince-Édouard", es: "la Mechanics' Lien Act de la Isla del Príncipe Eduardo" }),
    localPreference: "optional_below_thresholds",
    rbq: false,
    language: "page",
    contractForm: ccdc,
  },
  NL: {
    workersComp: wc("A WorkplaceNL clearance letter in good standing, kept valid for the whole contract.", "Une lettre de conformité de WorkplaceNL valide pendant tout le contrat.", "Una carta de autorización de WorkplaceNL vigente durante todo el contrato."),
    accessibility: wc(
      "Accessibility: meet the Town's accessibility plan under the Accessibility Act of Newfoundland and Labrador, where it applies to this work.",
      "Accessibilité : respecter le plan d'accessibilité de la municipalité adopté en vertu de l'Accessibility Act de Terre-Neuve-et-Labrador, s'il s'applique à ces travaux.",
      "Accesibilidad: cumplir el plan de accesibilidad del municipio según la Accessibility Act de Terranova y Labrador, cuando se aplique a este trabajo.",
    ),
    safetyRole: null,
    payment: lienBlank({ en: "Newfoundland and Labrador's Mechanics' Lien Act", fr: "la Mechanics' Lien Act de Terre-Neuve-et-Labrador", es: "la Mechanics' Lien Act de Terranova y Labrador" }),
    localPreference: "optional_below_thresholds",
    rbq: false,
    language: "page",
    contractForm: ccdc,
  },
};

/** Yukon, Northwest Territories, Nunavut: the general pack, with blanks for what differs. */
const GENERAL_PACK: ProvincePack = {
  workersComp: wc(
    "A workers' compensation clearance in good standing, kept valid for the whole contract [Confirm: clearance from the territory's workers' safety and compensation board].",
    "Une attestation d'indemnisation des accidents du travail valide pendant tout le contrat [À confirmer : attestation de la commission de la santé et de la sécurité au travail du territoire].",
    "Un certificado de compensación laboral vigente durante todo el contrato [Por confirmar: certificado de la junta de seguridad y compensación laboral del territorio].",
  ),
  accessibility: null,
  safetyRole: null,
  payment: {
    en: "Payment and holdback follow the territory's lien legislation [Confirm: holdback percentage and payment terms].",
    fr: "Le paiement et la retenue suivent la loi du territoire sur les privilèges [À confirmer : pourcentage de retenue et modalités de paiement].",
    es: "El pago y la retención siguen la ley de gravámenes del territorio [Por confirmar: porcentaje de retención y condiciones de pago].",
  },
  localPreference: "optional_below_thresholds",
  rbq: false,
  language: "page",
  contractForm: ccdc,
};

export function packFor(province: MuniProvince): ProvincePack {
  return (PACKS as Record<string, ProvincePack>)[province] ?? GENERAL_PACK;
}

/** May this town add a local preference at all (only with an explicit choice, and never in Ontario)? */
export function localPreferenceAllowed(province: MuniProvince): boolean {
  return packFor(province).localPreference !== "prohibited";
}

/** The language a town's document comes out in: Quebec in French, New Brunswick in both when asked, else the page's. */
export function documentLanguage(province: MuniProvince, pageLang: WriterLang, bilingual: boolean): { lang: WriterLang; bilingual: boolean } {
  const pack = packFor(province);
  if (pack.language === "fr") return { lang: "fr", bilingual: false };
  if (pack.language === "bilingual_option" && bilingual) return { lang: pageLang === "fr" ? "fr" : "en", bilingual: true };
  return { lang: pageLang, bilingual: false };
}

/* ------------------------------------------------------------- shared clauses */

export const SAFETY_ROLE: Record<"constructor" | "prime" | "blank", L> = {
  constructor: {
    en: "Health and safety: the contractor acts as constructor under Ontario's Occupational Health and Safety Act for the work area.",
    fr: "Santé et sécurité : l'entrepreneur agit à titre de constructeur au sens de la Loi sur la santé et la sécurité au travail de l'Ontario pour l'aire de travail.",
    es: "Salud y seguridad: el contratista actúa como constructor según la Occupational Health and Safety Act de Ontario en el área de trabajo.",
  },
  prime: {
    en: "Health and safety: the contractor acts as prime contractor for the work site under the province's occupational health and safety law.",
    fr: "Santé et sécurité : l'entrepreneur agit à titre de maître d'œuvre (prime contractor) du chantier en vertu de la loi provinciale sur la santé et la sécurité au travail.",
    es: "Salud y seguridad: el contratista actúa como contratista principal (prime contractor) del sitio según la ley provincial de salud y seguridad laboral.",
  },
  blank: {
    en: "Health and safety: the contractor follows the province's occupational health and safety law [Confirm: who acts as constructor or prime contractor].",
    fr: "Santé et sécurité : l'entrepreneur respecte la loi provinciale sur la santé et la sécurité au travail [À confirmer : qui agit comme maître d'œuvre].",
    es: "Salud y seguridad: el contratista cumple la ley provincial de salud y seguridad laboral [Por confirmar: quién actúa como contratista principal].",
  },
};

export const RBQ_CLAUSE: L = {
  en: "A valid Régie du bâtiment du Québec (RBQ) licence covering the subclass of work being bid.",
  fr: "Une licence valide de la Régie du bâtiment du Québec (RBQ) couvrant la sous-catégorie des travaux soumissionnés.",
  es: "Una licencia vigente de la Régie du bâtiment du Québec (RBQ) para la subcategoría de los trabajos ofertados.",
};

export const ACCESSIBILITY_BLANK: L = {
  en: "Accessibility: meet the Town's accessibility requirements where they apply [Confirm: the Town's accessibility policy, if any].",
  fr: "Accessibilité : respecter les exigences d'accessibilité de la municipalité, s'il y a lieu [À confirmer : politique d'accessibilité de la municipalité, s'il y en a une].",
  es: "Accesibilidad: cumplir los requisitos de accesibilidad del municipio cuando correspondan [Por confirmar: política de accesibilidad del municipio, si existe].",
};

export function bylawClause(lang: WriterLang, ref: string | null | undefined): string {
  const r = ref?.trim();
  if (lang === "fr") return `Cette demande est faite en vertu du règlement sur l'approvisionnement de la municipalité ${r ? `(${r})` : "[À confirmer : numéro et article du règlement]"}.`;
  if (lang === "es") return `Esta solicitud se emite según el reglamento de compras del municipio ${r ? `(${r})` : "[Por confirmar: número y artículo del reglamento]"}.`;
  return `This request is issued under the Town's purchasing by-law ${r ? `(${r})` : "[Confirm: by-law number and section]"}.`;
}

export function bidSecurityClauses(lang: WriterLang, construction: boolean): string[] {
  if (lang === "fr") {
    return [
      "Garantie de soumission : un cautionnement de soumission ou un chèque certifié de 10 % du prix soumis [À confirmer : montant], rendu aux soumissionnaires non retenus après l'adjudication.",
      ...(construction ? ["Engagement à fournir des cautionnements : cautionnement d'exécution et cautionnement pour gages, matériaux et services de 50 % du prix du contrat [À confirmer : montants], remis avant la signature du contrat."] : []),
    ];
  }
  if (lang === "es") {
    return [
      "Garantía de oferta: una fianza de oferta o un cheque certificado del 10 % del precio ofertado [Por confirmar: monto], que se devuelve a los oferentes no seleccionados tras la adjudicación.",
      ...(construction ? ["Compromiso de fianza: fianza de cumplimiento y fianza de pago de mano de obra y materiales del 50 % del precio del contrato [Por confirmar: montos], entregadas antes de firmar el contrato."] : []),
    ];
  }
  return [
    "Bid security: a bid bond or certified cheque for 10% of the bid price [Confirm: amount], returned to unsuccessful bidders after award.",
    ...(construction ? ["Agreement to bond: a performance bond and a labour and material payment bond, each for 50% of the contract price [Confirm: amounts], provided before the contract is signed."] : []),
  ];
}

/** The explained, below-threshold local preference (only when the town ticks it, never in Ontario). */
export function localPreferenceClause(lang: WriterLang, province: MuniProvince): string | null {
  if (!localPreferenceAllowed(province)) return null;
  const nw = NWPTA.has(province);
  const gs = (nw ? THRESHOLDS.nwpta : THRESHOLDS.cfta).goodsServices;
  const cn = (nw ? THRESHOLDS.nwpta : THRESHOLDS.cfta).construction;
  const agreement = nw ? "NWPTA" : "CFTA";
  if (lang === "fr") {
    return `Préférence locale : seulement si la politique d'approvisionnement de la municipalité le permet et pour un achat sous les seuils des accords commerciaux (${agreement} : ${money(gs, "fr")} pour les biens et services, ${money(cn, "fr")} pour la construction), une préférence de [À confirmer : %] s'applique aux soumissionnaires ayant [À confirmer : un établissement permanent dans la municipalité].`;
  }
  if (lang === "es") {
    return `Preferencia local: solo si la política de compras del municipio lo permite y para una compra por debajo de los umbrales de los acuerdos comerciales (${agreement}: ${money(gs, "es")} para bienes y servicios, ${money(cn, "es")} para construcción), se aplica una preferencia de [Por confirmar: %] a los oferentes con [Por confirmar: un establecimiento permanente en el municipio].`;
  }
  return `Local preference: only where the Town's purchasing policy allows it, and only for purchases below the trade-agreement thresholds (${agreement}: ${money(gs, "en")} for goods and services, ${money(cn, "en")} for construction), a preference of [Confirm: %] applies to bidders with [Confirm: a permanent place of business in the Town].`;
}

export const BILINGUAL_CLAUSE: L = {
  en: "Bids may be submitted in English or French.",
  fr: "Les soumissions peuvent être présentées en français ou en anglais.",
  es: "Las ofertas pueden presentarse en inglés o en francés.",
};

/** "$5,000,000" / "5 000 000 $" / "$5,000,000". */
export function money(n: number, lang: WriterLang): string {
  if (lang === "fr") return `${n.toLocaleString("fr-CA").replace(/[  ]/g, " ")} $`;
  return `$${n.toLocaleString("en-CA")}`;
}
