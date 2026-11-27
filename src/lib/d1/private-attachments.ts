import { createHash, randomUUID } from "node:crypto";
import type { SessionContext } from "@/lib/access/access";
import { cleanFileName } from "@/lib/vendor-certs/rules";
import type { FileCheck } from "@/lib/vendor-certs/server";
import { D1ApiError, UUID, type D1Binding } from "./contracts";
import { vpsAppDatabase } from "./http-binding";
import { attachmentTables, privateAttachmentHeaders, type AttachmentKind } from "./private-attachment-policy";

const origin = "https://pmrfp-private-project-files.pmrfp.workers.dev";
const keyPattern = /^private-attachments\/([a-f0-9-]{36})$/;
const member = `EXISTS (SELECT 1 FROM organization_members m
  JOIN users_profile u ON u.id=m.user_id JOIN organizations o ON o.id=m.organization_id
  WHERE m.organization_id=r.organization_id AND u.id=? AND u.status='active' AND o.status<>'suspended')`;
const nativeAdmin = `EXISTS (SELECT 1 FROM users_profile u WHERE u.id=?
  AND u.status='active' AND u.primary_role IN ('admin','super_admin'))`;

type Attachment = Extract<FileCheck, { ok: true }>;
type RecordRow = { id: string; organization_id: string; file_path: string | null; file_name: string | null };
type Authorize = { sql: string; params: string[] };

function memberAccess(session: SessionContext, read: boolean): Authorize {
  return read ? { sql: `(${member} OR ${nativeAdmin})`, params: [session.userId, session.userId] }
    : { sql: member, params: [session.userId] };
}

async function attachmentCall(id: string, method: "GET" | "HEAD" | "PUT" | "DELETE", fetcher: typeof fetch, file?: Attachment) {
  const secret = process.env.PMRFP_PRIVATE_R2_GATEWAY_KEY;
  if (!secret || !/^[a-f0-9]{64}$/.test(secret)) throw new D1ApiError(503, "storage_unavailable");
  return fetcher(`${origin}/v1/private-attachments/${id}`, {
    method, headers: { "x-pmrfp-gateway-key": secret, ...(file && { "content-type": file.mime }) },
    body: file ? new Uint8Array(file.data) : undefined,
    cache: "no-store", redirect: "error", signal: AbortSignal.timeout(12_000),
  });
}

export async function discardUnlinkedAttachment(path: string | null, fetcher = fetch) {
  const id = keyPattern.exec(path ?? "")?.[1];
  if (id && UUID.test(id)) await attachmentCall(id, "DELETE", fetcher).catch(() => null);
}

async function attach(
  kind: AttachmentKind, recordId: string, file: Attachment, access: Authorize,
  update: { assignments: string; values: (string | number | null)[] },
  db: D1Binding, fetcher: typeof fetch,
) {
  if (!UUID.test(recordId)) throw new D1ApiError(404, "notFound");
  const table = attachmentTables[kind];
  const record = await db.prepare(`SELECT id,organization_id,file_path FROM ${table} r WHERE id=? AND ${access.sql}`)
    .bind(recordId, ...access.params).first<RecordRow>();
  if (!record) throw new D1ApiError(404, "notFound");

  const id = randomUUID();
  const path = "private-attachments/" + id;
  const digest = createHash("sha256").update(file.data).digest("hex");
  const now = new Date();
  const reservation = await db.prepare(`INSERT INTO _private_attachments
    (id,kind,record_id,organization_id,mime,bytes,sha256,created_at)
    SELECT ?,?,r.id,r.organization_id,?,?,?,? FROM ${table} r
    WHERE r.id=? AND r.organization_id=? AND r.file_path IS ? AND ${access.sql}`)
    .bind(id, kind, file.mime, file.data.length, digest, now.getTime(), recordId, record.organization_id, record.file_path, ...access.params).run();
  if (reservation.meta.changes !== 1) throw new D1ApiError(409, "upload");

  try {
    const put = await attachmentCall(id, "PUT", fetcher, file);
    if (put.status !== 204) throw new D1ApiError(502, "upload");
  } catch {
    await attachmentCall(id, "DELETE", fetcher).catch(() => null);
    throw new D1ApiError(502, "upload");
  }

  // Recheck permissions and the previous version at commit. Unlinked objects
  // are inaccessible even if a timeout leaves their bytes in storage.
  const linked = await db.prepare(`UPDATE ${table} AS r SET file_path=?,file_name=?,file_uploaded_at=?,updated_at=?${update.assignments}
    WHERE id=? AND organization_id=? AND file_path IS ? AND ${access.sql}`)
    .bind(path, file.name, now.toISOString(), now.toISOString(), ...update.values, recordId, record.organization_id, record.file_path, ...access.params).run();
  if (linked.meta.changes !== 1) {
    await attachmentCall(id, "DELETE", fetcher).catch(() => null);
    throw new D1ApiError(409, "upload");
  }
  await discardUnlinkedAttachment(record.file_path, fetcher);
}

export function attachMemberFile(kind: AttachmentKind, recordId: string, session: SessionContext, file: Attachment,
  db: D1Binding = vpsAppDatabase(), fetcher = fetch) {
  const update = kind === "certificate" ? { assignments: ", uploaded_by='pm'", values: [] } : { assignments: "", values: [] };
  return attach(kind, recordId, file, memberAccess(session, false), update, db, fetcher);
}

export function attachVendorFile(recordId: string, hash: string, file: Attachment, values: {
  insurer: string | null; policy_number: string | null; coverage_amount: number | null; expires_on: string;
}, db: D1Binding = vpsAppDatabase(), fetcher = fetch) {
  return attach("certificate", recordId, file, {
    sql: `r.request_token_hash=? AND julianday(r.request_expires_at)>julianday('now')
      AND EXISTS (SELECT 1 FROM organizations WHERE id=r.organization_id AND status<>'suspended')`,
    params: [hash],
  }, {
    assignments: `, uploaded_by='vendor', insurer=?,policy_number=?,coverage_amount=?,expires_on=?,
      request_token_hash=NULL,request_expires_at=NULL,reminder_stage=NULL,reminder_for=NULL,vendor_reminded_stage=NULL`,
    values: [values.insurer, values.policy_number, values.coverage_amount, values.expires_on],
  }, db, fetcher);
}

export async function serveMemberFile(kind: AttachmentKind, recordId: string, session: SessionContext, head: boolean,
  db: D1Binding = vpsAppDatabase(), fetcher = fetch) {
  const access = memberAccess(session, true);
  const table = attachmentTables[kind];
  const record = await db.prepare(`SELECT r.file_path,r.file_name,a.mime,a.bytes FROM ${table} r
    JOIN _private_attachments a ON a.kind=? AND a.record_id=r.id AND a.organization_id=r.organization_id
      AND r.file_path='private-attachments/'||a.id WHERE r.id=? AND ${access.sql}`)
    .bind(kind, recordId, ...access.params).first<RecordRow & { mime: string; bytes: number }>();
  const match = keyPattern.exec(record?.file_path ?? "");
  if (!record || !match || !UUID.test(match[1])) throw new D1ApiError(404, "notFound");
  const upstream = await attachmentCall(match[1], head ? "HEAD" : "GET", fetcher);
  if (!upstream.ok || (!head && !upstream.body) || upstream.headers.get("content-type") !== record.mime ||
      Number(upstream.headers.get("content-length")) !== record.bytes) {
    await upstream.body?.cancel();
    throw new D1ApiError(upstream.status === 404 ? 404 : 503, upstream.status === 404 ? "notFound" : "unavailable");
  }
  const filename = cleanFileName(record.file_name) ?? "attachment";
  return new Response(head ? null : upstream.body, { headers: {
    ...privateAttachmentHeaders, "content-type": record.mime, "content-length": String(record.bytes),
    "content-disposition": `attachment; filename="${filename}"`,
  } });
}

export function attachmentError(error: unknown, fallback = "unavailable") {
  return Response.json({ error: error instanceof D1ApiError && error.status < 500 ? error.code : fallback }, {
    status: error instanceof D1ApiError ? error.status : 503,
    headers: privateAttachmentHeaders,
  });
}
