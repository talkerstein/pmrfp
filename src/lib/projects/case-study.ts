import { z } from "zod";
import { projectPhotoSchema, type ProjectPhoto } from "./photos";
import { VISIBILITIES, type Visibility } from "./visibility";

/**
 * The case-study builder's rules (pure: no I/O, shared by the server save,
 * the client wizard and the tests).
 *
 * A project becomes a case study when the trade has said who the work was
 * for, what was in scope, the story (challenge, approach, result), at least
 * one figure they can stand behind, and before + after photos. Every field
 * is the trade's own words; the optional AI step only tidies wording.
 */

// ── Vocabularies ─────────────────────────────────────────────────────

/** Who the work was for. A type of buyer, never a client's name. */
export const CLIENT_TYPES = [
  "property_manager",
  "condo_board",
  "commercial_landlord",
  "housing_provider",
  "public_sector",
  "general_contractor",
  "business_owner",
  "other",
] as const;
export type ClientType = (typeof CLIENT_TYPES)[number];

/** Optional contract value ranges (stored in case_studies.budget_band). */
export const VALUE_BANDS = ["under_10k", "10k_50k", "50k_100k", "100k_250k", "250k_1m", "over_1m"] as const;
export type ValueBand = (typeof VALUE_BANDS)[number];

/** A band key, or null for empty / legacy free text (shown as typed). */
export function valueBandKey(raw: string | null | undefined): ValueBand | null {
  return raw && (VALUE_BANDS as readonly string[]).includes(raw) ? (raw as ValueBand) : null;
}

export function clientTypeKey(raw: string | null | undefined): ClientType | null {
  return raw && (CLIENT_TYPES as readonly string[]).includes(raw) ? (raw as ClientType) : null;
}

// ── Results (figures) ────────────────────────────────────────────────

export const MAX_RESULTS = 4;

export const resultSchema = z.object({
  value: z.string().trim().min(1, "Each figure needs a value.").max(24, "Keep each figure short (24 characters)."),
  label: z.string().trim().min(2, "Say what each figure measures.").max(60, "Keep each label under 60 characters."),
});
export type CaseStudyResult = z.infer<typeof resultSchema>;

/** Stored jsonb → figures we're willing to render. Anything off is dropped. */
export function sanitizeResults(raw: unknown): CaseStudyResult[] {
  if (!Array.isArray(raw)) return [];
  const out: CaseStudyResult[] = [];
  for (const item of raw) {
    const r = resultSchema.safeParse(item);
    if (r.success) out.push(r.data);
    if (out.length === MAX_RESULTS) break;
  }
  return out;
}

// ── Months ───────────────────────────────────────────────────────────

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

/** "2026-05" → "2026-05-01" (a date column); "" → null. */
export function monthToDate(m: string): string | null {
  return MONTH_RE.test(m) ? `${m}-01` : null;
}

/** "2026-05-01" → "2026-05"; null → "". */
export function dateToMonth(d: string | null | undefined): string {
  return d && /^\d{4}-\d{2}/.test(d) ? d.slice(0, 7) : "";
}

/** The current month as "YYYY-MM" (UTC). Injectable for tests. */
export function thisMonth(now: Date = new Date()): string {
  return now.toISOString().slice(0, 7);
}

// ── The builder's save payload ───────────────────────────────────────

const monthField = z.union([z.literal(""), z.string().regex(MONTH_RE, "Pick a month.")]).default("");

export const caseStudyInputSchema = z
  .object({
    id: z.string().uuid(),
    title: z.string().trim().min(10, "Give the project a clear title (10+ characters).").max(140),
    summary: z.string().trim().max(400).default(""),
    clientType: z.union([z.literal(""), z.enum(CLIENT_TYPES)]).default(""),
    scope: z.string().trim().max(1500, "Keep the scope under 1,500 characters.").default(""),
    challenge: z.string().trim().min(40, "Say a bit more about the challenge (a sentence or two).").max(3000),
    approach: z.string().trim().min(40, "Say a bit more about what you did (a sentence or two).").max(3000),
    outcome: z.string().trim().min(40, "Say a bit more about the result (a sentence or two).").max(3000),
    results: z.array(resultSchema).max(MAX_RESULTS, `Up to ${MAX_RESULTS} figures.`).default([]),
    categorySlug: z.string().max(80).default(""),
    propertyTypeSlug: z.string().max(80).default(""),
    regionSlug: z.string().max(80).default(""),
    city: z.string().trim().max(80).default(""),
    startedOn: monthField,
    completedOn: monthField,
    valueBand: z.union([z.literal(""), z.enum(VALUE_BANDS)]).default(""),
    photos: z.array(projectPhotoSchema).max(50).default([]),
    heroUrl: z.string().max(500).default(""),
    visibility: z.enum(VISIBILITIES).default("public"),
    /** "Tidy my wording" was used on this save. */
    aiUsed: z.boolean().default(false),
    /** The trade ticked "I've read the AI wording and it's accurate". */
    aiChecked: z.boolean().default(false),
  })
  .superRefine((d, ctx) => {
    if (d.startedOn && d.completedOn && d.completedOn < d.startedOn) {
      ctx.addIssue({ code: "custom", path: ["completedOn"], message: "The finish month is before the start month." });
    }
    if (d.aiUsed && !d.aiChecked) {
      ctx.addIssue({ code: "custom", path: ["aiChecked"], message: "Read the AI wording and tick the box to confirm it's accurate." });
    }
  });

export type CaseStudyInput = z.input<typeof caseStudyInputSchema>;
export type CaseStudyData = z.output<typeof caseStudyInputSchema>;

/** A finish month can't be in the future (the job is done). */
export function futureMonthError(d: { startedOn: string; completedOn: string }, now: Date = new Date()): string | null {
  const m = thisMonth(now);
  if (d.completedOn && d.completedOn > m) return "The finish month can't be in the future.";
  if (d.startedOn && d.startedOn > m) return "The start month can't be in the future.";
  return null;
}

// ── Steps and progress ───────────────────────────────────────────────

export const BUILDER_STEPS = ["job", "scope", "story", "results", "photos", "proof", "visibility"] as const;
export type BuilderStep = (typeof BUILDER_STEPS)[number];

/** Steps that count toward "case study complete" (visibility is a setting, proof is a bonus). */
export const REQUIRED_STEPS: BuilderStep[] = ["job", "scope", "story", "results", "photos"];

export interface ProgressInput {
  clientType: string | null;
  categorySlug?: string | null;
  categoryId?: string | null;
  city: string | null;
  regionSlug?: string | null;
  regionId?: string | null;
  completedOn: string | null;
  scope: string | null;
  challenge: string;
  approach: string;
  outcome: string;
  results: CaseStudyResult[];
  photos: Pick<ProjectPhoto, "kind">[];
  reviewCount: number;
}

const filled = (s: string | null | undefined, min = 1) => (s ?? "").trim().length >= min;

export function stepDone(step: BuilderStep, d: ProgressInput): boolean {
  switch (step) {
    case "job":
      return (
        Boolean(clientTypeKey(d.clientType)) &&
        Boolean(d.categorySlug || d.categoryId) &&
        Boolean(filled(d.city) || d.regionSlug || d.regionId) &&
        Boolean(d.completedOn)
      );
    case "scope":
      return filled(d.scope, 20);
    case "story":
      return filled(d.challenge, 40) && filled(d.approach, 40) && filled(d.outcome, 40);
    case "results":
      return d.results.length > 0;
    case "photos":
      return d.photos.some((p) => p.kind === "before") && d.photos.some((p) => p.kind === "after");
    case "proof":
      return d.reviewCount > 0;
    case "visibility":
      return true;
  }
}

export interface Progress {
  done: number;
  total: number;
  /** Required steps still to do, in builder order. */
  missing: BuilderStep[];
  /** Every required step is done: show it as a case study. */
  complete: boolean;
}

export function caseStudyProgress(d: ProgressInput): Progress {
  const missing = REQUIRED_STEPS.filter((s) => !stepDone(s, d));
  return {
    done: REQUIRED_STEPS.length - missing.length,
    total: REQUIRED_STEPS.length,
    missing,
    complete: missing.length === 0,
  };
}

// ── Saving: what changed, and what status follows ────────────────────

export interface ContentSnapshot {
  title: string;
  summary: string | null;
  scope: string | null;
  challenge: string;
  approach: string;
  outcome: string;
  results: CaseStudyResult[];
  photoUrls: string[];
}

const norm = (s: string | null | undefined) => (s ?? "").trim();

/**
 * Did the words, figures or photos change? Those are what a moderator
 * checks. Trade, place, dates, value range and visibility don't send a live
 * project back for review.
 */
export function contentChanged(prev: ContentSnapshot, next: ContentSnapshot): boolean {
  return (
    norm(prev.title) !== norm(next.title) ||
    norm(prev.summary) !== norm(next.summary) ||
    norm(prev.scope) !== norm(next.scope) ||
    norm(prev.challenge) !== norm(next.challenge) ||
    norm(prev.approach) !== norm(next.approach) ||
    norm(prev.outcome) !== norm(next.outcome) ||
    JSON.stringify(prev.results.map((r) => [norm(r.value), norm(r.label)])) !==
      JSON.stringify(next.results.map((r) => [norm(r.value), norm(r.label)])) ||
    [...prev.photoUrls].sort().join("|") !== [...next.photoUrls].sort().join("|")
  );
}

export type SaveStatus = "published" | "pending_review";

/**
 * Status after a builder save.
 *  - Trade Pro with an approved profile (auto-publish) goes live, unless an
 *    admin rejected the project: a rejection always goes back to the queue.
 *  - Everyone else: a live project stays live when only settings changed;
 *    new words, figures or photos go back for a quick check.
 */
export function nextStatus(p: { prevStatus: string; autoPublish: boolean; changed: boolean }): SaveStatus {
  if (p.prevStatus === "rejected") return "pending_review";
  if (p.autoPublish) return "published";
  if (p.prevStatus === "published" && !p.changed) return "published";
  return "pending_review";
}

/** Editable at all? Archived projects are gone from the trade's side. */
export function isEditableStatus(status: string): boolean {
  return status !== "archived";
}

export type { Visibility };
