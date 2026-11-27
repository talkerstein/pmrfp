import "server-only";
import { randomUUID } from "node:crypto";
import { applyHistory } from "@/lib/contract-history/sync";
import type { D1Binding } from "@/lib/d1/contracts";
import { vpsAppDatabase } from "@/lib/d1/http-binding";
import { publicImageSource } from "@/lib/d1/public-asset-preview";
import { sendTownJobEmail } from "@/lib/email/send";
import { inviteUnsubscribeUrl, unsubscribeUrl } from "@/lib/email/unsubscribe";
import type { EmailLang } from "@/lib/pm-jobs/email-copy";
import { loadAlertAudience, loadJob, recipientLangs } from "@/lib/pm-jobs/server";
import { customerAppAuthority } from "../../../workers/d1-api/customer-signup";
import { addendumEmail, answerEmail, emailInviteEmail, questionWaitingEmail, tradeInviteEmail } from "./email-copy";
import { readNativeSealedState, writeNativeTownNotifications } from "./native-sealed";
import { awardHistoryRow, cleanRationale, planAward, resultsReady, summarize, type SummaryResponse } from "./results";
import type { PublishError, RecommendError, TownResults, TownResultsRow } from "./results-server";
import {
  askDecision, checkQuestionDeadline, cleanAnswer, cleanInviteEmail, cleanQuestion, dayStartToronto, emailInviteDecision,
  inviteBudget, INVITE_DAILY_MAX, planAddendum, planTradeInvites, todayToronto, townInvitesEnabled, townQaEmailsEnabled, type LogEvent,
} from "./rules";
import { isClosed, townClosesAt } from "./sealed";
import type { EmailInviteResult, InvitePreview, InviteRunResult, TownJob, TownJobDetail, TownJobSummary } from "./server";

const townJobColumns = "id,title,slug,summary,status,source_type,post_kind,buyer_key,buyer_name,official_url,official_portal,deadline,question_deadline,posted_by_user_id,posted_by_organization_id,poster_lang,created_at,published_at,sealed";
const townColumns = townJobColumns.split(",").map((column) => "r." + column).join(",");
const townSource = `r.source_type='public_buyer_direct' AND r.is_demo=0 AND ${customerAppAuthority}`;
const managed = `${townSource} AND EXISTS (
  SELECT 1 FROM users_profile u WHERE u.id=?1 AND u.status='active' AND (
    u.primary_role IN ('admin','super_admin') OR r.posted_by_user_id=u.id OR EXISTS(
      SELECT 1 FROM organization_members m WHERE m.user_id=u.id AND m.organization_id=r.posted_by_organization_id)))`;

type DbTownJob = Omit<TownJob, "sealed"> & { sealed: number | null };
const asJob = (row: DbTownJob): TownJob => ({ ...row, sealed: Boolean(row.sealed) });

export async function loadNativeManagedTownJob(actorId: string, id: string, db: D1Binding = vpsAppDatabase()) {
  const row = await db.prepare(`SELECT ${townColumns} FROM rfp_posts r WHERE r.id=?2 AND ${managed}`)
    .bind(actorId, id).first<DbTownJob>();
  return row ? asJob(row) : null;
}

export async function loadNativeTownBrand(actorId: string, id: string, db: D1Binding = vpsAppDatabase()) {
  const row = await db.prepare(`SELECT coalesce(p.buyer_name,o.name,r.buyer_name) AS name,
    coalesce(p.logo_url,o.logo_url) AS logo FROM rfp_posts r
    LEFT JOIN buyer_pages p ON p.organization_id=r.posted_by_organization_id
    LEFT JOIN organizations o ON o.id=r.posted_by_organization_id
    WHERE r.id=?2 AND ${managed}`).bind(actorId,id).first<{ name:string|null; logo:string|null }>();
  const logo = row?.logo;
  if (!logo) return { name:row?.name ?? null,logoUrl:null };
  const { src } = publicImageSource(logo);
  const local = /^\/api\/(?:company-media|migration\/public-asset)\/[a-f0-9-]+$/.test(src);
  if (local) return { name:row?.name ?? null,logoUrl:src };
  const url = URL.parse(src);
  const external = url?.protocol === "https:" && !url.username && !url.password
    && !url.hostname.endsWith(".supabase.co");
  return { name:row?.name ?? null,logoUrl:external ? src : null };
}

const opened = `EXISTS(SELECT 1 FROM _town_sealed_openings WHERE rfp_id=r.id AND status='opened')`;

export async function listNativeTownJobs(actorId: string, orgId: string, db: D1Binding = vpsAppDatabase()): Promise<TownJobSummary[]> {
  type Summary = Omit<TownJobSummary, "sealed"> & { sealed: number | null; opened: number };
  const rows = await db.prepare(`SELECT ${townColumns},
      CASE WHEN r.sealed=0 OR ${opened} THEN (SELECT count(*) FROM rfp_interests WHERE rfp_id=r.id)
        ELSE (SELECT count(*) FROM _town_sealed_quotes WHERE rfp_id=r.id AND status='active') END AS responses,
      ${opened} AS opened,
      (SELECT count(*) FROM town_job_questions WHERE rfp_id=r.id) AS questions,
      (SELECT count(*) FROM town_job_questions WHERE rfp_id=r.id AND status='open') AS questionsWaiting,
      (SELECT count(*) FROM town_job_addenda WHERE rfp_id=r.id) AS addenda,
      (SELECT count(*) FROM town_invites WHERE rfp_id=r.id) AS invites
    FROM rfp_posts r WHERE r.posted_by_organization_id=?2 AND ${managed}
    ORDER BY r.created_at DESC,r.id LIMIT 200`).bind(actorId, orgId).all<Summary>();
  return rows.results.map(({ opened: boxOpened, sealed, ...job }) => ({ ...job, sealed: Boolean(sealed),
    sealedBox: sealed ? { opened: Boolean(boxOpened), received: job.responses } : null }));
}

export async function loadNativeTownDetail(actorId: string, job: TownJob, db: D1Binding = vpsAppDatabase()): Promise<TownJobDetail> {
  const scope = `SELECT r.id FROM rfp_posts r WHERE r.id=?2 AND ${managed}`;
  const args = [actorId, job.id] as const;
  const [questions, addenda, invites, log, count] = await db.batch([
    db.prepare(`SELECT q.id,q.question,q.public_question,q.answer,q.answered_at,q.status,q.asker_user_id,q.asker_organization_id,
        q.created_at,o.name AS askerCompany FROM town_job_questions q LEFT JOIN organizations o ON o.id=q.asker_organization_id
      WHERE q.rfp_id IN (${scope}) ORDER BY q.created_at,q.id`).bind(...args),
    db.prepare(`SELECT number,body,official_url,old_deadline,new_deadline,created_at FROM town_job_addenda
      WHERE rfp_id IN (${scope}) ORDER BY number`).bind(...args),
    db.prepare(`SELECT i.id,i.kind,i.email_key,o.name AS company,i.created_at,i.status FROM town_invites i
      LEFT JOIN organizations o ON o.id=i.trade_organization_id WHERE i.rfp_id IN (${scope})
      ORDER BY i.created_at DESC,i.id`).bind(...args),
    db.prepare(`SELECT id,event,detail,created_at FROM town_job_log WHERE rfp_id IN (${scope})
      ORDER BY created_at DESC,id DESC LIMIT 200`).bind(...args),
    db.prepare(`SELECT count(*) AS count FROM rfp_interests WHERE rfp_id IN (
      ${scope} AND (r.sealed=0 OR ${opened}))`).bind(...args),
  ]);
  const entries = log.results as unknown as (Omit<TownJobDetail["log"][number], "detail"> & { detail: string | null })[];
  return {
    job,
    questions: questions.results as unknown as TownJobDetail["questions"],
    addenda: addenda.results as unknown as TownJobDetail["addenda"],
    invites: invites.results as unknown as TownJobDetail["invites"],
    log: entries.map((entry) => ({ ...entry, detail: entry.detail ? JSON.parse(entry.detail) : {} })),
    responses: Number(count.results[0]?.count ?? 0),
  };
}

export async function loadNativeTownResults(actorId: string, job: TownJob, db: D1Binding = vpsAppDatabase()): Promise<TownResults> {
  const scope = `SELECT r.id FROM rfp_posts r WHERE r.id=?2 AND ${managed}`;
  const args = [actorId, job.id] as const;
  const closesAt = townClosesAt(job.deadline, job.buyer_key);
  const closed = isClosed(closesAt);
  const sealed = job.sealed ? await readNativeSealedState(job.id,actorId,new Date(),db) : null;
  const ready = resultsReady({ sealed: Boolean(job.sealed), opened: sealed?.opening?.status === "opened", closed, status: job.status });
  const empty = { ready: false, closesAt, closed, sealed, summary: null, picked: null, saved: null, recommendedByName: null };
  if (!ready) return empty;
  const permitted = `${scope} AND (r.sealed=0 OR ${opened})`;
  const [responses, invites, saved] = await db.batch([
    db.prepare(`SELECT i.id,i.status,i.trade_organization_id AS orgId,coalesce(o.name,'—') AS company,
        i.quote_amount AS amount,i.quote_kind AS kind,i.start_date AS startDate,i.quote_notes AS notes,
        i.message,i.created_at AS createdAt,o.profile_status AS profileStatus,o.verified,o.insurance_status AS insurance,o.wsib_status AS wsib
      FROM rfp_interests i LEFT JOIN organizations o ON o.id=i.trade_organization_id
      WHERE i.rfp_id IN (${permitted}) LIMIT 500`).bind(...args),
    db.prepare(`SELECT trade_organization_id FROM town_invites WHERE status='sent' AND rfp_id IN (${permitted})`).bind(...args),
    db.prepare(`SELECT x.rfp_id,x.recommended_interest_id,x.rationale,x.recommended_by,x.recommended_at,x.award_interest_id,
        x.award_winner_name,x.award_amount,x.award_amount_public,x.award_date,x.award_published_at,
        coalesce(nullif(trim(u.full_name),''),u.email) AS recommendedByName
      FROM town_job_results x LEFT JOIN users_profile u ON u.id=x.recommended_by WHERE x.rfp_id IN (${permitted})`).bind(...args),
  ]);
  const rows = (responses.results as unknown as SummaryResponse[]).map((row) => ({ ...row, verified: Boolean(row.verified),
    amount: row.amount == null ? null : Number(row.amount), insurance: row.insurance?.trim() || null, wsib: row.wsib?.trim() || null }));
  const invitedOrgIds = new Set((invites.results as unknown as { trade_organization_id: string | null }[])
    .flatMap((row) => row.trade_organization_id ? [row.trade_organization_id] : []));
  const savedRow = saved.results[0] as unknown as (TownResultsRow & { recommendedByName: string | null }) | undefined;
  const { recommendedByName = null, ...record } = savedRow ?? {};
  return { ...empty, ready, summary: summarize(rows, { sent: invites.results.length, invitedOrgIds }),
    picked: rows.find((r) => r.status === "picked") ?? null, recommendedByName, saved: savedRow
      ? { ...record as TownResultsRow, award_amount_public: Boolean(savedRow.award_amount_public),
        award_amount: savedRow.award_amount == null ? null : Number(savedRow.award_amount) } : null };
}

const canonical = "https://pmrfp.com";

function writeTownLog(db: D1Binding, id: string, actor: string | null, event: LogEvent, detail: Record<string, unknown>, onlyLastWrite = false) {
  return db.prepare(`INSERT INTO town_job_log(rfp_id,organization_id,buyer_key,actor_user_id,event,detail)
    SELECT r.id,r.posted_by_organization_id,r.buyer_key,?,?,? FROM rfp_posts r
    WHERE r.id=? AND ${townSource}${onlyLastWrite ? " AND changes()=1" : ""}`).bind(actor,event,JSON.stringify(detail),id);
}

type Notice = Parameters<typeof answerEmail>[1] & { kind: "answer" };
type AddendumNotice = Parameters<typeof addendumEmail>[1] & { kind: "addendum" };
type TownNotice = Omit<Notice,"base"|"buyer"|"title"|"slug"|"unsubscribeUrl"|"mailingAddress"> |
  Omit<AddendumNotice,"base"|"buyer"|"title"|"slug"|"unsubscribeUrl"|"mailingAddress">;

async function broadcastNativeTownUpdate(db: D1Binding, job: TownJob, actor: string, notice: TownNotice) {
  const emailsOn = townQaEmailsEnabled();
  const result = await db.prepare(`SELECT u.id,u.email,coalesce(p.new_rfps,'daily') AS frequency,
      coalesce(p.channel_email,1) AS email_allowed,s.email_key AS suppressed
    FROM users_profile u LEFT JOIN notification_preferences p ON p.user_id=u.id
    LEFT JOIN email_suppressions s ON s.email_key=lower(trim(u.email))
    WHERE u.status='active' AND u.id IN (
      SELECT submitted_by_user_id FROM rfp_interests WHERE rfp_id=?
      UNION SELECT asker_user_id FROM town_job_questions WHERE rfp_id=?
      UNION SELECT user_id FROM buyer_follows WHERE buyer_slug=?
      UNION SELECT submitted_by_user_id FROM _town_sealed_quotes WHERE rfp_id=? AND status='active')
    AND u.id IS NOT ? AND NOT EXISTS(SELECT 1 FROM organization_members m WHERE m.user_id=u.id AND m.organization_id=?)
    AND ${customerAppAuthority}`).bind(job.id,job.id,job.buyer_key,job.id,job.posted_by_user_id,job.posted_by_organization_id)
    .all<{ id:string; email:string | null; frequency:string; email_allowed:number; suppressed:string | null }>();
  const answer = notice.kind === "answer";
  await writeNativeTownNotifications(result.results.map((u) => ({
    user_id:u.id,type:answer ? "town_answer" : "town_addendum", title:answer ? "A question was answered" : `Addendum ${notice.number} issued`,
    message:job.title,link_url:`/rfps/${job.slug}#${answer ? "questions" : "addenda"}`,
  })),db);
  const email = result.results.filter((u) => u.email && u.email_allowed && u.frequency!=="off" && !u.suppressed);
  let emailed = 0;
  if (emailsOn && email.length) {
    const langs = await recipientLangs(db,email.map((u) => u.id));
    for (const u of email) {
      const lang = langs.get(u.id) ?? "en";
      const unsub = unsubscribeUrl(canonical,u.id);
      if (!unsub) continue;
      const common = { base:canonical,buyer:job.buyer_name,title:job.title,slug:job.slug,unsubscribeUrl:unsub,
        mailingAddress:process.env.BUSINESS_MAILING_ADDRESS?.trim() || null };
      try {
        await sendTownJobEmail(u.email!,answer ? answerEmail(lang,{...common,...notice}) : addendumEmail(lang,{...common,...notice}),
          lang,answer ? "town-answer" : "town-addendum",unsub,{smtpOnly:true});
        emailed++;
      } catch { console.error("[town-jobs] update email delivery failed"); }
    }
  }
  const broadcast = { notified:result.results.length, emailed, wouldEmail:email.length, emailsOn };
  await writeTownLog(db,job.id,actor,"broadcast",{ kind:notice.kind,notified:broadcast.notified,emailed,
    would_email:broadcast.wouldEmail,emails_on:emailsOn }).run().catch(() => undefined);
  return broadcast;
}

export async function loadNativePublicTownJob(id: string, db: D1Binding = vpsAppDatabase()) {
  const row = await db.prepare(`SELECT ${townColumns} FROM rfp_posts r WHERE r.id=? AND ${townSource} AND r.status='published'`)
    .bind(id).first<DbTownJob>();
  return row ? asJob(row) : null;
}

export async function askNativeTownQuestion(job: TownJob, actor: string, org: string | null, raw: unknown, lang: EmailLang, db: D1Binding = vpsAppDatabase()) {
  const today = todayToronto();
  const refusal = askDecision({ signedIn:true,job,userId:actor,organizationId:org,today });
  if (refusal) return { ok:false,error:refusal } as const;
  const question = cleanQuestion(raw);
  if (!question) return { ok:false,error:"invalid" } as const;
  const id = randomUUID();
  const [result] = await db.batch([
    db.prepare(`INSERT INTO town_job_questions(id,rfp_id,asker_user_id,asker_organization_id,question,lang)
      SELECT ?,r.id,?,?,?,? FROM rfp_posts r WHERE r.id=? AND ${townSource} AND r.status='published'
        AND coalesce(r.post_kind,'')<>'tender_mirror' AND (r.deadline IS NULL OR r.deadline>=?)
        AND (r.question_deadline IS NULL OR r.question_deadline>=?) AND r.posted_by_user_id IS NOT ?
        AND NOT EXISTS(SELECT 1 FROM organization_members m WHERE m.organization_id=r.posted_by_organization_id AND m.user_id=?)
        AND EXISTS(SELECT 1 FROM users_profile u WHERE u.id=? AND u.status='active') RETURNING id`)
      .bind(id,actor,org,question,lang,job.id,today,today,actor,actor,actor),
    writeTownLog(db,job.id,actor,"question_asked",{question_id:id},true),
  ]);
  if (!result.results.length) return { ok:false,error:"failed" } as const;
  if (job.posted_by_user_id) {
    await writeNativeTownNotifications([{ user_id:job.posted_by_user_id,type:"town_question",title:"New question on your job",
      message:job.title,link_url:`/buyer-dashboard/jobs/${job.id}#questions` }],db).catch(() => undefined);
    if (townQaEmailsEnabled()) {
      try {
        const person = await db.prepare(`SELECT email FROM users_profile WHERE id=? AND status='active'
          AND NOT EXISTS(SELECT 1 FROM email_suppressions s WHERE s.email_key=lower(trim(users_profile.email)))`)
          .bind(job.posted_by_user_id).first<{ email:string }>();
        if (person?.email) {
          const targetLang = (await recipientLangs(db,[job.posted_by_user_id])).get(job.posted_by_user_id) ?? lang;
          await sendTownJobEmail(person.email,questionWaitingEmail(targetLang,{base:canonical,title:job.title,rfpId:job.id}),
            targetLang,"town-question",null,{smtpOnly:true});
        }
      } catch { console.error("[town-jobs] poster notification delivery failed"); }
    }
  }
  return { ok:true,id } as const;
}

export async function answerNativeTownQuestion(job: TownJob, actor: string, questionId: string, raw: unknown, publicQuestion: unknown, db: D1Binding = vpsAppDatabase()) {
  const answer = cleanAnswer(raw);
  const amended = typeof publicQuestion === "string" && publicQuestion.trim() ? cleanQuestion(publicQuestion) : undefined;
  if (!answer || amended === null) return { ok:false,error:"invalid" } as const;
  const [result] = await db.batch([
    db.prepare(`UPDATE town_job_questions SET answer=?3,public_question=coalesce(?4,question),status='answered',answered_at=?5,answered_by=?1
      WHERE id=?6 AND status='open' AND rfp_id IN (SELECT r.id FROM rfp_posts r WHERE r.id=?2 AND ${managed}) RETURNING public_question`)
      .bind(actor,job.id,answer,amended ?? null,new Date().toISOString(),questionId),
    writeTownLog(db,job.id,actor,"question_answered",{question_id:questionId},true),
  ]);
  const row = result.results[0];
  if (!row) return { ok:false,error:"answered" } as const;
  const broadcast = await broadcastNativeTownUpdate(db,job,actor,{kind:"answer",question:String(row.public_question),answer})
    .catch(() => ({notified:0,emailed:0,wouldEmail:0,emailsOn:townQaEmailsEnabled()}));
  return { ok:true,broadcast } as const;
}

export async function setNativeTownQuestionDeadline(job: TownJob, actor: string, raw: unknown, db: D1Binding = vpsAppDatabase()) {
  const checked = checkQuestionDeadline(raw,job.deadline);
  if (!checked.ok) return { ok:false,error:"invalid" } as const;
  const [result] = await db.batch([
    db.prepare(`UPDATE rfp_posts SET question_deadline=?3,updated_at=?4 WHERE id IN (
      SELECT r.id FROM rfp_posts r WHERE r.id=?2 AND ${managed} AND r.deadline IS ?5) RETURNING id`)
      .bind(actor,job.id,checked.value,new Date().toISOString(),job.deadline),
    writeTownLog(db,job.id,actor,"question_deadline_set",{value:checked.value},true),
  ]);
  return result.results.length ? {ok:true} as const : {ok:false,error:"failed"} as const;
}

export async function issueNativeTownAddendum(job: TownJob, actor: string, input: {body:unknown;officialUrl?:unknown;newDeadline?:unknown},
  db: D1Binding = vpsAppDatabase()) {
  const planned = planAddendum(input,job);
  if (!planned.ok) return planned;
  const plan = planned.plan;
  if (plan.newDeadline && job.sealed && isClosed(townClosesAt(job.deadline,job.buyer_key))) return {ok:false,error:"closed"} as const;
  const key = randomUUID();
  const now = new Date().toISOString();
  const insert = db.prepare(`INSERT INTO town_job_addenda(id,rfp_id,number,body,official_url,old_deadline,new_deadline,posted_by,created_at)
    SELECT ?3,r.id,(SELECT coalesce(max(a.number),0)+1 FROM town_job_addenda a WHERE a.rfp_id=r.id),
      ?4,?5,?6,?7,?1,?8 FROM rfp_posts r WHERE r.id=?2 AND ${managed} AND r.deadline IS ?9 AND r.question_deadline IS ?10
    RETURNING number`).bind(actor,job.id,key,plan.body,plan.officialUrl,plan.oldDeadline,plan.newDeadline,now,job.deadline,job.question_deadline);
  const stamped = db.prepare(`INSERT INTO town_job_log(rfp_id,organization_id,buyer_key,actor_user_id,event,detail)
    SELECT r.id,r.posted_by_organization_id,r.buyer_key,?,'addendum_issued',
      json_object('number',a.number,'deadline_changed',a.new_deadline IS NOT NULL)
      FROM rfp_posts r JOIN town_job_addenda a ON a.rfp_id=r.id WHERE a.id=? AND ${townSource}`).bind(actor,key);
  const statements = [insert,stamped];
  if (plan.newDeadline) {
    statements.push(
      db.prepare(`UPDATE rfp_posts SET deadline=?,question_deadline=?,updated_at=?
        WHERE id IN(SELECT rfp_id FROM town_job_addenda WHERE id=?)`).bind(plan.newDeadline,plan.questionDeadline,now,key),
      writeTownLog(db,job.id,actor,"deadline_changed",{from:plan.oldDeadline,to:plan.newDeadline},true),
    );
  }
  const [result] = await db.batch(statements);
  const item = result.results[0];
  if (!item) return {ok:false,error:"failed"} as const;
  const number = Number(item.number);
  const broadcast = await broadcastNativeTownUpdate(db,job,actor,{kind:"addendum",number,...plan})
    .catch(() => ({notified:0,emailed:0,wouldEmail:0,emailsOn:townQaEmailsEnabled()}));
  return {ok:true,number,broadcast} as const;
}

export async function unpublishNativeTownJob(id: string, actor: string, reason: string | null, db: D1Binding = vpsAppDatabase()) {
  const [result] = await db.batch([
    db.prepare(`UPDATE rfp_posts SET status='pending_review',updated_at=? WHERE id IN(
      SELECT r.id FROM rfp_posts r JOIN users_profile a ON a.id=? WHERE r.id=? AND ${townSource}
        AND r.status='published' AND a.status='active' AND a.primary_role IN ('admin','super_admin'))
      RETURNING posted_by_user_id,title`).bind(new Date().toISOString(),actor,id),
    writeTownLog(db,id,actor,"unpublished",{reason},true),
  ]);
  const row = result.results[0] as { posted_by_user_id:string | null; title:string } | undefined;
  if (row?.posted_by_user_id) await writeNativeTownNotifications([{user_id:row.posted_by_user_id,type:"town_unpublished",
    title:"Your job is back in review",message:reason || row.title,link_url:`/buyer-dashboard/jobs/${id}`}],db).catch(() => undefined);
  return {ok:Boolean(row)};
}

type PastInvite = { trade_organization_id: string | null; email_key: string };
async function nativeInvites(db: D1Binding, job: TownJob, actor: string, now: Date) {
  const scope = `SELECT r.id FROM rfp_posts r WHERE r.id=?2 AND ${managed}`;
  const args = [actor,job.id] as const;
  const [sent, existing] = await db.batch([
    db.prepare(`SELECT count(*) AS n FROM town_invites i WHERE i.organization_id IN (
      SELECT posted_by_organization_id FROM rfp_posts r WHERE r.id IN (${scope}))
      AND i.status='sent' AND julianday(i.created_at)>=julianday(?3)`).bind(...args,dayStartToronto(now)),
    db.prepare(`SELECT trade_organization_id,email_key FROM town_invites WHERE rfp_id IN (${scope})`).bind(...args),
  ]);
  const rows = existing.results as unknown as PastInvite[];
  return { sentToday:Number(sent.results[0]?.n ?? 0), emails:new Set(rows.map(i=>i.email_key)),
    orgs:new Set(rows.flatMap(i=>i.trade_organization_id ? [i.trade_organization_id] : [])) };
}

export async function previewNativeTradeInvites(job: TownJob, actor: string, now = new Date(), db: D1Binding = vpsAppDatabase()): Promise<InvitePreview> {
  const enabled = townInvitesEnabled();
  const empty = { matching:0,plan:{send:[],skipped:{already:0,unsubscribed:0,noEmail:0},overLimit:[]},sentToday:0,budget:0,enabled };
  if (job.status!=="published" || !job.posted_by_organization_id || !await loadNativeManagedTownJob(actor,job.id,db)) return empty;
  const full = await loadJob(db,job.id);
  if (!full) return empty;
  const [audience, before] = await Promise.all([loadAlertAudience(db,full,{forInvites:true}),nativeInvites(db,job,actor,now)]);
  const people = audience.people;
  const candidates = audience.audience.orgs.map((org) => ({orgId:org.id,orgName:org.name,city:org.city,
    people:(people?.usersByOrg.get(org.id) ?? []).map((userId) => ({userId,email:people?.users.get(userId)?.email ?? null,status:people?.users.get(userId)?.status ?? null}))}));
  const emails = candidates.flatMap((c) => c.people.flatMap((person) => person.email ? [person.email.trim().toLowerCase()] : []));
  const suppressed = await db.prepare("SELECT email_key FROM email_suppressions WHERE email_key IN (SELECT value FROM json_each(?))")
    .bind(JSON.stringify(emails)).all<{email_key:string}>();
  const budget = inviteBudget(before.sentToday);
  return { matching:candidates.length,sentToday:before.sentToday,budget,enabled,
    plan:planTradeInvites({candidates,alreadyOrgIds:before.orgs,alreadyEmails:before.emails, optedOutUserIds:people?.optedOut ?? new Set(),
      suppressedEmails:new Set(suppressed.results.map(r=>r.email_key)),budget}) };
}

const inviteAddress = () => process.env.BUSINESS_MAILING_ADDRESS?.trim() || null;
async function claimNativeInvite(db: D1Binding, job: TownJob, actor: string, person: {
  email: string; userId: string | null; orgId: string | null; lang: EmailLang; kind: "trade" | "email";
}, now: Date) {
  const id = randomUUID();
  const saved = await db.prepare(`INSERT INTO town_invites(id,rfp_id,organization_id,buyer_key,kind,trade_organization_id,user_id,email_key,lang,sent_by,created_at)
    SELECT ?3,r.id,r.posted_by_organization_id,r.buyer_key,?4,?5,?6,?7,?8,?1,?9
      FROM rfp_posts r WHERE r.id=?2 AND ${managed} AND r.status='published' AND r.posted_by_organization_id IS NOT NULL
        AND NOT EXISTS(SELECT 1 FROM email_suppressions WHERE email_key=?7)
        AND NOT EXISTS(SELECT 1 FROM users_profile u LEFT JOIN notification_preferences p ON p.user_id=u.id
          WHERE lower(trim(u.email))=?7 AND (u.status<>'active' OR p.channel_email=0 OR p.new_rfps='off'))
        AND (?5 IS NULL OR EXISTS (SELECT 1 FROM organization_members m JOIN organizations o ON o.id=m.organization_id
          WHERE m.user_id=?6 AND m.organization_id=?5 AND o.status='active' AND o.profile_status='approved' AND o.is_demo=0))
        AND NOT EXISTS(SELECT 1 FROM town_invites i WHERE i.rfp_id=r.id AND (i.email_key=?7 OR (?5 IS NOT NULL AND i.trade_organization_id=?5)))
        AND (SELECT count(*) FROM town_invites i WHERE i.organization_id=r.posted_by_organization_id
          AND i.status='sent' AND julianday(i.created_at)>=julianday(?10))<?11
      RETURNING id`).bind(actor,job.id,id,person.kind,person.orgId,person.userId,person.email,person.lang,now.toISOString(),
        dayStartToronto(now),INVITE_DAILY_MAX).first<{id:string}>();
  return saved?.id ?? null;
}

export async function sendNativeTradeInvites(job: TownJob, actor: string, now = new Date(), db: D1Binding = vpsAppDatabase()): Promise<InviteRunResult> {
  const preview = await previewNativeTradeInvites(job,actor,now,db);
  const wouldSend = preview.plan.send.length;
  const overLimit = preview.plan.overLimit.length;
  const counts = {wouldSend,overLimit,sent:0};
  if (!job.posted_by_organization_id) return {state:"blocked",reason:"no_town",...counts};
  if (!preview.enabled) {
    await writeTownLog(db,job.id,actor,"invites_off",{kind:"trade",would_send:wouldSend}).run();
    return {state:"off",...counts};
  }
  const address = inviteAddress();
  if (!address) return {state:"blocked",reason:"mailing_address",...counts};
  if (!unsubscribeUrl(canonical,"check")) return {state:"blocked",reason:"unsubscribe",...counts};
  const langs = await recipientLangs(db,preview.plan.send.map(p=>p.userId));
  let sent = 0;
  for (const p of preview.plan.send) {
    const lang = langs.get(p.userId) ?? "en";
    const row = await claimNativeInvite(db,job,actor,{kind:"trade",orgId:p.orgId,userId:p.userId,email:p.email,lang},now);
    if (!row) continue;
    const unsub = unsubscribeUrl(canonical,p.userId)!;
    try {
      await sendTownJobEmail(p.email,tradeInviteEmail(lang,{base:canonical,buyer:job.buyer_name,title:job.title,slug:job.slug,
        deadline:job.deadline,summary:job.summary,mirror:job.post_kind==="tender_mirror",portal:job.official_portal,company:p.orgName,
        unsubscribeUrl:unsub,mailingAddress:address}),lang,"town-invite",unsub,{smtpOnly:true});
      sent++;
    } catch { console.error("[town-jobs] invitation delivery failed"); }
    await writeNativeTownNotifications([{user_id:p.userId,type:"town_invite",title:`${job.buyer_name ?? "A town"} invited you to quote`.slice(0,200),
      message:job.title,link_url:`/rfps/${job.slug}`}],db).catch(() => undefined);
  }
  await writeTownLog(db,job.id,actor,"invites_sent",{kind:"trade",sent,over_limit:overLimit,skipped:preview.plan.skipped}).run().catch(() => undefined);
  return {state:"sent",wouldSend,sent,overLimit};
}

export async function sendNativeEmailInvite(job: TownJob, actor: string, raw: unknown, lang: EmailLang,
  now = new Date(), db: D1Binding = vpsAppDatabase()): Promise<EmailInviteResult> {
  const email = cleanInviteEmail(raw);
  if (!email || !job.posted_by_organization_id) return {state:"refused",reason:"email"};
  if (!await loadNativeManagedTownJob(actor,job.id,db) || job.status!=="published") return {state:"refused",reason:"blocked"};
  const [invited, state] = await Promise.all([nativeInvites(db,job,actor,now),
    db.prepare(`SELECT (SELECT id FROM users_profile WHERE lower(trim(email))=? LIMIT 1) AS user_id,
      EXISTS(SELECT 1 FROM users_profile u LEFT JOIN notification_preferences p ON p.user_id=u.id WHERE lower(trim(u.email))=?
        AND (u.status<>'active' OR p.channel_email=0 OR p.new_rfps='off')) AS opted_out,
      EXISTS(SELECT 1 FROM email_suppressions WHERE email_key=?) AS suppressed`).bind(email,email,email)
      .first<{user_id:string|null;opted_out:number;suppressed:number}>()]);
  const refusal = emailInviteDecision({email,alreadyEmails:invited.emails,suppressed:Boolean(state?.suppressed),optedOutUser:Boolean(state?.opted_out),
    budget:inviteBudget(invited.sentToday)});
  if (refusal) return {state:"refused",reason:refusal};
  if (!townInvitesEnabled()) {
    await writeTownLog(db,job.id,actor,"invites_off",{kind:"email",would_send:1}).run();
    return {state:"off"};
  }
  const address = inviteAddress();
  if (!address || !unsubscribeUrl(canonical,"check")) return {state:"refused",reason:"blocked"};
  const userId = state?.user_id ?? null;
  const id = await claimNativeInvite(db,job,actor,{kind:"email",orgId:null,userId,email,lang},now);
  if (!id) return {state:"refused",reason:"blocked"};
  const unsub = userId ? unsubscribeUrl(canonical,userId)! : inviteUnsubscribeUrl(canonical,id)!;
  try {
    await sendTownJobEmail(email,emailInviteEmail(lang,{base:canonical,buyer:job.buyer_name,title:job.title,slug:job.slug,deadline:job.deadline,
      summary:job.summary,mirror:job.post_kind==="tender_mirror",portal:job.official_portal,unsubscribeUrl:unsub,mailingAddress:address}),
      lang,"town-invite-email",unsub,{smtpOnly:true});
  } catch {
    // Keep the claim if the mail provider accepted it before the request failed.
    return {state:"refused",reason:"blocked"};
  }
  await writeTownLog(db,job.id,actor,"invite_email_sent",{invite_id:id}).run().catch(() => undefined);
  return {state:"sent"};
}

export async function saveNativeTownRecommendation(job: TownJob, actor: string, rawId: unknown, rawRationale: unknown,
  db: D1Binding = vpsAppDatabase()): Promise<{ok:true}|{ok:false;error:RecommendError}> {
  const current = await loadNativeTownResults(actor,job,db);
  if (!current.ready || !current.summary) return {ok:false,error:"not_ready"};
  const interest = current.summary.rows.find((row) => row.id===rawId && row.status!=="declined");
  if (!interest) return {ok:false,error:"invalid"};
  const rationale = cleanRationale(rawRationale);
  if (!rationale) return {ok:false,error:"rationale"};
  const now = new Date().toISOString();
  const [result] = await db.batch([
    db.prepare(`INSERT INTO town_job_results(rfp_id,organization_id,recommended_interest_id,rationale,recommended_by,recommended_at,updated_at)
      SELECT r.id,r.posted_by_organization_id,i.id,?4,?1,?5,?5 FROM rfp_posts r JOIN rfp_interests i ON i.rfp_id=r.id
      WHERE r.id=?2 AND ${managed} AND i.id=?3 AND i.status<>'declined' AND r.deadline IS ?6 AND r.status=?
        AND (r.sealed=0 OR ${opened})
      ON CONFLICT(rfp_id) DO UPDATE SET recommended_interest_id=excluded.recommended_interest_id,rationale=excluded.rationale,
        recommended_by=excluded.recommended_by,recommended_at=excluded.recommended_at,updated_at=excluded.updated_at
        WHERE award_published_at IS NULL RETURNING rfp_id`).bind(actor,job.id,interest.id,rationale,now,job.deadline,job.status),
    writeTownLog(db,job.id,actor,"recommendation_saved",{response:interest.id},true),
  ]);
  return result.results.length ? {ok:true} : {ok:false,error:"failed"};
}

/** D1's imported TEXT column applies a lexical range check. Preserve its numeric value and public API. */
function storedTownMoney(amount: number | null) {
  if (amount===null) return null;
  if (amount===1e9) return "1000000000";
  return amount.toFixed(2).padStart(13,"0");
}

export async function publishNativeTownAward(job: TownJob, actor: string, input: {
  winnerName: unknown; amount: unknown; amountPublic: unknown; awardDate: unknown;
}, db: D1Binding = vpsAppDatabase()): Promise<{ok:true;history:boolean}|{ok:false;error:PublishError}> {
  const current = await loadNativeTownResults(actor,job,db);
  if (!current.ready || !current.summary || !current.picked) return {ok:false,error:"not_picked"};
  const today = todayToronto();
  const planned = planAward(input,today);
  if (!planned.ok) return planned;
  const a = planned.award;
  const now = new Date().toISOString();
  const [result] = await db.batch([
    db.prepare(`INSERT INTO town_job_results(rfp_id,organization_id,award_interest_id,award_winner_name,award_amount,
      award_amount_public,award_date,award_published_at,award_published_by,updated_at)
      SELECT r.id,r.posted_by_organization_id,i.id,?4,?5,?6,?7,?8,?1,?8
        FROM rfp_posts r JOIN rfp_interests i ON i.rfp_id=r.id WHERE r.id=?2 AND ${managed}
        AND i.id=?3 AND i.status='picked' AND r.deadline IS ?9 AND r.status=?10 AND (r.sealed=0 OR ${opened})
      ON CONFLICT(rfp_id) DO UPDATE SET award_interest_id=excluded.award_interest_id,award_winner_name=excluded.award_winner_name,
        award_amount=excluded.award_amount,award_amount_public=excluded.award_amount_public,award_date=excluded.award_date,
        award_published_at=excluded.award_published_at,award_published_by=excluded.award_published_by,updated_at=excluded.updated_at
      RETURNING rfp_id`).bind(actor,job.id,current.picked.id,a.winnerName,storedTownMoney(a.amount),Number(a.amountPublic),a.awardDate,now,job.deadline,job.status),
    db.prepare(`UPDATE rfp_posts SET status='awarded',closed_at=?,updated_at=? WHERE id=? AND changes()=1
      AND status IN ('published','closed','expired')`).bind(now,now,job.id),
  ]);
  if (!result.results.length) return {ok:false,error:"failed"};
  const [place,cats] = await Promise.all([
    db.prepare("SELECT province,city FROM rfp_posts WHERE id=?").bind(job.id).first<{province:string|null;city:string|null}>(),
    db.prepare("SELECT t.slug FROM rfp_categories c JOIN trade_categories t ON t.id=c.category_id WHERE c.rfp_id=?")
      .bind(job.id).all<{slug:string}>(),
  ]);
  const row = awardHistoryRow({rfpId:job.id,slug:job.slug,title:job.title,buyerName:job.buyer_name,
    province:place?.province ?? null,city:place?.city ?? null,winnerName:a.winnerName,amount:a.amount,amountPublic:a.amountPublic,
    awardDate:a.awardDate,startDate:current.picked.startDate,quotes:current.summary.received,tradeSlugs:cats.results.map((c)=>c.slug),today});
  const saved = row ? await applyHistory(db,[row],[]).catch(() => null) : null;
  const history = Boolean(saved?.upserted);
  await writeTownLog(db,job.id,actor,"award_published",{winner:a.winnerName,amount_public:a.amountPublic,has_amount:a.amount!==null,history}).run()
    .catch(() => undefined);
  return {ok:true,history};
}
