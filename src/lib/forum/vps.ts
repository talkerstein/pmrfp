import "server-only";
import { randomUUID } from "node:crypto";
import type { SessionContext } from "@/lib/access/access";
import { vpsAppDatabase } from "@/lib/d1/http-binding";
import type { D1Binding } from "@/lib/d1/contracts";
import { customerAppAuthority } from "../../../workers/d1-api/customer-signup";
import { canonicalRoom, roomSlugCandidates, type ForumCategorySlug } from "./categories";
import { COOLDOWN_SECONDS, LIMITS, isNewMember } from "./rules";
import { AUTO_HIDE_REPORTS } from "./rules";
import { handleFrom, shortId, wordCount } from "./text";
import type { ModOp } from "./actions";
import type { ForumImage } from "./photos";

export type ForumActor = { userId: string; handle: string; post_count: number; banned: number; created_at: string; is_staff: number };
const active = "EXISTS(SELECT 1 FROM users_profile u WHERE u.id=? AND u.status='active')";
const writable = `${active} AND ${customerAppAuthority} AND EXISTS(SELECT 1 FROM forum_profiles f WHERE f.user_id=? AND f.banned=0)`;
const ownImages = `NOT EXISTS(SELECT 1 FROM json_each(?) j WHERE NOT EXISTS(
  SELECT 1 FROM _forum_media m WHERE m.user_id=? AND m.ready=1
    AND m.user_id||'/'||m.id||'.jpg'=json_extract(j.value,'$.path')))`;

export async function vpsForumActor(session: SessionContext, db: D1Binding = vpsAppDatabase()): Promise<ForumActor | null> {
  const get = () => db.prepare(`SELECT user_id AS userId,handle,post_count,banned,created_at,is_staff
    FROM forum_profiles WHERE user_id=? AND ${active} AND ${customerAppAuthority}`)
    .bind(session.userId, session.userId).first<ForumActor>();
  const current = await get();
  if (current) return current;
  const org = session.organization;
  const approved = org?.status === "active" && org.profile_status === "approved";
  const email = session.profile.email;
  let websiteHost: string | undefined;
  try {
    if (org?.website) websiteHost = new URL(/^https?:\/\//i.test(org.website) ? org.website : `https://${org.website}`).hostname.replace(/^www\./, "");
  } catch { /* An invalid website cannot verify a company mailbox. */ }
  const verified = approved && Boolean(websiteHost) && websiteHost === email.split("@").at(-1)?.toLowerCase();
  const base = handleFrom(session.profile.full_name || email);
  for (const handle of [base, `${base.slice(0, 24)}_${shortId(4)}`]) {
    const created = await db.prepare(`INSERT INTO forum_profiles(user_id,handle,display_name,organization_id,region,verified_business,last_seen_at)
      SELECT ?,?,?,?,?,?,? WHERE ${active} AND ${customerAppAuthority} ON CONFLICT DO NOTHING
      RETURNING user_id AS userId,handle,post_count,banned,created_at,is_staff`)
      .bind(session.userId, handle, (session.profile.full_name || handle).slice(0, 60), approved ? org.id : null,
        org?.province ?? null, Number(verified), new Date().toISOString(), session.userId).first<ForumActor>();
    if (created) return created;
    const existing = await get();
    if (existing) return existing;
  }
  return null;
}

export async function vpsForumRoom(slug: ForumCategorySlug, db: D1Binding = vpsAppDatabase()) {
  const rows = await db.prepare(`SELECT id,slug FROM forum_categories WHERE is_public=1 AND ${customerAppAuthority}
    AND slug IN (SELECT value FROM json_each(?)) ORDER BY slug=? DESC`)
    .bind(JSON.stringify(roomSlugCandidates(slug)), slug).all<{ id: string; slug: string }>();
  return rows.results.find((row) => canonicalRoom(row.slug) === slug) ?? null;
}

export async function vpsForumActivity(userId: string, body: string, db: D1Binding = vpsAppDatabase()) {
  const row = await db.prepare(`WITH recent AS (
    SELECT created_at,body,'thread' AS kind FROM forum_threads WHERE author_id=?
    UNION ALL SELECT created_at,body,'post' FROM forum_posts WHERE author_id=?
  ) SELECT sum(kind='thread' AND julianday(created_at)>julianday('now','-1 day')) AS threadsToday,
    sum(kind='post' AND julianday(created_at)>julianday('now','-1 day')) AS postsToday,
    (julianday('now')-max(julianday(created_at)))*86400 AS secondsSinceLast,
    max(body=? AND julianday(created_at)>julianday('now','-1 day')) AS duplicate FROM recent`)
    .bind(userId, userId, body).first<{ threadsToday: number | null; postsToday: number | null; secondsSinceLast: number | null; duplicate: number | null }>();
  return { threadsToday: row?.threadsToday ?? 0, postsToday: row?.postsToday ?? 0,
    secondsSinceLast: row?.secondsSinceLast ?? null, duplicate: Boolean(row?.duplicate) };
}

function postLimit(actor: ForumActor, body: string, trusted: boolean, kind: "thread" | "post") {
  const limits = isNewMember(actor.post_count, actor.created_at) ? LIMITS.newMember : LIMITS.member;
  return {
    sql: `NOT EXISTS(SELECT 1 FROM forum_threads WHERE author_id=? AND body=? AND julianday(created_at)>julianday('now','-1 day'))
      AND NOT EXISTS(SELECT 1 FROM forum_posts WHERE author_id=? AND body=? AND julianday(created_at)>julianday('now','-1 day'))
      AND (?=1 OR ((SELECT count(*) FROM forum_threads WHERE author_id=? AND julianday(created_at)>julianday('now','-1 day'))<?
        AND (SELECT count(*) FROM (
          SELECT created_at FROM forum_threads WHERE author_id=? UNION ALL SELECT created_at FROM forum_posts WHERE author_id=?
        ) WHERE julianday(created_at)>julianday('now','-1 day'))<?
        AND NOT EXISTS(SELECT 1 FROM (
          SELECT created_at FROM forum_threads WHERE author_id=? UNION ALL SELECT created_at FROM forum_posts WHERE author_id=?
        ) WHERE julianday(created_at)>julianday('now')-?/86400.0)))`,
    args: [actor.userId, body, actor.userId, body, Number(trusted), actor.userId,
      kind === "thread" ? limits.threadsPerDay : limits.postsPerDay, actor.userId, actor.userId, limits.postsPerDay,
      actor.userId, actor.userId, COOLDOWN_SECONDS],
  };
}

function updateCounts(db: D1Binding, threadId: string, authorId: string) {
  const posts = "FROM forum_posts p WHERE p.thread_id=t.id AND p.status='approved'";
  const sameRoom = "FROM forum_threads t WHERE t.category_id=c.id AND t.status='approved'";
  return [
    db.prepare(`UPDATE forum_threads AS t SET reply_count=(SELECT count(*) ${posts}),
      words_total=body_words+coalesce((SELECT sum(body_words) ${posts}),0),
      last_post_at=coalesce((SELECT created_at ${posts} ORDER BY created_at DESC,id DESC LIMIT 1),created_at),
      last_post_user_id=coalesce((SELECT author_id ${posts} ORDER BY created_at DESC,id DESC LIMIT 1),author_id)
      WHERE t.id=? AND ${customerAppAuthority}`).bind(threadId),
    db.prepare(`UPDATE forum_categories AS c SET thread_count=(SELECT count(*) ${sameRoom}),
      post_count=(SELECT count(*)+coalesce(sum(reply_count),0) ${sameRoom}),
      last_post_at=(SELECT max(last_post_at) ${sameRoom}),
      last_thread_id=(SELECT id ${sameRoom} ORDER BY last_post_at DESC,id DESC LIMIT 1)
      WHERE c.id=(SELECT category_id FROM forum_threads WHERE id=?) AND ${customerAppAuthority}`).bind(threadId),
    db.prepare(`UPDATE forum_profiles AS f SET
      post_count=(SELECT count(*) FROM forum_threads WHERE author_id=f.user_id AND status='approved')
        +(SELECT count(*) FROM forum_posts WHERE author_id=f.user_id AND status='approved'),
      last_seen_at=? WHERE f.user_id=? AND ${customerAppAuthority}`).bind(new Date().toISOString(), authorId),
  ];
}

export async function storeVpsForumThread(actor: ForumActor, input: {
  categoryId: string; type: string; title: string; slug: string; body: string; hold: boolean;
  staff: boolean; trusted: boolean; region: string | null; country: string | null;
  poll: { question: string; options: string[] } | null; images: ForumImage[];
}, db: D1Binding = vpsAppDatabase()) {
  const id = randomUUID();
  const sid = shortId(8);
  const limit = postLimit(actor, input.body, input.trusted, "thread");
  const images = JSON.stringify(input.images);
  const statements = [db.prepare(`INSERT INTO forum_threads
    (id,short_id,category_id,author_id,type,title,slug,body,body_words,status,is_staff,region,country,images)
    SELECT ?,?,c.id,?,?,?,?,?,?,?,?,?,?,? FROM forum_categories c WHERE c.id=? AND c.is_public=1 AND ${writable}
      AND ${ownImages} AND ${limit.sql}`)
    .bind(id, sid, actor.userId, input.type, input.title, input.slug, input.body,
      wordCount(input.body) + wordCount(input.title), input.hold ? "held" : "approved", Number(input.staff),
      input.region, input.country, images, input.categoryId, actor.userId, actor.userId, images, actor.userId, ...limit.args)];
  if (input.poll) {
    const pollId = randomUUID();
    statements.push(db.prepare(`INSERT INTO forum_polls(id,thread_id,question)
      SELECT ?,id,? FROM forum_threads WHERE id=?`).bind(pollId, input.poll.question, id));
    input.poll.options.forEach((label, position) => statements.push(db.prepare(`INSERT INTO forum_poll_options(id,poll_id,position,label)
      SELECT ?,id,?,? FROM forum_polls WHERE id=?`).bind(randomUUID(), position, label, pollId)));
  }
  if (input.staff) {
    statements.push(db.prepare(`UPDATE forum_profiles SET is_staff=1 WHERE user_id=? AND
      EXISTS(SELECT 1 FROM forum_threads WHERE id=?)`).bind(actor.userId, id));
  }
  const [written] = await db.batch([...statements, ...updateCounts(db, id, actor.userId)]);
  return written.meta.changes === 1 ? { id, sid } : null;
}

export async function storeVpsForumReply(actor: ForumActor, input: {
  threadId: string; body: string; hold: boolean; trusted: boolean; staff: boolean; images: ForumImage[];
}, db: D1Binding = vpsAppDatabase()) {
  const id = randomUUID();
  const limit = postLimit(actor, input.body, input.trusted, "post");
  const images = JSON.stringify(input.images);
  const [written] = await db.batch([
    db.prepare(`INSERT INTO forum_posts (id,thread_id,author_id,body,body_words,status,is_staff,images)
      SELECT ?,t.id,?,?,?,?,?,? FROM forum_threads t JOIN forum_categories c ON c.id=t.category_id
      WHERE t.id=? AND t.status='approved' AND c.is_public=1 AND ${writable}
        AND (t.is_locked=0 OR EXISTS(SELECT 1 FROM users_profile WHERE id=? AND primary_role IN ('admin','super_admin'))
          OR EXISTS(SELECT 1 FROM forum_category_mods WHERE category_id=t.category_id AND user_id=?))
        AND ${ownImages} AND ${limit.sql}`).bind(id, actor.userId, input.body, wordCount(input.body), input.hold ? "held" : "approved",
        Number(input.staff), images, input.threadId, actor.userId, actor.userId, actor.userId, actor.userId, images, actor.userId, ...limit.args),
    ...updateCounts(db, input.threadId, actor.userId),
  ]);
  return written.meta.changes === 1;
}

type Target = "thread" | "post";
export async function vpsForumTarget(type: Target, id: string, db: D1Binding = vpsAppDatabase()) {
  const from = type === "thread" ? "forum_threads t" : "forum_posts p JOIN forum_threads t ON t.id=p.thread_id";
  const item = type === "thread" ? "t" : "p";
  return db.prepare(`SELECT ${item}.id,${item}.author_id,${item}.status,t.id AS thread_id,t.category_id,t.type,t.title,t.status AS thread_status
    FROM ${from} JOIN forum_categories c ON c.id=t.category_id
    WHERE ${item}.id=? AND c.is_public=1 AND ${customerAppAuthority}`).bind(id).first<{
    id: string; author_id: string; status: string; thread_id: string; category_id: string; type: string; title: string; thread_status: string;
  }>();
}

export async function rateVpsForumThread(actor: ForumActor, id: string, score: number, db: D1Binding = vpsAppDatabase()) {
  const [write] = await db.batch([
    db.prepare(`INSERT INTO forum_thread_ratings(thread_id,user_id,score)
      SELECT t.id,?,? FROM forum_threads t JOIN forum_categories c ON c.id=t.category_id
      WHERE t.id=? AND t.author_id<>? AND t.status='approved' AND c.is_public=1 AND ${writable}
      ON CONFLICT(thread_id,user_id) DO UPDATE SET score=excluded.score`)
      .bind(actor.userId, score, id, actor.userId, actor.userId, actor.userId),
    db.prepare(`UPDATE forum_threads SET rating_count=(SELECT count(*) FROM forum_thread_ratings WHERE thread_id=?),
      rating_sum=(SELECT coalesce(sum(score),0) FROM forum_thread_ratings WHERE thread_id=?)
      WHERE id=? AND changes()=1`).bind(id, id, id),
  ]);
  return write.meta.changes === 1;
}

export async function voteVpsForumPost(actor: ForumActor, id: string, db: D1Binding = vpsAppDatabase()) {
  const allowed = `SELECT p.id FROM forum_posts p JOIN forum_threads t ON t.id=p.thread_id
    JOIN forum_categories c ON c.id=t.category_id WHERE p.id=? AND p.author_id<>? AND p.status='approved'
    AND t.status='approved' AND c.is_public=1 AND ${writable}`;
  const args = [id, actor.userId, actor.userId, actor.userId];
  const [removed, added] = await db.batch([
    db.prepare(`DELETE FROM forum_post_votes WHERE user_id=? AND post_id IN (${allowed})`).bind(actor.userId, ...args),
    db.prepare(`INSERT INTO forum_post_votes(post_id,user_id) SELECT id,? FROM (${allowed}) WHERE changes()=0
      ON CONFLICT(post_id,user_id) DO NOTHING`).bind(actor.userId, ...args),
    db.prepare(`UPDATE forum_posts SET upvote_count=(SELECT count(*) FROM forum_post_votes WHERE post_id=?)
      WHERE id IN (${allowed})`).bind(id, ...args),
  ]);
  return (removed.meta.changes ?? 0) + (added.meta.changes ?? 0) === 1;
}

function modScope(category: string) {
  return `(EXISTS(SELECT 1 FROM users_profile WHERE id=? AND status='active' AND primary_role IN ('admin','super_admin'))
    OR EXISTS(SELECT 1 FROM forum_category_mods WHERE category_id=${category} AND user_id=?))`;
}

export async function acceptVpsForumAnswer(actor: ForumActor, id: string, thread: string, db: D1Binding = vpsAppDatabase()) {
  const before = await db.prepare(`SELECT p.author_id FROM forum_threads t JOIN forum_posts p ON p.id=t.accepted_post_id
    WHERE t.id=?`).bind(thread).first<{ author_id: string }>();
  const [changed] = await db.batch([
    db.prepare(`UPDATE forum_threads AS t SET accepted_post_id=CASE WHEN accepted_post_id=? THEN NULL ELSE ? END
      WHERE id=? AND type='question' AND status='approved' AND ${writable}
      AND EXISTS(SELECT 1 FROM forum_categories c WHERE c.id=t.category_id AND c.is_public=1)
      AND EXISTS(SELECT 1 FROM forum_posts p WHERE p.id=? AND p.thread_id=t.id AND p.status='approved')
      AND (t.author_id=? OR ${modScope("t.category_id")})`).bind(id, id, thread, actor.userId, actor.userId, id,
      actor.userId, actor.userId, actor.userId),
    db.prepare(`UPDATE forum_posts AS p SET is_accepted=CASE WHEN
      id=(SELECT accepted_post_id FROM forum_threads WHERE id=?) THEN 1 ELSE 0 END
      WHERE thread_id=? AND changes()=1`).bind(thread, thread),
  ]);
  return changed.meta.changes === 1 ? { previousAuthor: before?.author_id ?? null } : null;
}

export async function reportVpsForumTarget(actor: ForumActor, type: Target, id: string, reason: string | undefined,
  db: D1Binding = vpsAppDatabase()) {
  const target = await vpsForumTarget(type, id, db);
  if (!target || target.status !== "approved" || target.thread_status !== "approved") return { error: "notfound" as const };
  if (target.author_id === actor.userId) return { error: "own" as const };
  const table = type === "thread" ? "forum_threads" : "forum_posts";
  const count = "(SELECT count(*) FROM forum_reports WHERE target_type=? AND target_id=? AND status='open')";
  const flags = await db.batch([
    db.prepare(`INSERT INTO forum_reports(id,target_type,target_id,reporter_id,reason)
      SELECT ?,?,id,?,? FROM ${table} WHERE id=? AND status='approved' AND author_id<>? AND ${writable}
      ON CONFLICT(target_type,target_id,reporter_id) DO NOTHING`)
      .bind(randomUUID(), type, actor.userId, reason?.slice(0, 300) || null, id, actor.userId, actor.userId, actor.userId),
    db.prepare(`UPDATE ${table} SET flag_count=${count},status=CASE WHEN ${count}>=? THEN 'hidden' ELSE status END
      WHERE id=? AND status='approved' AND changes()=1 RETURNING status,flag_count`)
      .bind(type, id, type, id, AUTO_HIDE_REPORTS, id),
    db.prepare(`INSERT INTO forum_mod_log(id,mod_id,action,target_type,target_id,reason)
      SELECT ?,?,'auto-hide',?,id,flag_count||' reports' FROM ${table} WHERE id=? AND status='hidden' AND changes()=1`)
      .bind(randomUUID(), actor.userId, type, id),
    ...updateCounts(db, target.thread_id, target.author_id),
  ]);
  return { target, hidden: (flags[1].results[0] as { status?: string } | undefined)?.status === "hidden" };
}

export async function moderateVpsForumTarget(actor: ForumActor, type: Target, id: string, op: ModOp, reason: string | undefined,
  db: D1Binding = vpsAppDatabase()) {
  const operations = { hide: "status='hidden'", unhide: "status='approved',flag_count=0", approve: "status='approved'",
    lock: "is_locked=1", unlock: "is_locked=0", pin: "is_pinned=1", unpin: "is_pinned=0" };
  if (!Object.hasOwn(operations, op) || (type === "post" && ["lock", "unlock", "pin", "unpin"].includes(op))) {
    return { error: "failed" as const };
  }
  const target = await vpsForumTarget(type, id, db);
  if (!target) return { error: "notfound" as const };
  const table = type === "thread" ? "forum_threads" : "forum_posts";
  const writes = [
    db.prepare(`UPDATE ${table} SET ${operations[op]} WHERE id=? AND ${writable} AND ${modScope("?")}`)
      .bind(id, actor.userId, actor.userId, actor.userId, target.category_id, actor.userId),
    db.prepare(`INSERT INTO forum_mod_log(id,mod_id,action,target_type,target_id,reason)
      SELECT ?,?,?,?,?,? WHERE changes()=1`).bind(randomUUID(), actor.userId, op, type, id, reason?.slice(0, 300) || null),
  ];
  if (["hide", "unhide", "approve"].includes(op)) writes.push(
    db.prepare(`UPDATE forum_reports SET status=?,resolved_by=? WHERE target_type=? AND target_id=? AND status='open' AND changes()=1`)
      .bind(op === "hide" ? "resolved" : "dismissed", actor.userId, type, id),
  );
  const [changed] = await db.batch([...writes, ...updateCounts(db, target.thread_id, target.author_id)]);
  return changed.meta.changes === 1 ? { target } : { error: "forbidden" as const };
}

export async function voteVpsForumPoll(actor: ForumActor, pollId: string, optionId: string, db: D1Binding = vpsAppDatabase()) {
  const result = await db.prepare(`INSERT INTO forum_poll_votes(poll_id,user_id,option_id)
    SELECT p.id,?,o.id FROM forum_polls p JOIN forum_poll_options o ON o.poll_id=p.id JOIN forum_threads t ON t.id=p.thread_id
    JOIN forum_categories c ON c.id=t.category_id WHERE p.id=? AND o.id=? AND t.status='approved' AND c.is_public=1
    AND (p.closes_at IS NULL OR julianday(p.closes_at)>julianday('now')) AND ${writable}
    ON CONFLICT(poll_id,user_id) DO NOTHING`).bind(actor.userId, pollId, optionId, actor.userId, actor.userId).run();
  return result.meta.changes === 1;
}
