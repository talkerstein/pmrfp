import { cache } from "react";
import { createServiceClient } from "@/lib/supabase/service";
import { isServiceConfigured } from "@/lib/supabase/config";
import { BUILDER_COLS, readVpsSharedCaseStudy, toDetail, type CaseStudyDetail } from "@/lib/data/case-studies";
import { toExtras, type ExtrasRow, type ProjectExtras } from "@/lib/data/projects";
import { isWellFormedToken } from "./tokens";
import { photosForViewer } from "./photo-storage";
import { reviewerDisplayName, type PublicReview } from "./reviews";
import { nativeStoredProjectPhotos, pickHero } from "./photos";
import { vpsAppDatabase } from "@/lib/d1/http-binding";
import { resolveVpsShareLink } from "@/lib/d1/vps-project-share";
import { vpsProjectAuthority, vpsProjectUploadsEnabled } from "@/lib/d1/vps-project-uploads";

/**
 * Private share links (/shared/<token>): a company hands one link to a
 * buyer for a bid or a prequalification package. The token is checked here
 * with the service role, because the project may be private and RLS keeps
 * private rows away from everyone outside the company. A revoked link, an
 * unpublished project or a malformed token all look the same: not found.
 */

export interface SharedProject {
  project: CaseStudyDetail;
  extras: ProjectExtras;
  reviews: PublicReview[];
  /** The company's directory profile is public (link to it); otherwise name only. */
  orgListed: boolean;
}

const SELECT =
  "id,organization_id,slug,title,city,province,property_type,challenge,approach,outcome,timeline,budget_band,published_at,updated_at," +
  "photos,hero_url,source,summary," +
  BUILDER_COLS +
  ",organizations(name,slug,verified,profile_status,status),trade_categories(name,slug),regions(slug,name)";

type ReviewRow = {
  id: string; organization_id: string; case_study_id: string | null; reviewer_name: string;
  reviewer_company: string | null; show_building: boolean | number; rating: number; body: string;
  verified_via: string | null; reply: string | null; created_at: string;
};

function publicReviews(rows: ReviewRow[]): PublicReview[] {
  return rows.map(r => ({
    id: r.id, organizationId: r.organization_id, caseStudyId: r.case_study_id,
    name: reviewerDisplayName(r.reviewer_name, Boolean(r.show_building)),
    company: r.show_building ? r.reviewer_company : null,
    rating: r.rating, body: r.body, verifiedVia: r.verified_via, reply: r.reply, createdAt: r.created_at,
  }));
}

async function vpsSharedProject(token: string): Promise<SharedProject | null> {
  const db = vpsAppDatabase();
  const link = await resolveVpsShareLink(db, token);
  if (!link) return null;
  const shared = await readVpsSharedCaseStudy(db, token);
  if (!shared || shared.project.id !== link.case_study_id) return null;
  const row = await db.prepare(`SELECT c.photos,c.hero_url,c.source,c.summary FROM case_studies c
    WHERE c.id=? AND c.organization_id=? AND c.status='published'
      AND EXISTS (SELECT 1 FROM case_study_share_links l WHERE l.id=? AND l.revoked_at IS NULL)`)
    .bind(link.case_study_id, link.organization_id, link.id)
    .first<ExtrasRow & { photos: string }>();
  if (!row) return null;
  const { results } = await db.prepare(`SELECT id,organization_id,case_study_id,reviewer_name,reviewer_company,show_building,
    rating,body,verified_via,reply,created_at FROM vendor_reviews WHERE case_study_id=? AND status='published'
    ORDER BY created_at DESC LIMIT 20`).bind(link.case_study_id).all<ReviewRow>();
  await db.prepare(`UPDATE case_study_share_links SET view_count=view_count+1,last_viewed_at=?
    WHERE id=? AND revoked_at IS NULL AND ${vpsProjectAuthority}`).bind(new Date().toISOString(), link.id).run().catch(() => undefined);
  const stored = nativeStoredProjectPhotos(JSON.parse(row.photos), link.case_study_id, link.organization_id);
  const hero = stored.find(photo => photo.url === row.hero_url || row.hero_url?.endsWith("/" + photo.path)) ?? pickHero(stored);
  const photoLink = (photoPath: string) => `/api/projects/shared-photo/${token}/${photoPath.split("/")[1].slice(0, -4)}`;
  return { ...shared, reviews: publicReviews(results), extras: {
    photos: stored.map(photo => ({ ...photo, url: photoLink(photo.path) })),
    heroUrl: hero ? photoLink(hero.path) : null,
    source: row.source === "capture" ? "capture" : "form",
    summary: row.summary?.trim() || null,
  } };
}

/** Deduped per request (metadata + page), so one visit counts one view. */
export const getSharedProject = cache(async function getSharedProject(token: string): Promise<SharedProject | null> {
  if (!isWellFormedToken(token)) return null;
  if (vpsProjectUploadsEnabled()) {
    try { return await vpsSharedProject(token); } catch { return null; }
  }
  if (!isServiceConfigured()) return null;
  try {
    const db = createServiceClient();
    const { data: link } = await db
      .from("case_study_share_links")
      .select("id,case_study_id,organization_id,revoked_at,view_count")
      .eq("token", token)
      .maybeSingle();
    const l = link as { id: string; case_study_id: string; organization_id: string; revoked_at: string | null; view_count: number } | null;
    if (!l || l.revoked_at) return null;

    const { data, error } = await db
      .from("case_studies")
      .select(SELECT)
      .eq("id", l.case_study_id)
      .eq("organization_id", l.organization_id)
      .eq("status", "published")
      .maybeSingle();
    if (error || !data) return null;
    const row = data as unknown as Parameters<typeof toDetail>[0] &
      ExtrasRow & { organizations: { name: string; slug: string; verified: boolean; profile_status?: string; status?: string } | null };
    if (row.organizations?.status === "suspended") return null;

    const { data: reviews } = await db
      .from("vendor_reviews")
      .select("id,organization_id,case_study_id,reviewer_name,reviewer_company,show_building,rating,body,verified_via,reply,created_at")
      .eq("case_study_id", l.case_study_id)
      .eq("status", "published")
      .order("created_at", { ascending: false })
      .limit(20);

    // Best effort: a view counter must never break the page.
    await db
      .from("case_study_share_links")
      .update({ view_count: (l.view_count ?? 0) + 1, last_viewed_at: new Date().toISOString() })
      .eq("id", l.id)
      .then(
        () => undefined,
        () => undefined,
      );

    // Private (and unlisted) photos are in the private bucket: sign them for
    // this link holder. The page is dynamic, so the hour-long URLs are fresh.
    const project = toDetail(row);
    const stored = toExtras(row, { includePrivate: true });
    const shown = await photosForViewer(
      { id: project.id, organizationId: l.organization_id, visibility: project.visibility, status: "published" },
      { kind: "share", caseStudyId: l.case_study_id },
      stored.photos,
      stored.heroUrl,
    );

    return {
      project,
      extras: { ...stored, ...shown },
      orgListed: row.organizations?.profile_status === "approved",
      reviews: publicReviews((reviews ?? []) as ReviewRow[]),
    };
  } catch {
    return null;
  }
});
