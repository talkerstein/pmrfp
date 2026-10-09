"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/access/access";
import { createServiceClient } from "@/lib/supabase/service";
import { logAudit } from "@/lib/audit";
import { ADMIN_ADJUST_MAX } from "./rules";
import { syncKarma } from "./sync";

/**
 * Admin-only reputation tools. Every change needs a written reason and goes
 * to audit_logs, so the ledger always explains itself.
 */

const BACK = "/admin/karma";

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

  const db = createServiceClient();
  const { data, error } = await db
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
  await logAudit({ actorUserId: session.userId, action: "karma.adjust", entityType: "organization", entityId: orgId, metadata: { points, reason, eventId: data!.id } });
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
  const db = createServiceClient();
  const { error } = await db
    .from("karma_events")
    .update({ reversed_at: new Date().toISOString(), reversed_reason: `admin: ${reason}`, reversed_by: session.userId })
    .eq("id", id);
  if (error) back({ error: `Could not reverse: ${error.message}`, org: orgId });
  await logAudit({ actorUserId: session.userId, action: "karma.reverse", entityType: "organization", entityId: orgId || null, metadata: { eventId: id, reason } });
  if (orgId) await syncKarma({ orgIds: [orgId] });
  revalidatePath(BACK);
  back({ ok: "Event reversed.", org: orgId });
}

/** Run the sync by hand: dry run (no writes) or apply. */
export async function runKarmaSyncAction(formData: FormData): Promise<void> {
  const session = await requireRole(["admin", "super_admin"]);
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
