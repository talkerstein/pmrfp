import { cache } from "react";
import { createReadClient } from "@/lib/supabase/read";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { isOwnPhotoUrl, pickHero, sanitizePhotos, type ProjectPhoto } from "@/lib/projects/photos";
import { reviewStats, type PublicReview } from "@/lib/projects/reviews";
import { isSchemaMissing } from "@/lib/projects/compat";

/**
 * Review count + average per case-study slug, for list cards. Only slugs with
 * at least one published review appear. Empty map before the migration.
 */
export async function ratingsBySlug(slugs: string[]): Promise<Map<string, { count: number; average: number }>> {
  const out = new Map<string, { count: number; average: number }>();
  if (!isSupabaseConfigured() || slugs.length === 0) return out;
  try {
    const supabase = createReadClient();
    const { data: studies, error } = await supabase
      .from("case_studies")
      .select("id,slug")
      .in("slug", slugs)
      .eq("status", "published");
    if (error || !studies?.length) return out;
    const slugById = new Map((studies as { id: string; slug: string }[]).map((r) => [r.id, r.slug]));
    const { data: reviews, error: rErr } = await supabase
      .from("vendor_reviews_public")
      .select("case_study_id,rating")
      .in("case_study_id", [...slugById.keys()]);
    if (rErr || !reviews) return out;
    const bySlug = new Map<string, { rating: number }[]>();
    for (const r of reviews as { case_study_id: string | null; rating: number }[]) {
      const slug = r.case_study_id ? slugById.get(r.case_study_id) : undefined;
      if (!slug) continue;
      if (!bySlug.has(slug)) bySlug.set(slug, []);
      bySlug.get(slug)!.push({ rating: r.rating });
    }
    for (const [slug, list] of bySlug) {
      const stats = reviewStats(list);
      if (stats.count > 0) out.set(slug, stats);
    }
  } catch {
    // no ratings
  }
  return out;
}

/**
 * Public reads for Projects (photo case studies) and project reviews.
 *
 * Everything here arrives with migration 20260924000001. Production can run
 * this code before that SQL is applied, so each read is its own query and
 * any error ("column does not exist", missing view) degrades to "no photos /
 * no reviews" and the new UI simply doesn't render.
 */

const supabaseUrl = () => process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

export interface ProjectExtras {
  photos: ProjectPhoto[];
  heroUrl: string | null;
  source: "form" | "capture";
  summary: string | null;
}

export const NO_EXTRAS: ProjectExtras = { photos: [], heroUrl: null, source: "form", summary: null };

function safeHero(heroUrl: unknown, photos: ProjectPhoto[]): string | null {
  if (typeof heroUrl === "string" && isOwnPhotoUrl(heroUrl, supabaseUrl())) return heroUrl;
  return pickHero(photos)?.url ?? null;
}

/** Photos, hero, source and summary for one case study (deduped per request). */
export const getProjectExtras = cache(async function getProjectExtras(caseStudyId: string): Promise<ProjectExtras> {
  if (!isSupabaseConfigured()) return NO_EXTRAS;
  try {
    const { data, error } = await createReadClient()
      .from("case_studies")
      .select("photos,hero_url,source,summary")
      .eq("id", caseStudyId)
      .maybeSingle();
    if (error || !data) return NO_EXTRAS;
    return toExtras(data as ExtrasRow);
  } catch {
    return NO_EXTRAS;
  }
});

export interface ExtrasRow {
  photos: unknown;
  hero_url: string | null;
  source: string | null;
  summary: string | null;
}

/** Stored photo columns → what the page may render (own-bucket URLs only). */
export function toExtras(r: ExtrasRow): ProjectExtras {
  const photos = sanitizePhotos(r.photos, supabaseUrl());
  return {
    photos,
    heroUrl: safeHero(r.hero_url, photos),
    source: r.source === "capture" ? "capture" : "form",
    summary: r.summary?.trim() || null,
  };
}

export interface ProjectCard {
  slug: string;
  title: string;
  city: string | null;
  province: string | null;
  heroUrl: string | null;
  publishedAt: string | null;
  /** Filled in through the case-study builder (client type + scope). */
  isCaseStudy: boolean;
}

interface CardRow {
  slug: string;
  title: string;
  city: string | null;
  province: string | null;
  published_at: string | null;
  hero_url?: string | null;
  client_type?: string | null;
  scope?: string | null;
}

/**
 * PUBLIC published projects for one company's profile, newest first.
 * Unlisted and private projects never show here. Each fallback drops the
 * columns of one migration (portfolio 20261009000002, then projects
 * 20260924000001) so the profile keeps working before either is applied.
 */
export async function listOrgProjects(organizationId: string, limit = 12): Promise<ProjectCard[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = createReadClient();
  const base = "slug,title,city,province,published_at";
  const run = (cols: string, publicOnly: boolean) => {
    let q = supabase.from("case_studies").select(cols).eq("organization_id", organizationId).eq("status", "published");
    if (publicOnly) q = q.eq("visibility", "public");
    return q.order("published_at", { ascending: false }).limit(limit);
  };
  try {
    let { data, error } = await run(`${base},hero_url,client_type,scope`, true);
    if (isSchemaMissing(error)) ({ data, error } = await run(`${base},hero_url`, false));
    // Pre-projects-migration: no hero_url column yet. Text-only studies still list.
    if (isSchemaMissing(error)) ({ data, error } = await run(base, false));
    if (error || !data) return [];
    return (data as unknown as CardRow[]).map((r) => ({
      slug: r.slug,
      title: r.title,
      city: r.city,
      province: r.province,
      publishedAt: r.published_at,
      heroUrl: r.hero_url && isOwnPhotoUrl(r.hero_url, supabaseUrl()) ? r.hero_url : null,
      isCaseStudy: Boolean(r.client_type && r.scope?.trim()),
    }));
  } catch {
    return [];
  }
}

/** Hero photo per slug, for list pages. Empty map before the migration. */
export async function heroUrlsBySlug(slugs: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!isSupabaseConfigured() || slugs.length === 0) return out;
  try {
    const { data, error } = await createReadClient()
      .from("case_studies")
      .select("slug,hero_url")
      .in("slug", slugs)
      .eq("status", "published");
    if (error || !data) return out;
    for (const r of data as { slug: string; hero_url: string | null }[]) {
      if (r.hero_url && isOwnPhotoUrl(r.hero_url, supabaseUrl())) out.set(r.slug, r.hero_url);
    }
  } catch {
    // no heroes
  }
  return out;
}

interface ReviewRow {
  id: string;
  organization_id: string;
  case_study_id: string | null;
  reviewer_display_name: string;
  reviewer_company: string | null;
  rating: number;
  body: string;
  verified_via: string | null;
  reply: string | null;
  created_at: string;
}

/**
 * Published first-party reviews for a company or one project, newest first.
 * Reads the vendor_reviews_public view (safe columns, consent applied in SQL).
 */
export async function listPublishedReviews(
  filter: { organizationId?: string; caseStudyId?: string },
  limit = 50,
): Promise<PublicReview[]> {
  if (!isSupabaseConfigured() || (!filter.organizationId && !filter.caseStudyId)) return [];
  try {
    let q = createReadClient()
      .from("vendor_reviews_public")
      .select("id,organization_id,case_study_id,reviewer_display_name,reviewer_company,rating,body,verified_via,reply,created_at")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (filter.organizationId) q = q.eq("organization_id", filter.organizationId);
    if (filter.caseStudyId) q = q.eq("case_study_id", filter.caseStudyId);
    const { data, error } = await q;
    if (error || !data) return [];
    return (data as ReviewRow[]).map((r) => ({
      id: r.id,
      organizationId: r.organization_id,
      caseStudyId: r.case_study_id,
      name: r.reviewer_display_name,
      company: r.reviewer_company,
      rating: r.rating,
      body: r.body,
      verifiedVia: r.verified_via,
      reply: r.reply,
      createdAt: r.created_at,
    }));
  } catch {
    return [];
  }
}
