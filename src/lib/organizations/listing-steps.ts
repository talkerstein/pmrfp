import { isUsState } from "@/lib/geo";

/**
 * "Finish your listing": what a directory listing still needs, one question at
 * a time. Pure (unit-tested). The order is what a property manager looks at
 * first; the dashboard's completion card reads the same list, so its score and
 * this flow can't disagree.
 */

export const LISTING_STEPS = ["logo", "short", "insurance", "website", "wsib", "phone", "city", "team", "full"] as const;
export type ListingStep = (typeof LISTING_STEPS)[number];

export const FINISH_PATH = "/dashboard/company/finish";

export const TEAM_SIZES = ["1-10", "11-50", "51-200", "200+"] as const;

/** A sentence or two. Long enough to rule out a stray word, not so long it stops anyone. */
export const SHORT_MIN = 20;
export const SHORT_MAX = 300;
export const FULL_MAX = 2500;
const TEXT_MAX = 120;

export interface ListingFields {
  logo_url?: string | null;
  short_description?: string | null;
  full_description?: string | null;
  website?: string | null;
  phone?: string | null;
  city?: string | null;
  province?: string | null;
  country?: string | null;
  insurance_status?: string | null;
  wsib_status?: string | null;
  employee_count_range?: string | null;
}

const COLUMN: Record<ListingStep, keyof ListingFields> = {
  logo: "logo_url",
  short: "short_description",
  full: "full_description",
  website: "website",
  phone: "phone",
  city: "city",
  insurance: "insurance_status",
  wsib: "wsib_status",
  team: "employee_count_range",
};

export function isListingStep(v: unknown): v is ListingStep {
  return typeof v === "string" && (LISTING_STEPS as readonly string[]).includes(v);
}

/** WSIB and its provincial cousins are Canadian; a U.S. company can't finish that step. */
export function stepsFor(org: ListingFields | null | undefined): ListingStep[] {
  const us = org?.country === "US" || org?.country === "United States" || isUsState(org?.province);
  return LISTING_STEPS.filter((s) => s !== "wsib" || !us);
}

export function isStepDone(step: ListingStep, org: ListingFields | null | undefined): boolean {
  return Boolean(org?.[COLUMN[step]]);
}

export function missingSteps(org: ListingFields | null | undefined): ListingStep[] {
  return stepsFor(org).filter((s) => !isStepDone(s, org));
}

/** The first thing still missing after `after` (or from the top). Null at the end, so a skipped step isn't asked twice in a row. */
export function nextStepAfter(org: ListingFields | null | undefined, after?: ListingStep | null): ListingStep | null {
  const steps = stepsFor(org);
  const from = after ? steps.indexOf(after) + 1 : 0;
  return steps.slice(from).find((s) => !isStepDone(s, org)) ?? null;
}

/** Which step the page shows: the one asked for by link, else the next one missing. */
export function pickStep(org: ListingFields | null | undefined, step: unknown, after: unknown): ListingStep | null {
  if (isListingStep(step) && stepsFor(org).includes(step)) return step;
  return nextStepAfter(org, isListingStep(after) ? after : null);
}

export function finishHref(step: ListingStep): string {
  return `${FINISH_PATH}?step=${step}`;
}

/** False when the answer is what's already saved. */
export function patchChanges(org: ListingFields, patch: Partial<ListingFields>): boolean {
  return (Object.keys(patch) as (keyof ListingFields)[]).some((k) => (org[k] ?? null) !== (patch[k] ?? null));
}

export type StepError = "short" | "tooLong" | "website" | "phone" | "team";

/** http(s) only, with a real-looking host. "northline.ca" gets https:// so nobody has to type it. */
export function normalizeWebsite(raw: string): string | null {
  const v = raw.trim();
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(v) ? v : `https://${v}`);
    if ((url.protocol !== "https:" && url.protocol !== "http:") || !url.hostname.includes(".")) return null;
    return url.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

/**
 * The column to write for this step's answer. Nothing typed writes nothing, the
 * same as Skip, so an empty save can't wipe a value. The logo is the exception:
 * the uploader's Remove button leaves it empty on purpose.
 */
export function stepPatch(step: ListingStep, raw: string): { patch?: Partial<ListingFields>; error?: StepError } {
  const value = raw.trim();
  if (step === "logo") return { patch: { logo_url: value || null } };
  if (!value) return {};
  switch (step) {
    case "short":
      if (value.length < SHORT_MIN) return { error: "short" };
      if (value.length > SHORT_MAX) return { error: "tooLong" };
      return { patch: { short_description: value } };
    case "full":
      if (value.length > FULL_MAX) return { error: "tooLong" };
      return { patch: { full_description: value } };
    case "website": {
      const website = normalizeWebsite(value);
      return website ? { patch: { website } } : { error: "website" };
    }
    case "phone":
      if (value.length > TEXT_MAX || value.replace(/\D/g, "").length < 7) return { error: "phone" };
      return { patch: { phone: value } };
    case "team":
      if (!(TEAM_SIZES as readonly string[]).includes(value)) return { error: "team" };
      return { patch: { employee_count_range: value } };
    case "city":
    case "insurance":
    case "wsib":
      if (value.length > TEXT_MAX) return { error: "tooLong" };
      return { patch: { [COLUMN[step]]: value } };
  }
}
