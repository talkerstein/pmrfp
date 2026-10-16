import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadBenchmarkData } from "@/lib/data/price-benchmarks-load";
import { torontoToday } from "./quiet";
import { shortId } from "./text";
import { canonicalRows } from "./data";
import { ensureSystemProfile, loadSourceRecords } from "./auto-threads-server";
import { ensureTeamProfile } from "./staff-guides-server";
import { forumV2Ready } from "./schema-v2";
import { RUN_CAP, openBidFrom, planRecurring, type OpenBid, type RecurringDraft, type RecurringKind } from "./recurring";

/**
 * Recurring threads (DB side). Inserts forum_threads rows (and, for polls,
 * the poll + its options) authored by the labelled PMRFP Board or PMRFP Team
 * account. Never inserts replies, votes or ratings. Every row is stamped by
 * the database at insert (no created_at from code: never backdated). Keyed
 * on auto_source_key, so a re-run in the same period does nothing.
 */

export interface RecurringRunResult {
  ready: boolean;
  dry: boolean;
  today: string;
  planned: number;
  created: number;
  skippedExisting: number;
  failed: number;
  byKind: Partial<Record<RecurringKind, number>>;
  sample: { title: string; room: string; country: string; kind: string }[];
  reason?: string;
}

/** Keys (of these drafts) already posted. */
async function existingKeys(db: SupabaseClient, keys: string[]): Promise<Set<string>> {
  const out = new Set<string>();
  for (let i = 0; i < keys.length; i += 100) {
    const { data } = await db.from("forum_threads").select("auto_source_key").in("auto_source_key", keys.slice(i, i + 100));
    for (const r of (data ?? []) as { auto_source_key: string }[]) out.add(r.auto_source_key);
  }
  return out;
}

/** The row for a draft. Exported for tests: no created_at / last_post_at (the database stamps them). */
export function recurringRow(d: RecurringDraft, categoryId: string, authorId: string, sid: string) {
  return {
    short_id: sid,
    category_id: categoryId,
    author_id: authorId,
    type: d.type,
    title: d.title,
    slug: d.slug,
    body: d.body,
    body_words: d.bodyWords,
    status: "approved" as const,
    is_staff: true,
    region: d.region,
    country: d.country,
    auto_source: d.kind,
    auto_source_key: d.key,
  };
}

/** Plan (dry) or post every recurring thread due today. */
export async function runRecurringThreads(db: SupabaseClient, opts: { dry: boolean; now?: Date; kinds?: RecurringKind[] }): Promise<RecurringRunResult> {
  const today = torontoToday(opts.now ?? new Date());
  const base: RecurringRunResult = { ready: false, dry: opts.dry, today, planned: 0, created: 0, skippedExisting: 0, failed: 0, byKind: {}, sample: [] };
  if (!(await forumV2Ready(db))) return { ...base, reason: "Apply supabase/migrations/20261017000001_forum_rework.sql first." };

  const want = new Set(opts.kinds ?? []);
  const needs = (k: RecurringKind) => want.size === 0 || want.has(k);
  // Real data only: this week's listings (one bounded read) and the shared,
  // cached board snapshot behind the price benchmarks. Nothing per request.
  const [records, bench, { data: cats }] = await Promise.all([
    needs("open-bids") ? loadSourceRecords(db, new Date(Date.parse(`${today}T00:00:00Z`) - 8 * 86_400_000).toISOString(), 3000) : Promise.resolve([]),
    needs("sold-for") || needs("awards-week") ? loadBenchmarkData() : Promise.resolve(null),
    db.from("forum_categories").select("id,slug"),
  ]);
  const bids = records.map(openBidFrom).filter((b): b is OpenBid => b != null);
  const all = planRecurring(
    {
      today,
      bids,
      awards: bench?.awards ?? [],
      trades: (bench?.categories ?? []).map((c) => ({ slug: c.slug, name: c.name })),
      kinds: opts.kinds,
    },
    new Set(),
    Number.MAX_SAFE_INTEGER,
  );
  const existing = await existingKeys(db, all.map((d) => d.key));
  const rooms = new Map(canonicalRows(((cats ?? []) as { id: string; slug: string }[])).map((c) => [c.slug, c.id]));
  const drafts = all.filter((d) => !existing.has(d.key) && rooms.has(d.category)).slice(0, RUN_CAP);
  const result: RecurringRunResult = {
    ...base,
    ready: true,
    planned: drafts.length,
    skippedExisting: all.filter((d) => existing.has(d.key)).length,
    sample: drafts.slice(0, 15).map((d) => ({ title: d.title, room: d.category, country: d.country, kind: d.kind })),
  };
  for (const d of drafts) result.byKind[d.kind] = (result.byKind[d.kind] ?? 0) + 1;
  if (opts.dry || drafts.length === 0) return result;

  const [boardId, teamId] = await Promise.all([
    drafts.some((d) => d.author === "board") ? ensureSystemProfile(db) : Promise.resolve(null),
    drafts.some((d) => d.author === "team") ? ensureTeamProfile(db) : Promise.resolve(null),
  ]);

  for (const d of drafts) {
    const authorId = d.author === "board" ? boardId : teamId;
    const categoryId = rooms.get(d.category);
    if (!authorId || !categoryId) {
      result.failed++;
      continue;
    }
    let insertedId: string | null = null;
    for (let i = 0; i < 3 && !insertedId; i++) {
      const { data, error } = await db.from("forum_threads").insert(recurringRow(d, categoryId, authorId, shortId(8))).select("id").single<{ id: string }>();
      if (data) insertedId = data.id;
      else if (error?.code === "23505" && /auto_source/.test(error.message ?? "")) break; // posted by a concurrent run
      else if (error && error.code !== "23505") {
        console.error("[forum-recurring] insert:", error.message);
        break;
      }
    }
    if (!insertedId) {
      result.failed++;
      continue;
    }
    result.created++;
    if (d.poll) {
      const { data: poll } = await db.from("forum_polls").insert({ thread_id: insertedId, question: d.poll.question }).select("id").single<{ id: string }>();
      if (poll) await db.from("forum_poll_options").insert(d.poll.options.map((label, position) => ({ poll_id: poll.id, position, label })));
    }
  }
  return result;
}

