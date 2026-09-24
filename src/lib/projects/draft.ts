import { z } from "zod";

/**
 * What "Write it for me" returns: an editable first draft of the case study
 * plus privacy flags from the photos. The model's JSON is untrusted: parseDraft
 * trims and caps every field and drops trade / property-type slugs that
 * aren't in the lists we offered, so the form only ever shows real options.
 */

export const privacySchema = z.object({
  /** A person's face may be visible. */
  people: z.boolean(),
  /** A licence plate may be readable. */
  licencePlates: z.boolean(),
  /** A street address or building number may be readable. */
  addressVisible: z.boolean(),
  /** A client, tenant or building name shows in a photo or the notes. */
  clientNameVisible: z.boolean(),
});
export type PrivacyFlags = z.infer<typeof privacySchema>;

export const NO_PRIVACY_FLAGS: PrivacyFlags = {
  people: false,
  licencePlates: false,
  addressVisible: false,
  clientNameVisible: false,
};

export const PRIVACY_WARNING: Record<keyof PrivacyFlags, string> = {
  people: "A person's face may be visible in a photo. Crop it out or get their OK first.",
  licencePlates: "A licence plate may be readable in a photo.",
  addressVisible: "A street address or building number may be readable.",
  clientNameVisible: "The client's or building's name may show in a photo or in your text.",
};

/** Schema the model fills. Slugs are constrained with enums ("" = none fits). */
export function draftOutputSchema(categorySlugs: string[], propertyTypeSlugs: string[]) {
  const slugEnum = (slugs: string[]) =>
    slugs.length ? z.enum(["", ...slugs] as [string, ...string[]]) : z.string();
  return z.object({
    title: z.string(),
    summary: z.string(),
    challenge: z.string(),
    approach: z.string(),
    outcome: z.string(),
    categorySlug: slugEnum(categorySlugs),
    propertyTypeSlug: slugEnum(propertyTypeSlugs),
    privacy: privacySchema,
  });
}

// Loose version for parsing: we re-check the slugs ourselves.
const rawDraftSchema = z.object({
  title: z.string(),
  summary: z.string().default(""),
  challenge: z.string(),
  approach: z.string(),
  outcome: z.string(),
  categorySlug: z.string().nullish(),
  propertyTypeSlug: z.string().nullish(),
  privacy: privacySchema.partial().default({}),
});

export interface ProjectDraft {
  title: string;
  summary: string;
  challenge: string;
  approach: string;
  outcome: string;
  categorySlug: string | null;
  propertyTypeSlug: string | null;
  privacy: PrivacyFlags;
}

export const DRAFT_LIMITS = { title: 120, summary: 400, section: 1500 } as const;

function clean(s: string, max: number): string {
  const t = s.replace(/\s+\n/g, "\n").replace(/[ \t]+/g, " ").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const lastStop = cut.lastIndexOf(". ");
  return lastStop > max * 0.6 ? cut.slice(0, lastStop + 1) : cut.trimEnd();
}

/** Model text → a draft the form can show, or null when it's unusable. */
export function parseDraft(
  text: string | undefined | null,
  opts: { categorySlugs: string[]; propertyTypeSlugs: string[] },
): ProjectDraft | null {
  if (!text) return null;
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return null;
  }
  const parsed = rawDraftSchema.safeParse(json);
  if (!parsed.success) return null;
  const d = parsed.data;
  const title = clean(d.title.replace(/^["']|["']$/g, ""), DRAFT_LIMITS.title);
  const challenge = clean(d.challenge, DRAFT_LIMITS.section);
  const approach = clean(d.approach, DRAFT_LIMITS.section);
  const outcome = clean(d.outcome, DRAFT_LIMITS.section);
  if (!title || !challenge || !approach || !outcome) return null;
  const pick = (slug: string | null | undefined, allowed: string[]) =>
    slug && allowed.includes(slug) ? slug : null;
  return {
    title,
    summary: clean(d.summary, DRAFT_LIMITS.summary),
    challenge,
    approach,
    outcome,
    categorySlug: pick(d.categorySlug, opts.categorySlugs),
    propertyTypeSlug: pick(d.propertyTypeSlug, opts.propertyTypeSlugs),
    // A missing flag means the model didn't check: warn rather than stay quiet.
    privacy: {
      people: d.privacy.people ?? true,
      licencePlates: d.privacy.licencePlates ?? true,
      addressVisible: d.privacy.addressVisible ?? true,
      clientNameVisible: d.privacy.clientNameVisible ?? true,
    },
  };
}

export function anyPrivacyFlag(p: PrivacyFlags): boolean {
  return p.people || p.licencePlates || p.addressVisible || p.clientNameVisible;
}
