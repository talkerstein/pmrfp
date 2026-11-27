import "server-only";
import { randomUUID } from "node:crypto";
import type { Locale } from "@/i18n/config";
import type { RfpPostInput } from "@/lib/validations";
import { GC_PACKAGE, isLinkableAward } from "@/lib/gc/packages";
import { D1ApiError, UUID, type D1Binding } from "./contracts";
import { vpsAppDatabase } from "./http-binding";
import { customerAppAuthority } from "../../../workers/d1-api/customer-signup";

export async function postVpsRfp(
  userId: string, organizationId: string | null, slug: string, lang: Locale,
  input: RfpPostInput, db: D1Binding = vpsAppDatabase(),
  gc?: { gcProjectName: string; awardedRfpId: string | null },
) {
  const categories = [...new Set(input.categories)];
  if (!UUID.test(userId) || (organizationId && !UUID.test(organizationId)) || !categories.length || categories.length > 40) {
    throw new D1ApiError(400, "invalid_rfp");
  }
  const id = randomUUID();
  const related = gc?.awardedRfpId ?? null;
  const project = gc?.gcProjectName.trim() ?? null;
  if (gc && (!project || project.length>160)) throw new D1ApiError(400,"invalid_rfp");
  const award = related ? await db.prepare(`SELECT slug,source_type FROM rfp_posts
    WHERE id=? AND status='published' AND is_demo=0 AND ${customerAppAuthority}`)
    .bind(related).first<{slug:string;source_type:string}>() : null;
  if (related && (!award || !isLinkableAward({slug:award.slug,sourceType:award.source_type}))) {
    throw new D1ApiError(400,"related_award_unavailable");
  }
  const placeholders = categories.map(() => "?").join(",");
  const stamp = new Date().toISOString();
  const [gate, post, ...links] = await db.batch([
    db.prepare(`SELECT CASE WHEN ${customerAppAuthority}
      AND EXISTS (SELECT 1 FROM users_profile WHERE id=? AND status='active'
        AND primary_role IN ('property_manager','real_estate_agent','admin','super_admin'))
      AND (? IS NULL OR EXISTS (SELECT 1 FROM organization_members m JOIN organizations o ON o.id=m.organization_id
        WHERE m.user_id=? AND m.organization_id=? AND o.status='active' AND o.is_demo=0))
      AND EXISTS (SELECT 1 FROM regions WHERE slug=?)
      AND (? IS NULL OR EXISTS (SELECT 1 FROM property_types WHERE slug=?))
      AND (? IS NULL OR EXISTS (SELECT 1 FROM rfp_posts WHERE id=? AND slug=? AND is_demo=0
        AND source_type='public_source' AND status='published'))
      AND (SELECT count(*) FROM trade_categories WHERE slug IN (${placeholders}))=?
      THEN 1 ELSE json('rfp_post_denied') END`).bind(userId, organizationId, userId, organizationId, input.regionSlug,
        input.propertyType ?? null, input.propertyType ?? null, related,related,award?.slug ?? null,...categories,categories.length),
    db.prepare(`INSERT INTO rfp_posts(id,slug,title,summary,scope,requirements,property_type_id,region_id,city,province,
        budget_min,budget_max,budget_public,deadline,submission_instructions,contact_visibility,contact_name,
        contact_email,contact_phone,posted_by_user_id,posted_by_organization_id,source_type,status,poster_lang,
        keep_alive_token,created_at,updated_at,gc_project_name,awarded_rfp_id)
      SELECT ?,?,?,?,?,?,(SELECT id FROM property_types WHERE slug=?),(SELECT id FROM regions WHERE slug=?),?,?,
        ?,?,?,?,?,?,?,?,?,?,?,
        coalesce(?,CASE WHEN primary_role IN ('admin','super_admin') THEN 'admin_seeded' ELSE 'property_manager_direct' END),
        'pending_review',?,?,?,?,?,? FROM users_profile WHERE id=?`).bind(
        id, slug, input.title, input.summary, input.scope, input.requirements || null, input.propertyType ?? null, input.regionSlug,
        input.city || null, input.province || null, input.budgetMin ?? null, input.budgetMax ?? null, Number(input.budgetPublic ?? false),
        input.deadline.toISOString().slice(0, 10), input.submissionInstructions || null, input.contactVisibility,
        input.contactName || null, input.contactEmail || null, input.contactPhone || null, userId, organizationId,
        gc ? GC_PACKAGE : null,lang,randomUUID(),stamp,stamp,project,related,userId,
      ),
    ...categories.map(category => db.prepare(`INSERT INTO rfp_categories(id,rfp_id,category_id)
      SELECT ?,?,id FROM trade_categories WHERE slug=?`).bind(randomUUID(), id, category)),
  ]);
  if (!gate?.success || !post?.success || post.meta.changes !== 1 ||
      links.length !== categories.length || links.some(link => !link.success || link.meta.changes !== 1)) {
    throw new D1ApiError(503, "rfp_post_unavailable");
  }
  return id;
}
