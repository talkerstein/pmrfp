import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import type { RfpTemplate } from "@/lib/seo/rfp-templates";
import { TIMING_LABEL, type RfpDraft, type WizardInput } from "./schema";

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
- title: the work, then the property type and city, e.g. "Flat roof replacement — mid-rise condominium, Mississauga". Under 90 characters.
- summary: two sentences — what is needed, and the one detail that most affects price.
- scope: start with "About the property:" and "What we need:" paragraphs, then "Scope of work:" bullets covering what is included (materials, disposal, permits, inspections, commissioning, warranty as relevant), then "Out of scope unless quoted as add-alternates:" bullets. Leave the method open where the manager didn't specify one, and ask the bidder to recommend it. If the building is occupied, cover access, noise and safety for occupants.
- requirements: bullets for the insurance amount given (building owner / condo corporation as additional insured), workers' compensation (WSIB or provincial WCB clearance in Canada; proof of coverage under state law in the U.S.), the licences and certifications this trade needs where the property is (e.g. TSSA for gas and elevators and ESA for electrical in Ontario; state or local licensing in the U.S.), references for comparable work, and a named project lead.
- questionsForBidders: 4 to 6 specific questions that separate strong bidders from weak ones for this exact job.`;

let _client: GoogleGenAI | null = null;
function client(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  // The SDK retries 5× with backoff by default — on a busy model that's a
  // minute of waiting. Retry once, then move to the next model in MODELS.
  _client ??= new GoogleGenAI({
    apiKey,
    httpOptions: { timeout: 30_000, retryOptions: { attempts: 2, initialDelay: 1 } },
  });
  return _client;
}

export function aiAvailable(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

export async function tailorRfp(
  input: WizardInput,
  base: RfpDraft,
  template: RfpTemplate | undefined,
): Promise<RfpDraft | null> {
  const ai = client();
  if (!ai) return null;

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

  for (const model of MODELS) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents,
        config: {
          systemInstruction: SYSTEM,
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
