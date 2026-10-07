"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSession, isAdminRole, type SessionContext } from "@/lib/access/access";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { isServiceConfigured } from "@/lib/supabase/config";
import { checkRateLimitByIp } from "@/lib/rate-limit";
import { sendAdminForumQueue } from "@/lib/email/send";
import { DEFAULT_LOCALE, isEnabledLocale, localizePath } from "@/i18n/config";
import { isForumCategory } from "./categories";
import { isMissingTable, threadPath } from "./data";
import { POINTS, checkPost, ratingPoints, shouldAutoHide } from "./rules";
import { handleFrom, normalizeBody, normalizeTitle, shortId, slugify, wordCount } from "./text";
import { turnstileEnabled, verifyTurnstile } from "./turnstile";
import { sessionCanPost } from "./eligibility";

/** Error codes; the forms translate them (forumClient.errors). */
export type ForumError =
  | "signin" | "verify" | "unavailable" | "banned" | "rate" | "cooldown" | "daily-threads" | "daily-posts"
  | "shortener" | "duplicate" | "honeypot" | "captcha" | "title" | "body" | "category" | "locked"
  | "notfound" | "forbidden" | "own" | "failed" | "unverified";

export interface ForumFormState {
  error?: ForumError;
  ok?: boolean;
  held?: boolean;
}

interface ProfileRow {
  user_id: string;
  handle: string;
  display_name: string;
  organization_id: string | null;
  post_count: number;
  verified_business: boolean;
  is_staff: boolean;
  banned: boolean;
  created_at: string;
}

interface Actor {
  userId: string;
  session: SessionContext;
  isAdmin: boolean;
  profile: ProfileRow;
  admin: SupabaseClient;
}

const PROFILE_COLS = "user_id,handle,display_name,organization_id,post_count,verified_business,is_staff,banned,created_at";

async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
}

function hostOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(/^https?:\/\//.test(url) ? url : `https://${url}`).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

async function award(admin: SupabaseClient, userId: string, event: keyof typeof POINTS | "rating", points: number, refType: string, refId: string) {
  if (!points) return;
  await admin.from("forum_reputation_events").upsert(
    { user_id: userId, event, points, ref_type: refType, ref_id: refId },
    { onConflict: "user_id,event,ref_type,ref_id", ignoreDuplicates: true },
  );
}

async function unaward(admin: SupabaseClient, userId: string, event: string, refType: string, refId: string) {
  await admin.from("forum_reputation_events").delete().eq("user_id", userId).eq("event", event).eq("ref_type", refType).eq("ref_id", refId);
}

/** The forum profile for this session, created on first use. */
async function ensureProfile(admin: SupabaseClient, session: SessionContext, email: string): Promise<ProfileRow | "missing"> {
  const { data, error } = await admin.from("forum_profiles").select(PROFILE_COLS).eq("user_id", session.userId).maybeSingle<ProfileRow>();
  if (error) return isMissingTable(error) ? "missing" : "missing";
  if (data) return data;

  const org = session.organization;
  const orgOk = org && org.profile_status === "approved" && org.status === "active";
  const emailHost = email.split("@")[1]?.toLowerCase() ?? "";
  const verified = Boolean(orgOk && hostOf(org!.website) && hostOf(org!.website) === emailHost);
  const base = handleFrom(session.profile.full_name || email);
  for (let i = 0; i < 5; i++) {
    const handle = i === 0 ? base : `${base.slice(0, 24)}_${shortId(4)}`;
    const row = {
      user_id: session.userId,
      handle,
      display_name: (session.profile.full_name || handle).slice(0, 60),
      organization_id: orgOk ? org!.id : null,
      region: org?.province ?? null,
      verified_business: verified,
    };
    const { data: created, error: e } = await admin.from("forum_profiles").insert(row).select(PROFILE_COLS).single<ProfileRow>();
    if (created) {
      if (verified) await award(admin, session.userId, "verifiedBusiness", POINTS.verifiedBusiness, "org", org!.id);
      return created;
    }
    if (e && e.code !== "23505") return "missing";
  }
  return "missing";
}

async function getActor(): Promise<{ actor: Actor } | { error: ForumError }> {
  if (!isServiceConfigured()) return { error: "unavailable" };
  const session = await getSession();
  if (!session) return { error: "signin" };
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user) return { error: "signin" };
  if (!user.email_confirmed_at) return { error: "verify" };
  if (!(await sessionCanPost(session, user))) return { error: "unverified" };
  const admin = createServiceClient();
  const profile = await ensureProfile(admin, session, user.email ?? session.profile.email);
  if (profile === "missing") return { error: "unavailable" };
  if (profile.banned) return { error: "banned" };
  void admin.from("forum_profiles").update({ last_seen_at: new Date().toISOString() }).eq("user_id", session.userId).then(() => undefined);
  return { actor: { userId: session.userId, session, isAdmin: isAdminRole(session.profile.primary_role), profile, admin } };
}

async function isMod(a: Actor, categoryId: string): Promise<boolean> {
  if (a.isAdmin) return true;
  const { data } = await a.admin.from("forum_category_mods").select("user_id").eq("user_id", a.userId).eq("category_id", categoryId).maybeSingle();
  return Boolean(data);
}

/** Per-account activity for the spam rules. */
async function activity(a: Actor, body: string) {
  const since = new Date(Date.now() - 86_400_000).toISOString();
  const [t, p, lastT, lastP, dupT, dupP] = await Promise.all([
    a.admin.from("forum_threads").select("id", { count: "exact", head: true }).eq("author_id", a.userId).gte("created_at", since),
    a.admin.from("forum_posts").select("id", { count: "exact", head: true }).eq("author_id", a.userId).gte("created_at", since),
    a.admin.from("forum_threads").select("created_at").eq("author_id", a.userId).order("created_at", { ascending: false }).limit(1).maybeSingle<{ created_at: string }>(),
    a.admin.from("forum_posts").select("created_at").eq("author_id", a.userId).order("created_at", { ascending: false }).limit(1).maybeSingle<{ created_at: string }>(),
    a.admin.from("forum_threads").select("id", { count: "exact", head: true }).eq("author_id", a.userId).eq("body", body).gte("created_at", since),
    a.admin.from("forum_posts").select("id", { count: "exact", head: true }).eq("author_id", a.userId).eq("body", body).gte("created_at", since),
  ]);
  const last = [lastT.data?.created_at, lastP.data?.created_at].filter(Boolean).map((d) => new Date(d!).getTime());
  return {
    threadsToday: t.count ?? 0,
    postsToday: p.count ?? 0,
    secondsSinceLast: last.length ? (Date.now() - Math.max(...last)) / 1000 : null,
    duplicate: (dupT.count ?? 0) + (dupP.count ?? 0) > 0,
  };
}

async function spamGate(a: Actor, kind: "thread" | "post", body: string, formData: FormData, trusted: boolean): Promise<{ error: ForumError } | { hold: boolean }> {
  const ip = await clientIp();
  if (await checkRateLimitByIp(ip, "forum-post")) return { error: "rate" };
  const act = await activity(a, body);
  const res = checkPost({
    kind,
    body,
    honeypot: formData.get("website")?.toString(),
    banned: a.profile.banned,
    postCount: a.profile.post_count,
    joinedAt: a.profile.created_at,
    trusted,
    ...act,
  });
  if (!res.ok) return { error: res.reason };
  if (turnstileEnabled() && a.profile.post_count === 0) {
    const ok = await verifyTurnstile(formData.get("cf-turnstile-response")?.toString(), ip);
    if (!ok) return { error: "captcha" };
  }
  return { hold: res.hold };
}

function langPath(formData: FormData, path: string): string {
  const l = formData.get("lang");
  return localizePath(path, isEnabledLocale(l) ? l : DEFAULT_LOCALE);
}

// ── Threads ─────────────────────────────────────────────────────────
export async function createThreadAction(_prev: ForumFormState, formData: FormData): Promise<ForumFormState> {
  const got = await getActor();
  if ("error" in got) return { error: got.error };
  const a = got.actor;
  const staff = formData.get("staff") === "1" && a.isAdmin;

  const category = formData.get("category")?.toString();
  if (!isForumCategory(category)) return { error: "category" };
  const type = formData.get("type") === "question" ? "question" : "discussion";
  const title = normalizeTitle(formData.get("title")?.toString() ?? "");
  const body = normalizeBody(formData.get("body")?.toString() ?? "");
  if (title.length < 8) return { error: "title" };
  if (body.length < 20) return { error: "body" };
  const region = formData.get("region")?.toString().trim().slice(0, 40) || null;

  const gate = await spamGate(a, "thread", body, formData, staff || a.isAdmin);
  if ("error" in gate) return { error: gate.error };

  const { data: cat } = await a.admin.from("forum_categories").select("id").eq("slug", category).maybeSingle<{ id: string }>();
  if (!cat) return { error: "unavailable" };

  if (staff && !a.profile.is_staff) await a.admin.from("forum_profiles").update({ is_staff: true }).eq("user_id", a.userId);

  const slug = slugify(title);
  let sid = "";
  let insertedId = "";
  for (let i = 0; i < 3 && !insertedId; i++) {
    sid = shortId(8);
    const { data, error } = await a.admin
      .from("forum_threads")
      .insert({
        short_id: sid,
        category_id: cat.id,
        author_id: a.userId,
        type,
        title,
        slug,
        body,
        body_words: wordCount(body) + wordCount(title),
        status: gate.hold ? "held" : "approved",
        is_staff: staff,
        region,
      })
      .select("id")
      .single<{ id: string }>();
    if (data) insertedId = data.id;
    else if (error && error.code !== "23505") return { error: isMissingTable(error) ? "unavailable" : "failed" };
  }
  if (!insertedId) return { error: "failed" };

  if (gate.hold) {
    await sendAdminForumQueue({ reason: "held", title, author: a.profile.handle }).catch(() => undefined);
    return { ok: true, held: true };
  }
  await award(a.admin, a.userId, "post", POINTS.post, "thread", insertedId);
  redirect(langPath(formData, threadPath(category, slug, sid)));
}

export async function createReplyAction(_prev: ForumFormState, formData: FormData): Promise<ForumFormState> {
  const got = await getActor();
  if ("error" in got) return { error: got.error };
  const a = got.actor;
  const threadId = formData.get("threadId")?.toString() ?? "";
  const body = normalizeBody(formData.get("body")?.toString() ?? "");
  if (body.length < 2) return { error: "body" };

  const { data: t } = await a.admin
    .from("forum_threads")
    .select("id,title,status,is_locked,category_id")
    .eq("id", threadId)
    .maybeSingle<{ id: string; title: string; status: string; is_locked: boolean; category_id: string }>();
  if (!t || t.status !== "approved") return { error: "notfound" };
  const mod = await isMod(a, t.category_id);
  if (t.is_locked && !mod) return { error: "locked" };

  const gate = await spamGate(a, "post", body, formData, mod);
  if ("error" in gate) return { error: gate.error };

  const { data: post, error } = await a.admin
    .from("forum_posts")
    .insert({ thread_id: t.id, author_id: a.userId, body, body_words: wordCount(body), status: gate.hold ? "held" : "approved", is_staff: a.profile.is_staff && a.isAdmin })
    .select("id")
    .single<{ id: string }>();
  if (!post) return { error: isMissingTable(error) ? "unavailable" : "failed" };

  if (gate.hold) {
    await sendAdminForumQueue({ reason: "held", title: t.title, author: a.profile.handle }).catch(() => undefined);
    return { ok: true, held: true };
  }
  await award(a.admin, a.userId, "post", POINTS.post, "post", post.id);
  return { ok: true };
}

// ── Rating, votes, accepted answer ──────────────────────────────────
export async function rateThreadAction(threadId: string, score: number): Promise<ForumFormState> {
  if (!Number.isInteger(score) || score < 1 || score > 5) return { error: "failed" };
  const got = await getActor();
  if ("error" in got) return { error: got.error };
  const a = got.actor;
  if (await checkRateLimitByIp(await clientIp(), "forum-vote")) return { error: "rate" };
  const { data: t } = await a.admin.from("forum_threads").select("id,author_id,status").eq("id", threadId).maybeSingle<{ id: string; author_id: string; status: string }>();
  if (!t || t.status !== "approved") return { error: "notfound" };
  if (t.author_id === a.userId) return { error: "own" };
  const { error } = await a.admin.from("forum_thread_ratings").upsert({ thread_id: t.id, user_id: a.userId, score }, { onConflict: "thread_id,user_id" });
  if (error) return { error: "failed" };
  const ref = `${t.id}:${a.userId}`;
  await unaward(a.admin, t.author_id, "rating", "rating", ref);
  await award(a.admin, t.author_id, "rating", ratingPoints(score), "rating", ref);
  return { ok: true };
}

export async function upvotePostAction(postId: string): Promise<ForumFormState> {
  const got = await getActor();
  if ("error" in got) return { error: got.error };
  const a = got.actor;
  if (await checkRateLimitByIp(await clientIp(), "forum-vote")) return { error: "rate" };
  const { data: p } = await a.admin.from("forum_posts").select("id,author_id,status").eq("id", postId).maybeSingle<{ id: string; author_id: string; status: string }>();
  if (!p || p.status !== "approved") return { error: "notfound" };
  if (p.author_id === a.userId) return { error: "own" };
  const ref = `${p.id}:${a.userId}`;
  const { data: existing } = await a.admin.from("forum_post_votes").select("post_id").eq("post_id", p.id).eq("user_id", a.userId).maybeSingle();
  if (existing) {
    await a.admin.from("forum_post_votes").delete().eq("post_id", p.id).eq("user_id", a.userId);
    await unaward(a.admin, p.author_id, "answerUpvoted", "vote", ref);
  } else {
    const { error } = await a.admin.from("forum_post_votes").insert({ post_id: p.id, user_id: a.userId, value: 1 });
    if (error) return { error: "failed" };
    await award(a.admin, p.author_id, "answerUpvoted", POINTS.answerUpvoted, "vote", ref);
  }
  return { ok: true };
}

export async function acceptAnswerAction(postId: string): Promise<ForumFormState> {
  const got = await getActor();
  if ("error" in got) return { error: got.error };
  const a = got.actor;
  const { data: p } = await a.admin.from("forum_posts").select("id,thread_id,author_id,status").eq("id", postId).maybeSingle<{ id: string; thread_id: string; author_id: string; status: string }>();
  if (!p || p.status !== "approved") return { error: "notfound" };
  const { data: t } = await a.admin
    .from("forum_threads")
    .select("id,author_id,type,accepted_post_id,category_id")
    .eq("id", p.thread_id)
    .maybeSingle<{ id: string; author_id: string; type: string; accepted_post_id: string | null; category_id: string }>();
  if (!t || t.type !== "question") return { error: "notfound" };
  if (t.author_id !== a.userId && !(await isMod(a, t.category_id))) return { error: "forbidden" };

  if (t.accepted_post_id) {
    const { data: prev } = await a.admin.from("forum_posts").select("id,author_id").eq("id", t.accepted_post_id).maybeSingle<{ id: string; author_id: string }>();
    await a.admin.from("forum_posts").update({ is_accepted: false }).eq("id", t.accepted_post_id);
    if (prev) await unaward(a.admin, prev.author_id, "acceptedAnswer", "post", prev.id);
  }
  const unaccept = t.accepted_post_id === p.id;
  await a.admin.from("forum_threads").update({ accepted_post_id: unaccept ? null : p.id }).eq("id", t.id);
  if (!unaccept) {
    await a.admin.from("forum_posts").update({ is_accepted: true }).eq("id", p.id);
    if (p.author_id !== t.author_id) await award(a.admin, p.author_id, "acceptedAnswer", POINTS.acceptedAnswer, "post", p.id);
  }
  return { ok: true };
}

// ── Reports and moderation ──────────────────────────────────────────
type Target = "thread" | "post";

async function loadTarget(admin: SupabaseClient, type: Target, id: string) {
  if (type === "thread") {
    const { data } = await admin.from("forum_threads").select("id,author_id,status,category_id,title").eq("id", id).maybeSingle<{ id: string; author_id: string; status: string; category_id: string; title: string }>();
    return data ? { ...data, threadTitle: data.title } : null;
  }
  const { data } = await admin
    .from("forum_posts")
    .select("id,author_id,status,forum_threads!inner(category_id,title)")
    .eq("id", id)
    .maybeSingle();
  if (!data) return null;
  const d = data as unknown as { id: string; author_id: string; status: string; forum_threads: { category_id: string; title: string } | { category_id: string; title: string }[] };
  const th = Array.isArray(d.forum_threads) ? d.forum_threads[0] : d.forum_threads;
  return { id: d.id, author_id: d.author_id, status: d.status, category_id: th.category_id, threadTitle: th.title };
}

export async function reportAction(type: Target, id: string, reason?: string): Promise<ForumFormState> {
  const got = await getActor();
  if ("error" in got) return { error: got.error };
  const a = got.actor;
  if (await checkRateLimitByIp(await clientIp(), "forum-vote")) return { error: "rate" };
  const target = await loadTarget(a.admin, type, id);
  if (!target || target.status !== "approved") return { error: "notfound" };
  if (target.author_id === a.userId) return { error: "own" };
  await a.admin.from("forum_reports").upsert(
    { target_type: type, target_id: id, reporter_id: a.userId, reason: reason?.slice(0, 300) || null },
    { onConflict: "target_type,target_id,reporter_id", ignoreDuplicates: true },
  );
  const { count } = await a.admin.from("forum_reports").select("id", { count: "exact", head: true }).eq("target_type", type).eq("target_id", id).eq("status", "open");
  const table = type === "thread" ? "forum_threads" : "forum_posts";
  const hide = shouldAutoHide(count ?? 0);
  await a.admin.from(table).update(hide ? { flag_count: count ?? 0, status: "hidden" } : { flag_count: count ?? 0 }).eq("id", id);
  if (hide) {
    await a.admin.from("forum_mod_log").insert({ mod_id: a.userId, action: "auto-hide", target_type: type, target_id: id, reason: `${count} reports` });
    await sendAdminForumQueue({ reason: "reported", title: target.threadTitle, author: target.author_id }).catch(() => undefined);
  }
  return { ok: true };
}

export type ModOp = "hide" | "unhide" | "approve" | "lock" | "unlock" | "pin" | "unpin";

export async function modAction(type: Target, id: string, op: ModOp, reason?: string): Promise<ForumFormState> {
  const got = await getActor();
  if ("error" in got) return { error: got.error };
  const a = got.actor;
  const target = await loadTarget(a.admin, type, id);
  if (!target) return { error: "notfound" };
  if (!(await isMod(a, target.category_id))) return { error: "forbidden" };
  const table = type === "thread" ? "forum_threads" : "forum_posts";
  const ref = type === "thread" ? "thread" : "post";

  switch (op) {
    case "hide":
      await a.admin.from(table).update({ status: "hidden" }).eq("id", id);
      await award(a.admin, target.author_id, "contentRemoved", POINTS.contentRemoved, ref, id);
      await a.admin.from("forum_reports").update({ status: "resolved", resolved_by: a.userId }).eq("target_type", type).eq("target_id", id).eq("status", "open");
      break;
    case "unhide":
    case "approve":
      await a.admin.from(table).update({ status: "approved", ...(op === "unhide" ? { flag_count: 0 } : {}) }).eq("id", id);
      await unaward(a.admin, target.author_id, "contentRemoved", ref, id);
      await award(a.admin, target.author_id, "post", POINTS.post, ref, id);
      await a.admin.from("forum_reports").update({ status: "dismissed", resolved_by: a.userId }).eq("target_type", type).eq("target_id", id).eq("status", "open");
      break;
    case "lock":
    case "unlock":
      if (type !== "thread") return { error: "failed" };
      await a.admin.from("forum_threads").update({ is_locked: op === "lock" }).eq("id", id);
      break;
    case "pin":
    case "unpin":
      if (type !== "thread") return { error: "failed" };
      await a.admin.from("forum_threads").update({ is_pinned: op === "pin" }).eq("id", id);
      break;
    default:
      return { error: "failed" };
  }
  await a.admin.from("forum_mod_log").insert({ mod_id: a.userId, action: op, target_type: type, target_id: id, reason: reason?.slice(0, 300) || null });
  return { ok: true };
}

/** Staff-only: appoint (or remove) a community moderator by handle. */
export async function appointModAction(_prev: ForumFormState, formData: FormData): Promise<ForumFormState> {
  const got = await getActor();
  if ("error" in got) return { error: got.error };
  const a = got.actor;
  if (!a.isAdmin) return { error: "forbidden" };
  const handle = formData.get("handle")?.toString().trim().replace(/^@/, "").toLowerCase() ?? "";
  const category = formData.get("category")?.toString();
  if (!isForumCategory(category)) return { error: "category" };
  const [{ data: prof }, { data: cat }] = await Promise.all([
    a.admin.from("forum_profiles").select("user_id").eq("handle", handle).maybeSingle<{ user_id: string }>(),
    a.admin.from("forum_categories").select("id").eq("slug", category).maybeSingle<{ id: string }>(),
  ]);
  if (!prof || !cat) return { error: "notfound" };
  const remove = formData.get("remove") === "1";
  if (remove) {
    await a.admin.from("forum_category_mods").delete().eq("category_id", cat.id).eq("user_id", prof.user_id);
  } else {
    await a.admin.from("forum_category_mods").upsert({ category_id: cat.id, user_id: prof.user_id }, { onConflict: "category_id,user_id", ignoreDuplicates: true });
  }
  await a.admin.from("forum_mod_log").insert({ mod_id: a.userId, action: remove ? "remove-mod" : "appoint-mod", target_type: "profile", target_id: prof.user_id, reason: category });
  return { ok: true };
}
