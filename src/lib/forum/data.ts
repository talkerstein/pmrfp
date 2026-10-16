import type { SupabaseClient } from "@supabase/supabase-js";
import { createReadClient } from "@/lib/supabase/read";
import { countryOf } from "@/lib/visitor-geo";
import { createServiceClient } from "@/lib/supabase/service";
import { isServiceConfigured, isSupabaseConfigured } from "@/lib/supabase/config";
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
  return forumV2Ready(db());
}

// ── Discovery: this week, unanswered, photos, polls (rework) ─────────
const one = (v: any) => (Array.isArray(v) ? v[0] : v);
const forCountry = (c: unknown, country: RoomCountry) => c == null || c === country;

/** Open questions nobody has answered yet (members only: no automatic posts or guides). For helpers. */
export async function listUnansweredQuestions(country: RoomCountry, limit = 8): Promise<ThreadWithCategory[]> {
  if (previewSamplesOn()) return sampleAllThreads().filter((t) => t.type === "question" && t.replyCount === 0).slice(0, limit);
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
export async function viewerPollState(client: SupabaseClient, userId: string, pollId: string): Promise<{ votedFor: string | null; counts: Map<string, number> | null }> {
  const { data } = await client.from("forum_poll_votes").select("option_id").eq("poll_id", pollId).eq("user_id", userId).maybeSingle<{ option_id: string }>();
  if (!data) return { votedFor: null, counts: null };
  const { data: rows, error } = await client.rpc("forum_poll_results", { pid: pollId });
  if (error) return { votedFor: data.option_id, counts: null };
  return { votedFor: data.option_id, counts: new Map(((rows ?? []) as { option_id: string; votes: number }[]).map((r) => [r.option_id, r.votes])) };
}

/** Room ids the viewer follows (RLS: own rows). Empty before the migration. */
export async function viewerFollows(client: SupabaseClient, userId: string): Promise<Set<string>> {
  const { data, error } = await client.from("forum_room_follows").select("category_id").eq("user_id", userId);
  if (error) return new Set();
  return new Set(((data ?? []) as { category_id: string }[]).map((r) => r.category_id));
}
/* eslint-enable @typescript-eslint/no-explicit-any */
