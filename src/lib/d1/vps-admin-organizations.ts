import { randomUUID } from "node:crypto";
import type { OrganizationReviewCounts } from "@/lib/organizations/review-server";
import { D1ApiError, UUID, customerAppAuthority, type D1Binding, type D1Statement } from "./contracts";
import { activeRequestAdmin } from "./customer-requests";
import { vpsAppDatabase } from "./http-binding";

const adminScope = `${customerAppAuthority} AND ${activeRequestAdmin}`;

type Decision = "approved" | "rejected" | "suspended";
type Action =
  | { kind: "review"; decision: Exclude<Decision, "suspended"> }
  | { kind: "held"; decision: Decision }
  | { kind: "clear"; seen: string }
  | { kind: "suspend" | "reinstate" }
  | { kind: "trust"; trusted: boolean };

type Changed = { state: "changed"; slug: string; approved: boolean } | { state: "unavailable" | "stale" };

export async function nativeOrganizationReviewCounts(adminId: string, db: D1Binding = vpsAppDatabase()): Promise<OrganizationReviewCounts> {
  const row = await db.prepare(`SELECT count(*) FILTER(WHERE profile_status='pending_review') AS waiting,
    count(*) FILTER(WHERE profile_status='approved' AND review_flagged_at IS NOT NULL) AS edited,
    count(*) FILTER(WHERE profile_status='approved' AND risk_flagged=1) AS held
    FROM organizations WHERE status<>'deleted' AND is_demo=0 AND ${adminScope}`).bind(adminId).first<OrganizationReviewCounts>();
  return row ?? { waiting: 0, edited: 0, held: 0 };
}

export async function changeVpsOrganization(
  adminId: string, id: string, action: Action, db: D1Binding = vpsAppDatabase(),
): Promise<Changed> {
  if (!UUID.test(id)) return { state: "unavailable" };
  const row = await db.prepare(`SELECT slug,updated_at,profile_status,risk_flagged,review_flagged_at,review_changes FROM organizations
    WHERE id=? AND status<>'deleted' AND is_demo=0 AND ${adminScope}`).bind(id, adminId).first<{
      slug: string; updated_at: string; profile_status: string; risk_flagged: number; review_flagged_at: string | null; review_changes: string | null;
    }>();
  if (!row) return { state: "unavailable" };
  const now = new Date(Math.max(Date.now(), (Date.parse(row.updated_at) || 0) + 1)).toISOString();
  const guard = `id=? AND updated_at=? AND status<>'deleted' AND is_demo=0 AND ${adminScope}`;
  const end = [now, id, row.updated_at, adminId];
  let change: D1Statement;
  let event: string;
  let metadata: object = {};
  let riskDecision: Decision | null = null;
  let sendApproval = false;
  switch (action.kind) {
    case "held":
    case "review": {
      const state = action.kind === "held" ? "risk_flagged=1" : "profile_status='pending_review'";
      const { decision } = action;
      riskDecision = decision;
      sendApproval = decision === "approved" && row.profile_status !== "approved";
      event = action.kind === "held" ? `organization.spam_${decision}` : `organization.${decision}`;
      change = db.prepare(`UPDATE organizations SET profile_status=?,
        approved_at=CASE WHEN ?='approved' THEN coalesce(approved_at,?) ELSE approved_at END,
        risk_flagged=CASE WHEN ?='approved' THEN 0 ELSE risk_flagged END,updated_at=?
        WHERE ${guard} AND ${state}`).bind(decision, decision, now, decision, ...end);
      break;
    }
    case "clear":
      if (!row.review_flagged_at) return { state: "unavailable" };
      if (action.seen && action.seen !== row.updated_at) return { state: "stale" };
      change = db.prepare(`UPDATE organizations SET review_flagged_at=NULL,review_changes=NULL,updated_at=?
        WHERE ${guard} AND profile_status='approved' AND review_flagged_at IS NOT NULL`).bind(...end);
      event = "organization.review_cleared";
      metadata = { changes: row.review_changes ? JSON.parse(row.review_changes) : null };
      break;
    case "suspend":
      change = db.prepare(`UPDATE organizations SET profile_status='suspended',review_flagged_at=NULL,review_changes=NULL,updated_at=?
        WHERE ${guard} AND profile_status='approved'`).bind(...end);
      event = "organization.suspended";
      metadata = { changes: row.review_changes ? JSON.parse(row.review_changes) : null };
      break;
    case "reinstate":
      change = db.prepare(`UPDATE organizations SET profile_status='approved',approved_at=coalesce(approved_at,?),updated_at=?
        WHERE ${guard} AND profile_status='suspended'`).bind(now, ...end);
      event = "organization.reinstated";
      break;
    case "trust":
      change = db.prepare(`UPDATE organizations SET link_trusted=?,link_earned_at=CASE WHEN ? THEN link_earned_at ELSE NULL END,updated_at=?
        WHERE ${guard}`).bind(Number(action.trusted), Number(action.trusted), ...end);
      event = action.trusted ? "organization.link_trusted" : "organization.link_untrusted";
      break;
  }
  const writes = [
    change,
    db.prepare(`INSERT INTO audit_logs(id,actor_user_id,action,entity_type,entity_id,metadata)
      SELECT ?,?,?,'organization',?,? WHERE changes()=1`).bind(randomUUID(), adminId, event, id, JSON.stringify(metadata)),
  ];
  if (riskDecision) writes.push(db.prepare(`UPDATE organization_risk SET decision=?,decided_by=?,decided_at=?,held=0
    WHERE organization_id=? AND changes()=1`).bind(riskDecision, adminId, now, id));
  const results = await db.batch(writes);
  if (results.length !== writes.length || results.some(result => !result.success)) throw new D1ApiError(503, "organization_change_unavailable");
  if (results[0].meta.changes !== 1) return { state: action.kind === "clear" ? "stale" : "unavailable" };
  return { state: "changed", slug: row.slug, approved: sendApproval };
}

export async function changeVpsBlockedDomain(
  adminId: string, domain: string, change: { reason: string | null } | "remove", db: D1Binding = vpsAppDatabase(),
) {
  const add = change !== "remove";
  const write = add
    ? db.prepare(`INSERT INTO blocked_domains(domain,reason,created_by) SELECT ?,?,? WHERE ${adminScope}
       ON CONFLICT(domain) DO UPDATE SET reason=excluded.reason,created_by=excluded.created_by`)
      .bind(domain, change.reason, adminId, adminId)
    : db.prepare(`DELETE FROM blocked_domains WHERE domain=? AND ${adminScope}`).bind(domain, adminId);
  const results = await db.batch([
    write,
    db.prepare(`INSERT INTO audit_logs(id,actor_user_id,action,entity_type,metadata)
      SELECT ?,?,?,'blocked_domain',? WHERE changes()=1`).bind(randomUUID(), adminId, add ? "blocked_domain.added" : "blocked_domain.removed",
      JSON.stringify(add ? { domain, reason: change.reason } : { domain })),
  ]);
  return results.length === 2 && results.every(r => r.success) && results[0].meta.changes === 1;
}
