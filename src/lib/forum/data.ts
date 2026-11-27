import type { SupabaseClient } from "@supabase/supabase-js";
import { createReadClient } from "@/lib/supabase/read";
import { createClient } from "@/lib/supabase/server";
import { countryOf } from "@/lib/visitor-geo";
import { createServiceClient } from "@/lib/supabase/service";
import { isServiceConfigured, isSupabaseConfigured } from "@/lib/supabase/config";
import { vpsAppDatabase } from "@/lib/d1/http-binding";
import { isVpsLiveCustomerAuth } from "@/lib/d1/staging-config";
import { customerAppAuthority } from "../../../workers/d1-api/customer-signup";
import { canonicalRoom, roomSlugCandidates, type ForumCategorySlug, type RoomCountry } from "./categories";
import { forumV2Ready } from "./schema-v2";
import { sanitizeImages, type ForumImage } from "./photos";
import { isRecurringKind, type RecurringKind } from "./recurring";
import { PAGE_SIZE, isIndexableThread, ratingAverage } from "./rules";
import { SYSTEM_HANDLE } from "./auto-threads";
import { TEAM_HANDLE } from "./staff-guides";
import { applyThreadSort, filterThreads, ilikePattern, type ThreadSort } from "./organize";
import { previewSamplesOn, sampleAllThreads, sampleCategoryThreads, sampleIndex, samplePosts, sampleProfile, sampleThread } from "./preview-samples";

/**
 * Forum reads. Public data goes through the cookieless read client, so it
 * is cached under the forum tag (src/lib/supabase/public-cache.ts) and RLS
 * only ever shows approved content. Every reader returns `ready: false`
 * instead of throwing when Supabase isn't configured or the forum
 * migration hasn't been applied yet, and the pages show "opening soon".
 */

export interface MemberRef {
  userId: string;
  handle: string;
  displayName: string;
  /** Legacy forum points, frozen since company reputation took over (src/lib/karma). */
  reputation: number;
  isStaff: boolean;
  verifiedBusiness: boolean;
  /** The member's company: its reputation level shows next to their name. */
  orgId: string | null;
}

export interface ForumCategory {
  id: string;
  slug: ForumCategorySlug;
  threadCount: number;
  postCount: number;
  lastPostAt: string | null;
  lastThread: { title: string; path: string; lastUser: string | null } | null;
  mods: { handle: string; displayName: string }[];
}

export interface ThreadSummary {
  id: string;
  shortId: string;
  slug: string;
  path: string;
  title: string;
  type: "question" | "discussion";
  status: "held" | "approved" | "hidden";
  isPinned: boolean;
  isLocked: boolean;
  isStaff: boolean;
  /** Automatic PMRFP Board post (auto-threads): labelled, noindex until a reply. */
  isAuto: boolean;
  /** Reference guide by the PMRFP Team staff account (staff-guides). */
  isGuide?: boolean;
  hasAccepted: boolean;
  replyCount: number;
  viewCount: number;
  ratingAvg: number | null;
  ratingCount: number;
  createdAt: string;
  lastPostAt: string;
  author: MemberRef | null;
  lastUser: { handle: string; displayName: string } | null;
  region: string | null;
  /** Canada or U.S. (recurring threads always; member threads may be unset = both). */
  country: RoomCountry | null;
  /** Photos (approved threads: public bucket). */
  images: ForumImage[];
  /** A recurring thread's series (open-bids, prompt, poll, ...), else null. */
  recurring: RecurringKind | null;
}

export interface Thread extends ThreadSummary {
  categoryId: string;
  categorySlug: ForumCategorySlug;
  body: string;
  wordsTotal: number;
  flagCount: number;
  acceptedPostId: string | null;
  updatedAt: string;
}

export interface Post {
  id: string;
  body: string;
  status: "held" | "approved" | "hidden";
  isStaff: boolean;
  isAccepted: boolean;
  upvoteCount: number;
  createdAt: string;
  editedAt: string | null;
  author: MemberRef | null;
  images: ForumImage[];
}

type Res<T> = ({ ready: true } & T) | { ready: false };

const MEMBER_COLS = "user_id,handle,display_name,reputation,is_staff,verified_business,organization_id";
const THREAD_COLS =
  "id,short_id,slug,title,type,status,is_pinned,is_locked,is_staff,accepted_post_id,reply_count,view_count,rating_sum,rating_count,created_at,last_post_at,region," +
  `author:forum_profiles!forum_threads_author_fkey(${MEMBER_COLS}),last_user:forum_profiles!forum_threads_last_user_fkey(handle,display_name)`;

/** Columns added by the forum rework migration (read only once it is applied). */
const V2_THREAD_COLS = ",country,images,auto_source";

async function threadCols(client: SupabaseClient): Promise<string> {
  return (await forumV2Ready(client)) ? THREAD_COLS + V2_THREAD_COLS : THREAD_COLS;
}

/** Country filter for lists: threads for this country, plus threads for both (country unset). */
function inCountryFilter(country: RoomCountry): string {
  return `country.is.null,country.eq.${country}`;
}

/** Table missing (migration not applied) or schema cache not reloaded yet. */
export function isMissingTable(err: { code?: string; message?: string } | null | undefined): boolean {
  if (!err) return false;
  return err.code === "42P01" || err.code === "PGRST205" || err.code === "PGRST200" || /forum_\w+.*(does not exist|schema cache)/.test(err.message ?? "");
}

function db(): SupabaseClient | null {
  return isSupabaseConfigured() ? createReadClient() : null;
}

function sqlMember(alias: "a" | "l") {
  return `CASE WHEN ${alias}.user_id IS NOT NULL THEN json_object(
    'user_id',${alias}.user_id,'handle',${alias}.handle,'display_name',${alias}.display_name,
    'reputation',${alias}.reputation,'is_staff',${alias}.is_staff,'verified_business',${alias}.verified_business,
    'organization_id',${alias}.organization_id) END`;
}

const nativeThreadFrom = `FROM forum_threads t JOIN forum_categories c ON c.id=t.category_id
  LEFT JOIN forum_profiles a ON a.user_id=t.author_id LEFT JOIN forum_profiles l ON l.user_id=t.last_post_user_id`;
const nativeThreadCols = `t.*,c.slug AS category_slug,${sqlMember("a")} AS author,${sqlMember("l")} AS last_user`;
const publicThread = `t.status='approved' AND c.is_public=1 AND ${customerAppAuthority}`;
type SqlValue = string | number | null;

async function nativeThreads(condition: string, values: SqlValue[], order: string, limit: number, offset = 0) {
  const rows = await vpsAppDatabase().prepare(`SELECT ${nativeThreadCols} ${nativeThreadFrom}
    WHERE ${publicThread} AND (${condition}) ORDER BY ${order} LIMIT ? OFFSET ?`)
    .bind(...values, limit, offset).all<{
      category_slug: string; author: string | null; last_user: string | null; images: string;
      category_id: string; body: string; words_total: number; flag_count: number;
      accepted_post_id: string | null; updated_at: string; id: string; auto_source: string | null; auto_source_key: string | null;
    }>();
  return rows.results.map((row) => ({
    ...row,
    author: row.author ? JSON.parse(row.author) : null,
    last_user: row.last_user ? JSON.parse(row.last_user) : null,
    images: JSON.parse(row.images),
  }));
}

function nativeThreadSummaries(rows: Awaited<ReturnType<typeof nativeThreads>>): ThreadWithCategory[] {
  return rows.flatMap((row) => {
    const slug = canonicalRoom(row.category_slug);
    return slug ? [{ ...summary(row, slug), categorySlug: slug }] : [];
  });
}

type MemberRow = { user_id: string; handle: string; display_name: string; reputation: number; is_staff: boolean; verified_business: boolean; organization_id?: string | null };

function member(r: MemberRow | MemberRow[] | null | undefined): MemberRef | null {
  const m = Array.isArray(r) ? r[0] : r;
  if (!m) return null;
  return {
    userId: m.user_id,
    handle: m.handle,
    displayName: m.display_name,
    reputation: m.reputation ?? 0,
    isStaff: m.is_staff,
    verifiedBusiness: m.verified_business,
    orgId: m.organization_id ?? null,
  };
}

/** Threads by the PMRFP Board system profile are automatic posts. */
function isSystemAuthor(a: { handle?: string } | { handle?: string }[] | null | undefined): boolean {
  const m = Array.isArray(a) ? a[0] : a;
  return m?.handle === SYSTEM_HANDLE;
}

/** Threads by the PMRFP Team staff profile are staff reference guides. */
function isTeamAuthor(a: { handle?: string } | { handle?: string }[] | null | undefined): boolean {
  const m = Array.isArray(a) ? a[0] : a;
  return m?.handle === TEAM_HANDLE;
}

let systemUserId: string | null | undefined;
async function systemAuthorId(client: SupabaseClient): Promise<string | null> {
  if (systemUserId) return systemUserId;
  const { data } = await client.from("forum_profiles").select("user_id").eq("handle", SYSTEM_HANDLE).maybeSingle<{ user_id: string }>();
  systemUserId = data?.user_id ?? null;
  return systemUserId;
}

export function threadPath(category: string, slug: string, sid: string): string {
  return `/forum/${category}/${slug}-${sid}`;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function summary(r: any, categorySlug: string): ThreadSummary {
  const lu = Array.isArray(r.last_user) ? r.last_user[0] : r.last_user;
  return {
    id: r.id,
    shortId: r.short_id,
    slug: r.slug,
    path: threadPath(categorySlug, r.slug, r.short_id),
    title: r.title,
    type: r.type,
    status: r.status,
    isPinned: r.is_pinned,
    isLocked: r.is_locked,
    isStaff: r.is_staff,
    isAuto: isSystemAuthor(r.author),
    isGuide: isTeamAuthor(r.author),
    hasAccepted: Boolean(r.accepted_post_id),
    replyCount: r.reply_count ?? 0,
    viewCount: r.view_count ?? 0,
    ratingAvg: ratingAverage(r.rating_sum ?? 0, r.rating_count ?? 0),
    ratingCount: r.rating_count ?? 0,
    createdAt: r.created_at,
    lastPostAt: r.last_post_at,
    author: member(r.author),
    lastUser: lu ? { handle: lu.handle, displayName: lu.display_name } : null,
    region: r.region ?? null,
    country: r.country === "CA" || r.country === "US" ? r.country : null,
    images: sanitizeImages(r.images),
    recurring: isRecurringKind(r.auto_source) ? r.auto_source : null,
  };
}

async function modsByCategory(client: SupabaseClient): Promise<Map<string, { handle: string; displayName: string }[]>> {
  const out = new Map<string, { handle: string; displayName: string }[]>();
  const { data } = await client.from("forum_category_mods").select("category_id,forum_profiles(handle,display_name)");
  for (const r of (data ?? []) as any[]) {
    const p = Array.isArray(r.forum_profiles) ? r.forum_profiles[0] : r.forum_profiles;
    if (!p) continue;
    const list = out.get(r.category_id) ?? [];
    list.push({ handle: p.handle, displayName: p.display_name });
    out.set(r.category_id, list);
  }
  return out;
}

export async function getForumIndex(): Promise<Res<{ categories: ForumCategory[] }>> {
  if (previewSamplesOn()) return { ready: true, categories: sampleIndex() };
  if (isVpsLiveCustomerAuth()) {
    try {
      const rows = await vpsAppDatabase().prepare(`SELECT c.id,c.slug,c.thread_count,c.post_count,c.last_post_at,
        t.title,t.slug AS thread_slug,t.short_id,p.display_name,
        coalesce((SELECT json_group_array(json_object('handle',a.handle,'displayName',a.display_name))
          FROM forum_category_mods m JOIN forum_profiles a ON a.user_id=m.user_id WHERE m.category_id=c.id),'[]') AS mods
        FROM forum_categories c
        LEFT JOIN forum_threads t ON t.id=c.last_thread_id AND t.category_id=c.id AND t.status='approved'
        LEFT JOIN forum_profiles p ON p.user_id=t.last_post_user_id
        WHERE c.is_public=1 AND ${customerAppAuthority} ORDER BY c.sort`).all<{
        id: string; slug: string; thread_count: number; post_count: number; last_post_at: string | null;
        title: string | null; thread_slug: string | null; short_id: string | null; display_name: string | null; mods: string;
      }>();
      return { ready: true, categories: canonicalRows(rows.results).map((row) => ({
        id: row.id, slug: row.slug, threadCount: row.thread_count, postCount: row.post_count, lastPostAt: row.last_post_at,
        lastThread: row.title && row.thread_slug && row.short_id ? {
          title: row.title, path: threadPath(row.slug, row.thread_slug, row.short_id), lastUser: row.display_name,
        } : null,
        mods: JSON.parse(row.mods),
      })) };
    } catch {
      return { ready: false };
    }
  }
  const client = db();
  if (!client) return { ready: false };
  const { data, error } = await client
    .from("forum_categories")
    .select("id,slug,sort,thread_count,post_count,last_post_at,last_thread_id")
    .order("sort");
  if (error || !data) {
    if (!isMissingTable(error)) console.error("[forum] categories", error?.message);
    return { ready: false };
  }
  // Rows still on an old room slug (before the rework migration) show under the new room.
  const rows = canonicalRows(data as any[]);
  const lastIds = rows.map((c) => c.last_thread_id).filter(Boolean);
  const [mods, last] = await Promise.all([
    modsByCategory(client),
    lastIds.length
      ? client
          .from("forum_threads")
          .select("id,short_id,slug,title,category_id,last_user:forum_profiles!forum_threads_last_user_fkey(handle,display_name)")
          .in("id", lastIds)
      : Promise.resolve({ data: [] as any[] }),
  ]);
  const lastById = new Map(((last.data ?? []) as any[]).map((t) => [t.id, t]));
  return {
    ready: true,
    categories: rows.map((c) => {
      const lt = c.last_thread_id ? lastById.get(c.last_thread_id) : null;
      const lu = lt ? (Array.isArray(lt.last_user) ? lt.last_user[0] : lt.last_user) : null;
      return {
        id: c.id,
        slug: c.slug,
        threadCount: c.thread_count ?? 0,
        postCount: c.post_count ?? 0,
        lastPostAt: c.last_post_at,
        lastThread: lt ? { title: lt.title, path: threadPath(c.slug, lt.slug, lt.short_id), lastUser: lu?.display_name ?? null } : null,
        mods: mods.get(c.id) ?? [],
      };
    }),
  };
}

export async function getCategoryRow(slug: ForumCategorySlug): Promise<Res<{ category: ForumCategory }>> {
  const idx = await getForumIndex();
  if (!idx.ready) return { ready: false };
  const category = idx.categories.find((c) => c.slug === slug);
  return category ? { ready: true, category } : { ready: false };
}

export async function listCategoryThreads(
  categoryId: string,
  categorySlug: string,
  page: number,
  sort: ThreadSort = "latest",
  opts: { hideAuto?: boolean; country?: RoomCountry } = {},
): Promise<{ threads: ThreadSummary[]; pinned: ThreadSummary[]; total: number }> {
  if (previewSamplesOn()) {
    const s = sampleCategoryThreads(categoryId);
    if (sort === "latest") return s;
    const threads = filterThreads(s.threads, sort);
    return { pinned: [], threads, total: threads.length };
  }
  if (isVpsLiveCustomerAuth()) {
    const sorts = {
      latest: ["t.is_pinned=0", "t.last_post_at DESC"],
      unanswered: ["t.type='question' AND t.accepted_post_id IS NULL", "t.last_post_at DESC"],
      solved: ["t.accepted_post_id IS NOT NULL", "t.last_post_at DESC"],
      top: ["t.rating_count>0", "t.rating_sum DESC,t.rating_count DESC,t.last_post_at DESC"],
    };
    const [predicate, order] = sorts[sort];
    const scope = "t.category_id=? AND (? IS NULL OR t.country IS NULL OR t.country=?)";
    const condition = `${scope} AND ${predicate} AND (?=0 OR coalesce(a.handle,'')<>?)`;
    const params = [categoryId, opts.country ?? null, opts.country ?? null];
    const values = [...params, Number(Boolean(opts.hideAuto)), SYSTEM_HANDLE];
    const [rows, pinned, total] = await Promise.all([
      nativeThreads(condition, values, order, PAGE_SIZE, (page - 1) * PAGE_SIZE),
      page === 1 && sort === "latest" ? nativeThreads(`${scope} AND t.is_pinned=1`, params, order, 10) : [],
      vpsAppDatabase().prepare(`SELECT count(*) AS n ${nativeThreadFrom} WHERE ${publicThread} AND ${condition}`)
        .bind(...values).first<{ n: number }>(),
    ]);
    return { threads: rows.map((row) => summary(row, categorySlug)),
      pinned: pinned.map((row) => summary(row, categorySlug)), total: total?.n ?? 0 };
  }
  const client = db();
  if (!client) return { threads: [], pinned: [], total: 0 };
  const from = (page - 1) * PAGE_SIZE;
  // ?auto=0: hide automatic PMRFP Board posts.
  const hideId = opts.hideAuto ? await systemAuthorId(client) : null;
  const [cols, v2] = await Promise.all([threadCols(client), forumV2Ready(client)]);
  // Country-first: Canadian and U.S. threads are never mixed (unset = for both).
  const country = v2 && opts.country ? inCountryFilter(opts.country) : null;
  const [pinned, list] = await Promise.all([
    page === 1 && sort === "latest"
      ? (() => {
          let q = client.from("forum_threads").select(cols).eq("category_id", categoryId).eq("status", "approved").eq("is_pinned", true);
          if (country) q = q.or(country);
          return q.order("last_post_at", { ascending: false }).limit(10);
        })()
      : Promise.resolve({ data: [] as any[] }),
    (() => {
      // Pinned threads sit above the Latest tab; the other tabs include them.
      let q = client.from("forum_threads").select(cols, { count: "exact" }).eq("category_id", categoryId).eq("status", "approved");
      if (sort === "latest") q = q.eq("is_pinned", false);
      if (hideId) q = q.neq("author_id", hideId);
      if (country) q = q.or(country);
      return applyThreadSort(q, sort).range(from, from + PAGE_SIZE - 1);
    })(),
  ]);
  return {
    pinned: ((pinned.data ?? []) as any[]).map((r) => summary(r, categorySlug)),
    threads: ((list.data ?? []) as any[]).map((r) => summary(r, categorySlug)),
    total: (list as { count?: number | null }).count ?? 0,
  };
}

/**
 * forum_categories rows → one row per current room, slug rewritten to the
 * current name. When both an old and a new row exist, the new one wins.
 */
export function canonicalRows<T extends { slug: string }>(rows: readonly T[]): (T & { slug: ForumCategorySlug })[] {
  const out = new Map<ForumCategorySlug, T & { slug: ForumCategorySlug }>();
  for (const r of rows) {
    const slug = canonicalRoom(r.slug);
    if (!slug) continue;
    if (out.has(slug) && r.slug !== slug) continue;
    out.set(slug, { ...r, slug });
  }
  return [...out.values()];
}

async function slugMap(client: SupabaseClient): Promise<Map<string, ForumCategorySlug>> {
  const { data } = await client.from("forum_categories").select("id,slug");
  const map = new Map<string, ForumCategorySlug>();
  for (const c of (data ?? []) as { id: string; slug: string }[]) {
    const slug = canonicalRoom(c.slug);
    if (slug) map.set(c.id, slug);
  }
  return map;
}

/** Category row ids for a room: its own row, plus an old-slug row before the migration. */
export async function roomIds(slug: ForumCategorySlug): Promise<string[]> {
  const client = db();
  if (!client) return [];
  const { data } = await client.from("forum_categories").select("id,slug").in("slug", roomSlugCandidates(slug));
  return ((data ?? []) as { id: string }[]).map((r) => r.id);
}

function withSlugs(rows: any[], slugs: Map<string, ForumCategorySlug>): (ThreadSummary & { categorySlug: ForumCategorySlug })[] {
  return rows.flatMap((r) => {
    const slug = slugs.get(r.category_id);
    return slug ? [{ ...summary(r, slug), categorySlug: slug }] : [];
  });
}

export type ThreadWithCategory = ThreadSummary & { categorySlug: ForumCategorySlug };

/** Newest approved threads across every forum (the index "Latest activity"). */
export async function listLatestThreads(limit = 8): Promise<ThreadWithCategory[]> {
  if (previewSamplesOn()) return sampleAllThreads().sort((a, b) => b.lastPostAt.localeCompare(a.lastPostAt)).slice(0, limit);
  if (isVpsLiveCustomerAuth()) return nativeThreadSummaries(await nativeThreads("1=1", [], "t.last_post_at DESC", limit));
  const client = db();
  if (!client) return [];
  const [{ data, error }, slugs] = await Promise.all([
    client.from("forum_threads").select(`${await threadCols(client)},category_id`).eq("status", "approved").order("last_post_at", { ascending: false }).limit(limit),
    slugMap(client),
  ]);
  if (error) return [];
  return withSlugs((data ?? []) as any[], slugs);
}

/** Pinned threads across every forum (e.g. "Start here: how this forum works"). */
export async function listPinnedThreads(limit = 3): Promise<ThreadWithCategory[]> {
  if (previewSamplesOn()) return sampleAllThreads().filter((t) => t.isPinned).slice(0, limit);
  if (isVpsLiveCustomerAuth()) return nativeThreadSummaries(await nativeThreads("t.is_pinned=1", [], "t.created_at ASC", limit));
  const client = db();
  if (!client) return [];
  const [{ data, error }, slugs] = await Promise.all([
    client.from("forum_threads").select(`${await threadCols(client)},category_id`).eq("status", "approved").eq("is_pinned", true).order("created_at", { ascending: true }).limit(limit),
    slugMap(client),
  ]);
  if (error) return [];
  return withSlugs((data ?? []) as any[], slugs);
}

/** Title search (simple ILIKE). Callers rate-limit and clean the query first. */
export async function searchThreads(q: string, limit = 30): Promise<ThreadWithCategory[]> {
  if (previewSamplesOn()) {
    const needle = q.toLowerCase();
    return sampleAllThreads().filter((t) => t.title.toLowerCase().includes(needle)).slice(0, limit);
  }
  if (isVpsLiveCustomerAuth()) return nativeThreadSummaries(await nativeThreads(
    "instr(lower(t.title),lower(?))>0", [q], "t.last_post_at DESC", limit));
  const client = db();
  if (!client) return [];
  const [{ data, error }, slugs] = await Promise.all([
    client.from("forum_threads").select(`${await threadCols(client)},category_id`).eq("status", "approved").ilike("title", ilikePattern(q)).order("last_post_at", { ascending: false }).limit(limit),
    slugMap(client),
  ]);
  if (error) return [];
  return withSlugs((data ?? []) as any[], slugs);
}

/** Other threads in the same forum, for the thread page sidebar. */
export async function listRelatedThreads(categoryId: string, categorySlug: ForumCategorySlug, excludeId: string, limit = 5): Promise<ThreadSummary[]> {
  if (previewSamplesOn()) return sampleAllThreads().filter((t) => t.categorySlug === categorySlug && t.id !== excludeId).slice(0, limit);
  if (isVpsLiveCustomerAuth()) return (await nativeThreads("t.category_id=? AND t.id<>?", [categoryId, excludeId],
    "t.last_post_at DESC", limit)).map((row) => summary(row, categorySlug));
  const client = db();
  if (!client) return [];
  const { data } = await client
    .from("forum_threads")
    .select(await threadCols(client))
    .eq("category_id", categoryId)
    .eq("status", "approved")
    .neq("id", excludeId)
    .order("last_post_at", { ascending: false })
    .limit(limit);
  return ((data ?? []) as any[]).map((r) => summary(r, categorySlug));
}

const CATEGORY_BY_ID = new Map<string, ForumCategorySlug>();

async function categorySlugFor(client: SupabaseClient, id: string): Promise<ForumCategorySlug | null> {
  const hit = CATEGORY_BY_ID.get(id);
  if (hit) return hit;
  const { data } = await client.from("forum_categories").select("id,slug");
  for (const c of (data ?? []) as { id: string; slug: string }[]) {
    const slug = canonicalRoom(c.slug);
    if (slug) CATEGORY_BY_ID.set(c.id, slug);
  }
  return CATEGORY_BY_ID.get(id) ?? null;
}

/** One approved thread by short id (public read). */
export async function getThread(sid: string): Promise<Res<{ thread: Thread | null }>> {
  if (previewSamplesOn()) return { ready: true, thread: sampleThread(sid) };
  if (isVpsLiveCustomerAuth()) {
    const [r] = await nativeThreads("t.short_id=?", [sid], "t.created_at DESC", 1);
    if (!r) return { ready: true, thread: null };
    const categorySlug = canonicalRoom(r.category_slug);
    if (!categorySlug) return { ready: true, thread: null };
    return {
      ready: true,
      thread: { ...summary(r, categorySlug), categoryId: r.category_id, categorySlug, body: r.body,
        wordsTotal: r.words_total, flagCount: r.flag_count, acceptedPostId: r.accepted_post_id, updatedAt: r.updated_at },
    };
  }
  const client = db();
  if (!client) return { ready: false };
  const { data, error } = await client
    .from("forum_threads")
    .select(`${await threadCols(client)},category_id,body,words_total,flag_count,region,updated_at`)
    .eq("short_id", sid)
    .maybeSingle();
  if (error) {
    if (!isMissingTable(error)) console.error("[forum] thread", error.message);
    return isMissingTable(error) ? { ready: false } : { ready: true, thread: null };
  }
  if (!data) return { ready: true, thread: null };
  const r = data as any;
  const categorySlug = await categorySlugFor(client, r.category_id);
  if (!categorySlug) return { ready: true, thread: null };
  return {
    ready: true,
    thread: {
      ...summary(r, categorySlug),
      categoryId: r.category_id,
      categorySlug,
      body: r.body,
      wordsTotal: r.words_total ?? 0,
      flagCount: r.flag_count ?? 0,
      acceptedPostId: r.accepted_post_id,
      updatedAt: r.updated_at,
    },
  };
}

function toPost(r: any): Post {
  return {
    id: r.id,
    body: r.body,
    status: r.status,
    isStaff: r.is_staff,
    isAccepted: r.is_accepted,
    upvoteCount: r.upvote_count ?? 0,
    createdAt: r.created_at,
    editedAt: r.edited_at,
    author: member(r.author),
    images: sanitizeImages(r.images),
  };
}

const POST_COLS_V1 = `id,body,status,is_staff,is_accepted,upvote_count,created_at,edited_at,author:forum_profiles!forum_posts_author_fkey(${MEMBER_COLS})`;

export async function listPosts(thread: Thread, page: number): Promise<{ posts: Post[]; accepted: Post | null }> {
  if (previewSamplesOn()) return samplePosts(thread);
  if (isVpsLiveCustomerAuth()) {
    const db = vpsAppDatabase();
    const columns = `SELECT p.*,${sqlMember("a")} AS author FROM forum_posts p
      JOIN forum_threads t ON t.id=p.thread_id JOIN forum_categories c ON c.id=t.category_id
      LEFT JOIN forum_profiles a ON a.user_id=p.author_id
      WHERE p.thread_id=? AND p.status='approved' AND ${publicThread}`;
    const order = thread.type === "question" ? "p.is_accepted DESC,p.upvote_count DESC,p.created_at" : "p.created_at";
    type NativePost = { author: string | null; images: string };
    const convert = (row: NativePost) => toPost({ ...row, author: row.author ? JSON.parse(row.author) : null, images: JSON.parse(row.images) });
    const rows = await db.prepare(`${columns} ORDER BY ${order},p.id LIMIT ? OFFSET ?`)
      .bind(thread.id, PAGE_SIZE, (page - 1) * PAGE_SIZE).all<NativePost>();
    const posts = rows.results.map(convert);
    const accepted = posts.find((post) => post.isAccepted);
    if (accepted || !thread.acceptedPostId) return { posts, accepted: accepted ?? null };
    const row = await db.prepare(`${columns} AND p.id=?`).bind(thread.id, thread.acceptedPostId).first<NativePost>();
    return { posts, accepted: row ? convert(row) : null };
  }
  const client = db();
  if (!client) return { posts: [], accepted: null };
  const from = (page - 1) * PAGE_SIZE;
  const POST_COLS = (await forumV2Ready(client)) ? `${POST_COLS_V1},images` : POST_COLS_V1;
  let q = client.from("forum_posts").select(POST_COLS).eq("thread_id", thread.id).eq("status", "approved");
  q = thread.type === "question"
    ? q.order("is_accepted", { ascending: false }).order("upvote_count", { ascending: false }).order("created_at", { ascending: true })
    : q.order("created_at", { ascending: true });
  const { data } = await q.range(from, from + PAGE_SIZE - 1);
  const posts = ((data ?? []) as any[]).map(toPost);
  let accepted = posts.find((p) => p.isAccepted) ?? null;
  if (!accepted && thread.acceptedPostId) {
    const { data: a } = await client.from("forum_posts").select(POST_COLS).eq("id", thread.acceptedPostId).eq("status", "approved").maybeSingle();
    accepted = a ? toPost(a) : null;
  }
  return { posts, accepted };
}

export interface Profile {
  userId: string;
  handle: string;
  displayName: string;
  trade: string | null;
  region: string | null;
  bio: string | null;
  reputation: number;
  /** The member's company (its reputation level is shown, not member points). */
  orgId: string | null;
  postCount: number;
  verifiedBusiness: boolean;
  isStaff: boolean;
  joinedAt: string;
  lastSeenAt: string | null;
  answers: number;
  accepted: number;
  bestThreadAverage: number | null;
  modOf: ForumCategorySlug[];
  latest: ThreadSummary[];
  crew: {
    name: string;
    slug: string;
    listed: boolean;
    members: { handle: string; displayName: string; reputation: number }[];
  } | null;
}

export async function getProfile(handle: string): Promise<Res<{ profile: Profile | null }>> {
  if (previewSamplesOn()) return { ready: true, profile: sampleProfile(handle) };
  if (!/^[a-z0-9_]{3,30}$/.test(handle)) return { ready: true, profile: null };
  if (isVpsLiveCustomerAuth()) {
    const db = vpsAppDatabase();
    const p = await db.prepare(`SELECT user_id AS userId,handle,display_name AS displayName,trade,region,bio,reputation,
      organization_id AS orgId,post_count AS postCount,verified_business AS verifiedBusiness,is_staff AS isStaff,
      created_at AS joinedAt,last_seen_at AS lastSeenAt FROM forum_profiles WHERE handle=? AND ${customerAppAuthority}`)
      .bind(handle).first<Omit<Profile, "answers" | "accepted" | "bestThreadAverage" | "modOf" | "latest" | "crew">>();
    if (!p) return { ready: true, profile: null };
    const [numbers, best, latest, mods, org, mates] = await Promise.all([
      db.prepare(`SELECT coalesce(sum(t.type='question'),0) AS answers,coalesce(sum(t.accepted_post_id=p.id),0) AS accepted
        FROM forum_posts p JOIN forum_threads t ON t.id=p.thread_id JOIN forum_categories c ON c.id=t.category_id
        WHERE p.author_id=? AND p.status='approved' AND ${publicThread}`).bind(p.userId).first<{ answers: number; accepted: number }>(),
      db.prepare(`SELECT max(1.0*t.rating_sum/t.rating_count) AS n ${nativeThreadFrom}
        WHERE t.author_id=? AND t.rating_count>=3 AND ${publicThread}`).bind(p.userId).first<{ n: number | null }>(),
      nativeThreads("t.author_id=?", [p.userId], "t.created_at DESC", 10),
      db.prepare(`SELECT c.slug FROM forum_category_mods m JOIN forum_categories c ON c.id=m.category_id
        WHERE m.user_id=? AND c.is_public=1`).bind(p.userId).all<{ slug: string }>(),
      p.orgId ? db.prepare(`SELECT name,slug,(profile_status='approved' AND status='active'
        AND organization_type IN ('trade_company','supplier')) AS listed FROM organizations WHERE id=? AND status='active' AND is_demo=0`)
        .bind(p.orgId).first<{ name: string; slug: string; listed: number }>() : null,
      p.orgId ? db.prepare(`SELECT handle,display_name AS displayName,reputation FROM forum_profiles
        WHERE organization_id=? ORDER BY reputation DESC LIMIT 50`).bind(p.orgId)
        .all<{ handle: string; displayName: string; reputation: number }>() : null,
    ]);
    return { ready: true, profile: { ...p, verifiedBusiness: Boolean(p.verifiedBusiness), isStaff: Boolean(p.isStaff),
      answers: numbers?.answers ?? 0, accepted: numbers?.accepted ?? 0, bestThreadAverage: best?.n ?? null,
      modOf: mods.results.flatMap((row) => canonicalRoom(row.slug) ?? []), latest: nativeThreadSummaries(latest),
      crew: org ? { ...org, listed: Boolean(org.listed), members: mates?.results ?? [] } : null } };
  }
  const client = db();
  if (!client) return { ready: false };
  const { data, error } = await client
    .from("forum_profiles")
    .select("user_id,handle,display_name,trade,region,bio,organization_id,reputation,post_count,verified_business,is_staff,created_at,last_seen_at")
    .eq("handle", handle)
    .maybeSingle();
  if (error) return isMissingTable(error) ? { ready: false } : { ready: true, profile: null };
  if (!data) return { ready: true, profile: null };
  const p = data as any;
  const [answers, accepted, rated, latest, mods, cats] = await Promise.all([
    client.from("forum_posts").select("id,forum_threads!inner(type)", { count: "exact", head: true }).eq("author_id", p.user_id).eq("status", "approved").eq("forum_threads.type", "question"),
    client.from("forum_posts").select("id", { count: "exact", head: true }).eq("author_id", p.user_id).eq("status", "approved").eq("is_accepted", true),
    client.from("forum_threads").select("rating_sum,rating_count").eq("author_id", p.user_id).eq("status", "approved").gte("rating_count", 3).limit(200),
    client.from("forum_threads").select(`${await threadCols(client)},category_id`).eq("author_id", p.user_id).eq("status", "approved").order("created_at", { ascending: false }).limit(10),
    client.from("forum_category_mods").select("category_id").eq("user_id", p.user_id),
    client.from("forum_categories").select("id,slug"),
  ]);
  const slugById = new Map(((cats.data ?? []) as { id: string; slug: string }[]).flatMap((c) => { const s = canonicalRoom(c.slug); return s ? [[c.id, s] as const] : []; }));
  let best: number | null = null;
  for (const r of (rated.data ?? []) as { rating_sum: number; rating_count: number }[]) {
    const avg = ratingAverage(r.rating_sum, r.rating_count);
    if (avg != null && (best == null || avg > best)) best = avg;
  }

  let crew: Profile["crew"] = null;
  if (p.organization_id) {
    const [{ data: org }, { data: mates }] = await Promise.all([
      client.from("organizations").select("name,slug,organization_type,profile_status,status").eq("id", p.organization_id).maybeSingle(),
      client.from("forum_profiles").select("handle,display_name,reputation").eq("organization_id", p.organization_id).order("reputation", { ascending: false }).limit(50),
    ]);
    if (org) {
      const o = org as any;
      const members = ((mates ?? []) as any[]).map((m) => ({ handle: m.handle, displayName: m.display_name, reputation: m.reputation ?? 0 }));
      crew = {
        name: o.name,
        slug: o.slug,
        listed: o.profile_status === "approved" && o.status === "active" && ["trade_company", "supplier"].includes(o.organization_type),
        members,
      };
    }
  }

  return {
    ready: true,
    profile: {
      userId: p.user_id,
      handle: p.handle,
      displayName: p.display_name,
      trade: p.trade,
      region: p.region,
      bio: p.bio,
      reputation: p.reputation ?? 0,
      orgId: p.organization_id ?? null,
      postCount: p.post_count ?? 0,
      verifiedBusiness: p.verified_business,
      isStaff: p.is_staff,
      joinedAt: p.created_at,
      lastSeenAt: p.last_seen_at,
      answers: (answers as { count?: number | null }).count ?? 0,
      accepted: (accepted as { count?: number | null }).count ?? 0,
      bestThreadAverage: best,
      modOf: ((mods.data ?? []) as { category_id: string }[]).map((m) => slugById.get(m.category_id)).filter(Boolean) as ForumCategorySlug[],
      latest: ((latest.data ?? []) as any[])
        .map((r) => (slugById.get(r.category_id) ? summary(r, slugById.get(r.category_id)!) : null))
        .filter(Boolean) as ThreadSummary[],
      crew,
    },
  };
}

/** Threads that pass the indexing gate, for the sitemap (lastmod = last reply). */
export async function listIndexableThreads(): Promise<{ path: string; lastPostAt: string }[]> {
  if (previewSamplesOn()) return [];
  if (isVpsLiveCustomerAuth()) return (await nativeThreads("t.words_total>=150 AND t.reply_count>=1", [],
    "t.last_post_at DESC", 5000)).flatMap((r) => {
    const category = canonicalRoom(r.category_slug);
    if (!category) return [];
    const t = summary(r, category);
    return isIndexableThread({ status: t.status, type: t.type, replyCount: t.replyCount, wordsTotal: r.words_total,
      flagged: r.flag_count > 0, category, auto: t.isAuto, recurring: Boolean(t.recurring) })
      ? [{ path: t.path, lastPostAt: t.lastPostAt }] : [];
  });
  const client = db();
  if (!client) return [];
  const [{ data, error }, { data: cats }] = await Promise.all([
    client
      .from("forum_threads")
      .select("short_id,slug,type,status,reply_count,words_total,flag_count,last_post_at,category_id")
      .eq("status", "approved")
      .gte("words_total", 150)
      .gte("reply_count", 1)
      .order("last_post_at", { ascending: false })
      .limit(5000),
    client.from("forum_categories").select("id,slug"),
  ]);
  if (error || !data) return [];
  const slugById = new Map(((cats ?? []) as { id: string; slug: string }[]).flatMap((c) => { const s = canonicalRoom(c.slug); return s ? [[c.id, s] as const] : []; }));
  return (data as any[])
    .filter((t) => slugById.has(t.category_id) && isIndexableThread({ status: t.status, type: t.type, replyCount: t.reply_count, wordsTotal: t.words_total, flagged: false, category: slugById.get(t.category_id) }))
    .map((t) => ({ path: threadPath(slugById.get(t.category_id)!, t.slug, t.short_id), lastPostAt: t.last_post_at }));
}

/** The signed-in viewer's own rating and upvotes on a thread (RLS: own rows). */
export async function viewerState(
  userId: string,
  threadId: string,
  postIds: string[],
): Promise<{ rating: number | null; voted: Set<string> }> {
  if (isVpsLiveCustomerAuth()) {
    const db = vpsAppDatabase();
    const [rating, votes] = await Promise.all([
      db.prepare("SELECT score FROM forum_thread_ratings WHERE user_id=? AND thread_id=?").bind(userId, threadId).first<{ score: number }>(),
      db.prepare(`SELECT v.post_id FROM forum_post_votes v JOIN forum_posts p ON p.id=v.post_id
        WHERE v.user_id=? AND p.thread_id=? AND p.status='approved' AND p.id IN (SELECT value FROM json_each(?))`)
        .bind(userId, threadId, JSON.stringify(postIds)).all<{ post_id: string }>(),
    ]);
    return { rating: rating?.score ?? null, voted: new Set(votes.results.map((r) => r.post_id)) };
  }
  const client = await createClient();
  const [r, v] = await Promise.all([
    client.from("forum_thread_ratings").select("score").eq("thread_id", threadId).eq("user_id", userId).maybeSingle(),
    postIds.length ? client.from("forum_post_votes").select("post_id").eq("user_id", userId).in("post_id", postIds) : Promise.resolve({ data: [] }),
  ]);
  return {
    rating: (r.data as { score: number } | null)?.score ?? null,
    voted: new Set(((v.data ?? []) as { post_id: string }[]).map((x) => x.post_id)),
  };
}

/** Is this user a moderator of this category (or a site admin)? Service read. */
export async function isCategoryMod(userId: string, categoryId: string): Promise<boolean> {
  if (isVpsLiveCustomerAuth()) return Boolean(await vpsAppDatabase().prepare(
    "SELECT 1 FROM forum_category_mods WHERE user_id=? AND category_id=?").bind(userId, categoryId).first());
  if (!isServiceConfigured()) return false;
  const { data } = await createServiceClient()
    .from("forum_category_mods")
    .select("user_id")
    .eq("user_id", userId)
    .eq("category_id", categoryId)
    .maybeSingle();
  return Boolean(data);
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** The viewer's approved post count (0 when they have no forum profile yet). */
export async function viewerPostCount(userId: string): Promise<number> {
  if (isVpsLiveCustomerAuth()) return (await vpsAppDatabase().prepare(
    "SELECT post_count FROM forum_profiles WHERE user_id=?").bind(userId).first<{ post_count: number }>())?.post_count ?? 0;
  if (!isServiceConfigured()) return 0;
  const { data } = await createServiceClient().from("forum_profiles").select("post_count").eq("user_id", userId).maybeSingle<{ post_count: number }>();
  return data?.post_count ?? 0;
}

// ── Quiet-forum home and tender threads (src/lib/forum/quiet.ts) ──────
/* eslint-disable @typescript-eslint/no-explicit-any */
let teamUserId: string | null | undefined;
async function teamAuthorId(client: SupabaseClient): Promise<string | null> {
  if (teamUserId) return teamUserId;
  const { data } = await client.from("forum_profiles").select("user_id").eq("handle", TEAM_HANDLE).maybeSingle<{ user_id: string }>();
  teamUserId = data?.user_id ?? null;
  return teamUserId;
}

/** Pinned PMRFP Team guides across every forum, oldest import first (content order). */
export async function listPinnedGuides(limit = 60): Promise<ThreadWithCategory[]> {
  if (previewSamplesOn()) return [];
  if (isVpsLiveCustomerAuth()) return nativeThreadSummaries(await nativeThreads("t.is_pinned=1 AND a.handle=?",
    [TEAM_HANDLE], "t.created_at ASC", limit));
  const client = db();
  if (!client) return [];
  const teamId = await teamAuthorId(client);
  if (!teamId) return [];
  const [{ data, error }, slugs] = await Promise.all([
    client.from("forum_threads").select(`${await threadCols(client)},category_id`).eq("status", "approved").eq("is_pinned", true).eq("author_id", teamId).order("created_at", { ascending: true }).limit(limit),
    slugMap(client),
  ]);
  if (error) return [];
  return withSlugs((data ?? []) as any[], slugs);
}

export type AutoThread = ThreadWithCategory & {
  kind: string | null;
  rfpId: string | null;
  deadline: string | null;
  /** Country-first: the listing's country (its province/state, else the thread's region). */
  country: "CA" | "US";
};

/**
 * Newest automatic PMRFP Board threads (real tenders, RFPs and awards) with
 * each listing's real closing date. Empty until the auto-threads migration
 * is applied.
 */
export async function listRecentAutoThreads(limit = 250): Promise<AutoThread[]> {
  if (previewSamplesOn()) return [];
  if (isVpsLiveCustomerAuth()) {
    const rows = await nativeThreads("a.handle=?", [SYSTEM_HANDLE], "t.created_at DESC", limit);
    const ids = [...new Set(rows.flatMap((r) => r.auto_source_key?.startsWith("rfp:") ? [r.auto_source_key.slice(4)] : []))];
    const listings = ids.length ? await vpsAppDatabase().prepare(`SELECT id,deadline,province FROM rfp_posts
      WHERE is_demo=0 AND status IN ('published','closed','awarded','expired') AND id IN (SELECT value FROM json_each(?))`)
      .bind(JSON.stringify(ids)).all<{ id: string; deadline: string | null; province: string | null }>() : null;
    const byId = new Map(listings?.results.map((r) => [r.id, r]));
    return rows.flatMap((row) => {
      const categorySlug = canonicalRoom(row.category_slug);
      if (!categorySlug) return [];
      const thread = summary(row, categorySlug);
      const rfpId = row.auto_source_key?.startsWith("rfp:") ? row.auto_source_key.slice(4) : null;
      const listing = rfpId ? byId.get(rfpId) : null;
      return [{ ...thread, categorySlug, kind: row.auto_source, rfpId, deadline: listing?.deadline ?? null,
        country: thread.country ?? countryOf({ province: listing?.province ?? thread.region }) }];
    });
  }
  const client = db();
  if (!client) return [];
  const boardId = await systemAuthorId(client);
  if (!boardId) return [];
  const [{ data, error }, slugs] = await Promise.all([
    client.from("forum_threads").select(`${THREAD_COLS},category_id,auto_source,auto_source_key`).eq("status", "approved").eq("author_id", boardId).order("created_at", { ascending: false }).limit(limit),
    slugMap(client),
  ]);
  if (error || !data) return [];
  const rows = data as any[];
  const rfpIdOf = (r: any): string | null => (typeof r.auto_source_key === "string" && r.auto_source_key.startsWith("rfp:") ? r.auto_source_key.slice(4) : null);
  const ids = [...new Set(rows.map(rfpIdOf).filter((x): x is string => Boolean(x)))];
  const deadlines = new Map<string, string | null>();
  const provinces = new Map<string, string | null>();
  for (let i = 0; i < ids.length; i += 150) {
    const { data: rf } = await client.from("rfp_public").select("id,deadline,province").in("id", ids.slice(i, i + 150));
    for (const r of (rf ?? []) as { id: string; deadline: string | null; province: string | null }[]) {
      deadlines.set(r.id, r.deadline);
      provinces.set(r.id, r.province);
    }
  }
  const byId = new Map(rows.map((r) => [r.id, r]));
  return withSlugs(rows, slugs).map((th) => {
    const r = byId.get(th.id);
    const rfpId = rfpIdOf(r);
    const province = (rfpId ? provinces.get(rfpId) : null) ?? th.region;
    return { ...th, kind: r?.auto_source ?? null, rfpId, deadline: rfpId ? deadlines.get(rfpId) ?? null : null, country: countryOf({ province }) };
  });
}

/** The real listing behind an automatic thread ("rfp:<id>"), as its public slug. */
export async function autoThreadListingSlug(threadId: string): Promise<{ kind: string | null; slug: string } | null> {
  if (previewSamplesOn()) return null;
  if (isVpsLiveCustomerAuth()) return vpsAppDatabase().prepare(`SELECT t.auto_source AS kind,r.slug
    FROM forum_threads t JOIN forum_categories c ON c.id=t.category_id JOIN rfp_posts r ON t.auto_source_key='rfp:'||r.id
    WHERE t.id=? AND ${publicThread} AND r.is_demo=0 AND r.status IN ('published','closed','awarded','expired')`)
    .bind(threadId).first<{ kind: string | null; slug: string }>();
  const client = db();
  if (!client) return null;
  const { data, error } = await client.from("forum_threads").select("auto_source,auto_source_key").eq("id", threadId).maybeSingle<{ auto_source: string | null; auto_source_key: string | null }>();
  if (error || !data?.auto_source_key?.startsWith("rfp:")) return null;
  const { data: rfp } = await client.from("rfp_public").select("slug").eq("id", data.auto_source_key.slice(4)).maybeSingle<{ slug: string }>();
  return rfp ? { kind: data.auto_source, slug: rfp.slug } : null;
}

/** Photos, polls, follows and country scoping are on (the rework migration is applied). */
export async function forumReworkReady(): Promise<boolean> {
  if (previewSamplesOn()) return false;
  if (isVpsLiveCustomerAuth()) return true;
  return forumV2Ready(db());
}

// ── Discovery: this week, unanswered, photos, polls (rework) ─────────
const one = (v: any) => (Array.isArray(v) ? v[0] : v);
const forCountry = (c: unknown, country: RoomCountry) => c == null || c === country;

/** Open questions nobody has answered yet (members only: no automatic posts or guides). For helpers. */
export async function listUnansweredQuestions(country: RoomCountry, limit = 8): Promise<ThreadWithCategory[]> {
  if (previewSamplesOn()) return sampleAllThreads().filter((t) => t.type === "question" && t.replyCount === 0).slice(0, limit);
  if (isVpsLiveCustomerAuth()) return nativeThreadSummaries(await nativeThreads(
    "t.type='question' AND t.reply_count=0 AND t.is_locked=0 AND (t.country IS NULL OR t.country=?) AND coalesce(a.handle,'') NOT IN (?,?)",
    [country, SYSTEM_HANDLE, TEAM_HANDLE], "t.created_at DESC", limit));
  const client = db();
  if (!client) return [];
  const [cols, v2, slugs] = await Promise.all([threadCols(client), forumV2Ready(client), slugMap(client)]);
  let q = client.from("forum_threads").select(`${cols},category_id`).eq("status", "approved").eq("type", "question").eq("reply_count", 0).eq("is_locked", false);
  if (v2) q = q.or(inCountryFilter(country));
  const { data, error } = await q.order("created_at", { ascending: false }).limit(limit * 3);
  if (error) return [];
  return withSlugs((data ?? []) as any[], slugs).filter((t) => !t.isAuto && !t.isGuide).slice(0, limit);
}

/** This week's most-answered questions (members only). */
export async function listTopQuestions(country: RoomCountry, days = 7, limit = 5): Promise<ThreadWithCategory[]> {
  if (previewSamplesOn()) return sampleAllThreads().filter((t) => t.type === "question" && t.replyCount > 0).slice(0, limit);
  if (isVpsLiveCustomerAuth()) return nativeThreadSummaries(await nativeThreads(
    "t.type='question' AND t.reply_count>0 AND t.created_at>=? AND (t.country IS NULL OR t.country=?) AND coalesce(a.handle,'')<>?",
    [new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10), country, SYSTEM_HANDLE],
    "t.reply_count DESC,t.view_count DESC", limit));
  const client = db();
  if (!client) return [];
  // Day precision keeps the cache key stable for the whole day.
  const since = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
  const [cols, v2, slugs] = await Promise.all([threadCols(client), forumV2Ready(client), slugMap(client)]);
  let q = client.from("forum_threads").select(`${cols},category_id`).eq("status", "approved").eq("type", "question").gt("reply_count", 0).gte("created_at", since);
  if (v2) q = q.or(inCountryFilter(country));
  const { data, error } = await q.order("reply_count", { ascending: false }).order("view_count", { ascending: false }).limit(limit * 3);
  if (error) return [];
  return withSlugs((data ?? []) as any[], slugs).filter((t) => !t.isAuto).slice(0, limit);
}

export interface PhotoItem {
  key: string;
  path: string;
  threadTitle: string;
  categorySlug: ForumCategorySlug;
  image: ForumImage;
  createdAt: string;
  author: MemberRef | null;
}

/** Newest photos in approved threads and replies, for one country (or for both). */
export async function listLatestPhotos(country: RoomCountry, limit = 8): Promise<PhotoItem[]> {
  if (previewSamplesOn()) return [];
  if (isVpsLiveCustomerAuth()) {
    const rows = await vpsAppDatabase().prepare(`WITH pictures AS (
      SELECT t.id AS item,t.author_id,t.created_at,t.images,t.id AS thread_id,'t' AS kind FROM forum_threads t
        WHERE t.status='approved' AND json_array_length(t.images)>0
      UNION ALL SELECT p.id,p.author_id,p.created_at,p.images,p.thread_id,'p' FROM forum_posts p
        WHERE p.status='approved' AND json_array_length(p.images)>0
    ) SELECT p.*,t.slug,t.short_id,t.title,c.slug AS category,${sqlMember("a")} AS author
      FROM pictures p JOIN forum_threads t ON t.id=p.thread_id JOIN forum_categories c ON c.id=t.category_id
      LEFT JOIN forum_profiles a ON a.user_id=p.author_id
      WHERE ${publicThread} AND (t.country IS NULL OR t.country=?) ORDER BY p.created_at DESC LIMIT ?`)
      .bind(country, limit).all<{ item: string; kind: string; images: string; slug: string; short_id: string; title: string;
        category: string; created_at: string; author: string | null }>();
    return rows.results.flatMap((r) => {
      const category = canonicalRoom(r.category);
      const image = sanitizeImages(JSON.parse(r.images))[0];
      if (!category || !image) return [];
      const anchor = r.kind === "p" ? `#post-${r.item}` : "";
      return [{ key: `${r.kind}-${r.item}`, path: threadPath(category, r.slug, r.short_id) + anchor,
        threadTitle: r.title, categorySlug: category, image, createdAt: r.created_at, author: member(r.author ? JSON.parse(r.author) : null) }];
    });
  }
  const client = db();
  if (!client || !(await forumV2Ready(client))) return [];
  const thread = "thread:forum_threads!inner(id,short_id,slug,title,category_id,country,status)";
  const [posts, threads, slugs] = await Promise.all([
    client
      .from("forum_posts")
      .select(`id,images,created_at,author:forum_profiles!forum_posts_author_fkey(${MEMBER_COLS}),${thread}`)
      .eq("status", "approved")
      .eq("thread.status", "approved")
      .neq("images", "[]")
      .order("created_at", { ascending: false })
      .limit(limit * 3),
    client
      .from("forum_threads")
      .select(`id,short_id,slug,title,category_id,country,images,created_at,author:forum_profiles!forum_threads_author_fkey(${MEMBER_COLS})`)
      .eq("status", "approved")
      .neq("images", "[]")
      .order("created_at", { ascending: false })
      .limit(limit * 2),
    slugMap(client),
  ]);
  const out: PhotoItem[] = [];
  for (const r of (posts.data ?? []) as any[]) {
    const th = one(r.thread);
    const slug = th ? slugs.get(th.category_id) : undefined;
    const img = sanitizeImages(r.images)[0];
    if (!th || !slug || !img || !forCountry(th.country, country)) continue;
    out.push({ key: `p-${r.id}`, path: `${threadPath(slug, th.slug, th.short_id)}#post-${r.id}`, threadTitle: th.title, categorySlug: slug, image: img, createdAt: r.created_at, author: member(r.author) });
  }
  for (const r of (threads.data ?? []) as any[]) {
    const slug = slugs.get(r.category_id);
    const img = sanitizeImages(r.images)[0];
    if (!slug || !img || !forCountry(r.country, country)) continue;
    out.push({ key: `t-${r.id}`, path: threadPath(slug, r.slug, r.short_id), threadTitle: r.title, categorySlug: slug, image: img, createdAt: r.created_at, author: member(r.author) });
  }
  return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit);
}

export interface PollSummary {
  pollId: string;
  question: string;
  path: string;
  title: string;
  categorySlug: ForumCategorySlug;
  createdAt: string;
}

/** Open polls from the last 45 days, for one country (or for both). */
export async function listActivePolls(country: RoomCountry, limit = 4): Promise<PollSummary[]> {
  if (previewSamplesOn()) return [];
  if (isVpsLiveCustomerAuth()) {
    const rows = await vpsAppDatabase().prepare(`SELECT p.id,p.question,p.created_at,t.slug,t.short_id,t.title,c.slug AS category
      FROM forum_polls p JOIN forum_threads t ON t.id=p.thread_id JOIN forum_categories c ON c.id=t.category_id
      WHERE ${publicThread} AND (t.country IS NULL OR t.country=?)
      AND julianday(p.created_at)>=julianday('now','-45 days')
      AND (p.closes_at IS NULL OR julianday(p.closes_at)>julianday('now')) ORDER BY p.created_at DESC LIMIT ?`)
      .bind(country, limit).all<{ id: string; question: string; created_at: string; slug: string; short_id: string; title: string; category: string }>();
    return rows.results.flatMap((r) => {
      const category = canonicalRoom(r.category);
      return category ? [{ pollId: r.id, question: r.question, createdAt: r.created_at, path: threadPath(category, r.slug, r.short_id),
        title: r.title, categorySlug: category }] : [];
    });
  }
  const client = db();
  if (!client || !(await forumV2Ready(client))) return [];
  const since = new Date(Date.now() - 45 * 86_400_000).toISOString().slice(0, 10);
  const [{ data, error }, slugs] = await Promise.all([
    client
      .from("forum_polls")
      .select("id,question,closes_at,created_at,thread:forum_threads!inner(id,short_id,slug,title,category_id,country,status)")
      .eq("thread.status", "approved")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(limit * 4),
    slugMap(client),
  ]);
  if (error) return [];
  const now = Date.now();
  const out: PollSummary[] = [];
  for (const r of (data ?? []) as any[]) {
    const th = one(r.thread);
    const slug = th ? slugs.get(th.category_id) : undefined;
    if (!th || !slug || !forCountry(th.country, country)) continue;
    if (r.closes_at && new Date(r.closes_at).getTime() <= now) continue;
    out.push({ pollId: r.id, question: r.question, path: threadPath(slug, th.slug, th.short_id), title: th.title, categorySlug: slug, createdAt: r.created_at });
  }
  return out.slice(0, limit);
}

/** Newest recurring threads of one series for one country (e.g. this week's "Open bids" threads). */
export async function listRecurringThreads(kind: RecurringKind, country: RoomCountry, limit = 40): Promise<ThreadWithCategory[]> {
  if (previewSamplesOn()) return [];
  if (isVpsLiveCustomerAuth()) return nativeThreadSummaries(await nativeThreads("t.auto_source=? AND t.country=?",
    [kind, country], "t.created_at DESC", limit));
  const client = db();
  if (!client || !(await forumV2Ready(client))) return [];
  const [cols, slugs] = await Promise.all([threadCols(client), slugMap(client)]);
  const { data, error } = await client
    .from("forum_threads")
    .select(`${cols},category_id`)
    .eq("status", "approved")
    .eq("auto_source", kind)
    .eq("country", country)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) return [];
  return withSlugs((data ?? []) as any[], slugs);
}

export interface PollView {
  id: string;
  question: string;
  closesAt: string | null;
  options: { id: string; label: string; position: number }[];
}

/** A thread's poll (public read: the question and options, never the counts). */
export async function getPoll(threadId: string): Promise<PollView | null> {
  if (previewSamplesOn()) return null;
  if (isVpsLiveCustomerAuth()) {
    const row = await vpsAppDatabase().prepare(`SELECT p.id,p.question,p.closes_at,
      (SELECT json_group_array(json_object('id',id,'label',label,'position',position)) FROM forum_poll_options WHERE poll_id=p.id) AS options
      FROM forum_polls p JOIN forum_threads t ON t.id=p.thread_id JOIN forum_categories c ON c.id=t.category_id
      WHERE p.thread_id=? AND ${publicThread}`).bind(threadId)
      .first<{ id: string; question: string; closes_at: string | null; options: string }>();
    return row ? { id: row.id, question: row.question, closesAt: row.closes_at,
      options: (JSON.parse(row.options) as PollView["options"]).sort((a,b) => a.position-b.position) } : null;
  }
  const client = db();
  if (!client || !(await forumV2Ready(client))) return null;
  const { data, error } = await client.from("forum_polls").select("id,question,closes_at,options:forum_poll_options!forum_poll_options_poll_id_fkey(id,label,position)").eq("thread_id", threadId).maybeSingle();
  if (error || !data) return null;
  const r = data as any;
  return {
    id: r.id,
    question: r.question,
    closesAt: r.closes_at,
    options: ((r.options ?? []) as any[]).map((o) => ({ id: o.id, label: o.label, position: o.position })).sort((a, b) => a.position - b.position),
  };
}

/**
 * The viewer's own vote, and the counts once they have voted (the
 * forum_poll_results RPC refuses counts to anyone who hasn't). Cookie
 * client: RLS sees the viewer.
 */
export async function viewerPollState(userId: string, pollId: string): Promise<{ votedFor: string | null; counts: Map<string, number> | null }> {
  if (isVpsLiveCustomerAuth()) {
    const db = vpsAppDatabase();
    const vote = await db.prepare("SELECT option_id FROM forum_poll_votes WHERE poll_id=? AND user_id=?")
      .bind(pollId, userId).first<{ option_id: string }>();
    if (!vote) return { votedFor: null, counts: null };
    const counts = await db.prepare("SELECT option_id,count(*) AS n FROM forum_poll_votes WHERE poll_id=? GROUP BY option_id")
      .bind(pollId).all<{ option_id: string; n: number }>();
    return { votedFor: vote.option_id, counts: new Map(counts.results.map((row) => [row.option_id, row.n])) };
  }
  const client = await createClient();
  const { data } = await client.from("forum_poll_votes").select("option_id").eq("poll_id", pollId).eq("user_id", userId).maybeSingle<{ option_id: string }>();
  if (!data) return { votedFor: null, counts: null };
  const { data: rows, error } = await client.rpc("forum_poll_results", { pid: pollId });
  if (error) return { votedFor: data.option_id, counts: null };
  return { votedFor: data.option_id, counts: new Map(((rows ?? []) as { option_id: string; votes: number }[]).map((r) => [r.option_id, r.votes])) };
}

/** Room ids the viewer follows (RLS: own rows). Empty before the migration. */
export async function viewerFollows(userId: string): Promise<Set<string>> {
  if (isVpsLiveCustomerAuth()) {
    const rows = await vpsAppDatabase().prepare(`SELECT f.category_id FROM forum_room_follows f JOIN forum_categories c ON c.id=f.category_id
      WHERE f.user_id=? AND c.is_public=1`).bind(userId).all<{ category_id: string }>();
    return new Set(rows.results.map((row) => row.category_id));
  }
  const client = await createClient();
  const { data, error } = await client.from("forum_room_follows").select("category_id").eq("user_id", userId);
  if (error) return new Set();
  return new Set(((data ?? []) as { category_id: string }[]).map((r) => r.category_id));
}
/* eslint-enable @typescript-eslint/no-explicit-any */
