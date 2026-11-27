import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { customerAppAuthority } from "../../../workers/d1-api/customer-signup";
import { D1ApiError, UUID, type D1Binding } from "@/lib/d1/contracts";
import { vpsAppDatabase } from "@/lib/d1/http-binding";
import { listingPhotoSchema, MAX_PHOTOS, type ListingPhoto } from "./rules";

const origin = "https://pmrfp-private-project-files.pmrfp.workers.dev";
const mediaPath = (id: string) => `https://pmrfp.com/api/marketplace/photos/${id}`;
const imageMime = "image/jpeg";
const headers = { "cache-control": "private, no-store", "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer", "content-security-policy": "default-src 'none'; sandbox" };
type Manifest = { id: string; width: number; height: number };
const photo = ({ id, width, height }: Manifest): ListingPhoto => ({ url: mediaPath(id), path: id, width, height });

export function parseVpsListingPhotos(raw: unknown): ListingPhoto[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item) => {
    const result = listingPhotoSchema.safeParse(item);
    return result.success && UUID.test(result.data.path) && result.data.url === mediaPath(result.data.path)
      ? [result.data] : [];
  }).slice(0, MAX_PHOTOS);
}

export async function validateVpsListingPhotos(raw: unknown, userId: string, db: D1Binding) {
  const ids = [...new Set(parseVpsListingPhotos(raw).map((item) => item.path))];
  if (!ids.length) return [];
  const { results } = await db.prepare(`SELECT id,width,height FROM _marketplace_media
    WHERE user_id=? AND ready=1 AND id IN (SELECT value FROM json_each(?)) AND ${customerAppAuthority}`)
    .bind(userId, JSON.stringify(ids)).all<Manifest>();
  const manifests = new Map(results.map((row) => [row.id, row]));
  return ids.flatMap((id) => {
    const row = manifests.get(id);
    return row ? [photo(row)] : [];
  });
}

function storage(id: string, method: "PUT" | "GET" | "HEAD" | "DELETE", fetcher: typeof fetch, bytes?: Buffer) {
  const secret = process.env.PMRFP_PRIVATE_R2_GATEWAY_KEY;
  if (!secret || !/^[a-f0-9]{64}$/.test(secret)) throw new D1ApiError(503, "unavailable");
  return fetcher(`${origin}/v1/marketplace-media/${id}`, {
    method, headers: { "x-pmrfp-gateway-key": secret, ...(bytes ? { "content-type": imageMime } : {}) },
    body: bytes ? new Uint8Array(bytes) : undefined, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(12_000),
  });
}

export async function uploadVpsListingPhoto(userId: string, image: { data: Buffer; width: number; height: number },
  db: D1Binding = vpsAppDatabase(), fetcher = fetch) {
  const id = randomUUID();
  const createdAt = Date.now();
  const digest = createHash("sha256").update(image.data).digest("hex");
  const reservation = await db.prepare(`INSERT INTO _marketplace_media(id,user_id,bytes,sha256,width,height,created_at)
    SELECT ?,u.id,?,?,?,?,? FROM users_profile u WHERE u.id=? AND u.status='active' AND ${customerAppAuthority}`)
    .bind(id, image.data.length, digest, image.width, image.height, createdAt, userId).run();
  if (!reservation.success || reservation.meta.changes !== 1) throw new D1ApiError(403, "upload");
  try {
    if ((await storage(id, "PUT", fetcher, image.data)).status !== 204) throw new D1ApiError(502, "upload");
    const ready = await db.prepare(`UPDATE _marketplace_media SET ready=1 WHERE id=? AND user_id=? AND ready=0
      AND EXISTS(SELECT 1 FROM users_profile u WHERE u.id=? AND u.status='active') AND ${customerAppAuthority}`)
      .bind(id, userId, userId).run();
    if (!ready.success || ready.meta.changes !== 1) throw new D1ApiError(502, "upload");
    return photo({ id, width: image.width, height: image.height });
  } catch {
    // Only clean up an uncommitted reservation. A timeout can hide a successful commit.
    const removed = await db.prepare("DELETE FROM _marketplace_media WHERE id=? AND user_id=? AND ready=0")
      .bind(id, userId).run().catch(() => null);
    if (removed?.meta.changes === 1) await storage(id, "DELETE", fetcher).catch(() => null);
    throw new D1ApiError(502, "upload");
  }
}

export async function serveVpsListingPhoto(id: string, userId: string | null, head: boolean,
  db: D1Binding = vpsAppDatabase(), fetcher = fetch) {
  const missing = () => new Response(null, { status: 404, headers });
  if (!UUID.test(id)) return missing();
  const row = await db.prepare(`SELECT f.bytes FROM _marketplace_media f JOIN users_profile u ON u.id=f.user_id
    WHERE f.id=? AND f.ready=1 AND u.status='active' AND ${customerAppAuthority}
    AND (f.user_id=? OR EXISTS(SELECT 1 FROM marketplace_listings l, json_each(l.photos) p
      WHERE l.user_id=f.user_id AND l.status='active' AND l.expires_at>? AND json_extract(p.value,'$.path')=f.id)
      OR EXISTS(SELECT 1 FROM users_profile a WHERE a.id=? AND a.status='active'
        AND a.primary_role IN ('admin','super_admin')
        AND EXISTS(SELECT 1 FROM marketplace_listings l, json_each(l.photos) p
          WHERE l.user_id=f.user_id AND json_extract(p.value,'$.path')=f.id)))`)
    .bind(id, userId, new Date().toISOString(), userId).first<{ bytes: number }>();
  if (!row) return missing();
  const response = await storage(id, head ? "HEAD" : "GET", fetcher);
  if (!response.ok || Number(response.headers.get("content-length")) !== row.bytes ||
    response.headers.get("content-type") !== imageMime || (!head && !response.body)) {
    await response.body?.cancel();
    return new Response(null, { status: 503, headers });
  }
  return new Response(head ? null : response.body, { headers: {
    ...headers, "content-type": imageMime, "content-length": String(row.bytes),
  } });
}
