import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import type { RfpTemplate } from "@/lib/seo/rfp-templates";
import { TIMING_LABEL, type RfpDraft, type WizardInput } from "./schema";

/**
 * Claude tailors the template draft to the specific job. Only the prose
 * sections come from the model — deadlines, weights, budget and submission
 * rules stay computed (compose.ts) so they can't be invented.
 */

const tailoredSchema = z.object({
  title: z.string(),
  summary: z.string(),
  scope: z.string(),
  requirements: z.string(),
  questionsForBidders: z.array(z.string()),
});

const SYSTEM = `You write requests for proposals (RFPs) for Canadian property managers hiring commercial trades and service contractors. A good RFP gets real, comparable bids: every bidder prices the same job.

Write in plain, direct Canadian English (Canadian spelling). No marketing language. Use short lines and "- " bullets inside sections; no Markdown headings, bold or tables.

Rules:
- Use only facts the property manager gave you or that are standard practice for this trade. Never invent a building address, name, size, date, dollar figure, equipment model or site condition. When a detail matters but wasn't given, write it as a bracketed placeholder, e.g. [roof area in sq ft].
- Title: the work, then the property type and city, e.g. "Flat roof replacement — mid-rise condominium, Mississauga". Under 90 characters.
- Summary: two sentences — what is needed, and the one detail that most affects price.
- Scope: start with "About the property:" and "What we need:" paragraphs, then "Scope of work:" bullets covering what is included (materials, disposal, permits, inspections, commissioning, warranty as relevant), then "Out of scope unless quoted as add-alternates:" bullets. Leave the method open where the manager didn't specify one, and ask the bidder to recommend it. If the building is occupied, cover access, noise and safety for occupants.
- Requirements: bullets for the insurance amount given (building owner / condo corporation as additional insured), WSIB or provincial WCB clearance, the licences and certifications this trade needs in the given province (e.g. TSSA for gas and elevators, ESA for electrical in Ontario), references for comparable work, and a named project lead.
- Questions for bidders: 4 to 6 specific questions that separate strong bidders from weak ones for this exact job.`;

let _client: Anthropic | null = null;
function client(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  _client ??= new Anthropic({ timeout: 90_000, maxRetries: 1 });
  return _client;
}

export function aiAvailable(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export async function tailorRfp(
  input: WizardInput,
  base: RfpDraft,
  template: RfpTemplate | undefined,
): Promise<RfpDraft | null> {
  const anthropic = client();
  if (!anthropic) return null;

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
    ? `Expert template for this kind of job (adapt it, don't copy placeholders that the answers already fill):\n\nScope:\n${template.scope}\n\nRequirements:\n${template.requirements}\n\nQuestions:\n${template.questions.map((q) => `- ${q}`).join("\n")}`
    : "No template exists for this trade; write from standard practice.";

  try {
    const response = await anthropic.beta.messages.parse({
      model: "claude-opus-5",
      max_tokens: 16000,
      // Server-side fallback if the model declines for policy reasons.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium", format: betaZodOutputFormat(tailoredSchema) },
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content: `Property manager's answers:\n${answers}\n\n${reference}\n\nStarting draft (improve and tailor it to this job):\nTitle: ${base.title}\nSummary: ${base.summary}\n\nScope:\n${base.scope}\n\nRequirements:\n${base.requirements}\n\nWrite the tailored RFP.`,
        },
      ],
    });
    if (response.stop_reason === "refusal" || !response.parsed_output) return null;
    const out = response.parsed_output;
    return {
      ...base,
      title: out.title.slice(0, 140),
      summary: out.summary,
      scope: out.scope,
      requirements: out.requirements,
      questionsForBidders: out.questionsForBidders.slice(0, 8),
    };
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) console.warn("[rfp-writer] rate limited by Anthropic");
    else if (err instanceof Anthropic.APIError) console.error(`[rfp-writer] API error ${err.status}`, err.message);
    else console.error("[rfp-writer] tailoring failed", err);
    return null;
  }
}
