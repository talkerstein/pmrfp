import { z } from "zod";
import { geminiClient, isQuotaError } from "@/lib/ai/gemini";
import { bidCheckSchema, type BidCheck } from "./schema";

/**
 * Reads one tender's notice text and fills the bid checklist. Extraction, not
 * writing: the model may only restate what the notice says, and "unknown" is
 * the default. Lite first — this is a simple, high-volume task and Lite has
 * the largest free quota.
 */
const MODELS = [process.env.GEMINI_BID_MODEL || "gemini-flash-lite-latest", "gemini-flash-latest"];

const SYSTEM = `You read public tender notices and RFPs for building and property work and tell a small contractor, in plain English, what they would need in order to bid.

Rules:
- Use ONLY the notice text provided. Never guess or fill in standard practice. If the notice does not say, the status is "unknown" and the detail is an empty string. A wrong "not_required" is worse than "unknown"; only use "not_required" / "none" when the notice explicitly says so.
- Write in English even when the notice is in French.
- plainSummary: one or two short sentences a tradesperson understands: what the work is, where, and the size or term if stated. No jargon, no marketing.
- detail fields: a few words quoting or closely paraphrasing the notice (amounts, percentages, dates, clearance level).
- securityClearance: Canadian federal notices often require "Reliability Status", "Secret" or a Designated Organization Screening; U.S. notices may require facility clearances or base access. Only if stated.
- licences: licences, certifications and registrations named in the notice (e.g. "COR", "ESA licence", "SAM.gov registration", "WSIB clearance"). Empty list if none named.
- setAside: small business, Indigenous (PSIB), service-disabled veteran, 8(a), HUBZone or similar restrictions, if stated.
- submission: how and where bids go and any questions deadline, if stated.
- watchOuts: up to three things a small contractor could easily miss (a mandatory site visit date, a very short deadline, bid documents only in French, a mandatory pre-qualification). Empty list if nothing stands out.`;

export interface BidCheckInput {
  title: string;
  summary: string | null;
  scope: string | null;
  requirements: string | null;
  province: string | null;
  deadline: string | null;
  issuer?: string | null;
}

export type BidCheckResult =
  | { ok: true; check: BidCheck; model: string }
  | { ok: false; quota: boolean; error: string; aborted?: boolean };

export function noticeText(i: BidCheckInput): string {
  return [
    `Title: ${i.title}`,
    i.issuer ? `Issued by: ${i.issuer}` : null,
    i.province ? `Location: ${i.province}` : null,
    i.deadline ? `Closing date: ${i.deadline}` : null,
    i.summary ? `Summary: ${i.summary}` : null,
    i.scope ? `Description:\n${i.scope.slice(0, 7000)}` : null,
    i.requirements ? `Requirements / selection criteria:\n${i.requirements.slice(0, 3000)}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

/** `signal` cuts a slow call off (the cron has a hard 60-second limit); an aborted run is not a failure. */
export async function extractBidCheck(input: BidCheckInput, signal?: AbortSignal): Promise<BidCheckResult> {
  const ai = geminiClient();
  if (!ai) return { ok: false, quota: false, error: "GEMINI_API_KEY not set" };
  let quota = false;
  let last = "no model succeeded";
  for (const model of MODELS) {
    if (signal?.aborted) return { ok: false, quota, error: "out of time", aborted: true };
    try {
      const response = await ai.models.generateContent({
        model,
        contents: `${noticeText(input)}\n\nReturn the bid checklist as JSON.`,
        config: {
          systemInstruction: SYSTEM,
          responseMimeType: "application/json",
          responseJsonSchema: z.toJSONSchema(bidCheckSchema),
          temperature: 0.1,
          abortSignal: signal,
        },
      });
      const parsed = bidCheckSchema.safeParse(JSON.parse(response.text ?? ""));
      if (parsed.success) return { ok: true, check: parsed.data, model };
      last = `${model}: schema mismatch`;
    } catch (err) {
      if (signal?.aborted) return { ok: false, quota, error: "out of time", aborted: true };
      quota = quota || isQuotaError(err);
      last = `${model}: ${err instanceof Error ? err.message.slice(0, 160) : String(err)}`;
    }
  }
  return { ok: false, quota, error: last };
}
