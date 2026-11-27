import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getSession } from "@/lib/access/access";
import { vpsAppDatabase } from "@/lib/d1/http-binding";
import { isVpsLiveCustomerAuth } from "@/lib/d1/staging-config";
import { NO_USAGE, type TrialUsage } from "./banner";

/** Notification types written by the alert crons: one row per alert email, recorded before it is sent. */
export const ALERT_NOTIFICATION_TYPES = ["rfp_alert", "major_project_alert", "lead_alert"] as const;

/**
 * What the member really got and did since `since`, read as the member (row
 * level security):
 *   alerts     rows in `notifications` the alert crons wrote for them
 *   saved      rows in `saved_rfps`
 *   responses  rows in `rfp_interests`
 *
 * Not included on purpose: "bids opened" and "awards viewed". Listing views
 * (rfp_views) are anonymous daily hashes with no reliable link to a member,
 * so we never put a number on them.
 */
export async function loadTrialUsage(userId: string, organizationId: string | null, since: string, db?: SupabaseClient): Promise<TrialUsage> {
  if (!db && isVpsLiveCustomerAuth()) {
    const session = await getSession();
    if (session?.userId !== userId || session.profile.status !== "active") return NO_USAGE;
    const row = await vpsAppDatabase().prepare(`SELECT
      (SELECT count(*) FROM notifications WHERE user_id=? AND type IN (SELECT value FROM json_each(?))
        AND julianday(created_at)>=julianday(?)) AS alerts,
      (SELECT count(*) FROM saved_rfps WHERE user_id=? AND julianday(created_at)>=julianday(?)) AS saved,
      (SELECT count(*) FROM rfp_interests i WHERE i.trade_organization_id=? AND julianday(i.created_at)>=julianday(?)
        AND EXISTS(SELECT 1 FROM organization_members m WHERE m.organization_id=i.trade_organization_id AND m.user_id=?)) AS responses`)
      .bind(userId,JSON.stringify(ALERT_NOTIFICATION_TYPES),since,userId,since,
        session.organization?.id === organizationId ? organizationId : null,since,userId).first<TrialUsage>().catch(() => null);
    return row ?? NO_USAGE;
  }
  if (!db && !isSupabaseConfigured()) return NO_USAGE;
  try {
    const supabase = db ?? (await createClient());
    const count = async (q: PromiseLike<{ count: number | null; error: unknown }>) => {
      const { count: n, error } = await q;
      return error ? 0 : (n ?? 0);
    };
    const [alerts, saved, responses] = await Promise.all([
      count(
        supabase
          .from("notifications")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId)
          .in("type", [...ALERT_NOTIFICATION_TYPES])
          .gte("created_at", since),
      ),
      count(supabase.from("saved_rfps").select("id", { count: "exact", head: true }).eq("user_id", userId).gte("created_at", since)),
      organizationId
        ? count(supabase.from("rfp_interests").select("id", { count: "exact", head: true }).eq("trade_organization_id", organizationId).gte("created_at", since))
        : Promise.resolve(0),
    ]);
    return { alerts, saved, responses };
  } catch {
    return NO_USAGE;
  }
}
