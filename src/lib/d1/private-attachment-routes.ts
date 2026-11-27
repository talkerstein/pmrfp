import { getSession } from "@/lib/access/access";
import { readCertFile } from "@/lib/vendor-certs/server";
import { UUID } from "./contracts";
import { attachMemberFile, attachmentError, serveMemberFile } from "./private-attachments";
import { privateAttachmentHeaders, type AttachmentKind } from "./private-attachment-policy";
import { matchesCustomerOrigin } from "./staging-config";
import { checkStagingRateLimit, stagingClientIp } from "./staging-rate-limit";

export async function nativeAttachmentLimit(request: Request) {
  const limit = await checkStagingRateLimit("api-write", stagingClientIp(request.headers));
  return limit.status === 204 ? null : Response.json({ error: "upload" }, {
    status: limit.status,
    headers: { ...privateAttachmentHeaders, ...(limit.status === 429 && { "retry-after": String(limit.retry) }) },
  });
}

export async function uploadPrivateAttachment(request: Request, kind: AttachmentKind) {
  if (!matchesCustomerOrigin(request)) return Response.json({ error: "upload" }, { status: 403 });
  const limited = await nativeAttachmentLimit(request);
  if (limited) return limited;
  const session = await getSession();
  if (!session) return Response.json({ error: "signIn" }, { status: 401 });
  const form = await request.formData().catch(() => null);
  if (!form) return Response.json({ error: "upload" }, { status: 400 });
  const id = String(form.get("id") ?? "");
  if (!UUID.test(id)) return Response.json({ error: "notFound" }, { status: 404 });
  const file = await readCertFile(form.get("file"));
  if (!file.ok) return Response.json({ error: file.error }, { status: file.error === "tooBig" ? 413 : 415 });
  try {
    await attachMemberFile(kind, id, session, file);
    return Response.json({ ok: true, name: file.name }, { headers: privateAttachmentHeaders });
  } catch (error) {
    return attachmentError(error, "upload");
  }
}

export async function downloadPrivateAttachment(request: Request, kind: AttachmentKind) {
  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!UUID.test(id)) return Response.json({ error: "notFound" }, { status: 404 });
  const session = await getSession();
  if (!session) return Response.json({ error: "signIn" }, { status: 401 });
  try {
    return await serveMemberFile(kind, id, session, request.method === "HEAD");
  } catch (error) {
    return attachmentError(error);
  }
}
