import { cache } from "react";
import { unstable_cache } from "next/cache";
import { createReadClient } from "@/lib/supabase/read";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createSingleFlight } from "@/lib/concurrency";

/**
 * "N contractors follow this town": followers per buyer page for public
 * pages, from ONE shared, server-cached copy of the buyer_follow_counts view
 * (counts only, never who; migration 20261021000110). Same rule as the
 * managed-page and permission snapshots (PR #136): no per-page queries.
 * Ten minutes is plenty for a count; a page shows the new number on its
 * next revalidation. Empty without Supabase or before the migration runs.
 *
 * Followers are reach, not content: they never make a page indexable
 * (lib/buyers/model isIndexablePage doesn't look at them).
 */

export const BUYER_FOLLOWS_TAG = "buyer-follows";
export const FOLLOW_COUNTS_REVALIDATE = 3600;
const READ_TIMEOUT_MS = 8_000;
const singleFlight = createSingleFlight();

interface CountRow {
  buyer_slug: string;
  followers: number;
}

async function fetchCounts(): Promise<CountRow[]> {
  const { data, error } = await createReadClient()
    .from("buyer_follow_counts")
    .select("buyer_slug,followers")
    .gt("followers", 0)
    .limit(20000)
    .abortSignal(AbortSignal.timeout(READ_TIMEOUT_MS));
  if (error) throw new Error(`buyer_follow_counts: ${error.message}`);
  return (data ?? []) as CountRow[];
}

const cachedCounts = unstable_cache(
  // The project URL keys the cache (a preview and production never share counts).
  async (projectUrl: string): Promise<CountRow[]> => singleFlight(`buyer-follow-counts:${projectUrl}`, fetchCounts),
  ["buyer-follow-counts-v1"],
  { tags: [BUYER_FOLLOWS_TAG], revalidate: FOLLOW_COUNTS_REVALIDATE },
);

/** Followers by page key ("ontario/town-of-cobourg"), once per request. */
export const getFollowerCountsSnapshot = cache(async (): Promise<ReadonlyMap<string, number>> => {
  if (!isSupabaseConfigured()) return new Map();
  try {
    const rows = await cachedCounts(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
    return new Map(rows.map((r) => [r.buyer_slug, Number(r.followers) || 0] as const));
  } catch (e) {
    console.warn("[buyer-follows] counts unavailable", e instanceof Error ? e.message : e);
    return new Map();
  }
});

/** One page's followers (0 when none, or when the counts can't be read). */
export async function followerCount(key: string): Promise<number> {
  return (await getFollowerCountsSnapshot()).get(key) ?? 0;
}
