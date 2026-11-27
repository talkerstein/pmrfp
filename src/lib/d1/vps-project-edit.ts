import type { ProjectSession } from "@/lib/projects/server";
import { vpsProjectPhotoUrl, type ProjectPhoto } from "@/lib/projects/photos";
import { D1ApiError, UUID, type D1Binding } from "./contracts";
import { archiveVpsProjectDraft, archiveVpsProjectDrafts, registerVpsProjectFiles, vpsDraftId,
  vpsProjectActiveMember, vpsProjectAuthority } from "./vps-project-uploads";

export function vpsEditorPhotoUrl(projectId: string, photoPath: string) {
  return `/api/projects/${projectId}/private-photo/${photoPath.split("/")[1].slice(0, -4)}`;
}

export function normalizeVpsProjectEdit(photos: ProjectPhoto[], previous: ProjectPhoto[], projectId: string, org: string) {
  const known = new Map(previous.map(photo => [photo.path, photo.url]));
  const seen = new Set<string>();
  const drafts: string[] = [];
  const canonical: ProjectPhoto[] = [];
  for (const photo of photos) {
    if (seen.has(photo.path)) return null;
    seen.add(photo.path);
    const existing = known.get(photo.path);
    if (existing && (photo.url === existing || photo.url === vpsEditorPhotoUrl(projectId, photo.path))) {
      canonical.push({ ...photo, url: existing });
      continue;
    }
    const id = vpsDraftId(photo, org);
    if (!id || existing) return null;
    drafts.push(id);
    canonical.push({ ...photo, url: vpsProjectPhotoUrl(projectId, id) });
  }
  return { photos: canonical, drafts };
}

const editableColumns = new Set([
  "title", "summary", "client_type", "scope", "challenge", "approach", "outcome", "results",
  "category_id", "region_id", "province", "property_type", "city", "started_on", "completed_on",
  "budget_band", "photos", "hero_url", "visibility", "ai_assisted", "status", "published_at",
]);

export async function writeVpsProjectEdit(
  db: D1Binding, session: ProjectSession, id: string, revision: string,
  update: Record<string, unknown>, drafts: string[], archive = archiveVpsProjectDraft,
) {
  const org = session.organization.id;
  const user = session.userId;
  const entries = Object.entries(update);
  if (!UUID.test(id) || !UUID.test(org) || !UUID.test(user) || !Number.isFinite(Date.parse(revision)) ||
      !entries.length || entries.some(([column]) => !editableColumns.has(column))) {
    throw new D1ApiError(400, "invalid_project_edit");
  }
  const values = entries.map(([, value]) => typeof value === "boolean" ? Number(value) :
    typeof value === "string" || typeof value === "number" || value === null ? value : JSON.stringify(value));
  const files = await archiveVpsProjectDrafts(db, session, drafts, archive);
  const ids = JSON.stringify(drafts);
  const stamp = new Date(Math.max(Date.now(), Date.parse(revision) + 1)).toISOString();
  const statements = [
    db.prepare(`SELECT CASE WHEN ${vpsProjectAuthority} AND ${vpsProjectActiveMember}
      AND EXISTS (SELECT 1 FROM case_studies WHERE id=? AND organization_id=? AND updated_at=? AND status<>'archived')
      AND (SELECT count(*) FROM _project_photo_uploads WHERE id IN (SELECT value FROM json_each(?))
        AND organization_id=? AND user_id=? AND expires_at>?)=? THEN 1 ELSE json('project_inputs_changed') END`)
      .bind(org, user, id, org, revision, ids, org, user, Date.now(), drafts.length),
    db.prepare(`UPDATE case_studies SET ${entries.map(([column]) => `${column}=?`).join(",")}, updated_at=?
      WHERE id=? AND organization_id=? AND updated_at=?`).bind(...values, stamp, id, org, revision),
  ];
  if (drafts.length) statements.push(registerVpsProjectFiles(db, files),
    db.prepare("DELETE FROM _project_photo_uploads WHERE id IN (SELECT value FROM json_each(?)) AND organization_id=? AND user_id=?")
      .bind(ids, org, user));
  const result = await db.batch(statements);
  if (result.length !== statements.length || result.some(row => !row.success) ||
      result[1].meta.changes !== 1 || (drafts.length > 0 && result[3].meta.changes !== drafts.length)) {
    throw new D1ApiError(503, "project_edit_unavailable");
  }
}
