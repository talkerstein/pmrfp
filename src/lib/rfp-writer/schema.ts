import { z } from "zod";

/**
 * RFP Writer: what the wizard collects, and the RFP it produces. Shared by
 * the API route (validation), the Claude call (structured output) and the
 * template composer (no-AI fallback). Keep in sync with the wizard fields.
 */

export const TIMING = ["asap", "1-month", "1-3-months", "3-6-months", "next-season"] as const;
export const CONTRACT = ["project", "service-contract"] as const;
export const INSURANCE = ["2m", "5m"] as const;
export const PRIORITY = ["balanced", "price", "quality"] as const;

export const wizardInputSchema = z.object({
  tradeSlug: z.string().trim().min(1).max(80),
  tradeName: z.string().trim().min(1).max(120),
  templateSlug: z.string().trim().max(120).optional(),
  description: z.string().trim().min(15, "Tell us a bit more about the job").max(1500),
  propertyType: z.string().trim().max(120).optional(),
  city: z.string().trim().max(120).optional(),
  province: z.string().trim().max(60).optional(),
  size: z.string().trim().max(120).optional(),
  occupied: z.boolean().optional(),
  contractType: z.enum(CONTRACT),
  timing: z.enum(TIMING),
  bidDeadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  budgetMin: z.number().int().nonnegative().max(100_000_000).optional(),
  budgetMax: z.number().int().nonnegative().max(100_000_000).optional(),
  insurance: z.enum(INSURANCE),
  siteVisit: z.boolean(),
  siteVisitDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  priority: z.enum(PRIORITY),
});
export type WizardInput = z.infer<typeof wizardInputSchema>;

export const rfpDraftSchema = z.object({
  title: z.string(),
  summary: z.string(),
  scope: z.string(),
  requirements: z.string(),
  submissionInstructions: z.string(),
  evaluationCriteria: z.array(z.string()),
  questionsForBidders: z.array(z.string()),
});
export type RfpDraft = z.infer<typeof rfpDraftSchema>;

export const TIMING_LABEL: Record<(typeof TIMING)[number], string> = {
  asap: "as soon as possible",
  "1-month": "within the next month",
  "1-3-months": "in the next 1–3 months",
  "3-6-months": "in the next 3–6 months",
  "next-season": "next season",
};

/** Published weights, by what the property manager says matters most. */
export const WEIGHTS: Record<(typeof PRIORITY)[number], [string, number][]> = {
  balanced: [["Price", 40], ["Relevant experience and references", 30], ["Scope coverage", 20], ["Schedule", 10]],
  price: [["Price", 55], ["Relevant experience and references", 20], ["Scope coverage", 15], ["Schedule", 10]],
  quality: [["Relevant experience and references", 35], ["Price", 30], ["Scope coverage", 20], ["Schedule", 15]],
};
