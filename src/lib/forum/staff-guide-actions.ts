"use server";

import { getSession, isAdminRole } from "@/lib/access/access";
import { createServiceClient } from "@/lib/supabase/service";
import { isServiceConfigured } from "@/lib/supabase/config";
import { runStaffGuideImport, type GuideImportResult } from "./staff-guides-server";

export type GuideImportState = { error?: string; result?: GuideImportResult };

/** Admin-only: preview (dry) or import the PMRFP Team staff guides. Idempotent. */
export async function staffGuideImportAction(_prev: GuideImportState, formData: FormData): Promise<GuideImportState> {
  const session = await getSession();
  if (!session || !isAdminRole(session.profile.primary_role)) return { error: "Admins only." };
  if (!isServiceConfigured()) return { error: "Supabase service role isn't configured." };
  const dry = formData.get("mode") !== "run";
  const result = await runStaffGuideImport(createServiceClient(), { dry });
  // Service writes to forum_* tables purge the forum read cache (write-fetch.ts).
  return { result };
}
