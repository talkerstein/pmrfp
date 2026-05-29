import { createServiceClient } from "@/lib/supabase/service";
import { isServiceConfigured } from "@/lib/supabase/config";

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
