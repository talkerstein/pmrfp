import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import { isServiceConfigured } from "@/lib/supabase/config";
import { SYSTEM_HANDLE } from "@/lib/forum/auto-threads";
import {
  SYNC_REVERSAL,
  applyPlan,
  deriveEvents,
  isEligibleOrg,
  orgsForUsers,
  planSync,
  type DesiredEvent,
  type ExistingEvent,
  type KarmaSnapshot,
  type SnapRemoved,
} from "./derive";
import { isKarmaKind, scoreLedger, type KarmaKind, type LevelNumber } from "./rules";

/**
 * Keeps karma_events in step with real data, then recomputes org_karma.
 *
 *  - Nightly cron (/api/cron/karma): full sync + decay for every company.
 *  - After a scoring action (forum vote, review moderation, org approval,
 *    express interest): a scoped sync for the companies involved, run with
 *    after() so the user never waits.
 *  - Backfill: the same full sync. `dryRun` writes nothing and returns what
 *    WOULD change plus the projected level distribution.
 *
 * Every write is idempotent (unique key on the ledger), so overlapping runs
 * are safe.
 */

export interface SyncReport {
  ready: boolean;
  dryRun: boolean;
  scoped: boolean;
  orgsConsidered: number;
  inserted: number;
  reversed: number;
  restored: number;
  updated: number;
  byKind: Partial<Record<KarmaKind, { add: number; remove: number }>>;
  /** Companies per level after this run (real, listed companies only). */
  levels: Record<LevelNumber, number>;
  forumProfilesLinked: number;
  warnings: string[];
}

const PAGE = 1000;

type Q<T> = PromiseLike<{ data: T[] | null; error: { code?: string; message?: string } | null }>;

/** Read every page of a query. Missing table/column → [] with a warning. */
async function readAll<T>(label: string, warnings: string[], q: (from: number, to: number) => Q<T>): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; from < 200_000; from += PAGE) {
    const { data, error } = await q(from, from + PAGE - 1);
    if (error) {
      warnings.push(`${label}: ${error.code ?? ""} ${error.message ?? "read failed"}`.trim());
      return rows;
    }
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  return rows;
}

function one<T>(v: T | T[] | null | undefined): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null);
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export async function loadSnapshot(db: SupabaseClient, warnings: string[]): Promise<KarmaSnapshot> {
  const [orgs, members, profiles, votes, ratings, accepted, hideLog, hiddenThreads, hiddenPosts, caseStudies, reviews, rfps, interests] = await Promise.all([
    readAll<any>("organizations", warnings, (a, b) => db.from("organizations").select("id,website,email,profile_status,status,is_demo,verified,created_at").order("id").range(a, b)),
    readAll<any>("organization_members", warnings, (a, b) => db.from("organization_members").select("user_id,organization_id,users_profile(email)").order("id").range(a, b)),
    readAll<any>("forum_profiles", warnings, (a, b) => db.from("forum_profiles").select("user_id,organization_id,banned,handle").order("user_id").range(a, b)),
    readAll<any>("forum_post_votes", warnings, (a, b) =>
      db.from("forum_post_votes").select("post_id,user_id,created_at,forum_posts(author_id,status,forum_threads(status))").order("created_at").range(a, b)),
    readAll<any>("forum_thread_ratings", warnings, (a, b) =>
      db.from("forum_thread_ratings").select("thread_id,user_id,score,created_at,forum_threads(author_id,status)").order("created_at").range(a, b)),
    readAll<any>("accepted answers", warnings, (a, b) =>
      db.from("forum_posts").select("id,author_id,status,created_at,forum_threads(author_id,status)").eq("is_accepted", true).order("id").range(a, b)),
    readAll<any>("forum_mod_log", warnings, (a, b) => db.from("forum_mod_log").select("target_type,target_id,created_at").eq("action", "hide").order("created_at").range(a, b)),
    readAll<any>("hidden threads", warnings, (a, b) => db.from("forum_threads").select("id,author_id").eq("status", "hidden").order("id").range(a, b)),
    readAll<any>("hidden posts", warnings, (a, b) => db.from("forum_posts").select("id,author_id").eq("status", "hidden").order("id").range(a, b)),
    readAll<any>("case_studies", warnings, (a, b) => db.from("case_studies").select("id,organization_id,status,published_at,created_at").eq("status", "published").order("id").range(a, b)),
    readAll<any>("vendor_reviews", warnings, (a, b) =>
      db.from("vendor_reviews").select("id,organization_id,case_study_id,status,verified_via,reviewer_email,reviewer_user_id,created_at").not("case_study_id", "is", null).order("id").range(a, b)),
    readAll<any>("rfp_posts", warnings, (a, b) =>
      db.from("rfp_posts").select("id,posted_by_organization_id,source_type,status,published_at,awarded_rfp_id,is_demo,created_at")
        .in("source_type", ["property_manager_direct", "gc_package"]).not("posted_by_organization_id", "is", null).order("id").range(a, b)),
    readAll<any>("rfp_interests", warnings, (a, b) => db.from("rfp_interests").select("rfp_id,trade_organization_id,created_at").order("id").range(a, b)),
  ]);

  const hidden = new Map<string, { type: "thread" | "post"; authorId: string }>();
  for (const t of hiddenThreads) hidden.set(`thread:${t.id}`, { type: "thread", authorId: t.author_id });
  for (const p of hiddenPosts) hidden.set(`post:${p.id}`, { type: "post", authorId: p.author_id });
  const removed = new Map<string, SnapRemoved>();
  for (const l of hideLog) {
    const h = hidden.get(`${l.target_type}:${l.target_id}`);
    if (h) removed.set(`${h.type}:${l.target_id}`, { targetType: h.type, targetId: l.target_id, authorId: h.authorId, createdAt: l.created_at });
  }

  return {
    orgs: orgs.map((o) => ({ id: o.id, website: o.website, email: o.email, profileStatus: o.profile_status, status: o.status, isDemo: Boolean(o.is_demo), verified: Boolean(o.verified), createdAt: o.created_at })),
    members: members.map((m) => ({ userId: m.user_id, orgId: m.organization_id, email: one<any>(m.users_profile)?.email ?? null })),
    forumProfiles: profiles.map((p) => ({ userId: p.user_id, orgId: p.organization_id, banned: Boolean(p.banned), system: p.handle === SYSTEM_HANDLE })),
    votes: votes.map((v) => {
      const post = one<any>(v.forum_posts);
      return { postId: v.post_id, voterId: v.user_id, authorId: post?.author_id ?? "", postStatus: post?.status ?? "", threadStatus: one<any>(post?.forum_threads)?.status ?? "", createdAt: v.created_at };
    }),
    ratings: ratings.map((r) => {
      const th = one<any>(r.forum_threads);
      return { threadId: r.thread_id, raterId: r.user_id, authorId: th?.author_id ?? "", score: r.score, threadStatus: th?.status ?? "", createdAt: r.created_at };
    }),
    accepted: accepted.map((p) => {
      const th = one<any>(p.forum_threads);
      return { postId: p.id, answerAuthorId: p.author_id, askerId: th?.author_id ?? "", postStatus: p.status, threadStatus: th?.status ?? "", createdAt: p.created_at };
    }),
    removed: [...removed.values()],
    caseStudies: caseStudies.map((c) => ({ id: c.id, orgId: c.organization_id, status: c.status, publishedAt: c.published_at, createdAt: c.created_at })),
    reviews: reviews.map((r) => ({
      id: r.id, orgId: r.organization_id, caseStudyId: r.case_study_id, status: r.status, verifiedVia: r.verified_via,
      reviewerEmail: r.reviewer_email, reviewerUserId: r.reviewer_user_id, createdAt: r.created_at,
    })),
    rfps: rfps.map((r) => ({
      id: r.id, orgId: r.posted_by_organization_id, sourceType: r.source_type, status: r.status, publishedAt: r.published_at,
      awardedRfpId: r.awarded_rfp_id ?? null, isDemo: Boolean(r.is_demo), createdAt: r.created_at,
    })),
    interests: interests.map((i) => ({ rfpId: i.rfp_id, orgId: i.trade_organization_id, createdAt: i.created_at })),
  };
}

async function loadLedger(db: SupabaseClient, warnings: string[]): Promise<ExistingEvent[] | null> {
  const probe = await db.from("karma_events").select("id", { head: true, count: "exact" });
  if (probe.error) {
    warnings.push(`karma_events: ${probe.error.message ?? "missing"} (run the karma migration)`);
    return null;
  }
  const rows = await readAll<any>("karma_events", warnings, (a, b) =>
    db.from("karma_events").select("id,org_id,kind,points,source_type,source_id,actor_id,created_at,reversed_at,reversed_reason").order("id").range(a, b));
  return rows
    .filter((r) => isKarmaKind(r.kind))
    .map((r) => ({
      id: r.id, orgId: r.org_id, kind: r.kind as KarmaKind, points: r.points, sourceType: r.source_type, sourceId: r.source_id,
      actorId: r.actor_id ?? "", createdAt: r.created_at, reversedAt: r.reversed_at, reversedReason: r.reversed_reason,
    }));
}
/* eslint-enable @typescript-eslint/no-explicit-any */

function emptyLevels(): Record<LevelNumber, number> {
  return { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
}

function chunks<T>(xs: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
}

export interface SyncOptions {
  dryRun?: boolean;
  /** Limit to these companies (plus the companies of these users). */
  orgIds?: string[];
  userIds?: string[];
  now?: Date;
}

export async function syncKarma(opts: SyncOptions = {}): Promise<SyncReport> {
  const dryRun = Boolean(opts.dryRun);
  const now = opts.now ?? new Date();
  const warnings: string[] = [];
  const report: SyncReport = {
    ready: false, dryRun, scoped: false, orgsConsidered: 0, inserted: 0, reversed: 0, restored: 0, updated: 0,
    byKind: {}, levels: emptyLevels(), forumProfilesLinked: 0, warnings,
  };
  if (!isServiceConfigured()) {
    warnings.push("Supabase service role not configured");
    return report;
  }
  const db = createServiceClient();
  const existing = await loadLedger(db, warnings);
  if (!existing) return report;
  report.ready = true;

  const snap = await loadSnapshot(db, warnings);
  const scopeIds = new Set<string>([...(opts.orgIds ?? []), ...orgsForUsers(snap, opts.userIds ?? [])]);
  const scoped = Boolean(opts.orgIds?.length || opts.userIds?.length);
  report.scoped = scoped;
  if (scoped && !scopeIds.size) return report;
  const scope = scoped ? scopeIds : null;

  const desired: DesiredEvent[] = deriveEvents(snap);
  const plan = planSync(desired, existing, scope);
  const kindOf = new Map(existing.map((e) => [e.id, e.kind]));
  const bump = (k: KarmaKind, f: "add" | "remove") => {
    const cur = report.byKind[k] ?? { add: 0, remove: 0 };
    cur[f]++;
    report.byKind[k] = cur;
  };
  plan.insert.forEach((d) => bump(d.kind, "add"));
  plan.restore.forEach((r) => bump(kindOf.get(r.id)!, "add"));
  plan.reverse.forEach((r) => bump(kindOf.get(r.id)!, "remove"));
  report.inserted = plan.insert.length;
  report.reversed = plan.reverse.length;
  report.restored = plan.restore.length;
  report.updated = plan.update.length;

  const nowIso = now.toISOString();
  const after = applyPlan(existing, plan, nowIso);
  const orgById = new Map(snap.orgs.map((o) => [o.id, o]));
  const touched = scope ?? new Set<string>([...after.map((e) => e.orgId), ...snap.orgs.filter(isEligibleOrg).map((o) => o.id)]);
  report.orgsConsidered = touched.size;

  if (!dryRun) {
    for (const batch of chunks(plan.insert, 500)) {
      const { error } = await db.from("karma_events").upsert(
        batch.map((d) => ({
          org_id: d.orgId, user_id: d.userId, kind: d.kind, points: d.points, source_type: d.sourceType,
          source_id: d.sourceId, actor_id: d.actorId, created_at: d.createdAt,
        })),
        { onConflict: "org_id,kind,source_type,source_id,actor_id", ignoreDuplicates: true },
      );
      if (error) warnings.push(`insert: ${error.message}`);
    }
    for (const batch of chunks(plan.reverse.map((r) => r.id), 200)) {
      const { error } = await db.from("karma_events").update({ reversed_at: nowIso, reversed_reason: SYNC_REVERSAL }).in("id", batch).is("reversed_at", null);
      if (error) warnings.push(`reverse: ${error.message}`);
    }
    for (const r of plan.restore) {
      const { error } = await db.from("karma_events").update({ reversed_at: null, reversed_reason: null, points: r.points }).eq("id", r.id).like("reversed_reason", "sync:%");
      if (error) warnings.push(`restore: ${error.message}`);
    }
    for (const u of plan.update) {
      const { error } = await db.from("karma_events").update({ points: u.points }).eq("id", u.id);
      if (error) warnings.push(`update: ${error.message}`);
    }
    // Forum profiles made before their company was approved carry no company;
    // link them now so the forum shows the level of the company they earn for.
    if (!scope) report.forumProfilesLinked = await linkForumProfiles(db, snap, warnings);
  }

  // Recompute scores from the ledger as it now stands.
  const byOrg = new Map<string, ExistingEvent[]>();
  for (const e of after) if (touched.has(e.orgId)) byOrg.set(e.orgId, [...(byOrg.get(e.orgId) ?? []), e]);
  const rows = [...touched].map((orgId) => {
    const s = scoreLedger(byOrg.get(orgId) ?? [], now);
    return { org_id: orgId, raw_points: s.raw, score: s.score, level: s.level, decay: s.decay, last_earned_at: s.lastEarnedAt, updated_at: nowIso };
  });
  for (const r of rows) if (isEligibleOrg(orgById.get(r.org_id))) report.levels[r.level as LevelNumber]++;
  if (!dryRun) {
    for (const batch of chunks(rows.filter((r) => orgById.has(r.org_id)), 500)) {
      const { error } = await db.from("org_karma").upsert(batch, { onConflict: "org_id" });
      if (error) warnings.push(`org_karma: ${error.message}`);
    }
  }
  return report;
}

async function linkForumProfiles(db: SupabaseClient, snap: KarmaSnapshot, warnings: string[]): Promise<number> {
  const orgById = new Map(snap.orgs.map((o) => [o.id, o]));
  let n = 0;
  for (const p of snap.forumProfiles) {
    if (p.orgId || p.system) continue;
    const eligible = snap.members.filter((m) => m.userId === p.userId && isEligibleOrg(orgById.get(m.orgId)));
    if (eligible.length !== 1) continue;
    const { error } = await db.from("forum_profiles").update({ organization_id: eligible[0].orgId }).eq("user_id", p.userId).is("organization_id", null);
    if (error) {
      warnings.push(`forum_profiles: ${error.message}`);
      break;
    }
    n++;
  }
  return n;
}

/**
 * Fire-and-forget scoped sync after a scoring action. Runs after the
 * response with after(); outside a request (tests, scripts) it just runs.
 * Never throws: reputation must never break the action that triggered it.
 */
export async function karmaSyncAfter(scope: { orgIds?: (string | null | undefined)[]; userIds?: (string | null | undefined)[] }): Promise<void> {
  const orgIds = (scope.orgIds ?? []).filter((x): x is string => Boolean(x));
  const userIds = (scope.userIds ?? []).filter((x): x is string => Boolean(x));
  if (!orgIds.length && !userIds.length) return;
  const run = () => syncKarma({ orgIds, userIds }).then(() => undefined, () => undefined);
  try {
    const { after } = await import("next/server");
    after(run);
  } catch {
    await run();
  }
}
