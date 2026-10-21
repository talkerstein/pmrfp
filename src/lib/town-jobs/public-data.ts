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
}

export async function getTownListing(slug: string): Promise<TownListing | null> {
  if (!isSupabaseConfigured()) return null;
  try {
    const db = createReadClient();
    const { data, error } = await db.from("town_posts_public").select("*").eq("slug", slug).maybeSingle();
    if (error || !data) return null;
    const post = data as TownPostPublic;
    const [{ data: qa }, { data: addenda }] = await Promise.all([
      db.from("town_job_qa_public").select("id,question,answer,answered_at").eq("rfp_id", post.id).order("answered_at", { ascending: true }),
      db.from("town_job_addenda_public").select("number,body,official_url,old_deadline,new_deadline,created_at").eq("rfp_id", post.id).order("number", { ascending: true }),
    ]);
    const rows = ((addenda ?? []) as AddendumRow[]).sort((a, b) => a.number - b.number);
    return {
      post,
      // The view only ever holds answered questions; publicQa keeps exactly the public fields.
      qa: publicQa(((qa ?? []) as { id: string; question: string; answer: string; answered_at: string }[]).map((r) => ({ ...r, status: "answered" }))),
      addenda: rows,
      history: deadlineHistory(rows),
    };
  } catch (e) {
    console.warn("[town-jobs] listing read failed", e instanceof Error ? e.message : e);
    return null;
  }
}
