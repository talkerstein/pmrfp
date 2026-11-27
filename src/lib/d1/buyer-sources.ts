import { randomUUID } from "node:crypto";
import { approvalPermissionRow, toRequestRow, type BuyerSourceRequestInput, type Decision } from "@/lib/buyers/source-requests";
import { seedRefused } from "@/lib/buyers/permissions";
import { customerAppAuthority } from "../../../workers/d1-api/customer-signup";
import { D1ApiError, type D1Binding } from "./contracts";
import { activeRequestAdmin } from "./customer-requests";
import { vpsAppDatabase } from "./http-binding";

const adminScope = `${customerAppAuthority} AND ${activeRequestAdmin}`;

export async function recordVpsBuyerSourceRequest(
  input: BuyerSourceRequestInput, methodLabel: string, db: D1Binding = vpsAppDatabase(),
): Promise<void> {
  const row = toRequestRow(input);
  const [request, notifications] = await db.batch([
    db.prepare(`INSERT INTO buyer_source_requests
      (id,organization,contact_name,work_email,tenders_url,method,feed_url,province_code,country,buyer_slug,authorized,lang,status)
      SELECT ?,?,?,?,?,?,?,?,?,?,?,?,? WHERE ${customerAppAuthority}`)
      .bind(randomUUID(), row.organization, row.contact_name, row.work_email, row.tenders_url, row.method, row.feed_url,
        row.province_code, row.country, row.buyer_slug, Number(row.authorized), row.lang, row.status),
    db.prepare(`INSERT INTO notifications(id,user_id,type,title,message,link_url)
      SELECT lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-a'||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6))),
        id,'buyer_source_request','A public buyer wants to list its tenders',?,'/admin/buyer-sources'
      FROM users_profile WHERE changes()=1 AND status='active' AND primary_role IN ('admin','super_admin') ORDER BY id LIMIT 50`)
      .bind(`${row.organization.slice(0, 120)} asked to list its tenders on PMRFP (${methodLabel}). Review it before anything is imported.`),
  ]);
  if (!request?.success || request.meta.changes !== 1 || !notifications?.success) {
    throw new D1ApiError(503, "buyer_source_requests_unavailable");
  }
}

export async function vpsBuyerReviewCounts(db: D1Binding = vpsAppDatabase()) {
  const row = await db.prepare(`SELECT (SELECT count(*) FROM buyer_claims WHERE status='pending') AS claims,
    (SELECT count(*) FROM buyer_source_requests WHERE status='new') AS requests
    WHERE ${customerAppAuthority}`).first<{ claims: number; requests: number }>();
  return row ?? { claims: 0, requests: 0 };
}

interface ReviewRequest {
  id: string;
  organization: string;
  contact_name: string;
  work_email: string;
  province_code: string;
  feed_url: string | null;
  status: string;
}

export interface BuyerSourceReviewRow extends ReviewRequest {
  tenders_url: string;
  method: string;
  buyer_slug: string | null;
  lang: string;
  admin_notes: string | null;
  decided_at: string | null;
  created_at: string;
}

export async function listVpsBuyerSourceRequests(adminId: string, showAll: boolean, db: D1Binding = vpsAppDatabase()) {
  const response = await db.prepare(`SELECT id,organization,contact_name,work_email,tenders_url,method,feed_url,
    province_code,buyer_slug,lang,status,admin_notes,decided_at,created_at FROM buyer_source_requests
    WHERE ${adminScope} AND (?=1 OR status='new') ORDER BY created_at DESC LIMIT 300`)
    .bind(adminId, Number(showAll)).all<BuyerSourceReviewRow>();
  if (!response.success) throw new D1ApiError(503, "buyer_source_requests_unavailable");
  return response.results;
}

export async function decideVpsBuyerSource(
  decision: Decision, adminId: string, db: D1Binding = vpsAppDatabase(),
): Promise<"saved" | "approved" | "rejected" | "not_found" | "already_decided" | "refused" | "missing_feed"> {
  const request = await db.prepare(`SELECT id,organization,contact_name,work_email,province_code,feed_url,status
    FROM buyer_source_requests WHERE id=? AND ${adminScope}`)
    .bind(decision.id, adminId).first<ReviewRequest>();
  if (!request) return "not_found";
  const now = new Date().toISOString();
  if (decision.action === "note") {
    const result = await db.prepare(`UPDATE buyer_source_requests SET admin_notes=?,updated_at=?
      WHERE id=? AND ${adminScope}`).bind(decision.notes || null, now, decision.id, adminId).run();
    return result.meta.changes === 1 ? "saved" : "not_found";
  }
  if (request.status !== "new") return "already_decided";
  if (decision.action === "approve") {
    if (seedRefused(decision.buyerSlug)) return "refused";
    if (decision.method === "feed" && !request.feed_url) return "missing_feed";
  }
  const status = decision.action === "approve" ? "approved" : "rejected";
  const statements = [
    db.prepare(`UPDATE buyer_source_requests SET status=?,admin_notes=?,decided_by=?,decided_at=?,updated_at=?
      WHERE id=? AND status='new' AND ${adminScope}`)
      .bind(status, decision.notes || null, adminId, now, now, decision.id, adminId),
    db.prepare(`INSERT INTO audit_logs(id,actor_user_id,action,entity_type,entity_id,metadata)
      SELECT ?,?,?,'buyer_source_requests',?,? WHERE changes()=1`)
      .bind(randomUUID(), adminId, `buyer_source.${decision.action}`, decision.id,
        JSON.stringify(decision.action === "approve" ? { buyerSlug: decision.buyerSlug, method: decision.method } : {})),
  ];
  if (decision.action === "approve") {
    const permission = approvalPermissionRow(request, decision, now.slice(0, 10), adminId);
    statements.push(db.prepare(`INSERT INTO buyer_permissions
      (buyer_slug,buyer_name,province_code,country,scope,status,method,feed_url,granted_on,contact,reply_quote,notes,
       source_request_id,updated_by,updated_at)
      SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,? WHERE changes()=1
      ON CONFLICT(buyer_slug) DO UPDATE SET buyer_name=excluded.buyer_name,province_code=excluded.province_code,
        country=excluded.country,scope=excluded.scope,status=excluded.status,method=excluded.method,
        feed_url=excluded.feed_url,granted_on=excluded.granted_on,contact=excluded.contact,reply_quote=excluded.reply_quote,
        notes=excluded.notes,source_request_id=excluded.source_request_id,updated_by=excluded.updated_by,updated_at=excluded.updated_at`)
      .bind(permission.buyer_slug, permission.buyer_name, permission.province_code, permission.country, permission.scope,
        permission.status, permission.method, permission.feed_url, permission.granted_on,
        permission.contact.slice(0, 300), permission.reply_quote, permission.notes, decision.id, adminId, now));
  }
  const results = await db.batch(statements);
  if (results.length !== statements.length || results.some(result => !result.success)) {
    throw new D1ApiError(503, "buyer_source_decision_unavailable");
  }
  return results[0].meta.changes === 1 ? status : "already_decided";
}
