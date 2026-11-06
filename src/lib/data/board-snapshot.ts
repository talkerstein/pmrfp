import { cache } from "react";
import { d1BoardEnabled } from "@/lib/d1/board-backend";
import { BOARD_SHARDS, shardRange, type BoardRow } from "@/lib/d1/board-contracts";
export { shardRange, type BoardRow } from "@/lib/d1/board-contracts";
import { unstable_cache } from "next/cache";
import { createReadClient } from "@/lib/supabase/read";
import { RFPS_TAG } from "@/lib/supabase/public-cache";
import { createLimiter, createSingleFlight } from "@/lib/concurrency";

/**
 * ONE shared, server-cached copy of the public board (every published RFP and
 * its trades). Every page that needs "the board" reads this snapshot instead
 * of querying Supabase itself.
 *
 * Why (incident 2026-10-09): listRfps() paged the whole rfp_public view and
 * then fired one rfp_categories query and one rfp_documents query per 150
 * ids, in parallel, on every call. ~20 callers (board, detail pages, trade and
 * region hubs, forum threads, counts, sitemap, builds) multiplied that into
 * thousands of queries a minute and the database fell over.
 *
 * Shape:
 *  - 16 shards by the first hex digit of the RFP id, each its own Next data
 *    cache entry (tag "rfps", 10 minutes). Keeps every entry far below Next's
 *    2 MB per-entry limit as the board grows, and a cold shard costs ~2 reads
 *    (rfp_public + rfp_categories by id range, keyset-paged), not dozens.
 *  - No photos (they're attached to rendered cards only, see withPublicRfpPhotos).
 *  - Writes to rfp_posts / rfp_categories / rfp_documents mark the tag stale
 *    (lib/supabase/write-fetch), so a new listing shows after one refresh.
 *  - Per server instance: at most 4 shard loads at once and one load per shard
 *    in flight, however many renders miss at the same moment.
 *
 * Callers inside another unstable_cache() bypass this cache (Next disables
 * nested caching), so derived data is memoised with React cache() per request
 * instead of being wrapped in unstable_cache.
 */

export const SNAPSHOT_SHARDS = BOARD_SHARDS;
/** Safety net only: every write through write-fetch marks the rfps tag stale. 6 h (was 10 min) because the lowest TTL on a page becomes its ISR TTL. */
export const SNAPSHOT_REVALIDATE = 21600;
/** PostgREST's default max rows per response. */
const PAGE = 1000;
const READ_TIMEOUT_MS = 10_000;
/** Warn well before a shard approaches Next's 2 MB data-cache entry limit. */
const SHARD_WARN_BYTES = 1_500_000;

interface RfpPublicRow {
  id: string; slug: string; title: string; summary: string | null;
  region_id: string | null; property_type_id: string | null;
  city: string | null; province: string | null; deadline: string | null; is_demo: boolean;
  source_type?: string | null; gc_project_name?: string | null; awarded_rfp_id?: string | null;
  published_at?: string | null; created_at?: string | null;
}

const COLUMNS = "id,slug,title,summary,region_id,property_type_id,city,province,deadline,is_demo,source_type,gc_project_name,awarded_rfp_id,published_at,created_at";

type Builder = {
  gte(column: string, value: string): Builder;
  gt(column: string, value: string): Builder;
  lt(column: string, value: string): Builder;
  order(column: string): Builder;
  limit(n: number): Builder;
  abortSignal(signal: AbortSignal): Builder;
  retry?(enabled: boolean): Builder;
} & PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>;

/** Keyset-paged read of one id range: `id > last` instead of OFFSET, so late pages stay cheap. */
async function readRange<T extends { id: string }>(
  table: string,
  columns: string,
  rangeColumn: string,
  lo: string | null,
  hi: string | null,
): Promise<T[]> {
  const client = createReadClient();
  const out: T[] = [];
  let after: string | null = null;
  for (;;) {
    let q = client.from(table).select(columns).order("id").limit(PAGE) as unknown as Builder;
    if (lo) q = q.gte(rangeColumn, lo);
    if (hi) q = q.lt(rangeColumn, hi);
    if (after) q = q.gt("id", after);
    q = q.abortSignal(AbortSignal.timeout(READ_TIMEOUT_MS));
    // One attempt per page: postgrest-js's 3 back-off retries piled load onto
    // a struggling database. A failed shard keeps serving its stale copy.
    if (typeof q.retry === "function") q = q.retry(false);
    const { data, error } = await q;
    if (error) throw new Error(`${table}: ${error.message}`);
    const page = (data ?? []) as T[];
    out.push(...page);
    if (page.length < PAGE) return out;
    after = page[page.length - 1].id;
  }
}

/** Reads one shard straight from Supabase (no cache). */
async function fetchSupabaseBoardShard(shard: number): Promise<BoardRow[]> {
  const { lo, hi } = shardRange(shard);
  const rows = await readRange<RfpPublicRow>("rfp_public", COLUMNS, "id", lo, hi);
  if (!rows.length) return [];
  // Categories for the same id range in one keyset-paged read, instead of
  // one `.in(rfp_id, …150 ids)` query per chunk. RLS limits them to published RFPs.
  const links = await readRange<{ id: string; rfp_id: string; category_id: string }>(
    "rfp_categories", "id,rfp_id,category_id", "rfp_id", lo, hi,
  );
  const cats = new Map<string, string[]>();
  for (const l of links) {
    const arr = cats.get(l.rfp_id);
    if (arr) arr.push(l.category_id);
    else cats.set(l.rfp_id, [l.category_id]);
  }
  const out: BoardRow[] = rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    title: r.title,
    summary: r.summary,
    regionId: r.region_id,
    propertyTypeId: r.property_type_id,
    city: r.city,
    province: r.province,
    deadline: r.deadline,
    isDemo: r.is_demo,
    sourceType: r.source_type ?? null,
    gcProjectName: r.gc_project_name ?? null,
    awardedRfpId: r.awarded_rfp_id ?? null,
    publishedAt: r.published_at ?? null,
    createdAt: r.created_at ?? null,
    categoryIds: cats.get(r.id) ?? [],
  }));
  return out;
}

/** Fixed provider for a shard; D1 errors never fall back to source reads. */
export async function fetchBoardShard(shard: number): Promise<BoardRow[]> {
  shardRange(shard);
  const out = d1BoardEnabled()
    ? await (await import("@/lib/d1/board-server")).d1BoardShard(shard)
    : await fetchSupabaseBoardShard(shard);
  const bytes = JSON.stringify(out).length;
  if (bytes > SHARD_WARN_BYTES) {
    console.warn("[board-snapshot] shard is large; raise SNAPSHOT_SHARDS", { shard, rows: out.length, bytes });
  }
  return out;
}

const limit = createLimiter(4);
const singleFlight = createSingleFlight();

const cachedShard = unstable_cache(
  // The project URL is part of the key so preview and production databases never share entries.
  async (shard: number, _projectUrl: string): Promise<BoardRow[]> =>
    singleFlight(`${_projectUrl}:board-shard:${shard}`, () => limit(() => fetchBoardShard(shard))),
  ["board-snapshot-shard-v2"],
  { tags: [RFPS_TAG], revalidate: SNAPSHOT_REVALIDATE },
);

/**
 * Every published RFP (open and closed), once per request: all callers in one
 * render share this result; across requests it comes from the data cache.
 * Sorted by id. Throws when a shard can't be read and isn't cached.
 */
export const getBoardRows = cache(async (): Promise<BoardRow[]> => {
  const projectUrl = d1BoardEnabled()
    ? `d1:${process.env.PMRFP_D1_API_URL ?? ""}:${process.env.PMRFP_D1_DATASET_SHA256 ?? ""}`
    : `supabase:${process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""}`;
  const shards = await Promise.all(Array.from({ length: SNAPSHOT_SHARDS }, (_, i) => cachedShard(i, projectUrl)));
  return shards.flat();
});

/** slug → row, for single-listing lookups without another query. */
export const getBoardIndex = cache(async (): Promise<Map<string, BoardRow>> => {
  return new Map((await getBoardRows()).map((r) => [r.slug, r]));
});
