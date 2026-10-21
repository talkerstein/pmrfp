/**
 * PMRFP for Towns, Part C: the reach report. Counts only, never who: views,
 * followers of the town when it posted, invitations, matching trades alerted,
 * questions, quotes received, and last year's comparison where there is one.
 *
 * Views come from rfp_views, which the site-wide tracker records (privacy
 * safe, bot filtered, server side; a separate change). Until it writes rows
 * every count here is 0. This file never writes a view.
 *
 * The pure parts (roll-ups, windows) are unit-tested in
 * test/unit/towns-part-c.test.ts; the reads take the service-role client.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

type Db = Pick<SupabaseClient, "from" | "rpc">;

/** Listing views per post (0 when there are none, or on any error). One small count query a post. */
export async function viewsFor(db: Db, rfpIds: readonly string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const ids = [...new Set(rfpIds)].slice(0, 200);
  for (const id of ids) out.set(id, 0);
  for (let i = 0; i < ids.length; i += 20) {
    const chunk = ids.slice(i, i + 20);
    const counts = await Promise.all(
      chunk.map(async (id) => {
        try {
          const { count, error } = await db.from("rfp_views").select("id", { count: "exact", head: true }).eq("rfp_id", id);
          return error ? 0 : (count ?? 0);
        } catch {
          return 0;
        }
      }),
    );
    chunk.forEach((id, k) => out.set(id, counts[k]));
  }
  return out;
}

// ── Pure ─────────────────────────────────────────────────────────────

/** "2026-10": a timestamp's calendar month in Toronto (the app's reporting zone). */
export function monthOf(at: string | Date, tz = "America/Toronto"): string {
  const d = typeof at === "string" ? new Date(at) : at;
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit" }).formatToParts(d);
  return `${parts.find((p) => p.type === "year")?.value}-${parts.find((p) => p.type === "month")?.value}`;
}

/** The same month a year earlier ("2026-10" → "2025-10"). */
export function monthLastYear(month: string): string {
  const [y, m] = month.split("-");
  return `${Number(y) - 1}-${m}`;
}

/** Followers when the post went live: the snapshot logged then (Part C onward), else the follows that existed by then. */
export function followersAtPosting(p: { loggedSnapshot: unknown; followsCreatedAt: readonly string[]; publishedAt: string | null }): number {
  if (typeof p.loggedSnapshot === "number" && Number.isFinite(p.loggedSnapshot)) return Math.max(0, Math.round(p.loggedSnapshot));
  if (!p.publishedAt) return 0;
  const t = Date.parse(p.publishedAt);
  return p.followsCreatedAt.filter((c) => Date.parse(c) <= t).length;
}

export interface PostCounts {
  id: string;
  publishedAt: string | null;
  views: number;
  quotes: number;
  invites: number;
  questions: number;
  alerted: number;
}

export interface MonthRollup {
  month: string;
  posts: number;
  views: number;
  quotes: number;
  invites: number;
  questions: number;
  alerted: number;
  /** Average quotes per post (one decimal), null without posts. */
  avgQuotes: number | null;
}

const one = (n: number) => Math.round(n * 10) / 10;

/** Totals for the posts published in `month` (by their publish date). */
export function rollupMonth(posts: readonly PostCounts[], month: string): MonthRollup {
  const inMonth = posts.filter((p) => p.publishedAt && monthOf(p.publishedAt) === month);
  const sum = (k: keyof Omit<PostCounts, "id" | "publishedAt">) => inMonth.reduce((s, p) => s + (p[k] || 0), 0);
  const quotes = sum("quotes");
  return {
    month,
    posts: inMonth.length,
    views: sum("views"),
    quotes,
    invites: sum("invites"),
    questions: sum("questions"),
    alerted: sum("alerted"),
    avgQuotes: inMonth.length ? one(quotes / inMonth.length) : null,
  };
}

/** A post against the town's posts from the same month last year (null when it had none). */
export function lastYearFor(post: Pick<PostCounts, "publishedAt">, all: readonly PostCounts[]): MonthRollup | null {
  if (!post.publishedAt) return null;
  const r = rollupMonth(all, monthLastYear(monthOf(post.publishedAt)));
  return r.posts ? r : null;
}

export interface PostReach {
  views: number;
  followersAtPosting: number;
  invites: number;
  alerted: number;
  questions: number;
  quotes: number;
  lastYear: MonthRollup | null;
}

// ── Reads ────────────────────────────────────────────────────────────

/** Matching trades alerted about each post (lead_alert_log, key "pmjob:<id>"). Counts only. */
export async function alertedFor(db: Db, rfpIds: readonly string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  for (const id of new Set(rfpIds)) {
    try {
      const { count, error } = await db.from("lead_alert_log").select("user_id", { count: "exact", head: true }).eq("lead_key", `pmjob:${id}`);
      out.set(id, error ? 0 : (count ?? 0));
    } catch {
      out.set(id, 0);
    }
  }
  return out;
}

/** Followers of the town when this post went live. */
export async function followersWhenPosted(db: Db, rfpId: string, buyerKey: string | null, publishedAt: string | null): Promise<number> {
  const { data: logged } = await db.from("town_job_log").select("detail").eq("rfp_id", rfpId).eq("event", "published").order("created_at", { ascending: true }).limit(1).maybeSingle();
  const snapshot = (logged as { detail: Record<string, unknown> | null } | null)?.detail?.followers;
  if (typeof snapshot === "number") return followersAtPosting({ loggedSnapshot: snapshot, followsCreatedAt: [], publishedAt });
  if (!buyerKey || !publishedAt) return 0;
  const { count } = await db.from("buyer_follows").select("user_id", { count: "exact", head: true }).eq("buyer_slug", buyerKey).lte("created_at", publishedAt);
  return count ?? 0;
}

/** The counts of a town's posts that the dashboard already has (lib/town-jobs/server townJobsFor). */
export interface ReachJob {
  id: string;
  published_at?: string | null;
  buyer_key: string | null;
  responses: number;
  questions: number;
  invites: number;
}

async function countsFor(db: Db, jobs: readonly ReachJob[]): Promise<PostCounts[]> {
  const ids = jobs.map((j) => j.id);
  const [views, alerted] = await Promise.all([viewsFor(db, ids), alertedFor(db, ids)]);
  return jobs.map((j) => ({ id: j.id, publishedAt: j.published_at ?? null, views: views.get(j.id) ?? 0, quotes: j.responses, invites: j.invites, questions: j.questions, alerted: alerted.get(j.id) ?? 0 }));
}

/** One post's reach report, with the town's same month last year when it posted then. */
export async function reachForPost(db: Db, job: ReachJob, allJobs: readonly ReachJob[]): Promise<PostReach> {
  const lastMonth = job.published_at ? monthLastYear(monthOf(job.published_at)) : null;
  const before = lastMonth ? allJobs.filter((j) => j.id !== job.id && j.published_at && monthOf(j.published_at) === lastMonth) : [];
  const [[mine], previous, followers] = await Promise.all([countsFor(db, [job]), countsFor(db, before), followersWhenPosted(db, job.id, job.buyer_key, job.published_at ?? null)]);
  return {
    views: mine.views,
    followersAtPosting: followers,
    invites: mine.invites,
    alerted: mine.alerted,
    questions: mine.questions,
    quotes: mine.quotes,
    lastYear: lastYearFor(mine, previous),
  };
}

/** The dashboard's monthly roll-up: this month's posts, against the same month last year. */
export async function monthlyReach(db: Db, jobs: readonly ReachJob[], now: Date = new Date()): Promise<{ current: MonthRollup; lastYear: MonthRollup }> {
  const month = monthOf(now);
  const prev = monthLastYear(month);
  const relevant = jobs.filter((j) => j.published_at && [month, prev].includes(monthOf(j.published_at)));
  const counts = await countsFor(db, relevant);
  return { current: rollupMonth(counts, month), lastYear: rollupMonth(counts, prev) };
}
