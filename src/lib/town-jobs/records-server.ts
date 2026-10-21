import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { RecordBundle, RecordPost } from "./records";
import { responsesFor, savedResults } from "./results-server";
import { isOpened, townClosesAt } from "./sealed";
import { sealedStateFor } from "./sealed-server";
import { TOWN_SOURCE } from "./rules";

/**
 * Loads a town's records for the export (service role; server only). The
 * caller checks the person belongs to the town. A sealed box's responses are
 * included only once it's opened (before that there are none to read: the
 * database keeps them in the private box), with its count instead.
 */

type Db = SupabaseClient;

export const EXPORT_MAX_POSTS = 100;

const POST_COLS =
  "id,slug,title,summary,scope,requirements,submission_instructions,status,post_kind,sealed,deadline,question_deadline,published_at,created_at,buyer_key,buyer_name,official_url,official_portal,budget_min,budget_max,city,province,posted_by_user_id,posted_by_organization_id,source_type";

type PostRow = Omit<RecordPost, "closes_at"> & { buyer_key: string | null; posted_by_user_id: string | null; posted_by_organization_id: string | null; source_type: string };

/** The town's posts to export: one by id, or those posted in [from, to] (inclusive days). */
export async function postsToExport(db: Db, orgId: string, q: { rfpId?: string | null; from?: string | null; to?: string | null }): Promise<PostRow[]> {
  let query = db.from("rfp_posts").select(POST_COLS).eq("posted_by_organization_id", orgId).eq("source_type", TOWN_SOURCE);
  if (q.rfpId) query = query.eq("id", q.rfpId);
  else {
    if (q.from) query = query.gte("created_at", `${q.from}T00:00:00Z`);
    if (q.to) query = query.lte("created_at", `${q.to}T23:59:59.999Z`);
  }
  const { data, error } = await query.order("created_at", { ascending: true }).limit(EXPORT_MAX_POSTS);
  if (error || !data) return [];
  return (data as unknown as PostRow[]).map((p) => ({ ...p, sealed: Boolean(p.sealed) }));
}

async function namesOf(db: Db, ids: readonly string[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return new Map();
  const { data } = await db.from("users_profile").select("id,full_name,email").in("id", unique);
  return new Map(((data ?? []) as { id: string; full_name: string | null; email: string | null }[]).map((u) => [u.id, u.full_name?.trim() || u.email || u.id]));
}

/**
 * One post's full record. Names in the log: the town's own people and PMRFP
 * staff by name; anyone else (a bidder) only by company, and a sealed box's
 * entries only once it's opened (through the opening's quote → response map).
 */
export async function recordBundle(db: Db, post: PostRow, actorId: string): Promise<RecordBundle> {
  const state = post.sealed ? await sealedStateFor(db, post.id, actorId) : null;
  const opened = !post.sealed || isOpened(state);
  const [{ data: addenda }, { data: questions }, { data: invites }, { data: log }, { data: members }, responses, saved] = await Promise.all([
    db.from("town_job_addenda").select("number,body,official_url,old_deadline,new_deadline,created_at").eq("rfp_id", post.id).order("number", { ascending: true }),
    db.from("town_job_questions").select("question,public_question,answer,answered_at,status,asker_organization_id,created_at").eq("rfp_id", post.id).order("created_at", { ascending: true }),
    db.from("town_invites").select("kind,email_key,trade_organization_id,status,created_at").eq("rfp_id", post.id).order("created_at", { ascending: true }),
    db.from("town_job_log").select("event,detail,actor_user_id,created_at").eq("rfp_id", post.id).order("id", { ascending: true }).limit(5000),
    post.posted_by_organization_id ? db.from("organization_members").select("user_id").eq("organization_id", post.posted_by_organization_id) : Promise.resolve({ data: [] }),
    opened ? responsesFor(db, post.id) : Promise.resolve(null),
    savedResults(db, post.id),
  ]);
  const qRows = (questions ?? []) as { question: string; public_question: string | null; answer: string | null; answered_at: string | null; status: string; asker_organization_id: string | null; created_at: string }[];
  const iRows = (invites ?? []) as { kind: string; email_key: string; trade_organization_id: string | null; status: string; created_at: string }[];
  const lRows = (log ?? []) as { event: string; detail: Record<string, unknown> | null; actor_user_id: string | null; created_at: string }[];
  const orgIds = [...new Set([...qRows.map((q) => q.asker_organization_id), ...iRows.map((i) => i.trade_organization_id)].filter((x): x is string => Boolean(x)))];
  const { data: orgs } = orgIds.length ? await db.from("organizations").select("id,name").in("id", orgIds) : { data: [] };
  const orgName = new Map(((orgs ?? []) as { id: string; name: string }[]).map((o) => [o.id, o.name]));

  // Who may be named in the record: the town's members and PMRFP admins.
  const townIds = new Set(((members ?? []) as { user_id: string }[]).map((m) => m.user_id));
  if (post.posted_by_user_id) townIds.add(post.posted_by_user_id);
  const actorIds = [...new Set(lRows.map((l) => l.actor_user_id).filter((x): x is string => Boolean(x)))];
  const { data: admins } = actorIds.length ? await db.from("users_profile").select("id,primary_role").in("id", actorIds) : { data: [] };
  for (const a of (admins ?? []) as { id: string; primary_role: string }[]) if (a.primary_role === "admin" || a.primary_role === "super_admin") townIds.add(a.id);
  const names = await namesOf(db, actorIds.filter((id) => townIds.has(id)));

  // After opening, each sealed quote id maps to its response, hence its company.
  const companyByResponse = new Map((responses ?? []).map((r) => [r.id, r.company]));
  const companyByQuote = new Map<string, string>();
  if (opened) {
    for (const l of lRows.filter((x) => x.event === "quotes_opened")) {
      for (const m of ((l.detail?.responses ?? []) as { quote?: string; response?: string }[])) {
        if (m.quote && m.response && companyByResponse.has(m.response)) companyByQuote.set(m.quote, companyByResponse.get(m.response)!);
      }
    }
  }

  const rec = responses?.find((r) => r.id === saved?.recommended_interest_id) ?? null;
  const recBy = saved?.recommended_by ? (await namesOf(db, [saved.recommended_by])).get(saved.recommended_by) ?? null : null;
  return {
    post: { ...post, closes_at: state?.closes_at ?? townClosesAt(post.deadline, post.buyer_key) },
    addenda: (addenda ?? []) as RecordBundle["addenda"],
    questions: qRows.map((q) => ({ asked_at: q.created_at, question: q.question, public_question: q.public_question, answer: q.answer, answered_at: q.answered_at, status: q.status, asker_company: q.asker_organization_id ? (orgName.get(q.asker_organization_id) ?? null) : null })),
    responses,
    sealedCount: post.sealed && !opened ? (state?.received ?? 0) : null,
    invites: iRows.map((i) => ({ created_at: i.created_at, kind: i.kind, to: i.trade_organization_id ? (orgName.get(i.trade_organization_id) ?? i.email_key) : i.email_key, status: i.status })),
    log: lRows.map((l) => {
      const quote = typeof l.detail?.quote === "string" ? (l.detail.quote as string) : null;
      return {
        at: l.created_at,
        event: l.event,
        actor: l.actor_user_id && townIds.has(l.actor_user_id) ? (names.get(l.actor_user_id) ?? null) : null,
        company: quote ? (companyByQuote.get(quote) ?? null) : null,
        detail: l.detail ?? {},
      };
    }),
    results: saved
      ? {
          recommended: rec?.company ?? null,
          rationale: saved.rationale,
          recommended_by: recBy,
          recommended_at: saved.recommended_at,
          winner: saved.award_winner_name,
          amount: saved.award_amount,
          amount_public: saved.award_amount_public,
          award_date: saved.award_date,
          published_at: saved.award_published_at,
        }
      : null,
  };
}
