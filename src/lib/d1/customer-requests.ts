import { randomUUID } from "node:crypto";
import { customerAppAuthority } from "../../../workers/d1-api/customer-signup";
import { D1ApiError, type D1Binding } from "./contracts";
import { vpsAppDatabase } from "./http-binding";
import type { toCorrectionRow } from "@/lib/corrections/rules";
import type { ContactRequestInput } from "@/lib/validations";

export const activeRequestAdmin = `EXISTS (SELECT 1 FROM users_profile
  WHERE id=? AND status='active' AND primary_role IN ('admin','super_admin'))`;

export async function recordContactRequest(input: ContactRequestInput, db: D1Binding = vpsAppDatabase()) {
  const row = await db.prepare(`INSERT INTO contact_requests
    (id,request_type,requester_name,requester_email,requester_phone,requester_organization,target_organization_id,message)
    SELECT ?,?,?,?,?,?,(SELECT id FROM organizations WHERE slug=? AND status='active' AND profile_status='approved' AND is_demo=0),?
    WHERE ${customerAppAuthority} RETURNING id`).bind(randomUUID(),input.requestType,input.name,input.email,
    input.phone ?? null,input.organization ?? null,input.targetOrganizationId ?? null,input.message).first();
  if (!row) throw new D1ApiError(503,"contact_requests_unavailable");
}

export async function recordCorrectionRequest(input: ReturnType<typeof toCorrectionRow>, db: D1Binding = vpsAppDatabase()) {
  const row = await db.prepare(`INSERT INTO correction_requests
    (id,page_kind,page_path,page_ref,reason,details,contact_email,contact_name,lang,reporter_user_id)
    SELECT ?,?,?,?,?,?,?,?,?,(SELECT id FROM users_profile WHERE id=? AND status='active')
    WHERE ${customerAppAuthority} RETURNING id`).bind(randomUUID(),input.page_kind,input.page_path,input.page_ref,
    input.reason,input.details,input.contact_email,input.contact_name,input.lang,input.reporter_user_id).first();
  if (!row) throw new D1ApiError(503,"correction_requests_unavailable");
}

export async function resolveCorrectionRequest(input: {
  id: string; status: string; resolution: string | null; final: boolean; actor: string; now: string;
}, db: D1Binding = vpsAppDatabase()) {
  const [write] = await db.batch([
    db.prepare(`UPDATE correction_requests SET status=?,resolution=?,resolved_at=?,resolved_by=?,updated_at=?
      WHERE id=? AND ${customerAppAuthority} AND ${activeRequestAdmin}`)
      .bind(input.status,input.resolution,input.final ? input.now : null,input.final ? input.actor : null,input.now,input.id,input.actor),
    db.prepare(`INSERT INTO audit_logs(id,actor_user_id,action,entity_type,entity_id,metadata)
      SELECT ?,?,'correction.update','correction_requests',?,? WHERE changes()=1`)
      .bind(randomUUID(),input.actor,input.id,JSON.stringify({ status: input.status })),
  ]);
  return write.meta.changes === 1;
}
