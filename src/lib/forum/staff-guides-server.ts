import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { autoThreadsReady } from "./auto-threads-server";
import { GUIDE_KEY_PREFIX, TEAM_BIO, TEAM_DISPLAY_NAME, TEAM_HANDLE, guideThreadRow, planStaffGuides, type StaffGuide } from "./staff-guides";
import { STAFF_GUIDES } from "./staff-guides-content";

/**
 * Staff guides (DB side). Inserts ONLY forum_threads rows authored by the
 * PMRFP Team staff profile (created once if missing). No posts, ratings,
 * votes or reputation. Keyed on forum_threads.auto_source_key ("guide:A1"),
 * so re-running, or running the SQL fallback too, never duplicates a guide.
 */

export interface GuideImportResult {
  ready: boolean;
  dry: boolean;
  total: number;
  alreadyImported: number;
  planned: number;
  created: number;
  failed: number;
  items: { title: string; category: string; pinned: boolean }[];
  reason?: string;
}

const TEAM_EMAIL = process.env.FORUM_TEAM_EMAIL || "forum-team@pmrfp.com";

/** The PMRFP Team staff profile's user id (created once: no password, sign-in banned). */
export async function ensureTeamProfile(db: SupabaseClient): Promise<string | null> {
  const { data: hit } = await db.from("forum_profiles").select("user_id").eq("handle", TEAM_HANDLE).maybeSingle<{ user_id: string }>();
  if (hit) {
    await db.from("forum_profiles").update({ is_staff: true }).eq("user_id", hit.user_id);
    return hit.user_id;
  }
  let userId: string | null = null;
  const created = await db.auth.admin.createUser({
    email: TEAM_EMAIL,
    email_confirm: true,
    ban_duration: "876000h",
    user_metadata: { full_name: TEAM_DISPLAY_NAME, primary_role: "visitor", system: "forum-team" },
    app_metadata: { system: "forum-team" },
  });
  if (created.data?.user) userId = created.data.user.id;
  else {
    for (let page = 1; page <= 20 && !userId; page++) {
      const { data } = await db.auth.admin.listUsers({ page, perPage: 200 });
      const users = data?.users ?? [];
      userId = users.find((u) => u.email?.toLowerCase() === TEAM_EMAIL.toLowerCase())?.id ?? null;
      if (users.length < 200) break;
    }
  }
  if (!userId) {
    console.error("[forum-guides] could not create the team user:", created.error?.message);
    return null;
  }
  const { error } = await db
    .from("forum_profiles")
    .upsert({ user_id: userId, handle: TEAM_HANDLE, display_name: TEAM_DISPLAY_NAME, bio: TEAM_BIO, is_staff: true }, { onConflict: "user_id" });
  if (error) {
    console.error("[forum-guides] team profile:", error.message);
    return null;
  }
  return userId;
}

async function importedKeys(db: SupabaseClient): Promise<Set<string>> {
  const out = new Set<string>();
  const { data } = await db.from("forum_threads").select("auto_source_key").like("auto_source_key", `${GUIDE_KEY_PREFIX}%`).limit(1000);
  for (const r of (data ?? []) as { auto_source_key: string }[]) out.add(r.auto_source_key);
  return out;
}

/** Preview (dry) or import every guide not imported yet. */
export async function runStaffGuideImport(
  db: SupabaseClient,
  opts: { dry: boolean; guides?: readonly StaffGuide[] },
): Promise<GuideImportResult> {
  const guides = opts.guides ?? STAFF_GUIDES;
  const base: GuideImportResult = { ready: false, dry: opts.dry, total: guides.length, alreadyImported: 0, planned: 0, created: 0, failed: 0, items: [] };
  if (!(await autoThreadsReady(db))) return { ...base, reason: "Apply supabase/migrations/20261008000001_forum_auto_threads.sql first (or run briefs/ops/2026-10-09-forum-staff-guides.sql)." };

  const [existing, { data: cats }] = await Promise.all([importedKeys(db), db.from("forum_categories").select("id,slug")]);
  const catId = new Map(((cats ?? []) as { id: string; slug: string }[]).map((c) => [c.slug, c.id]));
  const drafts = planStaffGuides(guides, existing).filter((d) => catId.has(d.category));
  const result: GuideImportResult = {
    ...base,
    ready: true,
    alreadyImported: guides.filter((g) => existing.has(`${GUIDE_KEY_PREFIX}${g.key}`)).length,
    planned: drafts.length,
    items: drafts.map((d) => ({ title: d.title, category: d.category, pinned: d.pinned })),
  };
  if (opts.dry || !drafts.length) return result;

  const authorId = await ensureTeamProfile(db);
  if (!authorId) return { ...result, reason: "Could not create the PMRFP Team staff profile." };

  // One at a time, in content order, so each guide gets its own real timestamp.
  for (const d of drafts) {
    const { error } = await db.from("forum_threads").insert(guideThreadRow(d, catId.get(d.category)!, authorId));
    if (!error) result.created++;
    else if (error.code === "23505") continue; // imported meanwhile (button twice, or the SQL file): skip
    else {
      console.error("[forum-guides] insert:", error.message);
      result.failed++;
    }
  }
  return result;
}
