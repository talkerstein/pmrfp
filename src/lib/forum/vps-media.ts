import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { D1ApiError, UUID, type D1Binding } from "@/lib/d1/contracts";
import { vpsAppDatabase } from "@/lib/d1/http-binding";
import { customerAppAuthority } from "../../../workers/d1-api/customer-signup";
import { forumPhotoPath, isForumPhotoPath, type ForumImage } from "./photos";

const endpoint = "https://pmrfp-private-project-files.pmrfp.workers.dev";
const safeHeaders = { "cache-control": "private, no-store", "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer", "content-security-policy": "default-src 'none'; sandbox" };
const mime = "image/jpeg";

function requestPhoto(id: string, method: "PUT" | "GET" | "HEAD" | "DELETE", data?: Buffer) {
  const secret = process.env.PMRFP_PRIVATE_R2_GATEWAY_KEY ?? "";
  if (!/^[a-f0-9]{64}$/.test(secret)) throw new D1ApiError(503, "unavailable");
  return fetch(`${endpoint}/v1/forum-media/${id}`, { method,
    headers: { "x-pmrfp-gateway-key": secret, ...(data ? { "content-type": mime } : {}) },
    body: data ? new Uint8Array(data) : undefined, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(12_000) });
}

export async function uploadVpsForumImage(userId: string, image: { data: Buffer; width: number; height: number },
  db: D1Binding = vpsAppDatabase()) {
  const id = randomUUID();
  const reserved = await db.prepare(`INSERT INTO _forum_media(id,user_id,bytes,sha256,width,height,created_at)
    SELECT ?,id,?,?,?,?,? FROM users_profile WHERE id=? AND status='active' AND ${customerAppAuthority}
    AND NOT EXISTS(SELECT 1 FROM forum_profiles WHERE user_id=? AND banned=1)`)
    .bind(id, image.data.length, createHash("sha256").update(image.data).digest("hex"), image.width, image.height, Date.now(),
      userId, userId).run();
  if (reserved.meta.changes !== 1) throw new D1ApiError(403, "unavailable");
  try {
    if ((await requestPhoto(id, "PUT", image.data)).status !== 204) throw new D1ApiError(502, "upload");
    const finished = await db.prepare(`UPDATE _forum_media SET ready=1 WHERE id=? AND user_id=? AND ready=0
      AND EXISTS(SELECT 1 FROM users_profile WHERE id=? AND status='active') AND ${customerAppAuthority}`)
      .bind(id, userId, userId).run();
    if (finished.meta.changes !== 1) throw new D1ApiError(502, "upload");
    const path = forumPhotoPath(userId, id);
    return { path, w: image.width, h: image.height, preview: `/api/forum/photos/${path}` };
  } catch {
    const removed = await db.prepare("DELETE FROM _forum_media WHERE id=? AND user_id=? AND ready=0")
      .bind(id, userId).run().catch(() => null);
    if (removed?.meta.changes === 1) await requestPhoto(id, "DELETE").catch(() => null);
    throw new D1ApiError(502, "upload");
  }
}

export async function approvedForumImages(userId: string, images: ForumImage[], db: D1Binding = vpsAppDatabase()) {
  if (!images.length) return [];
  const ids = images.map((image) => image.path.split("/")[1].slice(0, -4));
  const rows = await db.prepare(`SELECT id,width,height FROM _forum_media WHERE user_id=? AND ready=1
    AND id IN (SELECT value FROM json_each(?)) AND ${customerAppAuthority}`).bind(userId, JSON.stringify(ids))
    .all<{ id: string; width: number; height: number }>();
  const byId = new Map(rows.results.map((row) => [row.id, row]));
  return ids.flatMap((id) => {
    const row = byId.get(id);
    return row ? [{ path: forumPhotoPath(userId, row.id), w: row.width, h: row.height }] : [];
  });
}

export async function serveVpsForumImage(path: string, viewer: string | null, head: boolean, db: D1Binding = vpsAppDatabase()) {
  const missing = () => new Response(null, { status: 404, headers: safeHeaders });
  if (!isForumPhotoPath(path)) return missing();
  const [owner, filename] = path.split("/");
  const id = filename.slice(0, -4);
  if (!UUID.test(id)) return missing();
  const row = await db.prepare(`SELECT f.bytes FROM _forum_media f
    WHERE f.id=? AND f.user_id=? AND f.ready=1 AND ${customerAppAuthority}
    AND (f.user_id=? OR EXISTS(SELECT 1 FROM forum_threads t JOIN forum_categories c ON c.id=t.category_id, json_each(t.images) j
      WHERE t.author_id=f.user_id AND t.status='approved' AND c.is_public=1 AND json_extract(j.value,'$.path')=?)
    OR EXISTS(SELECT 1 FROM forum_posts p JOIN forum_threads t ON t.id=p.thread_id JOIN forum_categories c ON c.id=t.category_id,
      json_each(p.images) j WHERE p.author_id=f.user_id AND p.status='approved' AND t.status='approved' AND c.is_public=1
        AND json_extract(j.value,'$.path')=?))`).bind(id, owner, viewer, path, path).first<{ bytes: number }>();
  if (!row) return missing();
  const object = await requestPhoto(id, head ? "HEAD" : "GET");
  if (!object.ok || object.headers.get("content-type") !== mime || Number(object.headers.get("content-length")) !== row.bytes
    || (!head && !object.body)) {
    await object.body?.cancel();
    return new Response(null, { status: 503, headers: safeHeaders });
  }
  return new Response(head ? null : object.body, { headers: { ...safeHeaders, "content-type": mime, "content-length": String(row.bytes) } });
}
