import { geminiAvailable, geminiClient } from "@/lib/ai/gemini";
import { z } from "zod";
import type { RfpTemplate } from "@/lib/seo/rfp-templates";
import { TIMING_LABEL, type RfpDraft, type WizardInput } from "./schema";
import { TIMING_LABEL_FR, fillFr, frenchTemplate, localizeFr } from "./compose-fr";
import { TIMING_LABEL_ES, fillEs, localizeEs, spanishTemplate } from "./compose-es";
import { propertyTypeName, regionName, tradeName } from "@/i18n/terms";
import { isUsState } from "@/lib/geo";
import { finalizeDraft } from "./postprocess";

/**
 * Gemini Flash tailors the template draft to the specific job. Only the prose
 * sections come from the model — deadlines, weights, budget and submission
 * rules stay computed (compose.ts) so they can't be invented. Any failure
 * (no key, quota, bad JSON) returns null and the caller keeps the template
 * draft, so a property manager never sees an error.
 */

// "gemini-flash-latest" follows Google's current Flash model, so a retired
// model version can't silently break the writer. Override with GEMINI_MODEL.
// Free-tier Flash is often "high demand" (503) — try the next model before
// falling back to the template draft.
const MODELS = [process.env.GEMINI_MODEL || "gemini-flash-latest", "gemini-2.5-flash", "gemini-flash-lite-latest"];

const tailoredSchema = z.object({
  title: z.string(),
  summary: z.string(),
  scope: z.string(),
  requirements: z.string(),
  questionsForBidders: z.array(z.string()),
});

const SYSTEM = `You write requests for proposals (RFPs) for property managers in Canada and the United States hiring commercial trades and service contractors. A good RFP gets real, comparable bids: every bidder prices the same job.

Write in plain, direct English: Canadian spelling for a property in Canada, U.S. spelling for a property in a U.S. state. No marketing language. Use short lines and "- " bullets inside sections; no Markdown headings, bold or tables.

Rules:
- Use only facts the property manager gave you or that are standard practice for this trade. Never invent a building address, name, size, date, dollar figure, equipment model or site condition. When a detail matters but wasn't given, write it as a bracketed placeholder, e.g. [roof area in sq ft].
- Never state site specifics as facts unless the property manager gave them: access routes (stairwells, hatches, ladders), crane, staging or parking areas, working hours, service elevators, shut-off windows. Write each as a visible blank instead, e.g. [Confirm: site access details], [Confirm: working hours], [Confirm: staging and parking]. Keep every [Confirm: …] blank from the starting draft that the answers don't fill.
- Never leave a "[X]%" blank: give a sensible default followed by "(confirm)", or leave the item out.
- title: the work, then the property type and city, e.g. "Flat roof replacement — mid-rise condominium, Mississauga". Under 90 characters.
- summary: two sentences in your own words, in sentence case — what is needed, and the one detail that most affects price. Don't copy the manager's description into it; the scope already quotes it.
- scope: start with "About the property:" and "What we need:" paragraphs, then "Scope of work:" bullets covering what is included (materials, disposal, permits, inspections, commissioning, warranty as relevant), then "Out of scope unless quoted as add-alternates:" bullets. Leave the method open where the manager didn't specify one, and ask the bidder to recommend it. If the building is occupied, cover access, noise and safety for occupants.
- requirements: bullets for the insurance amount given (building owner / condo corporation as additional insured), workers' compensation (WSIB clearance in Ontario, a CNESST certificate of compliance in Quebec, the provincial WCB clearance elsewhere in Canada; proof of coverage under state law in the U.S.), the licences and certifications this trade needs where the property is (e.g. TSSA for gas and elevators and ESA for electrical in Ontario; in Quebec always a valid RBQ licence, plus CCQ competency certificates; state or local licensing in the U.S.), references for comparable work, and a named project lead.
- questionsForBidders: 4 to 6 specific questions that separate strong bidders from weak ones for this exact job.`;

/** Same job as SYSTEM, for the French wizard (/fr/rfp-writer): the RFP comes out in Quebec French. */
const SYSTEM_FR = `You write requests for proposals (RFPs) for property managers in Canada and the United States hiring commercial trades and service contractors. A good RFP gets real, comparable bids: every bidder prices the same job.

Write the whole RFP in Quebec French (français québécois), even if some answers are in English: plain, direct and professional, addressing bidders as "vous". No marketing language. Use short lines and "- " bullets inside sections; no Markdown headings, bold or tables. Quebec typography: a space before ":" and none before "?", "!" or ";". Money as "5 M$" or "25 000 $". Areas in "pi²".

Use standard Quebec construction and property-management terms: appel d'offres (RFP), soumission and soumissionnaire (bid, bidder), portée des travaux (scope of work), entrepreneur (contractor), assurance responsabilité civile générale (general liability insurance), assuré additionnel (additional insured), visite des lieux (site visit), option à prix séparé (add-alternate), syndicat de copropriété (condo corporation or board), gestionnaire immobilier (property manager), CVC (HVAC), déneigement (snow removal), entretien ménager (janitorial).

Rules:
- Use only facts the property manager gave you or that are standard practice for this trade. Never invent a building address, name, size, date, dollar figure, equipment model or site condition. When a detail matters but wasn't given, write it as a bracketed placeholder in French, e.g. [superficie du toit en pi²].
- Never state site specifics as facts unless the property manager gave them: access routes (cage d'escalier, trappe, échelle), crane, staging or parking areas, working hours, service elevators, shut-off windows. Write each as a visible blank in French instead, e.g. [À confirmer : accès au site], [À confirmer : heures de travail], [À confirmer : entreposage et stationnement]. Keep every [À confirmer : …] blank from the starting draft that the answers don't fill.
- Never leave a "[X] %" blank: give a sensible default followed by "(à confirmer)", or leave the item out.
- title: the work, then the property type and city, e.g. "Remplacement de toit plat — copropriété de moyenne hauteur, Laval". Under 90 characters.
- summary: two sentences in your own words — what is needed, and the one detail that most affects price. Don't copy the manager's description into it; the scope already quotes it.
- For a property in Quebec, requirements always include a valid RBQ licence and the CNESST attestation de conformité.
- scope: start with "À propos de l'immeuble :" and "Ce dont nous avons besoin :" paragraphs, then "Portée des travaux :" bullets covering what is included (materials, disposal, permits, inspections, commissioning, warranty as relevant), then "Exclus, sauf si soumis en option à prix séparé :" bullets. Leave the method open where the manager didn't specify one, and ask the bidder to recommend it. If the building is occupied, cover access, noise and safety for occupants.
- requirements: bullets for the insurance amount given (building owner / syndicat de copropriété as additional insured), workers' compensation where the property is (in Quebec an attestation de conformité de la CNESST; in Ontario a WSIB clearance certificate; elsewhere in Canada the provincial WCB clearance; in the U.S. proof of coverage under state law), the licences and certifications this trade needs where the property is (in Quebec e.g. the RBQ licence, CCQ competency certificates and a CMEQ master electrician for electrical work; in Ontario e.g. TSSA for gas and elevators and ESA for electrical; state or local licensing in the U.S.), references for comparable work, and a named project lead.
- questionsForBidders: 4 to 6 specific questions that separate strong bidders from weak ones for this exact job.`;

/** Same job as SYSTEM, for the Spanish wizard (/es/rfp-writer), written in Spanish: the RFP comes out in neutral Latin-American Spanish. */
const SYSTEM_ES = `Usted redacta solicitudes de propuestas (RFP) para administradores de propiedades de Estados Unidos y Canadá que contratan oficios comerciales y contratistas de servicios. Una buena RFP consigue ofertas reales y comparables: todos los oferentes cotizan el mismo trabajo.

Redacte toda la RFP en español neutro latinoamericano, aunque algunas respuestas estén en inglés: claro, directo y profesional, tratando de "usted" a los oferentes. Sin lenguaje de marketing. Use líneas cortas y viñetas "- " dentro de las secciones; sin encabezados de Markdown, negritas ni tablas. Montos con el signo de dólar delante: "$25,000", "$5 millones". Superficies en "pies²". Fechas como "15 de noviembre de 2026".

Use los términos habituales de construcción y administración de propiedades: solicitud de propuestas (RFP, en femenino: "la RFP"), oferta y oferente (bid, bidder), alcance del trabajo (scope of work), contratista (contractor), seguro de responsabilidad civil general (general liability insurance), asegurado adicional (additional insured), visita al sitio (site visit), alternativa adicional con precio por separado (add-alternate), asociación de condominio (condo association; corporación de condominio en Canadá), administrador de propiedades (property manager), seguro de compensación laboral (workers' compensation), HVAC (climatización), remoción de nieve (snow removal), limpieza y conserjería (janitorial).

Reglas:
- Use solo datos que le haya dado el administrador de propiedades o que sean práctica habitual para este oficio. Nunca invente una dirección, un nombre, un tamaño, una fecha, un monto en dólares, un modelo de equipo ni una condición del sitio. Cuando un dato importe pero no se haya dado, escríbalo como un marcador entre corchetes en español, p. ej., [superficie del techo en pies²].
- Nunca presente como hechos los detalles del sitio que el administrador no dio: rutas de acceso (escaleras, escotillas), áreas de grúa, acopio o estacionamiento, horario de trabajo, elevadores de servicio, cortes de servicio. Escriba cada uno como un espacio visible, p. ej., [Por confirmar: acceso al sitio], [Por confirmar: horario de trabajo], [Por confirmar: acopio y estacionamiento]. Conserve cada [Por confirmar: …] del borrador inicial que las respuestas no completen.
- Nunca deje un espacio "[X]%": indique un valor razonable seguido de "(por confirmar)" u omita el punto.
- title: el trabajo y luego el tipo de propiedad y la ciudad, p. ej., "Reemplazo de techo plano — condominio de altura media, Houston". Menos de 90 caracteres.
- summary: dos oraciones con sus propias palabras: qué se necesita y el dato que más influye en el precio. No copie la descripción del administrador; el alcance ya la cita.
- Para una propiedad en Quebec, los requisitos siempre incluyen una licencia RBQ vigente y el certificado de conformidad de la CNESST.
- scope: comience con los párrafos "Acerca de la propiedad:" y "Lo que necesitamos:", luego viñetas bajo "Alcance del trabajo:" con lo que está incluido (materiales, eliminación de residuos, permisos, inspecciones, puesta en marcha, garantía, según corresponda) y después viñetas bajo "Fuera del alcance, salvo que se cotice como alternativa adicional:". Deje abierto el método cuando el administrador no haya especificado uno y pida al oferente que lo recomiende. Si el edificio está ocupado, cubra el acceso, el ruido y la seguridad de los ocupantes.
- requirements: viñetas para el monto de seguro indicado (el propietario del edificio / la asociación de condominio como asegurado adicional), la compensación laboral según la ubicación de la propiedad (en EE. UU., prueba de cobertura de seguro de compensación laboral según la ley estatal; en Ontario, el certificado de autorización de la WSIB; en Quebec, el certificado de conformidad de la CNESST; en el resto de Canadá, el certificado de la WCB provincial), las licencias y certificaciones que este oficio necesita en esa ubicación (en EE. UU., licencias estatales o locales, p. ej., contratista eléctrico con licencia estatal o la certificación EPA 608 para refrigerantes; en Ontario, p. ej., TSSA para gas y elevadores y ESA para electricidad; en Quebec, p. ej., la licencia RBQ, los certificados de competencia CCQ y un maestro electricista de la CMEQ), referencias de trabajos comparables y un responsable de proyecto designado.
- questionsForBidders: de 4 a 6 preguntas específicas que distingan a los oferentes sólidos de los débiles para este trabajo en particular.`;

const client = geminiClient;

export function aiAvailable(): boolean {
  return geminiAvailable();
}

export async function tailorRfp(
  input: WizardInput,
  base: RfpDraft,
  template: RfpTemplate | undefined,
): Promise<RfpDraft | null> {
  const ai = client();
  if (!ai) return null;
  const draft =
    input.lang === "fr"
      ? await tailorRfpFr(ai, input, base, template)
      : input.lang === "es"
        ? await tailorRfpEs(ai, input, base, template)
        : await tailorRfpEn(ai, input, base, template);
  // Same last pass as the template path: no invented site facts, no "[X]%",
  // the manager's words once (base.summary is built from the answers).
  return draft ? finalizeDraft(draft, input, { lang: input.lang ?? "en", structuredSummary: base.summary }) : null;
}

async function tailorRfpEn(
  ai: NonNullable<ReturnType<typeof client>>,
  input: WizardInput,
  base: RfpDraft,
  template: RfpTemplate | undefined,
): Promise<RfpDraft | null> {
  const answers = [
    `Trade: ${input.tradeName}`,
    `Type of work: ${input.contractType === "service-contract" ? "ongoing service contract" : "one-time project"}`,
    `Job description (from the property manager): ${input.description}`,
    input.propertyType ? `Property type: ${input.propertyType}` : null,
    input.city || input.province ? `Location: ${[input.city, input.province].filter(Boolean).join(", ")}` : null,
    input.size ? `Size: ${input.size}` : null,
    input.occupied !== undefined ? `Occupied during work: ${input.occupied ? "yes" : "no"}` : null,
    `Timing: ${TIMING_LABEL[input.timing]}`,
    `Insurance required: ${input.insurance === "5m" ? "$5M" : "$2M"} general liability`,
    `Site visit: ${input.siteVisit ? "yes" : "no"}`,
  ].filter(Boolean).join("\n");

  const reference = template
    ? `Expert template for this kind of job (adapt it; don't keep placeholders the answers already fill):\n\nScope:\n${template.scope}\n\nRequirements:\n${template.requirements}\n\nQuestions:\n${template.questions.map((q) => `- ${q}`).join("\n")}`
    : "No template exists for this trade; write from standard practice.";

  const contents = `Property manager's answers:\n${answers}\n\n${reference}\n\nStarting draft (improve and tailor it to this job):\nTitle: ${base.title}\nSummary: ${base.summary}\n\nScope:\n${base.scope}\n\nRequirements:\n${base.requirements}\n\nReturn the tailored RFP as JSON.`;

  return generate(ai, contents, SYSTEM, base);
}

/** French: French answers, French template and base draft in, Quebec French out. */
async function tailorRfpFr(
  ai: NonNullable<ReturnType<typeof client>>,
  input: WizardInput,
  base: RfpDraft,
  template: RfpTemplate | undefined,
): Promise<RfpDraft | null> {
  const location = [input.city, input.province ? regionName(input.province, "fr") : undefined].filter(Boolean).join(", ");
  const answers = [
    `Trade: ${tradeName(input.tradeName, "fr")}`,
    `Type of work: ${input.contractType === "service-contract" ? "contrat de service continu" : "projet ponctuel"}`,
    `Job description (from the property manager): ${input.description}`,
    input.propertyType ? `Property type: ${propertyTypeName(input.propertyType, "fr")}` : null,
    location ? `Location: ${location}` : null,
    input.size ? `Size: ${input.size}` : null,
    input.occupied !== undefined ? `Occupied during work: ${input.occupied ? "oui" : "non"}` : null,
    `Timing: ${TIMING_LABEL_FR[input.timing]}`,
    `Insurance required: ${input.insurance === "5m" ? "5 M$" : "2 M$"} general liability`,
    `Site visit: ${input.siteVisit ? "oui" : "non"}`,
  ].filter(Boolean).join("\n");

  const fr = frenchTemplate(template);
  const reference = fr
    ? `Expert template for this kind of job, in French (adapt it; don't keep placeholders the answers already fill):\n\nScope:\n${fillFr(fr.scope, input)}\n\nRequirements:\n${localizeFr(fillFr(fr.requirements, input), input)}\n\nQuestions:\n${fr.questions.map((q) => `- ${q}`).join("\n")}`
    : template
      ? `Expert template for this kind of job, in English (adapt it and write it in French; don't keep placeholders the answers already fill):\n\nScope:\n${template.scope}\n\nRequirements:\n${template.requirements}\n\nQuestions:\n${template.questions.map((q) => `- ${q}`).join("\n")}`
      : "No template exists for this trade; write from standard practice.";

  const contents = `Property manager's answers:\n${answers}\n\n${reference}\n\nStarting draft in French (improve and tailor it to this job):\nTitle: ${base.title}\nSummary: ${base.summary}\n\nScope:\n${base.scope}\n\nRequirements:\n${base.requirements}\n\nReturn the tailored RFP as JSON, written in Quebec French.`;

  return generate(ai, contents, SYSTEM_FR, base);
}

/** Spanish: Spanish answers, Spanish template and base draft in, Spanish out. */
async function tailorRfpEs(
  ai: NonNullable<ReturnType<typeof client>>,
  input: WizardInput,
  base: RfpDraft,
  template: RfpTemplate | undefined,
): Promise<RfpDraft | null> {
  const location = [input.city, input.province ? regionName(input.province, "es") : undefined].filter(Boolean).join(", ");
  const countryName = input.province ? (isUsState(input.province) ? "Estados Unidos" : "Canadá") : null;
  const answers = [
    `Oficio: ${tradeName(input.tradeName, "es")}`,
    `Tipo de trabajo: ${input.contractType === "service-contract" ? "contrato de servicio continuo" : "proyecto único"}`,
    `Descripción del trabajo (del administrador de propiedades): ${input.description}`,
    input.propertyType ? `Tipo de propiedad: ${propertyTypeName(input.propertyType, "es")}` : null,
    location ? `Ubicación: ${location}${countryName ? ` (${countryName})` : ""}` : null,
    input.size ? `Tamaño: ${input.size}` : null,
    input.occupied !== undefined ? `Ocupado durante el trabajo: ${input.occupied ? "sí" : "no"}` : null,
    `Plazo: ${TIMING_LABEL_ES[input.timing]}`,
    `Seguro exigido: responsabilidad civil general de ${input.insurance === "5m" ? "$5 millones" : "$2 millones"}`,
    `Visita al sitio: ${input.siteVisit ? "sí" : "no"}`,
  ].filter(Boolean).join("\n");

  const es = spanishTemplate(template);
  const ready = (text: string) => localizeEs(fillEs(text, input), input);
  const reference = es
    ? `Plantilla de experto para este tipo de trabajo, en español (adáptela; no conserve los marcadores que las respuestas ya completan):\n\nAlcance:\n${ready(es.scope)}\n\nRequisitos:\n${ready(es.requirements)}\n\nPreguntas:\n${es.questions.map((q) => `- ${localizeEs(q, input)}`).join("\n")}`
    : template
      ? `Plantilla de experto para este tipo de trabajo, en inglés (adáptela y redáctela en español; no conserve los marcadores que las respuestas ya completan):\n\nScope:\n${template.scope}\n\nRequirements:\n${template.requirements}\n\nQuestions:\n${template.questions.map((q) => `- ${q}`).join("\n")}`
      : "No existe una plantilla para este oficio; redacte a partir de la práctica habitual.";

  const contents = `Respuestas del administrador de propiedades:\n${answers}\n\n${reference}\n\nBorrador inicial en español (mejórelo y adáptelo a este trabajo):\nTítulo: ${base.title}\nResumen: ${base.summary}\n\nAlcance:\n${base.scope}\n\nRequisitos:\n${base.requirements}\n\nDevuelva la RFP adaptada en formato JSON, redactada en español.`;

  return generate(ai, contents, SYSTEM_ES, base);
}

async function generate(
  ai: NonNullable<ReturnType<typeof client>>,
  contents: string,
  systemInstruction: string,
  base: RfpDraft,
): Promise<RfpDraft | null> {
  for (const model of MODELS) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents,
        config: {
          systemInstruction,
          responseMimeType: "application/json",
          responseJsonSchema: z.toJSONSchema(tailoredSchema),
          temperature: 0.4,
        },
      });
      const parsed = tailoredSchema.safeParse(JSON.parse(response.text ?? ""));
      if (!parsed.success) continue;
      const out = parsed.data;
      return {
        ...base,
        title: out.title.slice(0, 140),
        summary: out.summary,
        scope: out.scope,
        requirements: out.requirements,
        questionsForBidders: out.questionsForBidders.slice(0, 8),
      };
    } catch (err) {
      // Busy (503), quota (429), network, timeout or malformed JSON — try the next model.
      console.warn(`[rfp-writer] ${model} failed:`, err instanceof Error ? err.message.slice(0, 160) : err);
    }
  }
  return null; // every model failed — the template draft stands
}
