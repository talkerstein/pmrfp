import { createReadClient } from "@/lib/supabase/read";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { vpsAppDatabase } from "@/lib/d1/http-binding";
import type { D1Binding } from "@/lib/d1/contracts";
import { isVpsLiveCustomerAuth } from "@/lib/d1/staging-config";
import { customerAppAuthority } from "../../../workers/d1-api/customer-signup";
import { deadlineHistory, publicQa, type AddendumRow, type DeadlineChange, type PublicQa } from "./rules";
import { townClosesAt, townTimeZone } from "./sealed";

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

const publicTown = `SELECT id FROM rfp_posts WHERE slug=? AND source_type='public_buyer_direct' AND is_demo=0
  AND status IN ('published','closed','awarded') AND ${customerAppAuthority}`;

export async function getNativeTownListing(slug: string, db: D1Binding = vpsAppDatabase()): Promise<TownListing | null> {
  const [posts, questions, addenda, awards] = await db.batch([
    db.prepare(`SELECT r.id,r.slug,r.title,r.summary,r.scope,r.requirements,r.submission_instructions,
        CASE WHEN r.budget_public=1 THEN r.budget_min END AS budget_min,
        CASE WHEN r.budget_public=1 THEN r.budget_max END AS budget_max,
        r.deadline,r.question_deadline,r.city,r.province,r.status,r.published_at,r.buyer_key,
        coalesce(p.buyer_name,r.buyer_name) AS buyer_name,r.post_kind,r.official_url,r.official_portal,
        (p.organization_id IS NOT NULL AND p.organization_id=r.posted_by_organization_id) AS verified,
        CASE WHEN r.contact_visibility='public_contact' THEN r.contact_name END AS contact_name,
        CASE WHEN r.contact_visibility='public_contact' THEN r.contact_email END AS contact_email,
        CASE WHEN r.contact_visibility='public_contact' THEN r.contact_phone END AS contact_phone,
        r.sealed,(SELECT max(created_at) FROM town_job_log WHERE rfp_id=r.id AND event='quotes_opened') AS opened_at
      FROM rfp_posts r LEFT JOIN buyer_pages p ON p.buyer_key=r.buyer_key WHERE r.id IN (${publicTown})`).bind(slug),
    db.prepare(`SELECT id,coalesce(public_question,question) AS question,answer,answered_at
      FROM town_job_questions WHERE status='answered' AND rfp_id IN (${publicTown})
      ORDER BY answered_at,id`).bind(slug),
    db.prepare(`SELECT number,body,official_url,old_deadline,new_deadline,created_at FROM town_job_addenda
      WHERE rfp_id IN (${publicTown}) ORDER BY number`).bind(slug),
    db.prepare(`SELECT award_winner_name AS winner,CASE WHEN award_amount_public=1 THEN award_amount END AS amount,
        award_date AS date,award_published_at AS publishedAt FROM town_job_results
      WHERE award_published_at IS NOT NULL AND rfp_id IN (${publicTown})`).bind(slug),
  ]);
  const row = posts.results[0] as unknown as (Omit<TownPostPublic, "verified" | "budget_min" | "budget_max"> & {
    verified: number; sealed: number; opened_at: string | null; budget_min: string | number | null; budget_max: string | number | null;
  }) | undefined;
  if (!row) return null;
  const { sealed, opened_at, verified, budget_min, budget_max, ...fields } = row;
  const post: TownPostPublic = { ...fields, verified: Boolean(verified),
    budget_min: budget_min == null ? null : Number(budget_min), budget_max: budget_max == null ? null : Number(budget_max) };
  const rows = addenda.results as unknown as AddendumRow[];
  const award = awards.results[0] as unknown as (Omit<NonNullable<TownListing["award"]>, "amount"> & { amount: string | number | null }) | undefined;
  return {
    post,
    qa: publicQa((questions.results as unknown as { id: string; question: string; answer: string; answered_at: string }[])
      .map((q) => ({ ...q, status: "answered" }))),
    addenda: rows,
    history: deadlineHistory(rows),
    sealed: sealed ? { closesAt: townClosesAt(post.deadline, post.buyer_key), timeZone: townTimeZone(post.buyer_key), openedAt: opened_at } : null,
    award: award?.winner ? { ...award, amount: award.amount == null ? null : Number(award.amount) } : null,
  };
}

export async function getTownListing(slug: string): Promise<TownListing | null> {
  try {
    if (isVpsLiveCustomerAuth()) return await getNativeTownListing(slug);
    if (!isSupabaseConfigured()) return null;
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
