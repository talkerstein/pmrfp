import "server-only";
import { createHash, randomUUID } from "node:crypto";
import type { D1Binding } from "@/lib/d1/contracts";
import { vpsAppDatabase } from "@/lib/d1/http-binding";
import { customerAppAuthority } from "../../../workers/d1-api/customer-signup";
import { cleanEmail } from "@/lib/vendor-certs/rules";
import type { TownJob } from "./server";
import { cleanWitnessName, isClosed, townClosesAt, townTimeZone, type OpeningState, type OwnSealedQuote, type SealedError, type SealedState } from "./sealed";
import type { BreakGlassQuote, SealedQuoteInput } from "./sealed-server";

const sealedPost = `r.sealed=1 AND r.is_demo=0 AND r.source_type='public_buyer_direct' AND ${customerAppAuthority}`;
const activeTownMembers = `SELECT u.id,u.email,u.full_name,u.status
  FROM organization_members m JOIN users_profile u ON u.id=m.user_id
  WHERE m.organization_id=r.posted_by_organization_id AND u.status='active'`;
const townMember = `EXISTS(SELECT 1 FROM (${activeTownMembers}) WHERE id=?)`;
const eligibility = `SELECT o.id FROM organizations o JOIN organization_members m ON m.organization_id=o.id
  JOIN users_profile u ON u.id=m.user_id WHERE o.id=? AND u.id=? AND u.status='active'
  AND o.status='active' AND o.profile_status='approved' AND o.organization_type IN ('trade_company','supplier')`;

const hash = (token: string) => createHash("sha256").update(token, "utf8").digest("hex");
const tokenFormat = /^[A-Za-z0-9_-]{32}$/;
type Reply<T extends object> = ({ ok: true } & T) | { ok: false; error: SealedError };
const refuse = (error: SealedError) => ({ ok: false as const, error });

export async function loadNativeSealedPost(id: string, db: D1Binding = vpsAppDatabase()) {
  const job = await db.prepare(`SELECT r.id,r.title,r.slug,r.summary,r.status,r.source_type,r.post_kind,r.buyer_key,
    r.buyer_name,r.official_url,r.official_portal,r.deadline,r.question_deadline,r.posted_by_user_id,r.posted_by_organization_id,
    r.poster_lang FROM rfp_posts r WHERE r.id=? AND ${sealedPost}`).bind(id).first<TownJob>();
  return job ? { ...job, sealed: true } : null;
}

export async function readNativeOwnQuote(id: string, actor: string, org: string, db: D1Binding = vpsAppDatabase()): Promise<OwnSealedQuote | null> {
  const row = await db.prepare(`SELECT q.id,q.status,q.version,q.message,q.relevant_experience,q.availability,q.quote_amount,
    q.quote_kind,q.quote_notes,q.start_date,q.case_study_ids,q.lang,q.created_at,q.updated_at,q.withdrawn_at,
    q.opened_at,q.interest_id,r.deadline,r.buyer_key
    FROM _town_sealed_quotes q JOIN rfp_posts r ON r.id=q.rfp_id WHERE r.id=? AND q.trade_organization_id=?
      AND ${sealedPost} AND EXISTS(${eligibility})`).bind(id,org,org,actor)
    .first<Omit<OwnSealedQuote,"closes_at"|"case_study_ids"> & { deadline: string | null; buyer_key: string | null; case_study_ids: string }>();
  if (!row) return null;
  const { deadline, buyer_key, case_study_ids, ...quote } = row;
  return { ...quote, case_study_ids: JSON.parse(case_study_ids), closes_at: townClosesAt(deadline,buyer_key) };
}

export async function submitNativeSealedQuote(job: TownJob, actor: string, org: string, q: SealedQuoteInput,
  now = new Date(), db: D1Binding = vpsAppDatabase()): Promise<Reply<{ id: string; action: "received" | "replaced"; version: number; closes_at: string }>> {
  const closes = townClosesAt(job.deadline, job.buyer_key);
  if (!closes || job.status !== "published") return refuse("not_open");
  const stamp = now.toISOString();
  if (isClosed(closes, now)) {
    await db.prepare(`INSERT INTO town_job_log(rfp_id,organization_id,buyer_key,event,detail,created_at)
      SELECT r.id,r.posted_by_organization_id,r.buyer_key,'sealed_quote_late',json_object('closes_at',?),?
      FROM rfp_posts r WHERE r.id=? AND ${sealedPost} AND EXISTS(${eligibility})`)
      .bind(closes,stamp,job.id,org,actor).run();
    return refuse("late");
  }
  const message = q.message.trim();
  if (!message || message.length > 2000) return refuse("invalid");
  const id = randomUUID();
  const [before, inserted] = await db.batch([
    db.prepare(`SELECT q.status FROM _town_sealed_quotes q JOIN rfp_posts r ON r.id=q.rfp_id
      WHERE r.id=? AND q.trade_organization_id=? AND EXISTS(${eligibility}) AND ${sealedPost}`)
      .bind(job.id,org,org,actor),
    db.prepare(`INSERT INTO _town_sealed_quotes(id,rfp_id,trade_organization_id,submitted_by_user_id,message,relevant_experience,
        availability,quote_amount,quote_kind,quote_notes,start_date,case_study_ids,lang,created_at,updated_at)
      SELECT ?,r.id,?,?,?,?,?,?,?,?,?,(SELECT coalesce(json_group_array(c.id),'[]') FROM json_each(?) j
        JOIN case_studies c ON c.id=j.value WHERE c.organization_id=? AND c.status='published'),?,?,?
      FROM rfp_posts r WHERE r.id=? AND ${sealedPost} AND r.status='published'
        AND r.deadline IS ? AND r.buyer_key IS ?
        AND (r.posted_by_organization_id IS NULL OR r.posted_by_organization_id<>?)
        AND (r.posted_by_user_id IS NULL OR r.posted_by_user_id<>?)
        AND EXISTS(${eligibility})
        AND NOT EXISTS(SELECT 1 FROM _town_sealed_openings x WHERE x.rfp_id=r.id AND x.status='opened')
      ON CONFLICT(rfp_id,trade_organization_id) DO UPDATE SET
        submitted_by_user_id=excluded.submitted_by_user_id,status='active',message=excluded.message,
        relevant_experience=excluded.relevant_experience,availability=excluded.availability,
        quote_amount=excluded.quote_amount,quote_kind=excluded.quote_kind,quote_notes=excluded.quote_notes,
        start_date=excluded.start_date,case_study_ids=excluded.case_study_ids,lang=excluded.lang,
        version=min(version+1,1000),withdrawn_at=NULL,updated_at=excluded.updated_at
        WHERE _town_sealed_quotes.status<>'opened' RETURNING id,version`)
      .bind(id,org,actor,message,q.relevantExperience?.trim() || null,q.availability?.trim() || null,q.amount,
        q.amount == null ? null : q.kind,q.notes?.trim() || null,q.startDate,JSON.stringify(q.caseStudyIds ?? []),org,q.lang,stamp,stamp,
        job.id,job.deadline,job.buyer_key,org,actor,org,actor),
  ]);
  const saved = inserted.results[0] as { id: string; version: number } | undefined;
  if (!saved) return refuse("not_open");
  return { ok: true, ...saved, action: before.results[0]?.status === "active" ? "replaced" : "received", closes_at: closes };
}

export async function withdrawNativeSealedQuote(job: TownJob, actor: string, org: string,
  now = new Date(), db: D1Binding = vpsAppDatabase()): Promise<Reply<{ id: string }>> {
  const closes = townClosesAt(job.deadline,job.buyer_key);
  if (!closes || isClosed(closes, now)) return refuse("late");
  const stamp = now.toISOString();
  const row = await db.prepare(`UPDATE _town_sealed_quotes SET status='withdrawn',message=NULL,relevant_experience=NULL,
    availability=NULL,quote_amount=NULL,quote_kind=NULL,quote_notes=NULL,start_date=NULL,case_study_ids='[]',withdrawn_at=?,updated_at=?
    WHERE rfp_id=? AND trade_organization_id=? AND status='active' AND EXISTS(${eligibility})
      AND EXISTS(SELECT 1 FROM rfp_posts r WHERE r.id=_town_sealed_quotes.rfp_id AND ${sealedPost}
        AND r.deadline IS ? AND r.buyer_key IS ?) RETURNING id`).bind(stamp,stamp,job.id,org,org,actor,job.deadline,job.buyer_key).first<{ id: string }>();
  return row ? { ok: true, ...row } : refuse("not_found");
}

export async function readNativeSealedState(id: string, actor: string, now = new Date(), db: D1Binding = vpsAppDatabase()): Promise<SealedState | null> {
  const row = await db.prepare(`SELECT r.deadline,r.buyer_key,
    (SELECT count(*) FROM _town_sealed_quotes q WHERE q.rfp_id=r.id AND q.status IN ('active','opened')) AS received,
    (SELECT count(*) FROM _town_sealed_quotes q WHERE q.rfp_id=r.id AND q.status='withdrawn') AS withdrawn,
    (SELECT count(*) FROM (${activeTownMembers})) AS members,
    CASE WHEN o.rfp_id IS NOT NULL THEN json_object(
      'status',o.status,'attempt',o.attempt,'requested_by',o.requested_by,
      'requested_by_name',coalesce(nullif(trim(p.full_name),''),p.email),'requested_at',o.requested_at,'expires_at',o.expires_at,
      'witness_name',o.witness_name,'witness_email',o.witness_email,'confirmed_by',o.confirmed_by,
      'confirmed_by_name',coalesce(nullif(trim(c.full_name),''),c.email),'confirmed_method',o.confirmed_method,
      'witness_confirmed_name',o.witness_confirmed_name,'opened_at',o.opened_at) END AS opening
    FROM rfp_posts r LEFT JOIN _town_sealed_openings o ON o.rfp_id=r.id
    LEFT JOIN users_profile p ON p.id=o.requested_by LEFT JOIN users_profile c ON c.id=o.confirmed_by
    WHERE r.id=? AND ${sealedPost} AND EXISTS(SELECT 1 FROM users_profile u WHERE u.id=? AND u.status='active'
      AND (u.primary_role IN ('admin','super_admin') OR r.posted_by_user_id=u.id
        OR EXISTS(SELECT 1 FROM organization_members m WHERE m.user_id=u.id AND m.organization_id=r.posted_by_organization_id)))`)
    .bind(id,actor).first<{ deadline: string | null; buyer_key: string | null; received: number; withdrawn: number; members: number; opening: string | null }>();
  if (!row) return null;
  const opening = row.opening ? JSON.parse(row.opening) as OpeningState : null;
  if (opening?.status === "requested" && Date.parse(opening.expires_at) < now.getTime()) opening.status="expired";
  const closes = townClosesAt(row.deadline,row.buyer_key);
  return { sealed: true, closes_at: closes, time_zone:townTimeZone(row.buyer_key), closed:isClosed(closes,now),
    received:row.received, withdrawn:row.withdrawn, members:row.members, opening };
}

export async function requestNativeSealedOpening(job: TownJob, actor: string, witness: { name: unknown; email: unknown; hash: string | null },
  now = new Date(), db: D1Binding = vpsAppDatabase()): Promise<Reply<{ expires_at: string; witness: boolean; members: number }>> {
  const closes = townClosesAt(job.deadline,job.buyer_key);
  if (!closes || !isClosed(closes, now)) return refuse("not_closed");
  const context = await db.prepare(`SELECT (SELECT count(*) FROM (${activeTownMembers})) AS members,
    (SELECT lower(email) FROM users_profile WHERE id=?) AS email,
    o.status,o.expires_at FROM rfp_posts r LEFT JOIN _town_sealed_openings o ON o.rfp_id=r.id
    WHERE r.id=? AND ${sealedPost} AND ${townMember}`).bind(actor,job.id,actor)
    .first<{ members: number; email: string | null; status: string | null; expires_at: string | null }>();
  if (!context) return refuse("not_member");
  if (context.status === "opened") return refuse("already_open");
  if (context.status === "requested" && context.expires_at && Date.parse(context.expires_at)>=now.getTime()) return refuse("pending");
  const useWitness = Boolean(witness.hash);
  const name = useWitness ? cleanWitnessName(witness.name) : null;
  const email = useWitness && typeof witness.email === "string" ? cleanEmail(witness.email) : null;
  if (useWitness && context.members>1) return refuse("use_colleague");
  if (!useWitness && context.members<2) return refuse("needs_witness");
  if (useWitness && !name) return refuse("witness_name");
  if (useWitness && !email) return refuse("witness_email");
  if (email && context.email===email) return refuse("witness_self");

  const stamp = now.toISOString();
  const expires = new Date(now.getTime()+7*86_400_000).toISOString();
  const created = await db.prepare(`INSERT INTO _town_sealed_openings(rfp_id,status,requested_by,requested_at,expires_at,
    witness_name,witness_email,witness_token_hash,updated_at)
    SELECT r.id,'requested',?,?,?,?,?,?,? FROM rfp_posts r WHERE r.id=? AND ${sealedPost} AND ${townMember}
      AND r.status IN ('published','closed','expired') AND r.deadline IS ? AND r.buyer_key IS ?
      AND ((? IS NOT NULL AND (SELECT count(*) FROM (${activeTownMembers}))=1)
        OR (? IS NULL AND (SELECT count(*) FROM (${activeTownMembers}))>=2))
    ON CONFLICT(rfp_id) DO UPDATE SET status='requested',attempt=attempt+1,requested_by=excluded.requested_by,
      requested_at=excluded.requested_at,expires_at=excluded.expires_at,witness_name=excluded.witness_name,
      witness_email=excluded.witness_email,witness_token_hash=excluded.witness_token_hash,confirmed_by=NULL,
      confirmed_method=NULL,witness_confirmed_name=NULL,opened_at=NULL,updated_at=excluded.updated_at
      WHERE status IN ('cancelled','expired') OR (status='requested' AND julianday(expires_at)<julianday(excluded.requested_at))
      RETURNING expires_at`).bind(actor,stamp,expires,name,email,witness.hash,stamp,job.id,actor,job.deadline,job.buyer_key,
        witness.hash,witness.hash).first<{ expires_at: string }>();
  return created ? { ok: true, expires_at: expires, witness: useWitness, members: context.members } : refuse("pending");
}

export async function confirmNativeSealedOpening(id: string, actor: string, now = new Date(), db: D1Binding = vpsAppDatabase()): Promise<Reply<{ opened: number }>> {
  const state = await readNativeSealedState(id,actor,now,db);
  if (!state) return refuse("not_member");
  if (!state.closed) return refuse("not_closed");
  const opening = state.opening;
  if (!opening || opening.status === "cancelled") return refuse("no_request");
  if (opening.status === "opened") return refuse("already_open");
  if (opening.status === "expired") return refuse("expired");
  if (opening.requested_by === actor) return refuse("same_person");
  const stamp = now.toISOString();
  const updated = await db.prepare(`UPDATE _town_sealed_openings SET status='opened',confirmed_by=?,confirmed_method='member',
    witness_token_hash=NULL,opened_at=?,updated_at=? WHERE rfp_id=? AND status='requested' AND requested_by<>?
    AND julianday(expires_at)>=julianday(?) AND EXISTS(SELECT 1 FROM rfp_posts r WHERE r.id=_town_sealed_openings.rfp_id
      AND ${sealedPost} AND ${townMember}) RETURNING rfp_id`).bind(actor,stamp,stamp,id,actor,stamp,actor).first();
  return updated ? { ok: true, opened: state.received } : refuse("no_request");
}

export async function adjustNativeSealedOpening(id: string, actor: string, replacementHash: string | null, now = new Date(),
  db: D1Binding = vpsAppDatabase()): Promise<Reply<{ witness_email: string; witness_name: string; expires_at: string }>> {
  const stamp = now.toISOString();
  const row = await db.prepare(`UPDATE _town_sealed_openings SET status=CASE WHEN ? IS NULL THEN 'cancelled' ELSE status END,
    witness_token_hash=?,updated_at=? WHERE rfp_id=? AND status='requested'
      AND (? IS NULL OR (witness_email IS NOT NULL AND julianday(expires_at)>=julianday(?)))
      AND EXISTS(SELECT 1 FROM rfp_posts r WHERE r.id=_town_sealed_openings.rfp_id AND ${sealedPost} AND ${townMember})
      RETURNING witness_email,witness_name,expires_at`).bind(replacementHash,replacementHash,stamp,id,replacementHash,stamp,actor)
    .first<{ witness_email: string; witness_name: string; expires_at: string }>();
  return row ? { ok: true, ...row } : refuse("no_request");
}

interface WitnessRecord {
  title: string; buyer_name: string | null; closes_at: string | null; received: number;
  requested_by_name: string | null; requested_at: string; expires_at: string; witness_name: string | null;
}

export async function readNativeWitness(id: string, token: string, now = new Date(), db: D1Binding = vpsAppDatabase()): Promise<Reply<WitnessRecord>> {
  if (!tokenFormat.test(token)) return refuse("bad_link");
  const row = await db.prepare(`SELECT r.title,r.buyer_name,r.deadline,r.buyer_key,o.requested_at,o.expires_at,o.witness_name,
    coalesce(nullif(trim(p.full_name),''),p.email) AS requested_by_name,
    (SELECT count(*) FROM _town_sealed_quotes q WHERE q.rfp_id=r.id AND q.status='active') AS received
    FROM _town_sealed_openings o JOIN rfp_posts r ON r.id=o.rfp_id LEFT JOIN users_profile p ON p.id=o.requested_by
    WHERE r.id=? AND ${sealedPost} AND o.status='requested' AND o.witness_token_hash=?`).bind(id,hash(token))
    .first<Omit<WitnessRecord,"closes_at"> & { deadline: string | null; buyer_key: string | null }>();
  if (!row) return refuse("bad_link");
  if (Date.parse(row.expires_at)<now.getTime()) return refuse("expired");
  const { deadline,buyer_key,...result } = row;
  return { ok:true,...result,closes_at:townClosesAt(deadline,buyer_key) };
}

export async function confirmNativeWitness(id: string, token: string, name: unknown, now = new Date(),
  db: D1Binding = vpsAppDatabase()): Promise<Reply<{ opened: number }>> {
  const typed = cleanWitnessName(name);
  if (!typed) return refuse("witness_name");
  const info = await readNativeWitness(id,token,now,db);
  if (!info.ok) return info;
  if (!info.closes_at || !isClosed(info.closes_at,now)) return refuse("not_closed");
  const stamp = now.toISOString();
  const row = await db.prepare(`UPDATE _town_sealed_openings SET status='opened',confirmed_by=NULL,confirmed_method='witness',
    witness_confirmed_name=?,witness_token_hash=NULL,opened_at=?,updated_at=? WHERE rfp_id=? AND status='requested'
    AND witness_token_hash=? AND julianday(expires_at)>=julianday(?) AND EXISTS(SELECT 1 FROM rfp_posts r
      WHERE r.id=_town_sealed_openings.rfp_id AND ${sealedPost}) RETURNING rfp_id`).bind(typed,stamp,stamp,id,hash(token),stamp).first();
  return row ? { ok:true,opened:info.received } : refuse("bad_link");
}

type Notification = { user_id: string; type: string; title: string; message: string; link_url: string };
export async function writeNativeTownNotifications(rows: Notification[], db: D1Binding = vpsAppDatabase()) {
  if (!rows.length) return;
  await db.prepare(`INSERT INTO notifications(id,user_id,type,title,message,link_url)
    SELECT json_extract(j.value,'$.id'),u.id,json_extract(j.value,'$.type'),json_extract(j.value,'$.title'),
      json_extract(j.value,'$.message'),json_extract(j.value,'$.link_url')
    FROM json_each(?) j JOIN users_profile u ON u.id=json_extract(j.value,'$.user_id')
    WHERE u.status='active' AND ${customerAppAuthority}`).bind(JSON.stringify(rows.map((row) => ({ ...row, id: randomUUID() })))).run();
}

export async function nativeSealedTownMembers(jobId: string, db: D1Binding = vpsAppDatabase()) {
  const result = await db.prepare(`SELECT m.id,m.email,m.full_name,m.status FROM rfp_posts r JOIN organization_members j ON j.organization_id=r.posted_by_organization_id
    JOIN users_profile m ON m.id=j.user_id WHERE r.id=? AND ${sealedPost} AND m.status='active'`).bind(jobId)
    .all<{ id: string; email: string | null; full_name: string | null; status: string }>();
  return result.results;
}

export async function notifyNativeOpened(job: TownJob, db: D1Binding = vpsAppDatabase()) {
  const [members, interests] = await Promise.all([
    nativeSealedTownMembers(job.id,db),
    db.prepare(`SELECT DISTINCT i.submitted_by_user_id AS id FROM rfp_interests i JOIN _town_sealed_openings o
      ON o.rfp_id=i.rfp_id AND o.status='opened' WHERE i.rfp_id=? AND i.submitted_by_user_id IS NOT NULL`).bind(job.id).all<{ id:string }>(),
  ]);
  await writeNativeTownNotifications([
    ...members.map(({ id }) => ({ user_id:id, type:"sealed_opened", title:"The sealed quotes are open", message:job.title, link_url:`/buyer-dashboard/jobs/${job.id}#results` })),
    ...interests.results.map(({ id }) => ({ user_id:id, type:"sealed_opened_trade", title:"The town opened the sealed quotes", message:job.title, link_url:"/dashboard/interests" })),
  ],db);
}

const activeAdmin = "EXISTS(SELECT 1 FROM users_profile WHERE id=? AND status='active' AND primary_role IN ('admin','super_admin'))";
export async function breakNativeSealedGlass(id: string, actor: string, raw: unknown, db: D1Binding = vpsAppDatabase()): Promise<Reply<{ quotes: BreakGlassQuote[]; count: number }>> {
  const reason = typeof raw === "string" ? raw.trim() : "";
  if (reason.length<10 || reason.length>1000) return refuse("reason");
  const scope = `SELECT r.id,r.title,r.posted_by_organization_id,r.buyer_key FROM rfp_posts r WHERE r.id=? AND ${sealedPost} AND ${activeAdmin}`;
  const [audit, quotes, members] = await db.batch([
    db.prepare(`INSERT INTO town_job_log(rfp_id,organization_id,buyer_key,actor_user_id,event,detail)
      SELECT r.id,r.posted_by_organization_id,r.buyer_key,?,'sealed_break_glass',json_object('reason',?,'count',
        (SELECT count(*) FROM _town_sealed_quotes q WHERE q.rfp_id=r.id AND q.status IN ('active','opened')),
        'admin',(SELECT coalesce(nullif(trim(full_name),''),email) FROM users_profile WHERE id=?))
      FROM (${scope}) r RETURNING id`).bind(actor,reason,actor,id,actor),
    db.prepare(`SELECT q.id AS quote,q.status,o.name AS company,q.trade_organization_id AS organization_id,
        q.quote_amount,q.quote_kind,q.start_date,q.quote_notes,q.message,q.version,q.updated_at
      FROM _town_sealed_quotes q LEFT JOIN organizations o ON o.id=q.trade_organization_id
      WHERE q.rfp_id IN (SELECT id FROM (${scope})) AND q.status IN ('active','opened') ORDER BY q.updated_at,q.id`)
      .bind(id,actor),
    db.prepare(`SELECT m.user_id,r.title FROM (${scope}) r JOIN organization_members m ON m.organization_id=r.posted_by_organization_id
      JOIN users_profile u ON u.id=m.user_id AND u.status='active'`).bind(id,actor),
  ]);
  if (!audit.results.length) return refuse("not_admin");
  await writeNativeTownNotifications((members.results as { user_id: string; title: string }[]).map((m) => ({
    user_id:m.user_id,type:"sealed_break_glass",title:"PMRFP staff looked inside your sealed quote box",
    message:`${m.title}: ${reason}`.slice(0,500),link_url:`/buyer-dashboard/jobs/${id}#record`,
  })),db);
  return { ok:true,quotes:quotes.results as unknown as BreakGlassQuote[],count:quotes.results.length };
}

export async function listNativeAdminSealed(actor: string, db: D1Binding = vpsAppDatabase()) {
  const rows = await db.prepare(`SELECT r.id,r.title,r.slug,r.buyer_name,r.buyer_key,r.deadline,r.status,
    (SELECT count(*) FROM _town_sealed_quotes WHERE rfp_id=r.id AND status IN ('active','opened')) AS received,
    EXISTS(SELECT 1 FROM _town_sealed_openings WHERE rfp_id=r.id AND status='opened') AS opened
    FROM rfp_posts r WHERE ${sealedPost} AND ${activeAdmin} ORDER BY deadline DESC,r.id LIMIT 200`).bind(actor)
    .all<{ id: string; title: string; slug: string; buyer_name: string | null; buyer_key: string | null;
      deadline: string | null; status: string; received: number; opened: number }>();
  return rows.results.map((row) => ({ ...row, opened: Boolean(row.opened) }));
}
