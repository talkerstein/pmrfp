import type { SupabaseClient } from "@supabase/supabase-js";

export interface OrganizationReviewCounts {
  /** New companies in pending_review (hidden until approved). */
  waiting: number;
  /** Approved companies with profile edits to check (still live). */
  edited: number;
}

/**
 * What waits at /admin/organizations (the admin nav badge). Before migration
 * 20261021000030 there is no review_flagged_at column: edited counts 0.
 */
export async function organizationReviewCounts(db: SupabaseClient): Promise<OrganizationReviewCounts> {
  const [waiting, edited] = await Promise.all([
    db.from("organizations").select("id", { count: "exact", head: true }).eq("profile_status", "pending_review"),
    db
      .from("organizations")
      .select("id", { count: "exact", head: true })
      .eq("profile_status", "approved")
      .not("review_flagged_at", "is", null),
  ]);
  return {
    waiting: waiting.error ? 0 : (waiting.count ?? 0),
    edited: edited.error ? 0 : (edited.count ?? 0),
  };
}
