import { cache } from "react";
import { createReadClient } from "@/lib/supabase/read";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { isOwnPhotoUrl, pickHero, sanitizePhotos, type ProjectPhoto } from "@/lib/projects/photos";
import type { PublicReview } from "@/lib/projects/reviews";

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
    const r = data as { photos: unknown; hero_url: string | null; source: string | null; summary: string | null };
    const photos = sanitizePhotos(r.photos, supabaseUrl());
    return {
      photos,
      heroUrl: safeHero(r.hero_url, photos),
      source: r.source === "capture" ? "capture" : "form",
      summary: r.summary?.trim() || null,
    };
  } catch {
    return NO_EXTRAS;
  }
});

export interface ProjectCard {
  slug: string;
  title: string;
  city: string | null;
  province: string | null;
  heroUrl: string | null;
  publishedAt: string | null;
}

interface CardRow {
  slug: string;
  title: string;
  city: string | null;
  province: string | null;
  published_at: string | null;
  hero_url?: string | null;
}

/** Published projects for one company's profile, newest first. */
export async function listOrgProjects(organizationId: string, limit = 12): Promise<ProjectCard[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = createReadClient();
  const base = "slug,title,city,province,published_at";
  const run = (cols: string) =>
    supabase
      .from("case_studies")
      .select(cols)
      .eq("organization_id", organizationId)
      .eq("status", "published")
      .order("published_at", { ascending: false })
      .limit(limit);
  try {
    let { data, error } = await run(`${base},hero_url`);
    // Pre-migration: no hero_url column yet. Text-only studies still list.
    if (error) ({ data, error } = await run(base));
    if (error || !data) return [];
    return (data as unknown as CardRow[]).map((r) => ({
      slug: r.slug,
      title: r.title,
      city: r.city,
      province: r.province,
      publishedAt: r.published_at,
      heroUrl: r.hero_url && isOwnPhotoUrl(r.hero_url, supabaseUrl()) ? r.hero_url : null,
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
