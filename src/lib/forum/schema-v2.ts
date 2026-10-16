import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Is the forum rework migration (20261017000001_forum_rework.sql) applied?
 * The app reads its columns (country, images, auto_source kinds) and tables
 * (polls, follows) only once it is, so deploying before the migration keeps
 * every forum page working. A yes is remembered for the life of the
 * instance; a no is re-checked after a minute.
 */
let state: { ok: boolean; at: number } | null = null;
const RECHECK_MS = 60_000;

export async function forumV2Ready(client: SupabaseClient | null): Promise<boolean> {
  if (!client) return false;
  if (state?.ok) return true;
  if (state && Date.now() - state.at < RECHECK_MS) return false;
  try {
    const { error } = await client.from("forum_threads").select("country,images").limit(1);
    state = { ok: !error, at: Date.now() };
  } catch {
    state = { ok: false, at: Date.now() };
  }
  return state.ok;
}

/** Tests only. */
export function resetForumV2Probe(): void {
  state = null;
}
