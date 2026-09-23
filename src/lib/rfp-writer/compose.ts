import { RFP_TEMPLATES, type RfpTemplate } from "@/lib/seo/rfp-templates";
import { TIMING_LABEL, WEIGHTS, type RfpDraft, type WizardInput } from "./schema";

/**
 * Template-based RFP composer — no AI, always available. Starts from the
 * closest expert template for the trade and fills it with the wizard answers.
 * Also the fallback whenever the Claude call is unavailable or fails, so the
 * writer never shows an error to a property manager.
 */

export function pickTemplate(input: Pick<WizardInput, "tradeSlug" | "templateSlug">): RfpTemplate | undefined {
  if (input.templateSlug) {
    const t = RFP_TEMPLATES.find((x) => x.slug === input.templateSlug);
    if (t) return t;
  }
  return RFP_TEMPLATES.find((x) => x.tradeSlug === input.tradeSlug);
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
  return [input.city, input.province].filter(Boolean).join(", ");
}

/** "18,000 sq ft roof, 9 storeys" → "18,000 sq ft"; null if no area was given. */
function area(size: string | undefined): string | null {
  return size?.match(/[\d,.]+\s*(?:sq\.?\s*ft|square feet|sf|m2|m²)/i)?.[0] ?? null;
}

/** "a condominium in Mississauga" — for running sentences. */
function placePhrase(input: WizardInput): string {
  const type = input.propertyType ? input.propertyType.toLowerCase() : "property";
  const at = input.city ?? input.province;
  return `a ${type}${at ? ` in ${at}` : ""}`;
}

/** Replace template placeholders with answers where we have them. */
function fill(text: string, input: WizardInput): string {
  return text
    .replace(/\[(?:size|X)\]\s*sq ?ft/gi, area(input.size) ?? "[area to confirm] sq ft")
    .replace(/\[size\]/gi, input.size ?? "[size to confirm]")
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
  lines.push("Include: certificate of insurance, WSIB (or provincial WCB) clearance, relevant licences, a proposed schedule, and three references for comparable work.");
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
  return lines.join("\n");
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

export function composeRfp(input: WizardInput): RfpDraft {
  const t = pickTemplate(input);
  const place = [input.propertyType, input.city ?? input.province].filter(Boolean).join(", ");
  const noun = t ? t.name.replace(/ RFP Template$/, "") : `${input.tradeName} ${input.contractType === "service-contract" ? "Service Contract" : "Project"}`;
  const title = place ? `${noun} — ${place}` : noun;

  const firstSentence = input.description.split(/(?<=[.!?])\s/)[0].slice(0, 220);
  const summary = `${firstSentence}${/[.!?]$/.test(firstSentence) ? "" : "."} Work to take place ${TIMING_LABEL[input.timing]} at ${placePhrase(input)}.`;

  const scope = [
    `About the property:\n${propertyParagraph(input)}`,
    `What we need:\n${input.description}`,
    fill(t ? t.scope : genericScope(), input),
    t?.siteAccess ? `Site access (to confirm for this property):\n${fill(t.siteAccess, input)}` : null,
  ].filter(Boolean).join("\n\n");

  const requirements = t
    ? fill(t.requirements, input)
    : `- ${input.insurance === "5m" ? "$5M" : "$2M"} commercial general liability insurance, with the building owner / condo corporation named as additional insured (certificate required before mobilization).
- WSIB clearance certificate in good standing (or provincial WCB equivalent).
- All licences and certifications required for ${input.tradeName.toLowerCase()} work in the province.
- Three references for comparable work completed in the last 24 months.
- A named project lead or site contact for the duration of the work.`;

  return {
    title,
    summary,
    scope,
    requirements,
    submissionInstructions: submissionInstructions(input),
    evaluationCriteria: WEIGHTS[input.priority].map(([k, v]) => `${k} (${v}%)`),
    questionsForBidders: t?.questions.length ? t.questions : GENERIC_QUESTIONS,
  };
}
