import { randomUUID } from "node:crypto";
import { orderedPair } from "@/lib/dedupe/review";
import { customerAppAuthority, UUID, type D1Binding } from "./contracts";
import { activeRequestAdmin } from "./customer-requests";
import { vpsAppDatabase, vpsDatabase } from "./http-binding";
import { nativeAuthAuthority } from "../../../workers/d1-api/customer-password-reset";

const appScope = `${customerAppAuthority} AND ${activeRequestAdmin}`;
const duplicateBan = "2126-01-01T00:00:00.000Z";

export async function recordVpsDuplicateReview(
  actor: string, kind: "account" | "company", x: string, y: string, status: "dismissed" | "disabled", note: string | null,
  db: D1Binding = vpsAppDatabase(),
) {
  if (!UUID.test(x) || !UUID.test(y) || x === y) return false;
  const [a, b] = orderedPair(x, y);
  const table = kind === "company" ? "organizations" : "users_profile";
  const [review, audit] = await db.batch([
    db.prepare(`INSERT INTO duplicate_reviews(id,kind,a_id,b_id,status,source,note,resolved_by,resolved_at)
      SELECT ?,?,?,?,?,'admin',?,?,? WHERE ${appScope} AND (SELECT count(*) FROM ${table} WHERE id IN (?,?))=2
      ON CONFLICT(kind,a_id,b_id) DO UPDATE SET status=excluded.status,source=excluded.source,note=coalesce(excluded.note,note),
        resolved_by=excluded.resolved_by,resolved_at=excluded.resolved_at WHERE duplicate_reviews.status IN ('open','dismissed','disabled')`)
      .bind(randomUUID(), kind, a, b, status, note, actor, new Date().toISOString(), actor, a, b),
    db.prepare(`INSERT INTO audit_logs(id,actor_user_id,action,entity_type,entity_id,metadata)
      SELECT ?,?,?,?, ?,? WHERE changes()=1`)
      .bind(randomUUID(), actor, status === "dismissed" ? "duplicate.dismiss" : "duplicate.disable",
        kind === "company" ? "organization" : "user", x, JSON.stringify({ kind, a, b })),
  ]);
  return review?.success && review.meta.changes === 1 && audit?.success;
}

type Result = { state: "updated" | "auth_incomplete"; email: string } | { state: "unavailable" | "other_ban" };

export async function setVpsDuplicateAccountStatus(
  actor: string, user: string, other: string | null, enable: boolean, app: D1Binding = vpsAppDatabase(), authDb?: D1Binding,
): Promise<Result> {
  if (!UUID.test(user) || user === actor) return { state: "unavailable" };
  const target = await app.prepare(`SELECT u.email,u.status,u.updated_at,
    ((SELECT action FROM audit_logs a WHERE a.entity_type='user' AND a.entity_id=u.id AND a.action IN ('user.disable_duplicate','user.enable')
      ORDER BY a.created_at DESC,a.id DESC LIMIT 1)='user.disable_duplicate') AS reviewed
    FROM users_profile u WHERE u.id=? AND u.primary_role NOT IN ('admin','super_admin') AND ${appScope}`)
    .bind(user, actor).first<{ email: string; status: string; reviewed: number | null; updated_at: string }>();
  if (!target || (target.status !== "active" && target.status !== "suspended") ||
    (target.status === "suspended" && target.reviewed !== 1)) return { state: "unavailable" };
  const now = new Date(Math.max(Date.now(), (Date.parse(target.updated_at) || 0) + 1)).toISOString();
  const auth = authDb ?? vpsDatabase("auth");
  if (enable) {
    if (target.status !== "suspended") return { state: "unavailable" };
    const userState = await auth.prepare(`SELECT banned,banExpires FROM user WHERE id=? AND ${nativeAuthAuthority}`)
      .bind(user).first<{ banned: number; banExpires: string | null }>();
    if (!userState) return { state: "unavailable" };
    if (userState.banned === 1 && userState.banExpires !== duplicateBan &&
      (!userState.banExpires || !(Date.parse(userState.banExpires) <= Date.parse(now)))) return { state: "other_ban" };
    const cleared = await auth.prepare(`UPDATE user SET banned=0,banExpires=NULL,updatedAt=? WHERE id=? AND ${nativeAuthAuthority}
      AND (banned=0 OR banExpires=? OR julianday(banExpires)<=julianday(?))`).bind(now, user, duplicateBan, now).run();
    if (!cleared.success || cleared.meta.changes !== 1) return { state: "unavailable" };
  }
  const writes = await app.batch([
    app.prepare(`UPDATE users_profile SET status=?,updated_at=? WHERE id=? AND status=? AND updated_at=?
      AND primary_role NOT IN ('admin','super_admin') AND ${appScope}`)
      .bind(enable ? "active" : "suspended", now, user, target.status, target.updated_at, actor),
    app.prepare(`INSERT INTO audit_logs(id,actor_user_id,action,entity_type,entity_id,metadata,created_at)
      SELECT ?,?,?,'user',?,?,? WHERE changes()=1`)
      .bind(randomUUID(), actor, enable ? "user.enable" : "user.disable_duplicate", user, JSON.stringify({
        email: target.email, duplicateOf: other && UUID.test(other) ? other : null, previousStatus: target.status,
      }), now),
  ]);
  if (writes.length !== 2 || writes.some(row => !row.success) || writes[0].meta.changes !== 1) return { state: "unavailable" };
  if (!enable) {
    const successfulBan = await auth.batch([
      auth.prepare(`SELECT CASE WHEN ${nativeAuthAuthority} AND EXISTS(SELECT 1 FROM user WHERE id=?) THEN 1
        ELSE json('account_ban_unavailable') END`).bind(user),
      auth.prepare(`UPDATE user SET banned=1,banExpires=?,updatedAt=? WHERE id=? AND
        (banned=0 OR banExpires=? OR julianday(banExpires)<=julianday(?))`).bind(duplicateBan, now, user, duplicateBan, now),
      auth.prepare("DELETE FROM session WHERE userId=?").bind(user),
    ]).then(result => result.length === 3 && result.every(row => row.success)).catch(() => false);
    if (other && UUID.test(other) && other !== user) {
      await recordVpsDuplicateReview(actor, "account", user, other, "disabled", null, app).catch(() => false);
    }
    if (!successfulBan) return { state: "auth_incomplete", email: target.email };
  }
  return { state: "updated", email: target.email };
}
