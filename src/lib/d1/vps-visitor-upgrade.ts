import { randomUUID } from "node:crypto";
import type { BusinessRole } from "@/lib/auth/visitor-upgrade";
import { customerAppAuthority, UUID, type D1Binding } from "./contracts";
import { activeRequestAdmin } from "./customer-requests";
import { vpsAppDatabase, vpsDatabase } from "./http-binding";

export async function convertVpsVisitor(input: {
  userId: string; to: BusinessRole; actorUserId: string; by: "self" | "staff"; company?: string;
}, db: D1Binding = vpsAppDatabase(), authDb?: D1Binding): Promise<"converted" | "already" | "error"> {
  const { userId, to, actorUserId, by, company } = input;
  if (!UUID.test(userId) || !UUID.test(actorUserId) || (to !== "trade" && to !== "supplier") ||
    (by === "self" && actorUserId !== userId)) return "error";
  const actorScope = by === "staff" ? `AND ${activeRequestAdmin}` : "";
  const results = await db.batch([
    db.prepare(`UPDATE users_profile SET primary_role=?,onboarding_completed=0,updated_at=?
      WHERE id=? AND primary_role='visitor' AND status='active' AND ${customerAppAuthority} ${actorScope}`)
      .bind(to, new Date().toISOString(), userId, ...(by === "staff" ? [actorUserId] : [])),
    db.prepare(`INSERT INTO audit_logs(id,actor_user_id,action,entity_type,entity_id,metadata)
      SELECT ?,?,'user.visitor_converted','user',?,? WHERE changes()=1`)
      .bind(randomUUID(), actorUserId, userId, JSON.stringify({ from: "visitor", to, by })),
  ]);
  if (results.length !== 2 || results.some(result => !result.success)) return "error";
  if (results[0].meta.changes !== 1) return "already";
  try {
    const prefs = JSON.stringify({ primary_role: to, upgraded_from: "visitor", ...(company ? { pref_company: company } : {}) });
    const auth = authDb ?? vpsDatabase("auth");
    await auth.prepare(`INSERT INTO _auth_source_metadata(user_id,metadata)
      SELECT id,json_object('raw_user_meta_data',json(?),'raw_app_meta_data',json('{}')) FROM user WHERE id=?
      ON CONFLICT(user_id) DO UPDATE SET metadata=json_set(_auth_source_metadata.metadata,'$.raw_user_meta_data',
        json_patch(coalesce(json_extract(_auth_source_metadata.metadata,'$.raw_user_meta_data'),'{}'),json(?)))`)
      .bind(prefs, userId, prefs).run();
  } catch {
    // The app profile is the source of truth for the converted role.
    console.warn("[visitor-upgrade] Could not update optional onboarding preferences");
  }
  return "converted";
}
