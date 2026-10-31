import "server-only";
import { createClient } from "@/lib/supabase/server";
import { d1AccessToken, d1SavedRfpsClient, d1SavedRfpsEnabled } from "./server";

/** One provider decision covers both saves and the saved-list page; a D1 failure never falls back to source. */
export async function loadSavedRfpTitles(userId: string): Promise<{ title: string; slug: string }[]> {
  if (d1SavedRfpsEnabled()) return (await d1SavedRfpsClient().list(await d1AccessToken())).map(r => ({ title: r.title, slug: r.slug }));
  const db = await createClient();
  const { data } = await db.from("saved_rfps").select("rfp_id,created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(500);
  const ids = ((data as { rfp_id: string }[] | null) ?? []).map(r => r.rfp_id);
  if (!ids.length) return [];
  const { data: rows } = await db.from("rfp_public").select("id,title,slug").in("id", ids);
  const byId = new Map(((rows as { id: string; title: string; slug: string }[] | null) ?? []).map(r => [r.id, r]));
  return ids.flatMap(id => { const row = byId.get(id); return row ? [{ title: row.title, slug: row.slug }] : []; });
}
