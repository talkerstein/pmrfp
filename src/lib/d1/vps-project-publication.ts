import { createHash } from "node:crypto";
import type { ProjectSession } from "@/lib/projects/server";
import { pickHero, vpsProjectPhotoUrl, type ProjectPhoto } from "@/lib/projects/photos";
import { FREE_PROJECT_LIMIT, publishLimitError } from "@/lib/projects/limits";
import { projectSlug } from "@/lib/projects/slug";
import { D1ApiError, UUID, type D1Binding } from "./contracts";
import { vpsAppDatabase } from "./http-binding";
import { archiveVpsProjectDraft, archiveVpsProjectDrafts, registerVpsProjectFiles, vpsDraftId,
  vpsProjectActiveMember, vpsProjectAuthority } from "./vps-project-uploads";

interface ProjectInput {
  title: string; summary: string; challenge: string; approach: string; outcome: string;
  categorySlug: string; propertyTypeSlug: string; regionSlug: string; city: string;
  photos: ProjectPhoto[]; clientApproved: boolean;
}

export async function publishVpsProject(
  session: ProjectSession, input: ProjectInput, live: boolean,
  db: D1Binding = vpsAppDatabase(), archive = archiveVpsProjectDraft,
): Promise<{ id: string; slug: string; live: boolean } | { error: string }> {
  const org = session.organization.id;
  const user = session.userId;
  const ids = input.photos.map(photo => {
    const id = vpsDraftId(photo, org);
    if (!id) throw new D1ApiError(400, "invalid_project_photos");
    return id;
  });
  const id = ids[0];
  if (!id || new Set(ids).size !== ids.length || !UUID.test(org) || !UUID.test(user)) {
    throw new D1ApiError(400, "invalid_project_photos");
  }
  const hash = createHash("sha256").update(JSON.stringify(input)).digest("hex");
  const existing = await db.prepare(`SELECT p.slug, p.status, r.input_sha256 FROM _project_publication_receipts r
    JOIN case_studies p ON p.id=r.project_id
    WHERE p.id=? AND p.organization_id=? AND p.submitted_by_user_id=? AND ${vpsProjectAuthority} AND ${vpsProjectActiveMember}`)
    .bind(id, org, user, org, user).first<{slug: string; status: string; input_sha256: string}>();
  if (existing) {
    if (existing.input_sha256 !== hash) throw new D1ApiError(409, "project_already_saved");
    return { id, slug: existing.slug, live: existing.status === "published" };
  }

  const active = await db.prepare(`SELECT (SELECT count(*) FROM case_studies WHERE organization_id=?
    AND status NOT IN ('rejected','archived')) AS total WHERE ${vpsProjectAuthority} AND ${vpsProjectActiveMember}`)
    .bind(org, org, user).first<{total: number}>();
  if (!active) throw new D1ApiError(403, "project_unavailable");
  const limit = publishLimitError({ paid: session.hasTradeAccess, existingProjects: active.total, photoCount: ids.length });
  if (limit) return { error: limit };
  const now = Date.now();
  const idsJson = JSON.stringify(ids);
  const files = await archiveVpsProjectDrafts(db, session, ids, archive);
  const photos = input.photos.map((photo, i) => ({ ...photo, url: vpsProjectPhotoUrl(id, ids[i]) }));
  const slug = projectSlug(input.title, id.replace(/-/g, "").slice(0, 12));
  const stamp = new Date(now).toISOString();
  const result = await db.batch([
    db.prepare(`SELECT CASE WHEN ${vpsProjectAuthority} AND ${vpsProjectActiveMember}
      AND (?=1 OR (SELECT count(*) FROM case_studies WHERE organization_id=? AND status NOT IN ('rejected','archived'))<?)
      AND (?=0 OR EXISTS (SELECT 1 FROM organizations WHERE id=? AND profile_status='approved'))
      AND (SELECT count(*) FROM _project_photo_uploads WHERE id IN (SELECT value FROM json_each(?))
        AND organization_id=? AND user_id=? AND expires_at>?)=? THEN 1 ELSE json('project_inputs_changed') END`)
      .bind(org, user, Number(session.hasTradeAccess), org, FREE_PROJECT_LIMIT, Number(live), org,
        idsJson, org, user, Date.now(), ids.length),
    db.prepare(`INSERT INTO case_studies(id,organization_id,submitted_by_user_id,slug,title,summary,category_id,
      region_id,province,property_type,city,challenge,approach,outcome,photos,hero_url,source,client_approved,status,published_at)
      VALUES (?,?,?,?,?,?,(SELECT id FROM trade_categories WHERE slug=?),(SELECT id FROM regions WHERE slug=?),
        (SELECT province FROM regions WHERE slug=?),(SELECT name FROM property_types WHERE slug=?),?,?,?,?,?,?,'capture',?,?,?)`)
      .bind(id, org, user, slug, input.title, input.summary || null, input.categorySlug, input.regionSlug,
        input.regionSlug, input.propertyTypeSlug, input.city || null, input.challenge, input.approach, input.outcome,
        JSON.stringify(photos), pickHero(photos)?.url ?? null, Number(input.clientApproved), live ? "published" : "pending_review", live ? stamp : null),
    registerVpsProjectFiles(db, files),
    db.prepare("INSERT INTO _project_publication_receipts(project_id,input_sha256) VALUES(?,?)").bind(id, hash),
    db.prepare("DELETE FROM _project_photo_uploads WHERE id IN (SELECT value FROM json_each(?)) AND organization_id=? AND user_id=?")
      .bind(idsJson, org, user),
  ]);
  if (result.length !== 5 || result.some(row => !row.success) || result[4].meta.changes !== ids.length) {
    throw new D1ApiError(503, "project_unavailable");
  }
  return { id, slug, live };
}
