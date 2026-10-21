import "server-only";

/**
 * Followers of a town (the hook for PMRFP for Towns, Part B1).
 *
 * TODO(towns-part-b1): B1 adds buyer follows (table buyer_follows, follow
 * buttons, follow alerts). Wire this to it after both merge: return the user
 * ids (users_profile.id) who follow the town whose page key is `buyerKey`
 * ("ontario/town-of-cobourg", the same key as buyer_pages / rfp_posts.buyer_key;
 * slugs alone repeat across provinces). Callers already de-duplicate, drop
 * the town's own people, and respect unsubscribes and the do-not-contact
 * list before emailing, so this only has to list followers.
 *
 * Used by lib/town-jobs/server.ts for:
 *   - answers to questions and addenda (broadcast to everyone engaged with
 *     the job, plus followers),
 *   - a town's new job going live (in-app notice to followers).
 */
export async function getBuyerFollowerIds(buyerKey: string): Promise<string[]> {
  void buyerKey;
  return [];
}
