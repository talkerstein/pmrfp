import { D1ApiError, UUID, type D1Binding } from "../../src/lib/d1/contracts";
import { attachmentTables, privateAttachmentHeaders, type AttachmentKind } from "../../src/lib/d1/private-attachment-policy";
import type { SandboxBucket, SandboxObject } from "../d1-api/project-photos";

export async function privateAttachment(request: Request, db: D1Binding, bucket: SandboxBucket & {
  delete?(key: string): Promise<void>;
}, id: string) {
  if (!UUID.test(id)) throw new D1ApiError(404, "not_found");
  const key = "private-attachments/" + id;
  const record = await db.prepare(`SELECT kind,record_id,organization_id,mime,bytes,sha256,created_at
    FROM _private_attachments WHERE id=?`).bind(id).first<{
    kind: AttachmentKind; record_id: string; organization_id: string; mime: string; bytes: number; sha256: string; created_at: number;
  }>();
  if (!record || !Object.hasOwn(attachmentTables, record.kind)) throw new D1ApiError(404, "not_found");
  const linked = await db.prepare(`SELECT 1 AS linked FROM ${attachmentTables[record.kind]}
    WHERE id=? AND organization_id=? AND file_path=?`).bind(record.record_id, record.organization_id, key).first();

  if (request.method === "PUT") {
    if (linked || record.created_at <= Date.now() - 15 * 60_000) throw new D1ApiError(404, "not_found");
    if (!bucket.put || !request.body || request.headers.get("content-type") !== record.mime) {
      throw new D1ApiError(415, "unsupported_attachment");
    }
    const data = new Uint8Array(record.bytes);
    const reader = request.body.getReader();
    let length = 0;
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      if (length + value.length > data.length) {
        await reader.cancel();
        throw new D1ApiError(413, "file_too_large");
      }
      data.set(value, length);
      length += value.length;
    }
    const hash = await crypto.subtle.digest("SHA-256", data);
    const digest = Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, "0")).join("");
    if (length !== record.bytes || digest !== record.sha256) throw new D1ApiError(400, "invalid_attachment");
    await bucket.put(key, data.buffer, { httpMetadata: { contentType: record.mime }, customMetadata: { sha256: digest } });
    return new Response(null, { status: 204, headers: privateAttachmentHeaders });
  }

  if (request.method === "DELETE") {
    if (linked || !bucket.delete) throw new D1ApiError(409, "attachment_in_use");
    await bucket.delete(key);
    await db.prepare("DELETE FROM _private_attachments WHERE id=?").bind(id).run();
    return new Response(null, { status: 204, headers: privateAttachmentHeaders });
  }

  if (request.method !== "GET" && request.method !== "HEAD") throw new D1ApiError(405, "method_not_allowed");
  if (!linked) throw new D1ApiError(404, "not_found");
  const object = request.method === "HEAD" ? await bucket.head(key) : await bucket.get(key);
  if (!object || object.size !== record.bytes || object.httpMetadata?.contentType !== record.mime ||
      object.customMetadata?.sha256 !== record.sha256) throw new D1ApiError(503, "storage_unavailable");
  const body = request.method === "HEAD" ? null : (object as SandboxObject).body;
  if (request.method === "GET" && !body) throw new D1ApiError(503, "storage_unavailable");
  return new Response(body, { headers: {
    ...privateAttachmentHeaders, "content-type": record.mime, "content-length": String(record.bytes),
  } });
}
