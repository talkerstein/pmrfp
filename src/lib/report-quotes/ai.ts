import { z } from "zod";
import { geminiAvailable, geminiClient, isQuotaError } from "@/lib/ai/gemini";
import { modelOutputSchema, normalizeModelItems, type ReportCountry, type ReportItem, type ReportType, type TradeOption } from "./rules";

/**
 * Reads an inspection / condition report PDF and lists the repair items it
 * flags. Extraction, not judgement: the model may only restate what the
 * report says, with the page it says it on; no prices, no diagnosis, no
 * people's names. Any failure returns a reason and the user types the items
 * in the same editor, so there's never a dead end.
 */

// Flash reads PDFs (text and scanned) well; Lite is the last resort.
const MODELS = [process.env.GEMINI_REPORT_MODEL || "gemini-flash-latest", "gemini-2.5-flash", "gemini-flash-lite-latest"];

/** Inline PDFs above this go through the Files API instead (Gemini caps a request at 20 MB, and base64 adds a third). */
const INLINE_MAX_BYTES = 13 * 1024 * 1024;

const REPORT_LABEL: Record<ReportType, string> = {
  home_inspection: "home inspection report",
  pre_listing: "pre-listing inspection report",
  move_out: "rental move-out inspection",
  annual: "annual unit or building inspection",
  condition_assessment: "building condition assessment",
  reserve_fund: "reserve fund study",
  other: "property condition report",
};

export function systemPrompt(trades: readonly TradeOption[]): string {
  return `You read property inspection and condition reports (home inspections, pre-listing inspections, rental move-out and annual inspections, building condition assessments, reserve fund studies) and list the repair items the report itself flags, so the owner can ask trades for quotes.

Rules:
- List ONLY deficiencies, repairs, replacements or further evaluations that the report explicitly flags or recommends. Never add items from general knowledge, never diagnose, never guess at hidden problems.
- Skip boilerplate, scope limitations and disclaimers, components described as satisfactory or in good condition, and general maintenance tips that aren't tied to something observed.
- Never output prices, cost estimates or dollar amounts, even when the report gives them.
- item: one short plain sentence, in the language the report is written in: what is wrong and what the report recommends, e.g. "Double-tapped breaker in the main panel; have an electrician correct it". Under 200 characters.
- location: where in the property, e.g. "Basement", "Unit 4B bathroom", "North roof slope". Empty string when the report doesn't say.
- urgency: "safety" for anything the report calls a safety hazard or immediate concern (shock or fire risk, gas, carbon monoxide, structural, trip or fall hazards, missing smoke or CO alarms); "soon" for defects to repair or replace; "monitor" for items to watch, maintain or budget for (end of service life, minor wear).
- source_page: the page of the PDF file where the item appears; the first page of the file is 1. Use 0 only when you truly cannot tell. Every item must point at the page it came from.
- trade_slug: exactly one slug from the list below, for the trade that would do the repair. When the report names several, pick the main one. Use "other" when none fits.
- People: never write anyone's name (tenants, occupants, residents, owners, buyers, sellers, clients, the inspector) in item or location. Put every person's name you see in the report into names_to_redact, so the app can remove it.
- One item per distinct repair. Summary sections often repeat items from the body: list each repair once, with the page where it is described in most detail.

Trades (slug: name):
${trades.map((t) => `${t.slug}: ${t.name}`).join("\n")}`;
}

export type ExtractResult =
  | { ok: true; items: ReportItem[]; model: string }
  | { ok: false; reason: "unavailable" | "quota" | "failed"; error: string };

export interface ExtractOptions {
  trades: readonly TradeOption[];
  country: ReportCountry;
  reportType: ReportType;
  signal?: AbortSignal;
}

export function extractionAvailable(): boolean {
  return geminiAvailable();
}

type Ai = NonNullable<ReturnType<typeof geminiClient>>;
type PdfPart = { inlineData: { data: string; mimeType: string } } | { fileData: { fileUri: string; mimeType: string } };

/** The PDF as a request part: inline when small, else uploaded (and deleted again by the caller). */
async function pdfPart(ai: Ai, pdf: Buffer): Promise<{ part: PdfPart; uploadedName: string | null }> {
  if (pdf.byteLength <= INLINE_MAX_BYTES) {
    return { part: { inlineData: { data: pdf.toString("base64"), mimeType: "application/pdf" } }, uploadedName: null };
  }
  const file = await ai.files.upload({
    file: new Blob([new Uint8Array(pdf)], { type: "application/pdf" }),
    config: { mimeType: "application/pdf" },
  });
  if (!file.uri || !file.name) throw new Error("upload returned no file uri");
  return { part: { fileData: { fileUri: file.uri, mimeType: file.mimeType || "application/pdf" } }, uploadedName: file.name };
}

export async function extractReportItems(pdf: Buffer, opts: ExtractOptions): Promise<ExtractResult> {
  const ai = geminiClient();
  if (!ai) return { ok: false, reason: "unavailable", error: "GEMINI_API_KEY not set" };
  const country = opts.country === "US" ? "the United States" : "Canada";
  const prompt = `This is a ${REPORT_LABEL[opts.reportType]} for a property in ${country}. List the repair items it flags as JSON.`;
  let uploadedName: string | null = null;
  let quota = false;
  let last = "no model succeeded";
  try {
    const prepared = await pdfPart(ai, pdf);
    uploadedName = prepared.uploadedName;
    for (const model of MODELS) {
      if (opts.signal?.aborted) break;
      try {
        const response = await ai.models.generateContent({
          model,
          contents: [{ role: "user", parts: [prepared.part, { text: prompt }] }],
          config: {
            systemInstruction: systemPrompt(opts.trades),
            responseMimeType: "application/json",
            responseJsonSchema: z.toJSONSchema(modelOutputSchema),
            temperature: 0.1,
            // A long report takes longer than the shared client's 30 seconds.
            httpOptions: { timeout: 100_000 },
            abortSignal: opts.signal,
          },
        });
        const parsed = modelOutputSchema.safeParse(JSON.parse(response.text ?? ""));
        if (parsed.success) return { ok: true, items: normalizeModelItems(parsed.data, opts.trades), model };
        last = `${model}: schema mismatch`;
      } catch (err) {
        quota = quota || isQuotaError(err);
        last = `${model}: ${err instanceof Error ? err.message.slice(0, 160) : String(err)}`;
        // Quota is per key: the next model would fail the same way.
        if (quota) break;
      }
    }
  } catch (err) {
    quota = quota || isQuotaError(err);
    last = err instanceof Error ? err.message.slice(0, 160) : String(err);
  } finally {
    if (uploadedName) await ai.files.delete({ name: uploadedName }).catch(() => undefined);
  }
  return { ok: false, reason: quota ? "quota" : "failed", error: last };
}
