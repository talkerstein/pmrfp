import { RFP_TEMPLATES, type RfpTemplate } from "@/lib/seo/rfp-templates";
import { TIMING_LABEL, WEIGHTS, type RfpDraft, type WizardInput } from "./schema";
import { isUsState } from "@/lib/geo";
import { confirmBlank, finalizeDraft, properCase, siteAccessBlock, tidyUserText } from "./postprocess";

/**
 * Template-based RFP composer — no AI, always available. Starts from the
 * closest expert template for the trade and fills it with the wizard answers.
 * Also the fallback whenever the Claude call is unavailable or fails, so the
 * writer never shows an error to a property manager.
 */

/** An urgent leak or failure: the trade's emergency-repair template fits better than a full replacement. */
const URGENT_REPAIR = /\bleak|\bfui(?:t|te|tes|ent)\b|\bgotera|\bfiltra|\bburst|\bflood|\binfiltr|\bemergenc|\burgen/i;

export function pickTemplate(
  input: Pick<WizardInput, "tradeSlug" | "templateSlug"> & Partial<Pick<WizardInput, "timing" | "description">>,
): RfpTemplate | undefined {
  if (input.templateSlug) {
    const t = RFP_TEMPLATES.find((x) => x.slug === input.templateSlug);
    if (t) return t;
  }
  const forTrade = RFP_TEMPLATES.filter((x) => x.tradeSlug === input.tradeSlug);
  if (input.timing === "asap" && URGENT_REPAIR.test(input.description ?? "")) {
    const emergency = forTrade.find((x) => x.slug.includes("emergency"));
    if (emergency) return emergency;
  }
  return forTrade[0];
}

const money = (n: number) => `$${n.toLocaleString("en-CA")}`;

function fmtDate(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-CA", {
    month: "long",
    day: "numeric",
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

function where(input: WizardInput): string {
  return [input.city ? properCase(input.city) : undefined, input.province].filter(Boolean).join(", ");
}

/** "18,000 sq ft roof, 9 storeys" → "18,000 sq ft"; null if no area was given. */
function area(size: string | undefined): string | null {
  return size?.match(/[\d,.]+\s*(?:sq\.?\s*ft|square feet|sf|m2|m²)/i)?.[0] ?? null;
}

/** "a condominium in Mississauga" — for running sentences. */
function placePhrase(input: WizardInput): string {
  const type = input.propertyType ? input.propertyType.toLowerCase() : "property";
  const at = input.city ? properCase(input.city) : input.province;
  return `a ${type}${at ? ` in ${at}` : ""}`;
}

// Templates and defaults are written for Canadian buildings. A U.S. property
// needs U.S. terms: state workers' comp instead of WSIB/WCB, state licensing
// instead of TSSA/ESA, USD budgets. Most specific phrases first.
const US_TERMS: [RegExp, string][] = [
  [/WSIB clearance certificate in good standing(?: \(or provincial WCB equivalent\))?\.?/g, "Proof of workers' compensation coverage as required by state law."],
  [/WSIB clearance(?: in good standing)?\.?/g, "Proof of workers' compensation coverage as required by state law."],
  [/WSIB \(or provincial WCB\) clearance/g, "proof of workers' compensation coverage"],
  [/TSSA certification \(Ontario\) or provincial equivalent/g, "State or local licensing"],
  [/TSSA or provincial equivalent/g, "State or local licensing"],
  [/TSSA Gas Technician 2 minimum \(TSSA Gas Tech 1 for larger units\)/g, "Gas-fitter licensing as required by the state"],
  [/TSSA-licensed elevator mechanic/g, "State-licensed elevator mechanic"],
  [/ESA-licensed contractor \(Ontario\) or provincial equivalent/g, "Licensed electrical contractor in the state"],
  [/ESA \/ provincial inspection/g, "Electrical permit and inspection"],
  [/Refrigerant handling certification \(Canada CARO \/ ODP-compliant\)/g, "EPA Section 608 refrigerant handling certification"],
  [/ASME A17\.1 \/ CSA B44/g, "ASME A17.1"],
  [/per Canadian Electrical Code/g, "per the National Electrical Code (NEC)"],
  [/CAN\/ULC-S536/g, "NFPA 72"],
  [/CFAA-certified fire alarm technician \(Canadian Fire Alarm Association\)/g, "NICET-certified fire alarm technician"],
  [/major Canadian insurers/g, "major insurers"],
  [/\bTSSA\b/g, "state"],
  [/\bESA\b/g, "electrical inspection"],
  [/\bWSIB\b/g, "workers' comp"],
  [/in the province/g, "in the state"],
  [/\bprovincial\b/g, "state"],
  [/condo corporation/g, "condominium association"],
  [/\(CAD, before tax\)/g, "(USD, before tax)"],
];

// A Québec property: CNESST instead of WSIB (finalizeDraft adds the RBQ licence).
const QC_TERMS: [RegExp, string][] = [
  [/WSIB clearance certificate in good standing(?: \(or provincial WCB equivalent\))?\.?/g, "CNESST certificate of compliance (attestation de conformité) in good standing."],
  [/WSIB clearance(?: in good standing)?\.?/g, "CNESST certificate of compliance (attestation de conformité) in good standing."],
  [/WSIB \(or provincial WCB\) clearance/g, "CNESST certificate of compliance"],
  [/\bWSIB\b/g, "CNESST"],
];

const isQuebec = (p: string | undefined) => (p ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase() === "quebec";

export function localize(text: string, input: Pick<WizardInput, "province">): string {
  if (isQuebec(input.province)) return QC_TERMS.reduce((out, [p, r]) => out.replace(p, r), text);
  if (!isUsState(input.province)) return text;
  return US_TERMS.reduce((out, [p, r]) => out.replace(p, r), text);
}

/** Replace template placeholders with answers where we have them. */
function fill(text: string, input: WizardInput): string {
  return text
    .replace(/\[(?:size|X)\]\s*sq ?ft/gi, area(input.size) ?? `${confirmBlank("en", "area")} sq ft`)
    .replace(/\[size\]/gi, input.size ?? confirmBlank("en", "size"))
    .replace(/\[Property Name \/ Address\]/gi, [input.propertyType, where(input)].filter(Boolean).join(", ") || "our property")
    // Templates were written for posting on PMRFP; in a property manager's own RFP
    // the owner / condo corporation is the additional insured.
    .replace(/PMRFP\s*\/\s*building owner/gi, "the building owner / condo corporation")
    .replace(/\$\s?[25]M general liability/gi, `${input.insurance === "5m" ? "$5M" : "$2M"} general liability`);
}

export function propertyParagraph(input: WizardInput): string {
  const parts: string[] = [];
  const type = input.propertyType ? input.propertyType.toLowerCase() : "property";
  parts.push(`The property is a ${type}${where(input) ? ` in ${where(input)}` : ""}${input.size ? ` (${input.size})` : ""}.`);
  if (input.occupied === true) parts.push("The building is occupied during the work, so noise, access and safety must be planned around residents and tenants.");
  if (input.occupied === false) parts.push("The building will not be occupied during the work.");
  parts.push(`Work should take place ${TIMING_LABEL[input.timing]}.`);
  return parts.join(" ");
}

export function submissionInstructions(input: WizardInput): string {
  const lines: string[] = [];
  lines.push(
    input.contractType === "service-contract"
      ? "Submit pricing for the service contract (annual price, plus any per-visit or per-event rates), with any add-alternates priced separately."
      : "Submit a lump-sum price for the base scope, with each add-alternate priced separately.",
  );
  lines.push(`Include: certificate of insurance, WSIB (or provincial WCB) clearance, relevant licences${isQuebec(input.province) ? " (including the RBQ licence)" : ""}, a proposed schedule, and three references for comparable work.`);
  if (input.siteVisit) {
    lines.push(
      input.siteVisitDate
        ? `Site visit: ${fmtDate(input.siteVisitDate)}. Please confirm attendance in advance.`
        : "A site visit will be arranged for interested bidders before pricing is final. Please request a time.",
    );
  }
  lines.push(`Questions in writing by ${questionCutoff(input.bidDeadline)}. Answers will be shared with all bidders.`);
  lines.push(`Bids are due by ${fmtDate(input.bidDeadline)}.`);
  const w = WEIGHTS[input.priority].map(([k, v]) => `${k} ${v}%`).join(", ");
  lines.push(`Evaluation: ${w}.`);
  if (input.budgetMin || input.budgetMax) {
    const range = input.budgetMin && input.budgetMax
      ? `${money(input.budgetMin)}–${money(input.budgetMax)}`
      : money((input.budgetMax ?? input.budgetMin)!);
    lines.push(`Budget guidance: ${range} (CAD, before tax).`);
  }
  return localize(lines.join("\n"), input);
}

function genericScope(): string {
  return `Scope of work:
- Supply all labour, materials, equipment and supervision to complete the work described above.
- Obtain and pay for all required permits and inspections.
- Protect the building, occupants and finished surfaces throughout the work.
- Daily clean-up; removal and legal disposal of all debris.
- Written warranty on workmanship (bidder to state the term) plus manufacturer warranties on materials.

Please confirm anything you believe is required but not listed, and price it as an add-alternate.`;
}

const GENERIC_QUESTIONS = [
  "What is your proposed approach and schedule for this work?",
  "What warranty do you offer on workmanship and materials?",
  "Which parts of the work, if any, would you subcontract?",
  "What is your hourly or unit rate for work outside the base scope?",
];

/** "Flat Roof Replacement" → "Flat roof replacement"; "HVAC Rooftop Unit Replacement" keeps "HVAC". */
function sentenceCase(noun: string): string {
  return noun
    .split(" ")
    .map((w, i) => (i > 0 && /^[A-Z][a-z]+$/.test(w) ? w.toLowerCase() : w))
    .join(" ");
}

/** The summary, from the structured answers only: the manager's own words appear once, under "What we need". */
export function structuredSummary(input: WizardInput, noun: string): string {
  return `${sentenceCase(noun)} at ${placePhrase(input)}. Work to take place ${TIMING_LABEL[input.timing]}.`;
}

export function composeRfp(input: WizardInput): RfpDraft {
  const t = pickTemplate(input);
  const place = [input.propertyType, input.city ? properCase(input.city) : input.province].filter(Boolean).join(", ");
  const noun = t ? t.name.replace(/ RFP Template$/, "") : `${input.tradeName} ${input.contractType === "service-contract" ? "Service Contract" : "Project"}`;
  const title = place ? `${noun} — ${place}` : noun;
  const summary = structuredSummary(input, noun);

  const scope = [
    `About the property:\n${propertyParagraph(input)}`,
    `What we need:\n${tidyUserText(input.description, input, "en")}`,
    fill(t ? t.scope : genericScope(), input),
    // Never the template's sample site facts: visible blanks to confirm.
    siteAccessBlock("en", input, t?.siteAccess),
  ].join("\n\n");

  const requirements = localize(t
    ? fill(t.requirements, input)
    : `- ${input.insurance === "5m" ? "$5M" : "$2M"} commercial general liability insurance, with the building owner / condo corporation named as additional insured (certificate required before mobilization).
- WSIB clearance certificate in good standing (or provincial WCB equivalent).
- All licences and certifications required for ${input.tradeName.toLowerCase()} work in the province.
- Three references for comparable work completed in the last 24 months.
- A named project lead or site contact for the duration of the work.`, input);

  return finalizeDraft(
    {
      title,
      summary,
      scope: localize(scope, input),
      requirements,
      submissionInstructions: submissionInstructions(input),
      evaluationCriteria: WEIGHTS[input.priority].map(([k, v]) => `${k} (${v}%)`),
      questionsForBidders: t?.questions.length ? t.questions : GENERIC_QUESTIONS,
    },
    input,
    { lang: "en", structuredSummary: summary },
  );
}
