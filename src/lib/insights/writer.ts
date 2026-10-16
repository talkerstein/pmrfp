/**
 * Optional AI polish of the template sentences (weekly brief and admin
 * preview only; pages always use the templates). OFF unless INSIGHTS_LLM is
 * "1"/"true" and a Gemini key is set, through the repo's one AI client
 * (lib/ai/gemini via lib/projects/ai defaultGenerate). One call per batch.
 * Every polished sentence goes through validatePolished(); anything that
 * fails falls back to the template and is reported as a rejection (the
 * caller logs it to insight_rejections).
 */
import { z } from "zod";
import { isQuotaError } from "@/lib/ai/gemini";
import { defaultGenerate, type Generate } from "@/lib/projects/ai";
import type { Locale } from "@/i18n/config";
import { validatePolished } from "./validator";
import type { InsightFact } from "./types";

export function insightsLlmEnabled(env: string | undefined = process.env.INSIGHTS_LLM): boolean {
  return env === "1" || env === "true";
}

const MODELS = [process.env.GEMINI_INSIGHTS_MODEL || "gemini-flash-lite-latest", "gemini-flash-latest"];

const SYSTEM = `You are a copy editor for short market notes sent to trade contractors in Canada and the U.S. Each note was generated from data and is already correct. Make each one read naturally, in the SAME language as the input.

Hard rules:
- Keep every number, amount, percentage, date, month, company name, buyer name and place exactly as written. Do not add, remove, round or convert any of them.
- Add no new facts, names, places, reasons or context. Do not explain why something happened.
- No advice, no recommendations, no predictions ("you should", "we recommend", "will rise", "expect"). Describing the record is the whole job.
- Plain sentences. No Markdown, no links, no emoji, no exclamation marks.
- Same length or a little shorter.`;

const outputSchema = z.object({ items: z.array(z.object({ id: z.string(), text: z.string() })) });

export interface PolishInput {
  fact: InsightFact;
  template: string;
}

export interface Rejection {
  factId: string;
  kind: string;
  lang: Locale;
  reason: string;
  template: string;
  output: string;
  model: string | null;
}

export interface PolishOutcome {
  /** fact id → the text to use (polished when it passed, else the template). */
  texts: Map<string, string>;
  polished: number;
  rejections: Rejection[];
  model: string | null;
  /** Why no polish ran: "off", "unavailable", "quota", "failed". */
  skipped: string | null;
}

export async function polishInsights(
  inputs: readonly PolishInput[],
  lang: Locale,
  deps: { enabled?: boolean; generate?: Generate | null } = {},
): Promise<PolishOutcome> {
  const texts = new Map(inputs.map((i) => [i.fact.id, i.template]));
  const base: PolishOutcome = { texts, polished: 0, rejections: [], model: null, skipped: null };
  if (!(deps.enabled ?? insightsLlmEnabled())) return { ...base, skipped: "off" };
  if (!inputs.length) return base;
  const generate = deps.generate === undefined ? defaultGenerate() : deps.generate;
  if (!generate) return { ...base, skipped: "unavailable" };

  const schema = z.toJSONSchema(outputSchema);
  const parts = [{ text: `Edit these notes. Return JSON {"items":[{"id","text"}]} with the same ids.\n\n${JSON.stringify({ items: inputs.map((i) => ({ id: i.fact.id, text: i.template })) }, null, 2)}` }];
  let quota = false;
  for (const model of MODELS) {
    try {
      const raw = await generate({ model, system: SYSTEM, parts, schema });
      const parsed = outputSchema.safeParse(JSON.parse(raw ?? ""));
      if (!parsed.success) continue;
      const byId = new Map(parsed.data.items.map((x) => [x.id, x.text]));
      const rejections: Rejection[] = [];
      let polished = 0;
      for (const i of inputs) {
        const out = byId.get(i.fact.id);
        if (out === undefined) continue;
        if (out.trim() === i.template.trim()) continue;
        const v = validatePolished(i.template, out, i.fact);
        if (v.ok) {
          texts.set(i.fact.id, out.trim());
          polished++;
        } else {
          rejections.push({ factId: i.fact.id, kind: i.fact.kind, lang, reason: v.reasons.join("; "), template: i.template, output: out, model });
        }
      }
      return { texts, polished, rejections, model, skipped: null };
    } catch (err) {
      if (isQuotaError(err)) {
        quota = true;
        break;
      }
    }
  }
  return { ...base, skipped: quota ? "quota" : "failed" };
}
