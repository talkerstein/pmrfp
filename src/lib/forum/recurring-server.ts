import "server-only";
import { randomUUID } from "node:crypto";
import { type D1Binding } from "@/lib/d1/contracts";
import { inList, readD1ByIds } from "@/lib/lifecycle/d1";
import { SYSTEM_HANDLE } from "./auto-threads";
import { TEAM_HANDLE } from "./staff-guides";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadBenchmarkData } from "@/lib/data/price-benchmarks-load";
import { torontoToday } from "./quiet";
import { shortId } from "./text";
import { canonicalRows } from "./data";
import { ensureSystemProfile, loadD1SourceRecords, loadSourceRecords } from "./auto-threads-server";
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
async function existingKeys(db: SupabaseClient | D1Binding, keys: string[]): Promise<Set<string>> {
  if ("prepare" in db) return new Set((await readD1ByIds<{auto_source_key:string}>(db,keys,
    `SELECT auto_source_key FROM forum_threads WHERE auto_source_key ${inList}`)).map(row => row.auto_source_key));
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
export async function runRecurringThreads(db: SupabaseClient | D1Binding, opts: { dry: boolean; now?: Date; kinds?: RecurringKind[] }): Promise<RecurringRunResult> {
  const today = torontoToday(opts.now ?? new Date());
  const base: RecurringRunResult = { ready: false, dry: opts.dry, today, planned: 0, created: 0, skippedExisting: 0, failed: 0, byKind: {}, sample: [] };
  const native = "prepare" in db;
  if (!native && !(await forumV2Ready(db))) return { ...base, reason: "Apply supabase/migrations/20261017000002_forum_rework.sql first." };

  const want = new Set(opts.kinds ?? []);
  const needs = (k: RecurringKind) => want.size === 0 || want.has(k);
  // Real data only: this week's listings (one bounded read) and the shared,
  // cached board snapshot behind the price benchmarks. Nothing per request.
  const since = new Date(Date.parse(`${today}T00:00:00Z`) - 8 * 86_400_000).toISOString();
  const [records, bench, cats] = await Promise.all([
    needs("open-bids") ? native ? loadD1SourceRecords(db,since).then(result=>result.records) : loadSourceRecords(db,since,3000) : Promise.resolve([]),
    needs("sold-for") || needs("awards-week") ? loadBenchmarkData() : Promise.resolve(null),
    native ? db.prepare("SELECT id,slug FROM forum_categories").all<{id:string;slug:string}>().then(result=>result.results)
      : db.from("forum_categories").select("id,slug").then(result=>result.data),
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
  if (native) return postD1Recurring(db, drafts, rooms, result);

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


async function postD1Recurring(db: D1Binding, drafts: RecurringDraft[], rooms: Map<string,string>, result: RecurringRunResult) {
  const users = await db.prepare(`SELECT user_id,handle FROM forum_profiles WHERE is_staff=1
    AND ((handle=? AND is_system=1) OR handle=?)`).bind(SYSTEM_HANDLE,TEAM_HANDLE).all<{user_id:string;handle:string}>();
  const authors = new Map(users.results.map(row=>[row.handle,row.user_id]));
  for (const draft of drafts) {
    const author = authors.get(draft.author==="board" ? SYSTEM_HANDLE : TEAM_HANDLE);
    if (!author) { result.failed++; continue; }
    const row = recurringRow(draft,rooms.get(draft.category)!,author,shortId(8));
    const id = randomUUID();
    const statements = [db.prepare(`INSERT INTO forum_threads
      (id,short_id,category_id,author_id,type,title,slug,body,body_words,status,is_staff,region,country,auto_source,auto_source_key)
      VALUES(?,?,?,?,?,?,?,?,?,'approved',1,?,?,?,?) ON CONFLICT(auto_source_key) WHERE auto_source_key IS NOT NULL DO NOTHING`)
      .bind(id,row.short_id,row.category_id,row.author_id,row.type,row.title,row.slug,row.body,row.body_words,
        row.region,row.country,row.auto_source,row.auto_source_key)];
    if (draft.poll) {
      const poll = randomUUID();
      statements.push(db.prepare("INSERT INTO forum_polls(id,thread_id,question) SELECT ?,id,? FROM forum_threads WHERE id=?")
        .bind(poll,draft.poll.question,id));
      draft.poll.options.forEach((label,position)=>statements.push(db.prepare(`INSERT INTO forum_poll_options(id,poll_id,position,label)
        SELECT ?,id,?,? FROM forum_polls WHERE id=?`).bind(randomUUID(),position,label,poll)));
    }
    try {
      const [written]=await db.batch(statements);
      if (written.meta.changes === 1) result.created++;
      else result.skippedExisting++;
    } catch { result.failed++; }
  }
  return result;
}
