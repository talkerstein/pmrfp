import type { SupabaseClient } from "@supabase/supabase-js";
import { createReadClient } from "@/lib/supabase/read";
import { createServiceClient } from "@/lib/supabase/service";
import { isServiceConfigured, isSupabaseConfigured } from "@/lib/supabase/config";
import { FORUM_CATEGORY_SLUGS, type ForumCategorySlug } from "./categories";
import { PAGE_SIZE, isIndexableThread, ratingAverage } from "./rules";
import { SYSTEM_HANDLE } from "./auto-threads";
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
  reputation: number;
  isStaff: boolean;
  verifiedBusiness: boolean;
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
}

type Res<T> = ({ ready: true } & T) | { ready: false };

const MEMBER_COLS = "user_id,handle,display_name,reputation,is_staff,verified_business";
const THREAD_COLS =
  "id,short_id,slug,title,type,status,is_pinned,is_locked,is_staff,accepted_post_id,reply_count,view_count,rating_sum,rating_count,created_at,last_post_at,region," +
  `author:forum_profiles!forum_threads_author_fkey(${MEMBER_COLS}),last_user:forum_profiles!forum_threads_last_user_fkey(handle,display_name)`;

/** Table missing (migration not applied) or schema cache not reloaded yet. */
export function isMissingTable(err: { code?: string; message?: string } | null | undefined): boolean {
  if (!err) return false;
  return err.code === "42P01" || err.code === "PGRST205" || err.code === "PGRST200" || /forum_\w+.*(does not exist|schema cache)/.test(err.message ?? "");
}

function db(): SupabaseClient | null {
  return isSupabaseConfigured() ? createReadClient() : null;
}

type MemberRow = { user_id: string; handle: string; display_name: string; reputation: number; is_staff: boolean; verified_business: boolean };

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
  };
}

/** Threads by the PMRFP Board system profile are automatic posts. */
function isSystemAuthor(a: { handle?: string } | { handle?: string }[] | null | undefined): boolean {
  const m = Array.isArray(a) ? a[0] : a;
  return m?.handle === SYSTEM_HANDLE;
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
  const rows = (data as any[]).filter((c) => (FORUM_CATEGORY_SLUGS as readonly string[]).includes(c.slug));
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
  opts: { hideAuto?: boolean } = {},
): Promise<{ threads: ThreadSummary[]; pinned: ThreadSummary[]; total: number }> {
  if (previewSamplesOn()) {
    const s = sampleCategoryThreads(categoryId);
    if (sort === "latest") return s;
    const threads = filterThreads(s.threads, sort);
    return { pinned: [], threads, total: threads.length };
  }
  const client = db();
  if (!client) return { threads: [], pinned: [], total: 0 };
  const from = (page - 1) * PAGE_SIZE;
  // ?auto=0: hide automatic PMRFP Board posts.
  const hideId = opts.hideAuto ? await systemAuthorId(client) : null;
  const [pinned, list] = await Promise.all([
    page === 1 && sort === "latest"
      ? client.from("forum_threads").select(THREAD_COLS).eq("category_id", categoryId).eq("status", "approved").eq("is_pinned", true).order("last_post_at", { ascending: false }).limit(10)
      : Promise.resolve({ data: [] as any[] }),
    (() => {
      // Pinned threads sit above the Latest tab; the other tabs include them.
      let q = client.from("forum_threads").select(THREAD_COLS, { count: "exact" }).eq("category_id", categoryId).eq("status", "approved");
      if (sort === "latest") q = q.eq("is_pinned", false);
      if (hideId) q = q.neq("author_id", hideId);
      return applyThreadSort(q, sort).range(from, from + PAGE_SIZE - 1);
    })(),
  ]);
  return {
    pinned: ((pinned.data ?? []) as any[]).map((r) => summary(r, categorySlug)),
    threads: ((list.data ?? []) as any[]).map((r) => summary(r, categorySlug)),
    total: (list as { count?: number | null }).count ?? 0,
  };
}

async function slugMap(client: SupabaseClient): Promise<Map<string, ForumCategorySlug>> {
  const { data } = await client.from("forum_categories").select("id,slug");
  return new Map(((data ?? []) as { id: string; slug: ForumCategorySlug }[]).filter((c) => (FORUM_CATEGORY_SLUGS as readonly string[]).includes(c.slug)).map((c) => [c.id, c.slug]));
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
  const client = db();
  if (!client) return [];
  const [{ data, error }, slugs] = await Promise.all([
    client.from("forum_threads").select(`${THREAD_COLS},category_id`).eq("status", "approved").order("last_post_at", { ascending: false }).limit(limit),
    slugMap(client),
  ]);
  if (error) return [];
  return withSlugs((data ?? []) as any[], slugs);
}

/** Pinned threads across every forum (e.g. "Start here: how this forum works"). */
export async function listPinnedThreads(limit = 3): Promise<ThreadWithCategory[]> {
  if (previewSamplesOn()) return sampleAllThreads().filter((t) => t.isPinned).slice(0, limit);
  const client = db();
  if (!client) return [];
  const [{ data, error }, slugs] = await Promise.all([
    client.from("forum_threads").select(`${THREAD_COLS},category_id`).eq("status", "approved").eq("is_pinned", true).order("created_at", { ascending: true }).limit(limit),
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
  const client = db();
  if (!client) return [];
  const [{ data, error }, slugs] = await Promise.all([
    client.from("forum_threads").select(`${THREAD_COLS},category_id`).eq("status", "approved").ilike("title", ilikePattern(q)).order("last_post_at", { ascending: false }).limit(limit),
    slugMap(client),
  ]);
  if (error) return [];
  return withSlugs((data ?? []) as any[], slugs);
}

/** Other threads in the same forum, for the thread page sidebar. */
export async function listRelatedThreads(categoryId: string, categorySlug: ForumCategorySlug, excludeId: string, limit = 5): Promise<ThreadSummary[]> {
  if (previewSamplesOn()) return sampleAllThreads().filter((t) => t.categorySlug === categorySlug && t.id !== excludeId).slice(0, limit);
  const client = db();
  if (!client) return [];
  const { data } = await client
    .from("forum_threads")
    .select(THREAD_COLS)
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
  for (const c of (data ?? []) as { id: string; slug: ForumCategorySlug }[]) CATEGORY_BY_ID.set(c.id, c.slug);
  return CATEGORY_BY_ID.get(id) ?? null;
}

/** One approved thread by short id (public read). */
export async function getThread(sid: string): Promise<Res<{ thread: Thread | null }>> {
  if (previewSamplesOn()) return { ready: true, thread: sampleThread(sid) };
  const client = db();
  if (!client) return { ready: false };
  const { data, error } = await client
    .from("forum_threads")
    .select(`${THREAD_COLS},category_id,body,words_total,flag_count,region,updated_at`)
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
  };
}

const POST_COLS = `id,body,status,is_staff,is_accepted,upvote_count,created_at,edited_at,author:forum_profiles!forum_posts_author_fkey(${MEMBER_COLS})`;

export async function listPosts(thread: Thread, page: number): Promise<{ posts: Post[]; accepted: Post | null }> {
  if (previewSamplesOn()) return samplePosts(thread);
  const client = db();
  if (!client) return { posts: [], accepted: null };
  const from = (page - 1) * PAGE_SIZE;
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
    rank: number;
  } | null;
}

export async function getProfile(handle: string): Promise<Res<{ profile: Profile | null }>> {
  if (previewSamplesOn()) return { ready: true, profile: sampleProfile(handle) };
  const client = db();
  if (!client) return { ready: false };
  if (!/^[a-z0-9_]{3,30}$/.test(handle)) return { ready: true, profile: null };
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
    client.from("forum_threads").select(`${THREAD_COLS},category_id`).eq("author_id", p.user_id).eq("status", "approved").order("created_at", { ascending: false }).limit(10),
    client.from("forum_category_mods").select("category_id").eq("user_id", p.user_id),
    client.from("forum_categories").select("id,slug"),
  ]);
  const slugById = new Map(((cats.data ?? []) as { id: string; slug: ForumCategorySlug }[]).map((c) => [c.id, c.slug]));
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
        rank: members.reduce((s, m) => s + m.reputation, 0),
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
  const slugById = new Map(((cats ?? []) as { id: string; slug: string }[]).map((c) => [c.id, c.slug]));
  return (data as any[])
    .filter((t) => slugById.has(t.category_id) && isIndexableThread({ status: t.status, type: t.type, replyCount: t.reply_count, wordsTotal: t.words_total, flagged: false, category: slugById.get(t.category_id) }))
    .map((t) => ({ path: threadPath(slugById.get(t.category_id)!, t.slug, t.short_id), lastPostAt: t.last_post_at }));
}

/** The signed-in viewer's own rating and upvotes on a thread (RLS: own rows). */
export async function viewerState(
  client: SupabaseClient,
  userId: string,
  threadId: string,
  postIds: string[],
): Promise<{ rating: number | null; voted: Set<string> }> {
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
  if (!isServiceConfigured()) return 0;
  const { data } = await createServiceClient().from("forum_profiles").select("post_count").eq("user_id", userId).maybeSingle<{ post_count: number }>();
  return data?.post_count ?? 0;
}
