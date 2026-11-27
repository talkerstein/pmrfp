import "server-only";
import { vpsAppDatabase } from "@/lib/d1/http-binding";
import type { D1Binding } from "@/lib/d1/contracts";
import { customerAppAuthority } from "../../../workers/d1-api/customer-signup";
import type { RecordBundle, RecordPost } from "./records";
import type { SummaryResponse } from "./results";
import { townClosesAt } from "./sealed";

const ownedOrg = `r.posted_by_organization_id=?2 AND r.source_type='public_buyer_direct' AND r.is_demo=0
  AND EXISTS(SELECT 1 FROM organization_members m JOIN users_profile u ON u.id=m.user_id
    JOIN organizations o ON o.id=m.organization_id
    WHERE m.organization_id=r.posted_by_organization_id AND m.user_id=?1
      AND u.status='active' AND o.status='active' AND o.organization_type='public_buyer')
  AND ${customerAppAuthority}`;
type ExportPost = Omit<RecordPost,"closes_at"|"sealed"|"budget_min"|"budget_max"> & {
  buyer_key: string | null; sealed: number; budget_min: string | null; budget_max: string | null;
};
const columns = "id,slug,title,summary,scope,requirements,submission_instructions,status,post_kind,sealed,deadline,question_deadline,published_at,created_at,buyer_key,buyer_name,official_url,official_portal,budget_min,budget_max,city,province";
const projection = columns.split(",").map((c) => "r."+c).join(",");

export async function nativePostsToExport(actor: string, org: string, q: {rfpId:string|null;from:string|null;to:string|null},
  db: D1Binding = vpsAppDatabase()) {
  const result = await db.prepare(`SELECT ${projection} FROM rfp_posts r WHERE ${ownedOrg}
    AND ((?3 IS NOT NULL AND r.id=?3) OR (?3 IS NULL AND (?4 IS NULL OR julianday(r.created_at)>=julianday(?4))
      AND (?5 IS NULL OR julianday(r.created_at)<=julianday(?5)))) ORDER BY r.created_at,r.id LIMIT 100`)
    .bind(actor,org,q.rfpId,q.from ? q.from+"T00:00:00Z" : null,q.to ? q.to+"T23:59:59.999Z" : null).all<ExportPost>();
  return result.results;
}

export async function nativeRecordBundle(actor: string, org: string, candidate: ExportPost, db: D1Binding = vpsAppDatabase()): Promise<RecordBundle | null> {
  const args = [actor,org,candidate.id] as const;
  const scope = `SELECT r.id FROM rfp_posts r WHERE ${ownedOrg} AND r.id=?3`;
  const opened = "EXISTS(SELECT 1 FROM _town_sealed_openings WHERE rfp_id=r.id AND status='opened')";
  const visibleResponses = `${scope} AND (r.sealed=0 OR ${opened})`;
  const [post,addenda,questions,invites,logs,results,responses] = await db.batch([
    db.prepare(`SELECT ${projection},${opened} AS opened,
      (SELECT count(*) FROM _town_sealed_quotes q WHERE q.rfp_id=r.id AND q.status='active') AS sealedCount
      FROM rfp_posts r WHERE r.id IN (${scope})`).bind(...args),
    db.prepare(`SELECT number,body,official_url,old_deadline,new_deadline,created_at FROM town_job_addenda
      WHERE rfp_id IN (${scope}) ORDER BY number`).bind(...args),
    db.prepare(`SELECT q.created_at AS asked_at,q.question,q.public_question,q.answer,q.answered_at,q.status,o.name AS asker_company
      FROM town_job_questions q LEFT JOIN organizations o ON o.id=q.asker_organization_id
      WHERE q.rfp_id IN (${scope}) ORDER BY q.created_at,q.id`).bind(...args),
    db.prepare(`SELECT i.created_at,i.kind,coalesce(o.name,i.email_key) AS "to",i.status FROM town_invites i
      LEFT JOIN organizations o ON o.id=i.trade_organization_id WHERE i.rfp_id IN (${scope}) ORDER BY i.created_at,i.id`).bind(...args),
    db.prepare(`SELECT l.created_at AS at,l.event,l.detail,
      CASE WHEN u.primary_role IN ('admin','super_admin') OR j.posted_by_user_id=u.id OR EXISTS(
        SELECT 1 FROM organization_members m WHERE m.user_id=u.id AND m.organization_id=j.posted_by_organization_id)
      THEN coalesce(nullif(trim(u.full_name),''),u.email) END AS actor
      FROM town_job_log l JOIN rfp_posts j ON j.id=l.rfp_id LEFT JOIN users_profile u ON u.id=l.actor_user_id
      WHERE l.rfp_id IN (${scope}) ORDER BY l.id LIMIT 5000`).bind(...args),
    db.prepare(`SELECT x.recommended_interest_id,x.rationale,coalesce(nullif(trim(u.full_name),''),u.email) AS recommended_by,
      x.recommended_at,x.award_winner_name AS winner,x.award_amount AS amount,x.award_amount_public AS amount_public,
      x.award_date,x.award_published_at AS published_at FROM town_job_results x
      LEFT JOIN users_profile u ON u.id=x.recommended_by WHERE x.rfp_id IN (${visibleResponses})`).bind(...args),
    db.prepare(`SELECT i.id,i.status,i.trade_organization_id AS orgId,coalesce(o.name,'—') AS company,
      i.quote_amount AS amount,i.quote_kind AS kind,i.start_date AS startDate,i.quote_notes AS notes,
      i.message,i.created_at AS createdAt,o.profile_status AS profileStatus,o.verified,o.insurance_status AS insurance,o.wsib_status AS wsib
      FROM rfp_interests i LEFT JOIN organizations o ON o.id=i.trade_organization_id
      WHERE i.rfp_id IN (${visibleResponses}) ORDER BY i.created_at,i.id LIMIT 500`).bind(...args),
  ]);
  const selected = post.results[0] as unknown as (ExportPost & {opened:number;sealedCount:number}) | undefined;
  if (!selected) return null;
  const { opened: boxOpened,sealed, sealedCount,buyer_key,budget_min,budget_max,...fields } = selected;
  const visible = !sealed || Boolean(boxOpened);
  const quotes = visible ? (responses.results as unknown as SummaryResponse[]).map((row) => ({...row,verified:Boolean(row.verified),
    amount:row.amount==null ? null : Number(row.amount),insurance:row.insurance?.trim() || null,wsib:row.wsib?.trim() || null})) : null;
  const byResponse = new Map((quotes ?? []).map((r) => [r.id,r.company]));
  const log = (logs.results as unknown as {at:string;event:string;actor:string|null;detail:string|null}[])
    .map(({detail,...log}) => ({ ...log,detail:detail ? JSON.parse(detail) as Record<string,unknown> : {} }));
  const companyByQuote = new Map<string,string>();
  if (visible) for (const item of log) {
    if (item.event !== "quotes_opened" || !Array.isArray(item.detail.responses)) continue;
    for (const pair of item.detail.responses as {quote?:string;response?:string}[]) {
      const company = pair.response ? byResponse.get(pair.response) : null;
      if (pair.quote && company) companyByQuote.set(pair.quote,company);
    }
  }
  const saved = results.results[0] as unknown as (Omit<NonNullable<RecordBundle["results"]>,"recommended"|"amount"|"amount_public"> & {
    recommended_interest_id:string|null;amount:string|null;amount_public:number;
  }) | undefined;
  const { recommended_interest_id = null, ...result } = saved ?? {};
  return {
    post:{...fields,sealed:Boolean(sealed),closes_at:townClosesAt(fields.deadline,buyer_key),
      budget_min:budget_min==null ? null : Number(budget_min),budget_max:budget_max==null ? null : Number(budget_max)},
    addenda:addenda.results as unknown as RecordBundle["addenda"],
    questions:questions.results as unknown as RecordBundle["questions"],
    invites:invites.results as unknown as RecordBundle["invites"],
    responses:quotes,sealedCount:visible ? null : sealedCount,
    log:log.map((l) => ({ ...l,company:typeof l.detail.quote==="string" ? companyByQuote.get(l.detail.quote) ?? null : null })),
    results:saved ? { ...result as NonNullable<RecordBundle["results"]>, recommended:recommended_interest_id ? byResponse.get(recommended_interest_id) ?? null : null,
      amount:saved.amount==null ? null : Number(saved.amount),amount_public:Boolean(saved.amount_public) } : null,
  };
}

export async function logNativeTownRecords(actor: string,org: string,ids:string[],detail:Record<string,unknown>,db:D1Binding = vpsAppDatabase()) {
  const result = await db.prepare(`INSERT INTO town_job_log(rfp_id,organization_id,buyer_key,actor_user_id,event,detail)
    SELECT r.id,r.posted_by_organization_id,r.buyer_key,?1,'records_exported',?3 FROM rfp_posts r
    WHERE ${ownedOrg} AND r.id IN (SELECT value FROM json_each(?4))`)
    .bind(actor,org,JSON.stringify(detail),JSON.stringify(ids)).run();
  return result.meta.changes===ids.length;
}
