import { createServiceClient } from "@/lib/supabase/service";
import { isServiceConfigured } from "@/lib/supabase/config";
import { randomUUID } from "node:crypto";
import { vpsAppDatabase } from "@/lib/d1/http-binding";
import { isVpsLiveCustomerAuth } from "@/lib/d1/staging-config";
import { customerAppAuthority } from "../../workers/d1-api/customer-signup";

/**
 * Append an entry to audit_logs. Uses the service client so system events
 * are always recorded. No-ops when Supabase isn't configured (demo mode).
 */
export async function logAudit(params: {
  actorUserId: string | null;
  action: string;
  entityType?: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  if (isVpsLiveCustomerAuth()) {
    try {
      await vpsAppDatabase().prepare(`INSERT INTO audit_logs(id,actor_user_id,action,entity_type,entity_id,metadata)
        SELECT ?,?,?,?,?,? WHERE ${customerAppAuthority}`)
        .bind(randomUUID(), params.actorUserId, params.action, params.entityType ?? null, params.entityId ?? null,
          params.metadata ? JSON.stringify(params.metadata) : null).run();
    } catch {
      console.warn("[audit] D1 audit write unavailable", params.action);
    }
    return;
  }
  if (!isServiceConfigured()) return;
  try {
    const supabase = createServiceClient();
    await supabase.from("audit_logs").insert({
      actor_user_id: params.actorUserId,
      action: params.action,
      entity_type: params.entityType ?? null,
      entity_id: params.entityId ?? null,
      metadata: params.metadata ?? null,
    });
  } catch {
    // Audit logging must never break the primary action.
  }
}
