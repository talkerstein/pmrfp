import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import { isServiceConfigured } from "@/lib/supabase/config";

/**
 * Followers of a town (PMRFP for Towns, Part B1): the user ids
 * (users_profile.id) in buyer_follows for the page whose key is `buyerKey`
 * ("ontario/town-of-cobourg", the same key as buyer_pages, rfp_posts.buyer_key
 * and buyer_follows.buyer_slug; slugs alone repeat across provinces).
 * Callers already de-duplicate, drop the town's own people, and respect
 * unsubscribes and the do-not-contact list before emailing, so this only
 * lists followers. Empty without the service client, before migration
 * 20261021000110 runs, or on any read error.
 *
 * Used by lib/town-jobs/server.ts for:
 *   - answers to questions and addenda (broadcast to everyone engaged with
 *     the job, plus followers),
 *   - a town's new job going live (in-app notice to followers).
 */
export const MAX_FOLLOWERS = 5000;

export async function getBuyerFollowerIds(buyerKey: string): Promise<string[]> {
  if (!buyerKey || !isServiceConfigured()) return [];
  try {
    const { data, error } = await createServiceClient().from("buyer_follows").select("user_id").eq("buyer_slug", buyerKey).limit(MAX_FOLLOWERS);
    if (error) return [];
    return [...new Set(((data ?? []) as { user_id: string }[]).map((r) => r.user_id).filter(Boolean))];
  } catch {
    return [];
  }
}
