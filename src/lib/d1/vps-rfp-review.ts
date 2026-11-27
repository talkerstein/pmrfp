import "server-only";
import { randomUUID } from "node:crypto";
import { D1ApiError, UUID, type D1Binding } from "./contracts";
import { vpsAppDatabase } from "./http-binding";
import { customerAppAuthority } from "../../../workers/d1-api/customer-signup";

const inReview = `id=? AND status IN ('pending_review','draft') AND is_demo=0
  AND EXISTS (SELECT 1 FROM users_profile WHERE id=? AND status='active' AND primary_role IN ('admin','super_admin'))`;

export async function reviewVpsRfp(
  adminId: string, id: string, decision: "published" | "rejected", reason: string | null,
  db: D1Binding = vpsAppDatabase(),
) {
  if (!UUID.test(adminId) || !UUID.test(id)) return null;
  const stamp = new Date().toISOString();
  const published = decision === "published";
  const [gate, notification, changes, audit] = await db.batch<{
    id: string; title: string; slug: string; source_type: string; poster_lang: string | null; email: string | null;
  }>([
    db.prepare(`SELECT CASE WHEN ${customerAppAuthority} THEN 1 ELSE json('app_authority_unavailable') END`),
    db.prepare(`INSERT INTO notifications(id,user_id,type,title,message,link_url)
      SELECT ?,posted_by_user_id,?,?,title,CASE WHEN source_type='public_buyer_direct'
        THEN '/buyer-dashboard/jobs/' || id ELSE ? END FROM rfp_posts WHERE ${inReview}
        AND posted_by_user_id IS NOT NULL`).bind(randomUUID(),
      published ? "rfp_published" : "rfp_rejected", published ? "Your job is live" : "Your listing wasn't published",
      published ? `/pm-dashboard/rfps/${id}/interests` : "/pm-dashboard/rfps", id, adminId),
    db.prepare(`UPDATE rfp_posts
        SET status=?,published_at=CASE WHEN ? THEN ? ELSE published_at END,
            review_note=CASE WHEN ? IS NOT NULL THEN ? ELSE review_note END,updated_at=?
      WHERE ${inReview}
      RETURNING id,title,slug,source_type,poster_lang,coalesce(nullif(trim(contact_email),''),
         (SELECT email FROM users_profile WHERE id=posted_by_user_id)) AS email`)
      .bind(decision, Number(published), stamp, published ? null : reason, reason, stamp, id, adminId),
    db.prepare(`INSERT INTO town_job_log(rfp_id,organization_id,buyer_key,actor_user_id,event,detail)
      SELECT id,posted_by_organization_id,buyer_key,?,?,CASE WHEN ? THEN json_object('auto',0,'followers',
        (SELECT count(*) FROM buyer_follows f WHERE f.buyer_slug=rfp_posts.buyer_key)) ELSE json_object('reason',?) END
      FROM rfp_posts WHERE id=? AND source_type='public_buyer_direct' AND changes()=1`)
      .bind(adminId,decision,Number(published),reason,id),
  ]);
  if (!gate?.success || !notification?.success || !changes?.success || !audit?.success) {
    throw new D1ApiError(503, "rfp_review_unavailable");
  }
  return changes.results[0] ?? null;
}
