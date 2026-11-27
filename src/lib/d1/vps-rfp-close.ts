import "server-only";
import { D1ApiError, UUID, type D1Binding } from "./contracts";
import { vpsAppDatabase } from "./http-binding";
import { customerAppAuthority } from "../../../workers/d1-api/customer-signup";

const canClose = `EXISTS (SELECT 1 FROM users_profile actor WHERE actor.id=? AND actor.status='active'
  AND (actor.primary_role IN ('admin','super_admin') OR actor.id=rfp_posts.posted_by_user_id))`;
const finalStatuses = ["awarded", "closed", "expired", "archived"];

export async function closeVpsRfp(userId: string, rfpId: string, outcome: "awarded" | "closed" | "expired", db: D1Binding = vpsAppDatabase()) {
  if (!UUID.test(userId) || !UUID.test(rfpId)) return "not_found";
  const timestamp = new Date().toISOString();
  const [gate, result, current] = await db.batch<{ can_close: number; status: string }>([
    db.prepare(`SELECT CASE WHEN ${customerAppAuthority} THEN 1 ELSE json('app_authority_unavailable') END`),
    db.prepare(`UPDATE rfp_posts SET status=?,closed_at=?,updated_at=? WHERE id=? AND ${canClose}
      AND status NOT IN ('awarded','closed','expired','archived')`).bind(outcome, timestamp, timestamp, rfpId, userId),
    db.prepare(`SELECT status, ${canClose} AS can_close FROM rfp_posts WHERE id=?`).bind(userId, rfpId),
  ]);
  if (!gate?.success || !result?.success || !current?.success) throw new D1ApiError(503, "rfp_close_unavailable");
  if (result.meta.changes === 1) return "ok";
  if (!current.results[0]) return "not_found";
  if (!current.results[0].can_close) return "not_owner";
  return finalStatuses.includes(current.results[0].status) ? "closed" : "failed";
}
