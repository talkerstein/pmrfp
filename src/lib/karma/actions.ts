"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/access/access";
import { createServiceClient } from "@/lib/supabase/service";
import { vpsAppDatabase } from "@/lib/d1/http-binding";
import { isVpsLiveCustomerAuth } from "@/lib/d1/staging-config";
import { customerAppAuthority } from "../../../workers/d1-api/customer-signup";
import { logAudit } from "@/lib/audit";
import { ADMIN_ADJUST_MAX } from "./rules";
import { syncKarma } from "./sync";

/**
 * Admin-only reputation tools. Every change needs a written reason and goes
 * to audit_logs, so the ledger always explains itself.
 */

const BACK = "/admin/karma";
const nativeStaff = `${customerAppAuthority} AND EXISTS(SELECT 1 FROM users_profile
  WHERE id=? AND status='active' AND primary_role IN ('admin','super_admin'))`;

function back(params: Record<string, string>): never {
  const q = new URLSearchParams(params).toString();
  redirect(q ? `${BACK}?${q}` : BACK);
}

/** Add or remove points by hand (a correction, a referral we verified by email). */
export async function adjustKarmaAction(formData: FormData): Promise<void> {
  const session = await requireRole(["admin", "super_admin"]);
  const orgId = String(formData.get("orgId") ?? "").trim();
  const points = Math.trunc(Number(formData.get("points")));
  const reason = String(formData.get("reason") ?? "").trim().slice(0, 500);
  if (!/^[0-9a-f-]{36}$/i.test(orgId)) back({ error: "Pick a company." });
  if (!Number.isFinite(points) || points === 0 || Math.abs(points) > ADMIN_ADJUST_MAX) back({ error: `Points must be between -${ADMIN_ADJUST_MAX} and ${ADMIN_ADJUST_MAX}, not 0.`, org: orgId });
  if (reason.length < 3) back({ error: "A reason is required.", org: orgId });

  const { data, error } = isVpsLiveCustomerAuth() ? await (async () => {
    const id = crypto.randomUUID();
    const db = vpsAppDatabase();
    const [write] = await db.batch([
      db.prepare(`INSERT INTO karma_events(id,org_id,kind,points,source_type,source_id,reason,created_by)
        SELECT ?,o.id,'admin_adjustment',?,'admin',?,?,? FROM organizations o
        WHERE o.id=? AND o.is_demo=0 AND ${nativeStaff}`).bind(id,points,id,reason,session.userId,orgId,session.userId),
      db.prepare(`INSERT INTO audit_logs(id,actor_user_id,action,entity_type,entity_id,metadata)
        SELECT ?,?,'karma.adjust','organization',?,? WHERE changes()=1`)
        .bind(crypto.randomUUID(),session.userId,orgId,JSON.stringify({points,reason,eventId:id})),
    ]);
    return { data: write.meta.changes === 1 ? { id } : null, error: null };
  })().catch(() => ({ data: null, error: { message: "D1 unavailable." } })) : await createServiceClient()
    .from("karma_events")
    .insert({
      org_id: orgId,
      kind: "admin_adjustment",
      points,
      source_type: "admin",
      source_id: crypto.randomUUID(),
      reason,
      created_by: session.userId,
    })
    .select("id")
    .single<{ id: string }>();
  if (error || !data) back({ error: `Could not save: ${error?.message ?? "unknown"}`, org: orgId });
  if (!isVpsLiveCustomerAuth()) await logAudit({ actorUserId: session.userId, action: "karma.adjust", entityType: "organization", entityId: orgId, metadata: { points, reason, eventId: data!.id } });
  await syncKarma({ orgIds: [orgId] });
  revalidatePath(BACK);
  back({ ok: "Adjustment saved.", org: orgId });
}

/** Mark one ledger row as abuse: the points come off and stay off. */
export async function reverseKarmaEventAction(formData: FormData): Promise<void> {
  const session = await requireRole(["admin", "super_admin"]);
  const id = String(formData.get("id") ?? "");
  const orgId = String(formData.get("orgId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim().slice(0, 480);
  if (!id) back({ error: "Missing event." });
  if (reason.length < 3) back({ error: "A reason is required.", org: orgId });
  const { error } = isVpsLiveCustomerAuth() ? await (async () => {
    const db = vpsAppDatabase();
    const [write] = await db.batch([
      db.prepare(`UPDATE karma_events SET reversed_at=?,reversed_reason=?,reversed_by=?
        WHERE id=? AND org_id=? AND reversed_by IS NULL AND ${nativeStaff}`)
        .bind(new Date().toISOString(),`admin: ${reason}`,session.userId,id,orgId,session.userId),
      db.prepare(`INSERT INTO audit_logs(id,actor_user_id,action,entity_type,entity_id,metadata)
        SELECT ?,?,'karma.reverse','organization',?,? WHERE changes()=1`)
        .bind(crypto.randomUUID(),session.userId,orgId,JSON.stringify({eventId:id,reason})),
    ]);
    return { error: write.meta.changes === 1 ? null : { message: "No matching event." } };
  })().catch(() => ({ error: { message: "D1 unavailable." } })) : await createServiceClient()
    .from("karma_events")
    .update({ reversed_at: new Date().toISOString(), reversed_reason: `admin: ${reason}`, reversed_by: session.userId })
    .eq("id", id);
  if (error) back({ error: `Could not reverse: ${error.message}`, org: orgId });
  if (!isVpsLiveCustomerAuth()) await logAudit({ actorUserId: session.userId, action: "karma.reverse", entityType: "organization", entityId: orgId || null, metadata: { eventId: id, reason } });
  if (orgId) await syncKarma({ orgIds: [orgId] });
  revalidatePath(BACK);
  back({ ok: "Event reversed.", org: orgId });
}

/** Run the sync by hand: dry run (no writes) or apply. */
export async function runKarmaSyncAction(formData: FormData): Promise<void> {
  const session = await requireRole(["admin", "super_admin"]);
  if (session.profile.status !== "active") back({ error: "Admins only." });
  const dryRun = formData.get("mode") !== "apply";
  const r = await syncKarma({ dryRun });
  if (!dryRun) await logAudit({ actorUserId: session.userId, action: "karma.sync", metadata: { inserted: r.inserted, reversed: r.reversed, restored: r.restored, updated: r.updated } });
  revalidatePath(BACK);
  const summary = [
    dryRun ? "DRY RUN (nothing written)" : "Applied",
    `${r.inserted} new, ${r.reversed} clawed back, ${r.restored} restored, ${r.updated} updated`,
    `levels L1-L5: ${[1, 2, 3, 4, 5].map((l) => r.levels[l as 1]).join(" / ")}`,
    ...(r.warnings.length ? [`warnings: ${r.warnings.slice(0, 3).join("; ")}`] : []),
  ].join(" · ");
  back(r.ready ? { ok: summary } : { error: `Not ready: ${r.warnings.join("; ") || "run the karma migration first"}` });
}
