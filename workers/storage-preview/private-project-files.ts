import { D1ApiError, UUID, type D1Binding } from "../../src/lib/d1/contracts";
import { privateAttachment } from "./private-attachments";
import { verifyGateway } from "../d1-api/auth";
import type { SandboxBucket, SandboxObject } from "../d1-api/project-photos";

const digestPattern = /^[0-9a-f]{64}$/;
const privateHeaders = { "cache-control": "private, no-store", "x-content-type-options": "nosniff" };
type FileRecord = { bytes: number; etag: string; sha256: string };
const maxJpegBytes = 10 * 1024 * 1024;

async function managedMedia(request: Request, db: D1Binding, bucket: SandboxBucket, id: string, kind: "company" | "marketplace" | "forum") {
  if (!UUID.test(id) || !["PUT", "GET", "HEAD", "DELETE"].includes(request.method)) throw new D1ApiError(404, "not_found");
  const jpeg = kind !== "company";
  const mime = jpeg ? "image/jpeg" : "image/webp";
  const table = kind === "company" ? "_company_media" : kind === "forum" ? "_forum_media" : "_marketplace_media";
  const record = await db.prepare(`SELECT bytes,sha256,ready,created_at FROM ${table} WHERE id=?`)
    .bind(id).first<{ bytes: number; sha256: string; ready: number; created_at: number }>();
  const key = `${kind}-media/${id}`;
  if (request.method === "DELETE") {
    if (record || !bucket.delete) throw new D1ApiError(404, "not_found");
    await bucket.delete(key);
    return new Response(null, { status: 204, headers: privateHeaders });
  }
  if (!record || !digestPattern.test(record.sha256) ||
    record.bytes < (jpeg ? 4 : 12) || record.bytes > (jpeg ? maxJpegBytes : 5 * 1024 * 1024)) {
    throw new D1ApiError(404, "not_found");
  }
  if (request.method === "PUT") {
    if (record.ready || record.created_at <= Date.now() - 15 * 60_000) throw new D1ApiError(404, "not_found");
    if (!bucket.put || !request.body || request.headers.get("content-type") !== mime) {
      throw new D1ApiError(415, jpeg ? "jpeg_required" : "webp_required");
    }
    const bytes = new Uint8Array(record.bytes);
    const reader = request.body.getReader();
    let count = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (count + value.length > bytes.length) {
        await reader.cancel();
        throw new D1ApiError(413, "file_too_large");
      }
      bytes.set(value, count);
      count += value.length;
    }
    const decoder = new TextDecoder();
    const validSignature = jpeg ? bytes[0] === 255 && bytes[1] === 216 && bytes.at(-2) === 255 && bytes.at(-1) === 217 :
      decoder.decode(bytes.subarray(0, 4)) === "RIFF" && decoder.decode(bytes.subarray(8, 12)) === "WEBP";
    if (count !== record.bytes || !validSignature || await sha256(bytes.buffer) !== record.sha256) {
      throw new D1ApiError(400, jpeg ? "invalid_jpeg" : "invalid_webp");
    }
    await bucket.put(key, bytes.buffer, { httpMetadata: { contentType: mime }, customMetadata: { sha256: record.sha256 } });
    return new Response(null, { status: 204, headers: privateHeaders });
  }
  if (record.ready !== 1) throw new D1ApiError(404, "not_found");
  const object = request.method === "HEAD" ? await bucket.head(key) : await bucket.get(key);
  if (!object || object.size !== record.bytes || object.httpMetadata?.contentType !== mime ||
    object.customMetadata?.sha256 !== record.sha256) throw new D1ApiError(503, "storage_unavailable");
  const body = request.method === "HEAD" ? null : (object as SandboxObject).body;
  if (request.method === "GET" && !body) throw new D1ApiError(503, "storage_unavailable");
  return new Response(body, { headers: { ...privateHeaders, "content-type": mime, "content-length": String(record.bytes) } });
}

function matchesManifest(object: Awaited<ReturnType<SandboxBucket["head"]>>, record: FileRecord) {
  return object && object.size === record.bytes && object.etag === record.etag &&
    object.httpMetadata?.contentType === "image/jpeg";
}

async function sha256(bytes: ArrayBuffer) {
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
    .map(byte => byte.toString(16).padStart(2, "0")).join("");
}

async function draftObject(request: Request, db: D1Binding, bucket: SandboxBucket, id: string, commit: boolean) {
  if (!UUID.test(id)) throw new D1ApiError(404, "not_found");
  if (commit ? request.method !== "POST" : !["GET", "HEAD", "PUT"].includes(request.method)) {
    throw new D1ApiError(405, "method_not_allowed");
  }
  const draft = await db.prepare("SELECT bytes,sha256 FROM _project_photo_uploads WHERE id=? AND expires_at>?")
    .bind(id, Date.now()).first<{ bytes: number; sha256: string }>();
  if (!draft || !digestPattern.test(draft.sha256) || draft.bytes < 4 || draft.bytes > maxJpegBytes) {
    throw new D1ApiError(404, "not_found");
  }
  const key = `private-project-drafts/${id}`;
  if (request.method === "PUT") {
    if (!bucket.put || !request.body || request.headers.get("content-type") !== "image/jpeg") {
      throw new D1ApiError(415, "jpeg_required");
    }
    const jpeg = new Uint8Array(draft.bytes);
    const reader = request.body.getReader();
    let offset = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (offset + value.length > jpeg.length) {
        await reader.cancel();
        throw new D1ApiError(413, "file_too_large");
      }
      jpeg.set(value, offset);
      offset += value.length;
    }
    const checksum = await sha256(jpeg.buffer);
    if (offset !== jpeg.length || jpeg[0] !== 255 || jpeg[1] !== 216 ||
        jpeg.at(-2) !== 255 || jpeg.at(-1) !== 217 || checksum !== draft.sha256) {
      throw new D1ApiError(400, "invalid_draft_jpeg");
    }
    await bucket.put(key, jpeg.buffer, {
      httpMetadata: { contentType: "image/jpeg" }, customMetadata: { sha256: draft.sha256 },
    });
    return new Response(null, { status: 204, headers: privateHeaders });
  }

  const object = request.method === "HEAD" ? await bucket.head(key) : await bucket.get(key);
  if (!object) throw new D1ApiError(404, "not_found");
  if (object.size !== draft.bytes || object.httpMetadata?.contentType !== "image/jpeg" ||
      object.customMetadata?.sha256 !== draft.sha256) throw new D1ApiError(503, "storage_unavailable");
  const body = request.method === "HEAD" ? null : (object as SandboxObject).body;
  if (commit) {
    if (!bucket.put || !body) throw new D1ApiError(503, "storage_unavailable");
    const destination = `private-project-photo/${draft.sha256}`;
    const jpeg = await new Response(body).arrayBuffer();
    if (jpeg.byteLength !== draft.bytes || await sha256(jpeg) !== draft.sha256) {
      throw new D1ApiError(503, "storage_unavailable");
    }
    // Keep the original object and ETag when a digest is already in the
    // migration manifest. Concurrent promotions write identical bytes.
    const existing = await bucket.get(destination);
    if (existing) {
      if (existing.size !== draft.bytes || await sha256(await new Response(existing.body).arrayBuffer()) !== draft.sha256) {
        throw new D1ApiError(503, "storage_unavailable");
      }
    } else {
      await bucket.put(destination, jpeg, {
        httpMetadata: { contentType: "image/jpeg" }, customMetadata: { sha256: draft.sha256 },
      });
    }
    const permanent = await bucket.head(destination);
    if (!permanent || permanent.size !== draft.bytes || permanent.httpMetadata?.contentType !== "image/jpeg" ||
        !/^[0-9a-f]{32}$/.test(permanent.etag ?? "")) throw new D1ApiError(503, "storage_unavailable");
    return Response.json({ sha256: draft.sha256, bytes: draft.bytes, etag: permanent.etag }, { headers: privateHeaders });
  }
  return new Response(body, {
    headers: { ...privateHeaders, "content-type": "image/jpeg", "content-length": String(object.size) },
  });
}

export default {
  async fetch(request: Request, env: {
    APP_DB: D1Binding; PRIVATE_FILES: SandboxBucket; GATEWAY_SECRET: string;
    VPS_IP: string; MODE: "readiness" | "serving";
  }) {
    try {
      if (!env.VPS_IP || request.headers.get("cf-connecting-ip") !== env.VPS_IP) throw new D1ApiError(404, "not_found");
      await verifyGateway(request.headers.get("x-pmrfp-gateway-key"), env.GATEWAY_SECRET);
      const url = new URL(request.url);
      if (url.search || request.headers.has("range")) throw new D1ApiError(400, "invalid_request");
      if (url.pathname === "/v1/private-project-files/health") {
        if (request.method !== "GET") throw new D1ApiError(405, "method_not_allowed");
        const inventory = await env.APP_DB.prepare("SELECT sha256,bytes,etag FROM _private_project_files LIMIT 81").all<FileRecord>();
        if (!inventory.success || inventory.results.length > 80) throw new D1ApiError(503, "storage_unavailable");
        for (const record of inventory.results) {
          if (!digestPattern.test(record.sha256) ||
              !matchesManifest(await env.PRIVATE_FILES.head(`private-project-photo/${record.sha256}`), record)) {
            throw new D1ApiError(503, "storage_unavailable");
          }
        }
        return Response.json({ reachable: true, verifiedFiles: inventory.results.length }, { headers: privateHeaders });
      }
      if (env.MODE !== "serving") throw new D1ApiError(503, "storage_unavailable");
      const authority = await env.APP_DB.prepare("SELECT id FROM _customer_app_authority WHERE id=1 AND mode='native-v1'")
        .first<{ id: number }>();
      if (authority?.id !== 1) throw new D1ApiError(503, "storage_unavailable");
      const attachment = /^\/v1\/private-attachments\/([^/]+)$/.exec(url.pathname);
      if (attachment) return await privateAttachment(request, env.APP_DB, env.PRIVATE_FILES, attachment[1]);
      const media = /^\/v1\/(company|marketplace|forum)-media\/([^/]+)$/.exec(url.pathname);
      if (media) {
        const kind = media[1] === "company" ? "company" : media[1] === "forum" ? "forum" : "marketplace";
        return await managedMedia(request, env.APP_DB, env.PRIVATE_FILES, media[2], kind);
      }
      const draft = /^\/v1\/private-project-drafts\/([^/]+)(\/commit)?$/.exec(url.pathname);
      if (draft) return await draftObject(request, env.APP_DB, env.PRIVATE_FILES, draft[1], !!draft[2]);
      const digest = url.pathname.split("/").at(-1) ?? "";
      if (url.pathname !== `/v1/private-project-files/${digest}` || !digestPattern.test(digest)) {
        throw new D1ApiError(404, "not_found");
      }
      if (request.method !== "GET" && request.method !== "HEAD") throw new D1ApiError(405, "method_not_allowed");
      const record = await env.APP_DB.prepare("SELECT bytes, etag, sha256 FROM _private_project_files WHERE sha256=? LIMIT 1")
        .bind(digest).first<FileRecord>();
      if (!record) throw new D1ApiError(404, "not_found");
      const key = `private-project-photo/${digest}`;
      const object = request.method === "HEAD" ? await env.PRIVATE_FILES.head(key) : await env.PRIVATE_FILES.get(key);
      if (!matchesManifest(object, record)) throw new D1ApiError(503, "storage_unavailable");
      const body = request.method === "HEAD" ? null : (object as SandboxObject).body;
      if (request.method === "GET" && !body) throw new D1ApiError(503, "storage_unavailable");
      return new Response(body, {
        headers: { ...privateHeaders, "content-type": "image/jpeg", "content-length": String(record.bytes), etag: `"${record.etag}"` },
      });
    } catch (error) {
      const status = error instanceof D1ApiError ? error.status : 503;
      return new Response(null, { status, headers: privateHeaders });
    }
  },
};
