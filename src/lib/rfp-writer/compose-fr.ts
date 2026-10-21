import type { RfpTemplate } from "@/lib/seo/rfp-templates";
import { isUsState } from "@/lib/geo";
import { propertyTypeName, regionName, tradeName } from "@/i18n/terms";
import { pickTemplate } from "./compose";
import { RFP_TEMPLATES_FR, type RfpTemplateFr } from "./templates-fr";
import { WEIGHTS, type RfpDraft, type WizardInput } from "./schema";
import { confirmBlank, finalizeDraft, properCase, siteAccessBlock, tidyUserText } from "./postprocess";

/**
 * French (Quebec) version of compose.ts: same structure and rules, written in
 * French from the French templates (templates-fr.ts). Used when the wizard is
 * on /fr. English generation never goes through this file.
 */

export const TIMING_LABEL_FR: Record<WizardInput["timing"], string> = {
  asap: "dès que possible",
  "1-month": "d'ici un mois",
  "1-3-months": "d'ici 1 à 3 mois",
  "3-6-months": "d'ici 3 à 6 mois",
  "next-season": "la saison prochaine",
};

/** Evaluation criteria labels (WEIGHTS keys are English). */
const CRITERIA_FR: Record<string, string> = {
  Price: "Prix",
  "Relevant experience and references": "Expérience pertinente et références",
  "Scope coverage": "Couverture de la portée des travaux",
  Schedule: "Échéancier",
};

export function frenchTemplate(t: RfpTemplate | undefined): RfpTemplateFr | undefined {
  return t ? RFP_TEMPLATES_FR[t.slug] : undefined;
}

const money = (n: number) => `${n.toLocaleString("fr-CA")} $`;

function fmtDate(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("fr-CA", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** Question cut-off: 5 days before the deadline, never in the past. */
function questionCutoff(deadline: string): string {
  const d = new Date(`${deadline}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 5);
  const today = new Date();
  return fmtDate((d < today ? today : d).toISOString().slice(0, 10));
}

/** "Copropriété" -> "copropriété", but "CVC" stays "CVC". */
function lowerFirst(s: string): string {
  return /^[A-ZÀ-Ý][a-zà-ÿ]/.test(s) ? s[0].toLowerCase() + s.slice(1) : s;
}

/** "de toiture", "d'électricité". */
function de(word: string): string {
  return /^[aeiouyàâéèêëîïôûœh]/i.test(word) ? `d'${word}` : `de ${word}`;
}

const norm = (s: string | undefined) => (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();

function where(input: WizardInput): string {
  return [input.city ? properCase(input.city) : undefined, input.province ? regionName(input.province, "fr") : undefined].filter(Boolean).join(", ");
}

function propertyTypeFr(input: WizardInput): string | undefined {
  return input.propertyType ? propertyTypeName(input.propertyType, "fr") : undefined;
}

/** "18 000 pi², 9 étages" -> "18 000 pi²"; null if no area was given. */
function area(size: string | undefined): string | null {
  return size?.match(/\d[\d\s  ,.]*\s*(?:pi(?:eds)?\s*(?:²|2|carrés?)|p\.?\s?c\.?|sq\.?\s*ft|square feet|sf|m2|m²)/i)?.[0] ?? null;
}

/** Workers' compensation proof, by province. Capitalized: it starts a bullet. */
function wcb(province: string | undefined): string {
  const p = norm(province);
  if (!p) return "Attestation de conformité de la CNESST (Québec) ou certificat de la WSIB (Ontario) en vigueur";
  if (isUsState(province)) return "Preuve de couverture contre les accidents du travail exigée par la loi de l'État";
  if (p === "quebec") return "Attestation de conformité de la CNESST en vigueur";
  if (p === "ontario") return "Certificat de décharge de la WSIB en vigueur";
  return "Attestation en règle de la commission des accidents du travail de la province (WCB)";
}

// A U.S. property in French: state rules instead of Quebec / Ontario / provincial
// ones, U.S. codes, USD budgets. Most specific phrases first.
const US_TERMS_FR: [RegExp, string][] = [
  [/Maître électricien membre de la CMEQ au Québec, entrepreneur autorisé ESA en Ontario ou l'équivalent provincial/g, "Entrepreneur électricien titulaire de la licence exigée par l'État"],
  [/Certificat de compétence en gaz approprié \(CCQ au Québec; TSSA Gas Technician 2 minimum en Ontario, Gas Technician 1 pour les plus gros appareils\)/g, "Licence de gazier exigée par l'État"],
  [/RBQ\/CCQ au Québec, TSSA en Ontario ou l'équivalent provincial/g, "licence exigée par l'État"],
  [/\(attestation halocarbures au Québec, carte ODP en Ontario\)/g, "(certification EPA section 608)"],
  [/\(frigoriste CCQ au Québec, Sceau rouge en réfrigération et climatisation ailleurs\)/g, "(licence de technicien exigée par l'État)"],
  [/\(certificat de compétence CCQ au Québec, licence TSSA en Ontario\)/g, "(licence exigée par l'État)"],
  [/\(RBQ au Québec, TSSA en Ontario\)/g, "(selon les exigences de l'État)"],
  [/\(ESA en Ontario ou autorité provinciale\)/g, "(permis et inspection électriques)"],
  [/ \(EB-10S au Québec, HL3 en Ontario, ou l'équivalent\)/g, ""],
  [/normes d'accessibilité provinciales \(AODA en Ontario\)/g, "normes d'accessibilité applicables (ADA)"],
  [/ \(Code de gestion des pesticides au Québec\)/g, ""],
  [/ \(licence RBQ au Québec\)/g, ""],
  [/\(Hydro-Québec ou distributeur local\)/g, "(distributeur local)"],
  [/\(Hydro-Québec, Save on Energy, etc\.\)/g, "(programmes locaux)"],
  [/lignes directrices de la CNESST \(Québec\) ou du ministère du Travail provincial/g, "lignes directrices de l'OSHA et de l'État"],
  [/certifié ACAI\/CFAA \(Association canadienne des alarmes incendie\)/g, "certifié NICET"],
  [/Code canadien de l'électricité/g, "National Electrical Code (NEC)"],
  [/CAN\/ULC-S536/g, "NFPA 72"],
  [/ASME A17\.1 \/ CSA B44/g, "ASME A17.1"],
  [/\bSIMDUT\b/g, "HazCom (OSHA)"],
  [/principaux assureurs canadiens/g, "principaux assureurs"],
  [/l'équivalent provincial/g, "l'équivalent exigé par l'État"],
  [/équivalent provincial/g, "équivalent exigé par l'État"],
  [/dans la province/g, "dans l'État"],
  [/de la province/g, "de l'État"],
  [/\bprovincia(?:l|le|ux|les)\b/g, "de l'État"],
  [/syndicat de copropriété/g, "association de copropriétaires"],
  [/\(CAD, avant taxes\)/g, "(USD, avant taxes)"],
];

export function localizeFr(text: string, input: Pick<WizardInput, "province">): string {
  const out = text.replace(/\{WCB\}/g, wcb(input.province));
  if (!isUsState(input.province)) return out;
  return US_TERMS_FR.reduce((acc, [p, r]) => acc.replace(p, r), out);
}

/** Replace French template placeholders with answers where we have them. */
export function fillFr(text: string, input: WizardInput): string {
  return text
    .replace(/\[(?:size|X)\]\s*pi²/gi, area(input.size) ?? `${confirmBlank("fr", "superficie")} pi²`)
    .replace(/\[size\]/gi, input.size ?? confirmBlank("fr", "dimensions"))
    .replace(/responsabilité civile générale de [25] M\$/g, `responsabilité civile générale de ${input.insurance === "5m" ? "5 M$" : "2 M$"}`);
}

export function propertyParagraphFr(input: WizardInput): string {
  const parts: string[] = [];
  const type = propertyTypeFr(input);
  const place = [type ? lowerFirst(type) : undefined, where(input)].filter(Boolean).join(" — ");
  parts.push(`Immeuble : ${place || confirmBlank("fr", "type d'immeuble et emplacement")}${input.size ? ` (${input.size})` : ""}.`);
  if (input.occupied === true) parts.push("L'immeuble demeure occupé pendant les travaux : le bruit, l'accès et la sécurité doivent être planifiés en fonction des résidents et des locataires.");
  if (input.occupied === false) parts.push("L'immeuble ne sera pas occupé pendant les travaux.");
  parts.push(`Les travaux devraient avoir lieu ${TIMING_LABEL_FR[input.timing]}.`);
  return parts.join(" ");
}

export function submissionInstructionsFr(input: WizardInput): string {
  const lines: string[] = [];
  lines.push(
    input.contractType === "service-contract"
      ? "Soumettez un prix pour le contrat de service (prix annuel, plus les taux par visite ou par intervention, le cas échéant), avec chaque option à prix séparé."
      : "Soumettez un prix forfaitaire pour la portée de base, avec chaque option à prix séparé.",
  );
  lines.push(`Joignez : certificat d'assurance, ${lowerFirst(wcb(input.province)).replace(/ en vigueur$/, "")}, licences pertinentes${norm(input.province) === "quebec" ? " (dont la licence RBQ)" : ""}, échéancier proposé et trois références pour des travaux comparables.`);
  if (input.siteVisit) {
    lines.push(
      input.siteVisitDate
        ? `Visite des lieux : ${fmtDate(input.siteVisitDate)}. Veuillez confirmer votre présence à l'avance.`
        : "Une visite des lieux sera organisée pour les soumissionnaires intéressés avant le dépôt des prix. Veuillez demander un rendez-vous.",
    );
  }
  lines.push(`Questions par écrit au plus tard le ${questionCutoff(input.bidDeadline)}. Les réponses seront transmises à tous les soumissionnaires.`);
  lines.push(`Les soumissions doivent être reçues au plus tard le ${fmtDate(input.bidDeadline)}.`);
  const w = WEIGHTS[input.priority].map(([k, v]) => `${CRITERIA_FR[k] ?? k} ${v} %`).join(", ");
  lines.push(`Évaluation : ${w}.`);
  if (input.budgetMin || input.budgetMax) {
    const range = input.budgetMin && input.budgetMax
      ? `${money(input.budgetMin)} à ${money(input.budgetMax)}`
      : money((input.budgetMax ?? input.budgetMin)!);
    lines.push(`Budget indicatif : ${range} (CAD, avant taxes).`);
  }
  return localizeFr(lines.join("\n"), input);
}

function genericScopeFr(): string {
  return `Portée des travaux :
- Fournir toute la main-d'œuvre, les matériaux, l'équipement et la supervision nécessaires pour réaliser les travaux décrits ci-dessus.
- Obtenir et payer tous les permis et inspections requis.
- Protéger l'immeuble, les occupants et les surfaces finies pendant toute la durée des travaux.
- Nettoyage quotidien; enlèvement et élimination conforme de tous les débris.
- Garantie écrite sur la main-d'œuvre (durée à préciser par le soumissionnaire) et garanties du fabricant sur les matériaux.

Veuillez indiquer tout élément que vous jugez nécessaire mais qui n'est pas mentionné, et le soumettre en option à prix séparé.`;
}

const GENERIC_QUESTIONS_FR = [
  "Quelle approche et quel échéancier proposez-vous pour ces travaux?",
  "Quelle garantie offrez-vous sur la main-d'œuvre et les matériaux?",
  "Quelles parties des travaux, le cas échéant, confieriez-vous à des sous-traitants?",
  "Quel est votre taux horaire ou unitaire pour les travaux hors de la portée de base?",
];

export function composeRfpFr(input: WizardInput): RfpDraft {
  const t = pickTemplate(input);
  const tf = frenchTemplate(t);
  const trade = lowerFirst(tradeName(input.tradeName, "fr"));
  const type = propertyTypeFr(input);
  const city = input.city ? properCase(input.city) : input.province ? regionName(input.province, "fr") : undefined;
  const place = [type, city].filter(Boolean).join(", ");
  const noun = tf
    ? tf.name
    : `${input.contractType === "service-contract" ? "Contrat de service" : "Projet"} ${de(trade)}`;
  const title = place ? `${noun} — ${place}` : noun;

  // From the structured answers only: the manager's own words appear once, under "Ce dont nous avons besoin".
  const placeInSentence = [type ? lowerFirst(type) : undefined, city].filter(Boolean).join(", ");
  const summary = `${noun}${placeInSentence ? ` (${placeInSentence})` : ""}. Travaux à réaliser ${TIMING_LABEL_FR[input.timing]}.`;

  const scope = [
    `À propos de l'immeuble :\n${propertyParagraphFr(input)}`,
    `Ce dont nous avons besoin :\n${tidyUserText(input.description, input, "fr")}`,
    fillFr(tf ? tf.scope : genericScopeFr(), input),
    // Never the template's sample site facts: visible blanks to confirm.
    siteAccessBlock("fr", input, tf?.siteAccess ?? t?.siteAccess),
  ].join("\n\n");

  const requirements = localizeFr(tf
    ? fillFr(tf.requirements, input)
    : `- Assurance responsabilité civile générale de ${input.insurance === "5m" ? "5 M$" : "2 M$"}, avec le propriétaire de l'immeuble / le syndicat de copropriété désigné comme assuré additionnel (certificat exigé avant la mobilisation).
- {WCB}.
- Toutes les licences et certifications requises pour les travaux ${de(trade)} dans la province${norm(input.province) === "quebec" ? " (p. ex. licence RBQ et certificats de compétence CCQ)" : ""}.
- Trois références pour des travaux comparables réalisés au cours des 24 derniers mois.
- Un chargé de projet ou responsable de chantier désigné pour toute la durée des travaux.`, input);

  return finalizeDraft(
    {
      title,
      summary,
      scope: localizeFr(scope, input),
      requirements,
      submissionInstructions: submissionInstructionsFr(input),
      evaluationCriteria: WEIGHTS[input.priority].map(([k, v]) => `${CRITERIA_FR[k] ?? k} (${v} %)`),
      questionsForBidders: tf?.questions.length ? tf.questions : GENERIC_QUESTIONS_FR,
    },
    input,
    { lang: "fr", structuredSummary: summary },
  );
}
