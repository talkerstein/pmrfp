"use server";

import { getSession, isAdminRole } from "@/lib/access/access";
import { createServiceClient } from "@/lib/supabase/service";
import { isServiceConfigured } from "@/lib/supabase/config";
import { isVpsLiveCustomerAuth } from "@/lib/d1/staging-config";
import { vpsAppDatabase } from "@/lib/d1/http-binding";
import { runRecurringThreads, type RecurringRunResult } from "./recurring-server";

export type RecurringState = { error?: string; result?: RecurringRunResult };

/** Admin-only: preview (dry) or post the recurring threads due today (same as the daily cron). */
export async function recurringRunAction(_prev: RecurringState, formData: FormData): Promise<RecurringState> {
  const session = await getSession();
  if (!session || session.profile.status !== "active" || !isAdminRole(session.profile.primary_role)) return { error: "Admins only." };
  const native = isVpsLiveCustomerAuth();
  if (!native && !isServiceConfigured()) return { error: "Forum database is unavailable." };
  const dry = formData.get("mode") !== "run";
  return { result: await runRecurringThreads(native ? vpsAppDatabase() : createServiceClient(), { dry }) };
}
