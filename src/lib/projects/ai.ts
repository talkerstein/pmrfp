import { z } from "zod";
import type { PartUnion } from "@google/genai";
import { geminiClient, isQuotaError } from "@/lib/ai/gemini";
import { draftOutputSchema, parseDraft, type ProjectDraft } from "./draft";
import type { PhotoKind } from "./photos";

/**
 * "Write it for me": site photos + the trade's rough notes → a first draft of
 * the case study. Lite first (cheapest, biggest free quota); low temperature
 * because this is describing, not inventing. Photos are fetched from our own
 * bucket only (the route checks the URLs) and sent inline.
 */
const MODELS = [process.env.GEMINI_PROJECT_MODEL || "gemini-flash-lite-latest", "gemini-flash-latest"];

/** Photos sent to the model. More adds cost and rarely changes the draft. */
export const MAX_DRAFT_PHOTOS = 6;

const SYSTEM = `You write short project case studies for a trade contractor's public portfolio on PMRFP, where property managers in Canada and the U.S. look for trades. You get the contractor's own notes and site photos labelled before, during or after.

Rules:
- Use only what the notes say and what the photos clearly show. Never invent numbers, sizes, dates, prices, product names, company names, client names or places. If the notes don't give a size or a city, leave it out.
- Plain, direct English, like a contractor explaining the job to a property manager. No marketing words ("state-of-the-art", "seamless", "top-notch", "exceeded expectations"). No exclamation marks. No Markdown.
- title: the work, the building type, and the city if the notes give one, e.g. "Flat roof replacement, 24,000 sq ft warehouse, Mississauga". Under 90 characters.
- summary: one or two sentences: what was done and why it mattered to the building.
- challenge: 2 to 4 sentences on what was wrong and what made the job hard.
- approach: 2 to 4 sentences on what the crew did and why.
- outcome: 2 to 4 sentences on the result. Numbers only if they are in the notes.
- categorySlug: the best match from the trade list, or "" if none fits.
- propertyTypeSlug: the best match from the property type list, or "" if unclear.
- privacy: people = a person's face is visible in any photo; licencePlates = a readable licence plate; addressVisible = a readable street address or building number; clientNameVisible = a client, tenant or building name is readable in a photo or named in the notes. When unsure, answer true.`;

export interface DraftInput {
  notes: string;
  photos: { url: string; kind: PhotoKind }[];
  categories: { slug: string; name: string }[];
  propertyTypes: { slug: string; name: string }[];
}

export type DraftResult =
  | { ok: true; draft: ProjectDraft; model: string }
  | { ok: false; reason: "unavailable" | "quota" | "failed"; error: string };

export interface GenerateArgs {
  model: string;
  system: string;
  parts: PartUnion[];
  schema: unknown;
}

/** Injectable for tests: returns the model's raw text. */
export type Generate = (args: GenerateArgs) => Promise<string | undefined>;
export type FetchImage = (url: string) => Promise<{ data: string; mimeType: string } | null>;

const MAX_IMAGE_BYTES = 6 * 1024 * 1024;

async function defaultFetchImage(url: string): Promise<{ data: string; mimeType: string } | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length === 0 || buf.length > MAX_IMAGE_BYTES) return null;
    return { data: buf.toString("base64"), mimeType: "image/jpeg" };
  } catch {
    return null;
  }
}

function defaultGenerate(): Generate | null {
  const ai = geminiClient();
  if (!ai) return null;
  return async ({ model, system, parts, schema }) => {
    const response = await ai.models.generateContent({
      model,
      contents: parts,
      config: {
        systemInstruction: system,
        responseMimeType: "application/json",
        responseJsonSchema: schema,
        temperature: 0.2,
      },
    });
    return response.text;
  };
}

/** The text prompt: notes plus the lists the model must pick from. */
export function draftPrompt(input: DraftInput, photoKinds: PhotoKind[]): string {
  const photoLine = photoKinds.length
    ? `Photos attached, in order: ${photoKinds.map((k, i) => `${i + 1} = ${k}`).join(", ")}.`
    : "No photos attached.";
  return [
    `Contractor's notes:\n${input.notes.trim() || "(none, work from the photos)"}`,
    photoLine,
    `Trade list (slug: name):\n${input.categories.map((c) => `${c.slug}: ${c.name}`).join("\n")}`,
    `Property type list (slug: name):\n${input.propertyTypes.map((p) => `${p.slug}: ${p.name}`).join("\n")}`,
    "Return the case study draft as JSON.",
  ].join("\n\n");
}

export async function draftProject(
  input: DraftInput,
  deps: { generate?: Generate | null; fetchImage?: FetchImage } = {},
): Promise<DraftResult> {
  const generate = deps.generate === undefined ? defaultGenerate() : deps.generate;
  if (!generate) return { ok: false, reason: "unavailable", error: "GEMINI_API_KEY not set" };
  const fetchImage = deps.fetchImage ?? defaultFetchImage;

  const chosen = input.photos.slice(0, MAX_DRAFT_PHOTOS);
  const images = await Promise.all(chosen.map((p) => fetchImage(p.url)));
  const kinds: PhotoKind[] = [];
  const imageParts: PartUnion[] = [];
  images.forEach((img, i) => {
    if (!img) return;
    kinds.push(chosen[i].kind);
    imageParts.push({ inlineData: { data: img.data, mimeType: img.mimeType } });
  });
  if (!input.notes.trim() && imageParts.length === 0) {
    return { ok: false, reason: "failed", error: "Nothing to write from" };
  }

  const categorySlugs = input.categories.map((c) => c.slug);
  const propertyTypeSlugs = input.propertyTypes.map((p) => p.slug);
  const schema = z.toJSONSchema(draftOutputSchema(categorySlugs, propertyTypeSlugs));
  const parts: PartUnion[] = [{ text: draftPrompt(input, kinds) }, ...imageParts];

  let quota = false;
  let last = "no model succeeded";
  for (const model of MODELS) {
    try {
      const text = await generate({ model, system: SYSTEM, parts, schema });
      const draft = parseDraft(text, { categorySlugs, propertyTypeSlugs });
      if (draft) return { ok: true, draft, model };
      last = `${model}: unusable output`;
    } catch (err) {
      if (isQuotaError(err)) quota = true;
      last = `${model}: ${err instanceof Error ? err.message.slice(0, 160) : String(err)}`;
    }
  }
  return { ok: false, reason: quota ? "quota" : "failed", error: last };
}
