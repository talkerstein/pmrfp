import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { shortId } from "./text";
import {
  SYSTEM_DISPLAY_NAME,
  SYSTEM_HANDLE,
  planAutoThreads,
  type AutoSourceRecord,
  type AutoThreadDraft,
} from "./auto-threads";

/**
 * Forum auto-threads (DB side). Writes ONLY forum_threads rows (plus the
 * one-time PMRFP Board system profile). It never inserts posts, ratings,
 * votes or reputation events. Everything no-ops (ready: false) until
 * supabase/migrations/20261008000001_forum_auto_threads.sql is applied.
 */

export interface AutoRunResult {
  ready: boolean;
  dry: boolean;
  considered: number;
  alreadyThreaded: number;
  planned: number;
  created: number;
  failed: number;
  sample: { title: string; category: string; createdAt: string; kind: string }[];
  reason?: string;
}

const SYSTEM_EMAIL = process.env.FORUM_SYSTEM_EMAIL || "forum-board@pmrfp.com";

function isMissingColumn(err: { code?: string; message?: string } | null | undefined): boolean {
  if (!err) return false;
  return err.code === "42703" || err.code === "PGRST204" || err.code === "42P01" || err.code === "PGRST205" || /auto_source|is_system/.test(err.message ?? "");
}

/** True once the auto-threads migration is applied. */
export async function autoThreadsReady(db: SupabaseClient): Promise<boolean> {
  const { error } = await db.from("forum_threads").select("auto_source_key").limit(1);
  return !error;
}

/** The PMRFP Board system profile's user id (created once, sign-in banned). */
export async function ensureSystemProfile(db: SupabaseClient): Promise<string | null> {
  const { data: hit } = await db.from("forum_profiles").select("user_id").eq("handle", SYSTEM_HANDLE).maybeSingle<{ user_id: string }>();
  if (hit) {
    await db.from("forum_profiles").update({ is_system: true, is_staff: true }).eq("user_id", hit.user_id);
    return hit.user_id;
  }

  let userId: string | null = null;
  const created = await db.auth.admin.createUser({
    email: SYSTEM_EMAIL,
    email_confirm: true,
    // No password and a ~100-year ban: nobody can ever sign in as the Board.
    ban_duration: "876000h",
    user_metadata: { full_name: SYSTEM_DISPLAY_NAME, primary_role: "visitor", system: "forum-board" },
    app_metadata: { system: "forum-board" },
  });
  if (created.data?.user) userId = created.data.user.id;
  else {
    // Already exists from an earlier, partial run: find it.
    for (let page = 1; page <= 20 && !userId; page++) {
      const { data } = await db.auth.admin.listUsers({ page, perPage: 200 });
      const users = data?.users ?? [];
      userId = users.find((u) => u.email?.toLowerCase() === SYSTEM_EMAIL.toLowerCase())?.id ?? null;
      if (users.length < 200) break;
    }
  }
  if (!userId) {
    console.error("[forum-auto] could not create system user:", created.error?.message);
    return null;
  }
  const { error } = await db.from("forum_profiles").upsert(
    {
      user_id: userId,
      handle: SYSTEM_HANDLE,
      display_name: SYSTEM_DISPLAY_NAME,
      bio: "Automatic posts from PMRFP: one thread per real public tender, RFP or contract award. Not a person; never replies, rates or votes.",
      is_staff: true,
      is_system: true,
    },
    { onConflict: "user_id" },
  );
  if (error) {
    console.error("[forum-auto] system profile:", error.message);
    return null;
  }
  return userId;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
/** Published, non-demo RFP rows (tenders, PM RFPs, awards) since `sinceIso`. */
export async function loadSourceRecords(db: SupabaseClient, sinceIso: string, limit = 3000): Promise<AutoSourceRecord[]> {
  const rows: any[] = [];
  for (let from = 0; from < limit; from += 1000) {
    const { data, error } = await db
      .from("rfp_posts")
      .select("id,slug,title,summary,city,province,deadline,published_at,created_at,source_type,is_demo,status")
      .eq("status", "published")
      .eq("is_demo", false)
      .gte("published_at", sinceIso)
      .order("published_at", { ascending: false })
      .range(from, Math.min(from + 999, limit - 1));
    if (error) {
      console.error("[forum-auto] rfp read:", error.message);
      break;
    }
    rows.push(...(data ?? []));
    if ((data ?? []).length < 1000) break;
  }
  if (!rows.length) return [];

  const [{ data: cats }, links] = await Promise.all([
    db.from("trade_categories").select("id,slug,name"),
    (async () => {
      const out: { rfp_id: string; category_id: string }[] = [];
      const ids = rows.map((r) => r.id);
      for (let i = 0; i < ids.length; i += 300) {
        const { data } = await db.from("rfp_categories").select("rfp_id,category_id").in("rfp_id", ids.slice(i, i + 300));
        out.push(...((data ?? []) as any[]));
      }
      return out;
    })(),
  ]);
  const catById = new Map(((cats ?? []) as { id: string; slug: string; name: string }[]).map((c) => [c.id, c]));
  const byRfp = new Map<string, { slug: string; name: string }[]>();
  for (const l of links) {
    const c = catById.get(l.category_id);
    if (!c) continue;
    const list = byRfp.get(l.rfp_id) ?? [];
    list.push(c);
    byRfp.set(l.rfp_id, list);
  }
  return rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    title: r.title,
    summary: r.summary,
    city: r.city,
    province: r.province,
    deadline: r.deadline,
    publishedAt: r.published_at,
    createdAt: r.created_at,
    sourceType: r.source_type,
    isDemo: Boolean(r.is_demo),
    status: r.status,
    tradeSlugs: (byRfp.get(r.id) ?? []).map((c) => c.slug),
    tradeNames: (byRfp.get(r.id) ?? []).map((c) => c.name),
  }));
}

async function existingKeys(db: SupabaseClient): Promise<Set<string>> {
  const out = new Set<string>();
  for (let from = 0; ; from += 1000) {
    const { data } = await db.from("forum_threads").select("auto_source_key").not("auto_source_key", "is", null).range(from, from + 999);
    for (const r of (data ?? []) as { auto_source_key: string }[]) out.add(r.auto_source_key);
    if ((data ?? []).length < 1000) break;
  }
  return out;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** The row inserted for a draft. Exported for tests. */
export function threadRow(d: AutoThreadDraft, categoryId: string, authorId: string, sid: string) {
  return {
    short_id: sid,
    category_id: categoryId,
    author_id: authorId,
    type: "discussion" as const,
    title: d.title,
    slug: d.slug.slice(0, 80) || "thread",
    body: d.body,
    body_words: d.bodyWords,
    status: "approved" as const,
    is_staff: true,
    region: d.region,
    auto_source: d.kind,
    auto_source_key: d.sourceKey,
    // The real event date, never "now".
    created_at: d.createdAt,
    updated_at: d.createdAt,
    last_post_at: d.createdAt,
  };
}

/** Plan (dry) or create auto-threads for records published in the last `days`. */
export async function runAutoThreads(db: SupabaseClient, opts: { days: number; cap: number; dry: boolean; now?: Date }): Promise<AutoRunResult> {
  const base: AutoRunResult = { ready: false, dry: opts.dry, considered: 0, alreadyThreaded: 0, planned: 0, created: 0, failed: 0, sample: [] };
  if (!(await autoThreadsReady(db))) return { ...base, reason: "Apply supabase/migrations/20261008000001_forum_auto_threads.sql first." };

  const since = new Date((opts.now ?? new Date()).getTime() - opts.days * 86_400_000).toISOString();
  const [records, existing, { data: cats }] = await Promise.all([
    loadSourceRecords(db, since),
    existingKeys(db),
    db.from("forum_categories").select("id,slug"),
  ]);
  const catId = new Map(((cats ?? []) as { id: string; slug: string }[]).map((c) => [c.slug, c.id]));
  const drafts = planAutoThreads(records, existing, opts.cap).filter((d) => catId.has(d.category));
  const result: AutoRunResult = {
    ...base,
    ready: true,
    considered: records.length,
    alreadyThreaded: records.filter((r) => existing.has(`rfp:${r.id}`)).length,
    planned: drafts.length,
    sample: drafts.slice(0, 12).map((d) => ({ title: d.title, category: d.category, createdAt: d.createdAt, kind: d.kind })),
  };
  if (opts.dry || !drafts.length) return result;

  const authorId = await ensureSystemProfile(db);
  if (!authorId) return { ...result, reason: "Could not create the PMRFP Board system profile." };

  for (const d of drafts) {
    let done = false;
    for (let i = 0; i < 3 && !done; i++) {
      const { error } = await db.from("forum_threads").insert(threadRow(d, catId.get(d.category)!, authorId, shortId(8)));
      if (!error) {
        result.created++;
        done = true;
      } else if (error.code === "23505" && /auto_source/.test(error.message ?? "")) {
        done = true; // threaded by a concurrent run: idempotent skip
      } else if (error.code !== "23505") {
        if (isMissingColumn(error)) return { ...result, reason: "Auto-thread columns missing." };
        console.error("[forum-auto] insert:", error.message);
        result.failed++;
        done = true;
      }
    }
  }
  return result;
}
