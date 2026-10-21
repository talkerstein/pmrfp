import { createReadClient } from "@/lib/supabase/read";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { deadlineHistory, publicQa, type AddendumRow, type DeadlineChange, type PublicQa } from "./rules";

/**
 * What a public buyer's listing shows to every visitor (anon reads of the
 * public views from migration 20261021000060): the job in full (public
 * procurement details are free), the answered questions without who asked,
 * the addenda and the closing date's change history. Read only for listings
 * whose source type says they're a town's job, so other listings never pay
 * for these queries. Null / empty without Supabase or before the migration.
 */

export interface TownPostPublic {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  scope: string | null;
  requirements: string | null;
  submission_instructions: string | null;
  budget_min: number | null;
  budget_max: number | null;
  deadline: string | null;
  question_deadline: string | null;
  city: string | null;
  province: string | null;
  status: string;
  published_at: string | null;
  buyer_key: string | null;
  buyer_name: string | null;
  post_kind: string | null;
  official_url: string | null;
  official_portal: string | null;
  verified: boolean | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
}

export interface TownListing {
  post: TownPostPublic;
  qa: PublicQa[];
  addenda: AddendumRow[];
  history: DeadlineChange[];
  /** Part C: "Sealed until closing" (the closing instant, the town's zone, when it was opened). Never a count. */
  sealed: { closesAt: string | null; timeZone: string; openedAt: string | null } | null;
  /** Part C: the published award ("Awarded to X"; the amount only when the town published it). */
  award: { winner: string; amount: number | null; date: string | null; publishedAt: string } | null;
}

export async function getTownListing(slug: string): Promise<TownListing | null> {
  if (!isSupabaseConfigured()) return null;
  try {
    const db = createReadClient();
    const { data, error } = await db.from("town_posts_public").select("*").eq("slug", slug).maybeSingle();
    if (error || !data) return null;
    const post = data as TownPostPublic;
    const [{ data: qa }, { data: addenda }, sealedRes, awardRes] = await Promise.all([
      db.from("town_job_qa_public").select("id,question,answer,answered_at").eq("rfp_id", post.id).order("answered_at", { ascending: true }),
      db.from("town_job_addenda_public").select("number,body,official_url,old_deadline,new_deadline,created_at").eq("rfp_id", post.id).order("number", { ascending: true }),
      // Part C (migration 20261021000120): absent before it runs, so errors read as "not sealed, no award".
      db.from("town_sealed_public").select("closes_at,time_zone,opened_at").eq("rfp_id", post.id).maybeSingle(),
      db.from("town_awards_public").select("winner_name,amount,award_date,award_published_at").eq("rfp_id", post.id).maybeSingle(),
    ]);
    const sealedRow = sealedRes.error ? null : (sealedRes.data as { closes_at: string | null; time_zone: string; opened_at: string | null } | null);
    const awardRow = awardRes.error ? null : (awardRes.data as { winner_name: string; amount: number | string | null; award_date: string | null; award_published_at: string } | null);
    const rows = ((addenda ?? []) as AddendumRow[]).sort((a, b) => a.number - b.number);
    return {
      post,
      // The view only ever holds answered questions; publicQa keeps exactly the public fields.
      qa: publicQa(((qa ?? []) as { id: string; question: string; answer: string; answered_at: string }[]).map((r) => ({ ...r, status: "answered" }))),
      addenda: rows,
      history: deadlineHistory(rows),
      sealed: sealedRow ? { closesAt: sealedRow.closes_at, timeZone: sealedRow.time_zone, openedAt: sealedRow.opened_at } : null,
      award: awardRow?.winner_name ? { winner: awardRow.winner_name, amount: awardRow.amount == null ? null : Number(awardRow.amount), date: awardRow.award_date, publishedAt: awardRow.award_published_at } : null,
    };
  } catch (e) {
    console.warn("[town-jobs] listing read failed", e instanceof Error ? e.message : e);
    return null;
  }
}
