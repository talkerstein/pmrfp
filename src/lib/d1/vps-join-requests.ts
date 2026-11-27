import type { CreateJoinResult, DecideJoinResult } from "../dedupe/join";
import { customerAppAuthority } from "../../../workers/d1-api/customer-signup";
import { D1ApiError, type D1Binding } from "./contracts";
import { vpsAppDatabase } from "./http-binding";

const active = "EXISTS(SELECT 1 FROM users_profile actor WHERE actor.id=? AND actor.status='active')";
const admin = "EXISTS(SELECT 1 FROM users_profile actor WHERE actor.id=? AND actor.status='active' AND actor.primary_role IN ('admin','super_admin'))";
const manages = `EXISTS(SELECT 1 FROM organization_members m JOIN users_profile actor ON actor.id=m.user_id
  WHERE m.organization_id=j.organization_id AND m.user_id=? AND m.role IN ('owner','admin') AND actor.status='active')`;

export async function readVpsPendingJoin(userId: string, db: D1Binding = vpsAppDatabase()) {
  return db.prepare(`SELECT j.id, j.organization_id AS organizationId, o.name AS companyName, o.slug
    FROM organization_join_requests j JOIN organizations o ON o.id=j.organization_id
    WHERE ${customerAppAuthority} AND j.user_id=? AND j.status='pending' AND ${active}
    ORDER BY j.created_at DESC,j.id LIMIT 1`).bind(userId, userId)
    .first<{ id: string; organizationId: string; companyName: string; slug: string | null }>();
}

export async function listVpsJoinRequests(org: string, actor: string, db: D1Binding = vpsAppDatabase()) {
  const me = await db.prepare(`SELECT 1 AS allowed FROM organizations j
    WHERE j.id=? AND ${customerAppAuthority} AND EXISTS(SELECT 1 FROM organization_members m
      JOIN users_profile actor ON actor.id=m.user_id WHERE m.organization_id=j.id AND m.user_id=?
        AND m.role IN ('owner','admin') AND actor.status='active')`).bind(org, actor).first();
  if (!me) return null;
  const { results } = await db.prepare(`SELECT j.id,j.created_at,p.full_name,p.email
    FROM organization_join_requests j JOIN users_profile p ON p.id=j.user_id
    WHERE ${customerAppAuthority} AND j.organization_id=? AND j.status='pending' AND ${manages}
    ORDER BY j.created_at,j.id LIMIT 20`).bind(org, actor)
    .all<{ id: string; created_at: string; full_name: string | null; email: string }>();
  return results.map(({ id, created_at, full_name, email }) => ({ id, created_at, users_profile: { full_name, email } }));
}

export async function createVpsJoinRequest(input: { organizationId: string; userId: string; reasons: string[] },
  db: D1Binding = vpsAppDatabase()): Promise<CreateJoinResult> {
  const { organizationId: org, userId: actor } = input;
  const check = await db.prepare(`SELECT EXISTS(SELECT 1 FROM organizations WHERE id=? AND status='active' AND is_demo=0) AS company,
    EXISTS(SELECT 1 FROM organization_members WHERE organization_id=? AND user_id=?) AS member,
    EXISTS(SELECT 1 FROM organization_join_requests WHERE organization_id=? AND user_id=? AND status='pending') AS pending
    WHERE ${customerAppAuthority} AND ${active}`).bind(org, org, actor, org, actor, actor)
    .first<{ company: number; member: number; pending: number }>();
  if (!check) return { ok: false, reason: "failed" };
  if (!check.company) return { ok: false, reason: "no_company" };
  if (check.member) return { ok: false, reason: "already_member" };
  if (check.pending) return { ok: false, reason: "already_pending" };
  const id = crypto.randomUUID();
  const reasons = JSON.stringify(input.reasons.slice(0, 5));
  const [gate, inserted, notified, recorded] = await db.batch<{ user_id: string }>([
    db.prepare(`SELECT CASE WHEN ${customerAppAuthority} AND ${active} AND
      EXISTS(SELECT 1 FROM organizations WHERE id=? AND status='active' AND is_demo=0) AND
      NOT EXISTS(SELECT 1 FROM organization_members WHERE organization_id=? AND user_id=?)
      THEN 1 ELSE json('join_unavailable') END`).bind(actor, org, org, actor),
    db.prepare(`INSERT INTO organization_join_requests(id,organization_id,user_id,match_reasons)
      VALUES(?,?,?,?) ON CONFLICT(organization_id,user_id) WHERE status='pending' DO NOTHING RETURNING user_id`).bind(id, org, actor, reasons),
    db.prepare(`INSERT INTO notifications(id,user_id,type,title,message,link_url)
      SELECT lower(hex(randomblob(16))),m.user_id,'join_request','Someone asked to join your company',
        'A new PMRFP member asked to join '||o.name||'. Approve or decline it from your dashboard.','/dashboard'
      FROM organization_join_requests j JOIN organizations o ON o.id=j.organization_id
        JOIN organization_members m ON m.organization_id=o.id WHERE j.id=? AND m.role IN ('owner','admin')
      RETURNING user_id`).bind(id),
    db.prepare(`INSERT INTO audit_logs(id,actor_user_id,action,entity_type,entity_id,metadata)
      SELECT ?,?,'organization.join_requested','organization',organization_id,
        json_object('requestId',id,'reasons',json(match_reasons),'approvers',
          (SELECT count(*) FROM organization_members WHERE organization_id=j.organization_id AND role IN ('owner','admin')))
      FROM organization_join_requests j WHERE j.id=?`).bind(crypto.randomUUID(), actor, id),
  ]);
  if (![gate, inserted, notified, recorded].every(row => row?.success)) return { ok: false, reason: "failed" };
  return inserted.results.length ? { ok: true, id, approvers: notified.results.map(row => row.user_id) }
    : { ok: false, reason: "already_pending" };
}

export async function cancelVpsJoinRequest(id: string, actor: string, db: D1Binding = vpsAppDatabase()) {
  return Boolean(await db.prepare(`UPDATE organization_join_requests SET status='cancelled',decided_by=?,decided_at=?
    WHERE id=? AND user_id=? AND status='pending' AND ${customerAppAuthority} AND ${active}
    RETURNING id`).bind(actor, new Date().toISOString(), id, actor, actor).first());
}

export async function decideVpsJoinRequest(id: string, actor: string, approve: boolean,
  db: D1Binding = vpsAppDatabase()): Promise<DecideJoinResult> {
  const req = await db.prepare(`SELECT j.organization_id,j.user_id,j.status,${admin} AS asAdmin, ${manages} AS manages
    FROM organization_join_requests j WHERE j.id=? AND ${customerAppAuthority}`).bind(actor, actor, id)
    .first<{ organization_id: string; user_id: string; status: string; asAdmin: number; manages: number }>();
  if (!req) return { ok: false, reason: "not_found" };
  if (req.status !== "pending") return { ok: false, reason: "not_pending" };
  if (!req.asAdmin && !req.manages) return { ok: false, reason: "forbidden" };
  const status = approve ? "approved" : "declined";
  const when = new Date().toISOString();
  const writes = [
    db.prepare(`SELECT CASE WHEN ${customerAppAuthority} AND EXISTS(SELECT 1 FROM organization_join_requests j
      JOIN organizations o ON o.id=j.organization_id JOIN users_profile applicant ON applicant.id=j.user_id
      WHERE j.id=? AND j.status='pending' AND o.status='active' AND applicant.status='active' AND (${admin} OR ${manages}))
      THEN 1 ELSE json('join_request_changed') END`).bind(id, actor, actor),
    db.prepare("UPDATE organization_join_requests SET status=?,decided_by=?,decided_at=? WHERE id=?").bind(status, actor, when, id),
  ];
  if (approve) {
    writes.push(
      db.prepare(`INSERT INTO organization_members(id,organization_id,user_id,role) VALUES(?,?,?,'member')
        ON CONFLICT(organization_id,user_id) DO NOTHING`).bind(crypto.randomUUID(), req.organization_id, req.user_id),
      db.prepare("UPDATE users_profile SET onboarding_completed=1,updated_at=? WHERE id=?").bind(when, req.user_id),
    );
  }
  writes.push(
    db.prepare(`INSERT INTO notifications(id,user_id,type,title,message,link_url) VALUES(?,?,'join_request',?,?,?)`)
      .bind(crypto.randomUUID(), req.user_id, approve ? "You've been added to your company" : "Your request to join was declined",
        approve ? "Your request to join was approved. Your company's listing is now in your dashboard."
          : "The company declined your request. You can create your own listing from onboarding.", approve ? "/dashboard" : "/onboarding"),
    db.prepare(`INSERT INTO audit_logs(id,actor_user_id,action,entity_type,entity_id,metadata)
      VALUES(?,?,?,'organization_join_request',?,?)`).bind(crypto.randomUUID(), actor,
        approve ? "organization.join_approved" : "organization.join_declined", id, JSON.stringify({ asAdmin: req.asAdmin === 1 })),
  );
  const results = await db.batch(writes);
  if (results.length !== writes.length || results.some(row => !row.success)) throw new D1ApiError(503, "join_unavailable");
  return { ok: true, status };
}
