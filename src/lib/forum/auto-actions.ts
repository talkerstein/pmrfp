"use server";

import { getSession, isAdminRole } from "@/lib/access/access";
import { createServiceClient } from "@/lib/supabase/service";
import { isServiceConfigured } from "@/lib/supabase/config";
import { BACKFILL_CAP, BACKFILL_DAYS } from "./auto-threads";
import { runAutoThreads, type AutoRunResult } from "./auto-threads-server";

export type AutoImportState = { error?: string; result?: AutoRunResult };

/**
 * Admin-only: preview (dry) or run the 90-day backfill of automatic
 * "PMRFP Board" threads from real tenders, RFPs and contract awards.
 */
export async function autoThreadImportAction(_prev: AutoImportState, formData: FormData): Promise<AutoImportState> {
  const session = await getSession();
  if (!session || !isAdminRole(session.profile.primary_role)) return { error: "Admins only." };
  if (!isServiceConfigured()) return { error: "Supabase service role isn't configured." };
  const dry = formData.get("mode") !== "run";
  const result = await runAutoThreads(createServiceClient(), { days: BACKFILL_DAYS, cap: BACKFILL_CAP, dry });
  return { result };
}
