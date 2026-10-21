import { cache } from "react";
import { unstable_cache } from "next/cache";
import { createReadClient } from "@/lib/supabase/read";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { RFPS_TAG } from "@/lib/supabase/public-cache";
import { createSingleFlight } from "@/lib/concurrency";
import type { TownPostLite } from "./merge";

/**
 * Every town's own live posts (town_posts_public), as ONE shared,
 * server-cached copy for the buyer pages, the town page and the town bids
 * widget: same rule as the board and managed-page snapshots (no per-page
 * queries). Tag "rfps" (a publish, unpublish or deadline change expires it),
 * 10 minutes. Empty without Supabase or before migration 20261021000060.
 */

const REVALIDATE = 600;
const READ_TIMEOUT_MS = 8_000;
const singleFlight = createSingleFlight();

async function fetchPosts(): Promise<TownPostLite[]> {
  const { data, error } = await createReadClient()
    .from("town_posts_public")
    .select("slug,title,deadline,buyer_key,status")
    .eq("status", "published")
    .limit(5000)
    .abortSignal(AbortSignal.timeout(READ_TIMEOUT_MS));
  if (error) throw new Error(`town_posts_public: ${error.message}`);
  return (data ?? []) as TownPostLite[];
}

const cachedPosts = unstable_cache(
  async (_projectUrl: string): Promise<TownPostLite[]> => singleFlight("town-posts", fetchPosts),
  ["town-posts-public-v1"],
  { tags: [RFPS_TAG], revalidate: REVALIDATE },
);

/** Towns' live posts, once per request. */
export const getTownPostsSnapshot = cache(async (): Promise<TownPostLite[]> => {
  if (!isSupabaseConfigured()) return [];
  try {
    return await cachedPosts(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
  } catch (e) {
    console.warn("[town-posts] snapshot unavailable", e instanceof Error ? e.message : e);
    return [];
  }
});
