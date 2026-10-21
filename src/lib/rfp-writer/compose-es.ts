import type { RfpTemplate } from "@/lib/seo/rfp-templates";
import { isUsState } from "@/lib/geo";
import { propertyTypeName, regionName, tradeName } from "@/i18n/terms";
import { pickTemplate } from "./compose";
import { RFP_TEMPLATES_ES, type RfpTemplateEs } from "./templates-es";
import { WEIGHTS, type RfpDraft, type WizardInput } from "./schema";
import { confirmBlank, finalizeDraft, properCase, siteAccessBlock, tidyUserText } from "./postprocess";

/**
 * Spanish (neutral Latin-American, "usted") version of compose.ts: same
 * structure and rules, written in Spanish from the Spanish templates
 * (templates-es.ts). Used when the wizard is on /es. Most Spanish RFPs are for
 * U.S. properties: state workers' comp and licensing, USD budgets. Canadian
 * properties get WSIB / CNESST / WCB and provincial licensing. English and
 * French generation never go through this file.
 */

export const TIMING_LABEL_ES: Record<WizardInput["timing"], string> = {
  asap: "lo antes posible",
  "1-month": "dentro del próximo mes",
  "1-3-months": "en los próximos 1 a 3 meses",
  "3-6-months": "en los próximos 3 a 6 meses",
  "next-season": "la próxima temporada",
};

/** Evaluation criteria labels (WEIGHTS keys are English). */
const CRITERIA_ES: Record<string, string> = {
  Price: "Precio",
  "Relevant experience and references": "Experiencia pertinente y referencias",
  "Scope coverage": "Cobertura del alcance del trabajo",
  Schedule: "Cronograma",
};

export function spanishTemplate(t: RfpTemplate | undefined): RfpTemplateEs | undefined {
  return t ? RFP_TEMPLATES_ES[t.slug] : undefined;
}

/** "$25,000": dollar sign first, comma thousands (U.S. Spanish). */
const money = (n: number) => `$${n.toLocaleString("es-US")}`;

/** "15 de noviembre de 2026". */
function fmtDate(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("es-US", {
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

/** "Condominio" -> "condominio", but "HVAC (climatización)" stays. */
function lowerFirst(s: string): string {
  return /^[A-ZÁÉÍÓÚÑ][a-záéíóúñü]/.test(s) ? s[0].toLowerCase() + s.slice(1) : s;
}

const norm = (s: string | undefined) => (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();

function where(input: WizardInput): string {
  return [input.city ? properCase(input.city) : undefined, input.province ? regionName(input.province, "es") : undefined].filter(Boolean).join(", ");
}

function propertyTypeEs(input: WizardInput): string | undefined {
  return input.propertyType ? propertyTypeName(input.propertyType, "es") : undefined;
}

/**
 * "18,000 sq ft roof, 9 storeys" or "techo de 18,000 pies²" -> "18,000 pies²";
 * null if no area was given. Square feet always come out as "pies²".
 */
function area(size: string | undefined): string | null {
  const m = size?.match(/(\d[\d,.]*)\s*(pies?\s*(?:²|2|cuadrados?)|p2|ft²|ft2|sq\.?\s*ft|square\s+feet|sf|m2|m²|metros?\s+cuadrados?)/i);
  if (!m) return null;
  return `${m[1]} ${/^m/i.test(m[2]) ? "m²" : "pies²"}`;
}

type Country = "us" | "ca" | null;

function country(province: string | undefined): Country {
  if (!norm(province)) return null;
  return isUsState(province) ? "us" : "ca";
}

/**
 * Workers' compensation proof, by state or province: the bullet line
 * (capitalized, no final period) and the short form used in a sentence.
 */
function wcb(province: string | undefined): { line: string; short: string } {
  const p = norm(province);
  if (!p) {
    return {
      line: "Prueba de cobertura vigente de seguro de compensación laboral (según la ley estatal en EE. UU.; certificado de la WSIB o de la WCB provincial en Canadá)",
      short: "prueba de cobertura de compensación laboral",
    };
  }
  if (isUsState(province)) {
    return {
      line: "Prueba de cobertura de seguro de compensación laboral según la ley estatal",
      short: "prueba de cobertura de seguro de compensación laboral según la ley estatal",
    };
  }
  if (p === "quebec") {
    return { line: "Certificado de conformidad de la CNESST vigente", short: "certificado de conformidad de la CNESST" };
  }
  if (p === "ontario") {
    return { line: "Certificado de autorización de la WSIB vigente", short: "certificado de autorización de la WSIB" };
  }
  return {
    line: "Certificado de autorización vigente de la junta de compensación laboral de la provincia (WCB)",
    short: "certificado de autorización de la WCB provincial",
  };
}

/** Who is named as additional insured. */
function owner(c: Country): string {
  return c === "us"
    ? "el propietario del edificio / la asociación de condominio"
    : "el propietario del edificio / la corporación de condominio";
}

/**
 * Resolves the template tokens for the property's state or province: {WCB},
 * {OWNER} and {ca:…|us:…} (Canadian wording when no location was given, as in
 * English). Only ever applied to template text, never to the manager's own words.
 */
export function localizeEs(text: string, input: Pick<WizardInput, "province">): string {
  const c = country(input.province);
  return text
    .replace(/\{WCB\}/g, () => wcb(input.province).line)
    .replace(/\{OWNER\}/g, () => owner(c))
    .replace(/\{ca:([^{}|]*)\|us:([^{}|]*)\}/g, (_m, ca: string, us: string) => (c === "us" ? us : ca));
}

/** Replace Spanish template placeholders with answers where we have them. */
export function fillEs(text: string, input: WizardInput): string {
  return text
    .replace(/\[(?:size|X)\]\s*pies²/gi, () => area(input.size) ?? `${confirmBlank("es", "superficie")} pies²`)
    .replace(/\[size\]/gi, () => input.size ?? confirmBlank("es", "tamaño"))
    .replace(/responsabilidad civil general de \$[25] millones/g, () => `responsabilidad civil general de ${input.insurance === "5m" ? "$5 millones" : "$2 millones"}`);
}

/** Template text ready for the RFP: placeholders filled, tokens resolved. */
function templateText(text: string, input: WizardInput): string {
  return localizeEs(fillEs(text, input), input);
}

export function propertyParagraphEs(input: WizardInput): string {
  const parts: string[] = [];
  const type = propertyTypeEs(input);
  const place = [type ? lowerFirst(type) : undefined, where(input)].filter(Boolean).join(" — ");
  parts.push(`Propiedad: ${place || confirmBlank("es", "tipo de propiedad y ubicación")}${input.size ? ` (${input.size})` : ""}.`);
  if (input.occupied === true) parts.push("El edificio estará ocupado durante el trabajo, por lo que el ruido, el acceso y la seguridad deben planificarse en función de los residentes y los inquilinos.");
  if (input.occupied === false) parts.push("El edificio no estará ocupado durante el trabajo.");
  parts.push(`El trabajo debe realizarse ${TIMING_LABEL_ES[input.timing]}.`);
  return parts.join(" ");
}

export function submissionInstructionsEs(input: WizardInput): string {
  const lines: string[] = [];
  lines.push(
    input.contractType === "service-contract"
      ? "Presente el precio del contrato de servicio (precio anual, más las tarifas por visita o por evento, si corresponde), con cada alternativa adicional cotizada por separado."
      : "Presente un precio global (suma alzada) para el alcance base, con cada alternativa adicional cotizada por separado.",
  );
  lines.push(`Incluya: certificado de seguro, ${wcb(input.province).short}, las licencias pertinentes${norm(input.province) === "quebec" ? " (incluida la licencia RBQ)" : ""}, un cronograma propuesto y tres referencias de trabajos comparables.`);
  if (input.siteVisit) {
    lines.push(
      input.siteVisitDate
        ? `Visita al sitio: ${fmtDate(input.siteVisitDate)}. Confirme su asistencia con anticipación.`
        : "Se organizará una visita al sitio para los oferentes interesados antes de fijar los precios. Solicite una cita.",
    );
  }
  lines.push(`Preguntas por escrito a más tardar el ${questionCutoff(input.bidDeadline)}. Las respuestas se compartirán con todos los oferentes.`);
  lines.push(`Las ofertas deben recibirse a más tardar el ${fmtDate(input.bidDeadline)}.`);
  const w = WEIGHTS[input.priority].map(([k, v]) => `${CRITERIA_ES[k] ?? k} ${v}%`).join(", ");
  lines.push(`Evaluación: ${w}.`);
  if (input.budgetMin || input.budgetMax) {
    const range = input.budgetMin && input.budgetMax
      ? `de ${money(input.budgetMin)} a ${money(input.budgetMax)}`
      : money((input.budgetMax ?? input.budgetMin)!);
    lines.push(`Presupuesto de referencia: ${range} (${isUsState(input.province) ? "USD" : "CAD"}, antes de impuestos).`);
  }
  return lines.join("\n");
}

function genericScopeEs(): string {
  return `Alcance del trabajo:
- Suministrar toda la mano de obra, los materiales, el equipo y la supervisión necesarios para completar el trabajo descrito arriba.
- Obtener y pagar todos los permisos e inspecciones requeridos.
- Proteger el edificio, a los ocupantes y las superficies terminadas durante todo el trabajo.
- Limpieza diaria; retiro y eliminación legal de todos los escombros.
- Garantía escrita sobre la mano de obra (el oferente debe indicar el plazo), además de las garantías del fabricante sobre los materiales.

Indique cualquier elemento que considere necesario y que no esté incluido, y cotícelo como alternativa adicional.`;
}

function genericRequirementsEs(input: WizardInput, trade: string): string {
  return `- Seguro de responsabilidad civil general comercial de ${input.insurance === "5m" ? "$5 millones" : "$2 millones"}; {OWNER} debe figurar como asegurado adicional (se exige el certificado antes de la movilización).
- {WCB}.
- Todas las licencias y certificaciones exigidas para trabajos de ${trade} en {ca:la provincia|us:el estado}.
- Tres referencias de trabajos comparables realizados en los últimos 24 meses.
- Un responsable del proyecto o contacto en el sitio designado durante todo el trabajo.`;
}

const GENERIC_QUESTIONS_ES = [
  "¿Qué enfoque y qué cronograma propone para este trabajo?",
  "¿Qué garantía ofrece sobre la mano de obra y los materiales?",
  "¿Qué partes del trabajo subcontrataría, si las hay?",
  "¿Cuál es su tarifa por hora o por unidad para trabajos fuera del alcance base?",
];

export function composeRfpEs(input: WizardInput): RfpDraft {
  const t = pickTemplate(input);
  const te = spanishTemplate(t);
  const trade = lowerFirst(tradeName(input.tradeName, "es"));
  const type = propertyTypeEs(input);
  const city = input.city ? properCase(input.city) : input.province ? regionName(input.province, "es") : undefined;
  const place = [type, city].filter(Boolean).join(", ");
  const noun = te
    ? te.name
    : `${input.contractType === "service-contract" ? "Contrato de servicio" : "Proyecto"} de ${trade}`;
  const title = place ? `${noun} — ${place}` : noun;

  // From the structured answers only: the manager's own words appear once, under "Lo que necesitamos".
  const placeInSentence = [type ? lowerFirst(type) : undefined, city].filter(Boolean).join(", ");
  const summary = `${noun}${placeInSentence ? ` (${placeInSentence})` : ""}. El trabajo debe realizarse ${TIMING_LABEL_ES[input.timing]}.`;

  const scope = [
    `Acerca de la propiedad:\n${propertyParagraphEs(input)}`,
    `Lo que necesitamos:\n${tidyUserText(input.description, input, "es")}`,
    templateText(te ? te.scope : genericScopeEs(), input),
    // Never the template's sample site facts: visible blanks to confirm.
    siteAccessBlock("es", input, te?.siteAccess ?? t?.siteAccess),
  ].join("\n\n");

  const requirements = templateText(te ? te.requirements : genericRequirementsEs(input, trade), input);

  return finalizeDraft(
    {
      title,
      summary,
      scope,
      requirements,
      submissionInstructions: submissionInstructionsEs(input),
      evaluationCriteria: WEIGHTS[input.priority].map(([k, v]) => `${CRITERIA_ES[k] ?? k} (${v}%)`),
      questionsForBidders: te?.questions.length ? te.questions.map((q) => localizeEs(q, input)) : GENERIC_QUESTIONS_ES,
    },
    input,
    { lang: "es", structuredSummary: summary },
  );
}
