import { createHash, randomUUID } from "node:crypto";
import type { ProjectSession } from "@/lib/projects/server";
import type { ProjectPhoto } from "@/lib/projects/photos";
import { D1ApiError, UUID, type D1Binding } from "./contracts";
import { vpsAppDatabase } from "./http-binding";

const storageOrigin = "https://pmrfp-private-project-files.pmrfp.workers.dev";
export const vpsProjectAuthority = "EXISTS (SELECT 1 FROM _customer_app_authority WHERE id=1 AND mode='native-v1')";
export const vpsProjectActiveMember = `EXISTS (SELECT 1 FROM organization_members m
  JOIN users_profile u ON u.id=m.user_id JOIN organizations o ON o.id=m.organization_id
  WHERE m.organization_id=? AND u.id=? AND u.status='active' AND o.status<>'suspended'
    AND o.organization_type IN ('trade_company','supplier'))`;
const maxJpegBytes = 10 * 1024 * 1024;
const draftLifetimeMs = 24 * 60 * 60 * 1000;
const privateHeaders = {
  "cache-control": "private, no-store", "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff", "content-security-policy": "default-src 'none'; sandbox",
};

export function vpsProjectUploadsEnabled() {
  return process.env.PMRFP_VPS_CUSTOMER_ENGINE === "d1" && process.env.PMRFP_VPS_PROJECT_UPLOADS === "enabled";
}

export async function countVpsActiveProjects(organizationId: string) {
  const row = await vpsAppDatabase().prepare(`SELECT (SELECT count(*) FROM case_studies
    WHERE organization_id=? AND status NOT IN ('rejected','archived')) AS total WHERE ${vpsProjectAuthority}`)
    .bind(organizationId).first<{ total: number }>();
  if (!row || typeof row.total !== "number") throw new D1ApiError(503, "projects_unavailable");
  return row.total;
}

async function draftRequest(id: string, method: "PUT" | "GET" | "HEAD", key: string, fetcher: typeof fetch, data?: Buffer) {
  if (!/^[0-9a-f]{64}$/.test(key)) throw new D1ApiError(503, "storage_configuration_unavailable");
  return fetcher(`${storageOrigin}/v1/private-project-drafts/${id}`, {
    method, redirect: "error", cache: "no-store", signal: AbortSignal.timeout(12000),
    headers: { "x-pmrfp-gateway-key": key, ...(data && { "content-type": "image/jpeg" }) },
    body: data ? new Uint8Array(data) : undefined,
  });
}

export async function uploadVpsProjectPhoto(
  session: ProjectSession, photo: { data: Buffer; width: number; height: number },
  db: D1Binding = vpsAppDatabase(), fetcher = fetch, key = process.env.PMRFP_PRIVATE_R2_GATEWAY_KEY ?? "",
) {
  const orgId = session.organization.id;
  if (!UUID.test(orgId) || !UUID.test(session.userId) || photo.data.length < 4 || photo.data.length > maxJpegBytes) {
    throw new D1ApiError(400, "invalid_draft_photo");
  }
  if (!/^[0-9a-f]{64}$/.test(key)) throw new D1ApiError(503, "storage_configuration_unavailable");
  const id = randomUUID();
  const digest = createHash("sha256").update(photo.data).digest("hex");
  const reserve = await db.prepare(`INSERT INTO _project_photo_uploads(id,organization_id,user_id,sha256,bytes,expires_at)
    SELECT ?,?,?,?,?,? WHERE ${vpsProjectAuthority} AND ${vpsProjectActiveMember}`)
    .bind(id, orgId, session.userId, digest, photo.data.length, Date.now() + draftLifetimeMs, orgId, session.userId).run();
  if (!reserve.success || reserve.meta.changes !== 1) throw new D1ApiError(403, "project_upload_unavailable");
  try {
    const uploaded = await draftRequest(id, "PUT", key, fetcher, photo.data);
    if (uploaded.status !== 204) throw new D1ApiError(503, "project_upload_unavailable");
  } catch {
    // A timeout may leave bytes in R2. Removing this reservation immediately
    // blocks preview and publication while the draft prefix expires.
    await db.prepare(`DELETE FROM _project_photo_uploads WHERE id=? AND organization_id=? AND user_id=?
      AND sha256=? AND ${vpsProjectAuthority}`).bind(id, orgId, session.userId, digest).run().catch(() => null);
    throw new D1ApiError(503, "project_upload_unavailable");
  }
  return { url: `/api/projects/photos/drafts/${id}`, path: `${orgId}/${id}.jpg`, width: photo.width, height: photo.height };
}

export async function serveVpsProjectDraft(
  session: ProjectSession, id: string, head: boolean,
  db: D1Binding = vpsAppDatabase(), fetcher = fetch, key = process.env.PMRFP_PRIVATE_R2_GATEWAY_KEY ?? "",
) {
  const missing = () => new Response(null, { status: 404, headers: privateHeaders });
  const orgId = session.organization.id;
  if (!UUID.test(id) || !UUID.test(orgId) || !UUID.test(session.userId)) return missing();
  const record = await db.prepare(`SELECT bytes FROM _project_photo_uploads
    WHERE id=? AND organization_id=? AND user_id=? AND expires_at>? AND ${vpsProjectAuthority} AND ${vpsProjectActiveMember}`)
    .bind(id, orgId, session.userId, Date.now(), orgId, session.userId).first<{ bytes: number }>();
  if (!record) return missing();
  const response = await draftRequest(id, head ? "HEAD" : "GET", key, fetcher);
  if (response.status === 404) return missing();
  if (!response.ok || Number(response.headers.get("content-length")) !== record.bytes ||
      response.headers.get("content-type") !== "image/jpeg" || (!head && !response.body)) {
    await response.body?.cancel();
    throw new D1ApiError(503, "storage_unavailable");
  }
  return new Response(head ? null : response.body, {
    headers: { ...privateHeaders, "content-type": "image/jpeg", "content-length": String(record.bytes) },
  });
}

export async function archiveVpsProjectDraft(id: string, fetcher = fetch, key = process.env.PMRFP_PRIVATE_R2_GATEWAY_KEY ?? "") {
  if (!UUID.test(id) || !/^[0-9a-f]{64}$/.test(key)) throw new D1ApiError(503, "storage_configuration_unavailable");
  const response = await fetcher(`${storageOrigin}/v1/private-project-drafts/${id}/commit`, {
    method: "POST", headers: { "x-pmrfp-gateway-key": key },
    redirect: "error", cache: "no-store", signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) throw new D1ApiError(503, "project_photos_unavailable");
  const file = await response.json() as { sha256?: string; etag?: string; bytes?: number };
  if (!file.sha256 || !/^[0-9a-f]{64}$/.test(file.sha256) || !file.etag || !/^[0-9a-f]{32}$/.test(file.etag) ||
      !Number.isSafeInteger(file.bytes) || file.bytes! < 4 || file.bytes! > maxJpegBytes) {
    throw new D1ApiError(503, "project_photos_unavailable");
  }
  return { sha256: file.sha256, etag: file.etag, bytes: file.bytes! };
}

export function vpsDraftId(photo: ProjectPhoto, organizationId: string) {
  const id = photo.url.split("/").at(-1) ?? "";
  return UUID.test(id) && photo.url === `/api/projects/photos/drafts/${id}` && photo.path === `${organizationId}/${id}.jpg`
    ? id : null;
}

export async function archiveVpsProjectDrafts(db: D1Binding, session: ProjectSession, ids: string[], archive = archiveVpsProjectDraft) {
  if (!ids.length) return [];
  const org = session.organization.id;
  const { results: drafts } = await db.prepare(`SELECT id, sha256, bytes FROM _project_photo_uploads
    WHERE id IN (SELECT value FROM json_each(?)) AND organization_id=? AND user_id=? AND expires_at>?`)
    .bind(JSON.stringify(ids), org, session.userId, Date.now()).all<{id: string; sha256: string; bytes: number}>();
  if (drafts.length !== ids.length) throw new D1ApiError(404, "project_photos_unavailable");
  const files = [];
  for (let i = 0; i < drafts.length; i += 3) {
    files.push(...await Promise.all(drafts.slice(i, i + 3).map(async draft => {
      const object = await archive(draft.id);
      if (object.sha256 !== draft.sha256 || object.bytes !== draft.bytes) throw new D1ApiError(503, "project_photos_unavailable");
      return { path: `${org}/${draft.id}.jpg`, ...object };
    })));
  }
  return files;
}

export function registerVpsProjectFiles(db: D1Binding, files: Awaited<ReturnType<typeof archiveVpsProjectDrafts>>) {
  return db.prepare(`INSERT INTO _private_project_files(source_path,sha256,etag,bytes)
    SELECT json_extract(value,'$.path'),json_extract(value,'$.sha256'),json_extract(value,'$.etag'),json_extract(value,'$.bytes')
    FROM json_each(?)`).bind(JSON.stringify(files));
}
