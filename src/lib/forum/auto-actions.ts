"use server";

import { getSession, isAdminRole } from "@/lib/access/access";
import { createServiceClient } from "@/lib/supabase/service";
import { isServiceConfigured } from "@/lib/supabase/config";
import { isVpsLiveCustomerAuth } from "@/lib/d1/staging-config";
import { vpsAppDatabase } from "@/lib/d1/http-binding";
import { BACKFILL_CAP, BACKFILL_DAYS } from "./auto-threads";
import { runAutoThreads, type AutoRunResult } from "./auto-threads-server";

export type AutoImportState = { error?: string; result?: AutoRunResult };

/**
 * Admin-only: preview (dry) or run the 90-day backfill of automatic
 * "PMRFP Board" threads from real tenders, RFPs and contract awards.
 */
export async function autoThreadImportAction(_prev: AutoImportState, formData: FormData): Promise<AutoImportState> {
  const session = await getSession();
  if (!session || session.profile.status !== "active" || !isAdminRole(session.profile.primary_role)) return { error: "Admins only." };
  const native = isVpsLiveCustomerAuth();
  if (!native && !isServiceConfigured()) return { error: "Forum database is unavailable." };
  const dry = formData.get("mode") !== "run";
  const result = await runAutoThreads(native ? vpsAppDatabase() : createServiceClient(), { days: BACKFILL_DAYS, cap: BACKFILL_CAP, dry });
  return { result };
}
