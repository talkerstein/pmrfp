import { z } from "zod";
import { isQuotaError } from "@/lib/ai/gemini";
import { defaultGenerate, type Generate } from "./ai";
import { POLISH_FIELDS, type PolishField, type PolishInput } from "./polish-fields";

/**
 * "Tidy my wording" in the case-study builder. The model only re-words what
 * the trade typed: no photos, no lists to pick from, nothing to invent from.
 * Then a guard compares each field with the trade's own text and throws the
 * AI version away when it brings in a number or a proper name the trade
 * never wrote. Whatever survives is shown as an AI draft for the trade to
 * read and confirm before it's saved.
 */

export { POLISH_FIELDS, type PolishField, type PolishInput };

const MODELS = [process.env.GEMINI_PROJECT_MODEL || "gemini-flash-lite-latest", "gemini-flash-latest"];

const SYSTEM = `You tidy the wording of a trade contractor's project case study. You are an editor, not a writer.

Rules:
- Keep every fact exactly as given. Do not add numbers, sizes, dates, prices, durations, product or brand names, company or client names, people, places, certifications or claims that are not in the input.
- Do not remove a fact the contractor gave, and keep their numbers written the same way.
- Fix spelling, grammar and order. Short, plain sentences, like a contractor explaining the job to a property manager. No marketing words ("state-of-the-art", "seamless", "top-notch", "exceeded expectations"), no exclamation marks, no Markdown.
- Write in the same language as the input.
- Same length or shorter. If a field is empty, return it empty.
- summary: one or two sentences. scope: what was included in the work, as a short paragraph. challenge, approach, outcome: two to four sentences each.`;

const outputSchema = z.object({
  summary: z.string(),
  scope: z.string(),
  challenge: z.string(),
  approach: z.string(),
  outcome: z.string(),
});

// ── Fact guard ───────────────────────────────────────────────────────

// Thousands groups ("24,000", "24 000") or a plain number with an optional decimal ("1.5", "1,5").
const NUM_RE = /\d{1,3}(?:[,   ]\d{3})+(?:\.\d+)?|\d+(?:[.,]\d+)?/g;

/** Numbers in a text, normalized: "24,000" / "24 000" → "24000", "1,5" → "1.5", "3rd" → "3". */
export function numberTokens(s: string): Set<string> {
  const out = new Set<string>();
  for (const m of s.matchAll(NUM_RE)) {
    let n = m[0];
    if (/^\d{1,3}(?:[,   ]\d{3})+/.test(n)) n = n.replace(/[,   ]/g, "");
    else n = n.replace(",", ".");
    n = n.replace(/^0+(?=\d)/, "");
    if (n.includes(".")) n = n.replace(/\.?0+$/, "");
    out.add(n);
  }
  return out;
}

/** Numbers the output has that the source doesn't. */
export function inventedNumbers(source: string, output: string): string[] {
  const have = numberTokens(source);
  return [...numberTokens(output)].filter((n) => !have.has(n));
}

const WORD_RE = /\p{Lu}[\p{Ll}'’-]+/gu;

/**
 * Capitalized words in the middle of a sentence that don't appear (in any
 * case) in the source: likely an invented name, place or brand. Words that
 * start a sentence are skipped, so "The" and "We" never trip it.
 */
export function newProperNouns(source: string, output: string): string[] {
  const src = source.toLowerCase();
  const found: string[] = [];
  for (const m of output.matchAll(WORD_RE)) {
    const idx = m.index ?? 0;
    const before = output.slice(0, idx).trimEnd();
    if (before === "" || /[.!?:;\n]$/.test(before)) continue;
    const w = m[0];
    if (!src.includes(w.toLowerCase())) found.push(w);
  }
  return [...new Set(found)];
}

/** Why an AI field was thrown away, or null when it only re-words the source. */
export function factProblem(source: string, output: string): string | null {
  const nums = inventedNumbers(source, output);
  if (nums.length) return `added ${nums.join(", ")}`;
  const names = newProperNouns(source, output);
  if (names.length) return `added ${names.join(", ")}`;
  return null;
}

// ── Polish ───────────────────────────────────────────────────────────

export type PolishResult =
  | {
      ok: true;
      /** Only fields the AI changed and the guard accepted. */
      fields: Partial<PolishInput>;
      /** Fields where the AI's version was rejected; the trade's text stays. */
      kept: PolishField[];
      model: string;
    }
  | { ok: false; reason: "unavailable" | "quota" | "failed" | "empty"; error: string };

const MAX_SOURCE = 3000;

export async function polishCaseStudy(
  input: PolishInput,
  deps: { generate?: Generate | null } = {},
): Promise<PolishResult> {
  const source: PolishInput = {
    summary: (input.summary ?? "").trim().slice(0, 400),
    scope: (input.scope ?? "").trim().slice(0, 1500),
    challenge: (input.challenge ?? "").trim().slice(0, MAX_SOURCE),
    approach: (input.approach ?? "").trim().slice(0, MAX_SOURCE),
    outcome: (input.outcome ?? "").trim().slice(0, MAX_SOURCE),
  };
  if (POLISH_FIELDS.every((f) => !source[f])) return { ok: false, reason: "empty", error: "Nothing to tidy yet" };

  const generate = deps.generate === undefined ? defaultGenerate() : deps.generate;
  if (!generate) return { ok: false, reason: "unavailable", error: "GEMINI_API_KEY not set" };

  const schema = z.toJSONSchema(outputSchema);
  const parts = [{ text: `Tidy these fields. Return JSON with the same keys.\n\n${JSON.stringify(source, null, 2)}` }];

  let quota = false;
  let last = "no model succeeded";
  for (const model of MODELS) {
    try {
      const text = await generate({ model, system: SYSTEM, parts, schema });
      const parsed = outputSchema.safeParse(JSON.parse(text ?? ""));
      if (!parsed.success) {
        last = `${model}: unusable output`;
        continue;
      }
      return { ok: true, model, ...guardFields(source, parsed.data) };
    } catch (err) {
      if (isQuotaError(err)) quota = true;
      last = `${model}: ${err instanceof Error ? err.message.slice(0, 160) : String(err)}`;
    }
  }
  return { ok: false, reason: quota ? "quota" : "failed", error: last };
}

const LIMITS: Record<PolishField, number> = { summary: 400, scope: 1500, challenge: 3000, approach: 3000, outcome: 3000 };

/**
 * Keep an AI field only when the source had text, the output isn't empty,
 * it didn't grow much, and it passes the fact guard. Every check runs
 * against ALL the trade's text, so moving a fact between fields is fine.
 */
export function guardFields(source: PolishInput, output: PolishInput): { fields: Partial<PolishInput>; kept: PolishField[] } {
  const all = POLISH_FIELDS.map((f) => source[f]).join("\n");
  const fields: Partial<PolishInput> = {};
  const kept: PolishField[] = [];
  for (const f of POLISH_FIELDS) {
    const src = source[f];
    const out = (output[f] ?? "").replace(/[ \t]+/g, " ").trim();
    if (!src) continue;
    if (!out || out === src) continue;
    if (out.length > Math.max(src.length * 1.4, src.length + 120) || out.length > LIMITS[f] || factProblem(all, out)) {
      kept.push(f);
      continue;
    }
    fields[f] = out;
  }
  return { fields, kept };
}
