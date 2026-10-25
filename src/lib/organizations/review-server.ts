import type { SupabaseClient } from "@supabase/supabase-js";

export interface OrganizationReviewCounts {
  /** New companies in pending_review (hidden until approved). Includes the ones held by the spam check. */
  waiting: number;
  /** Approved companies with profile edits to check (still live). */
  edited: number;
  /** Approved companies the spam check flagged after an edit (still live, nofollow and noindex). */
  held: number;
}

/**
 * What waits at /admin/organizations (the admin nav badge). Before migration
 * 20261021000030 there is no review_flagged_at column: edited counts 0; before
 * 20261024000100 there is no risk_flagged column: held counts 0.
 */
export async function organizationReviewCounts(db: SupabaseClient): Promise<OrganizationReviewCounts> {
  const [waiting, edited, held] = await Promise.all([
    db.from("organizations").select("id", { count: "exact", head: true }).eq("profile_status", "pending_review"),
    db
      .from("organizations")
      .select("id", { count: "exact", head: true })
      .eq("profile_status", "approved")
      .not("review_flagged_at", "is", null),
    db.from("organizations").select("id", { count: "exact", head: true }).eq("profile_status", "approved").eq("risk_flagged", true),
  ]);
  return {
    waiting: waiting.error ? 0 : (waiting.count ?? 0),
    edited: edited.error ? 0 : (edited.count ?? 0),
    held: held.error ? 0 : (held.count ?? 0),
  };
}
