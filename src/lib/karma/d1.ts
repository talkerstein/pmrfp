import "server-only";
import { randomUUID } from "node:crypto";
import type { D1Binding, D1Statement } from "@/lib/d1/contracts";
import { SYSTEM_HANDLE } from "@/lib/forum/auto-threads";
import { isEligibleOrg, SYNC_REVERSAL, type ExistingEvent, type KarmaSnapshot, type planSync } from "./derive";
import { isKarmaKind } from "./rules";

async function read<T>(db: D1Binding, sql: string, ...params: (string | number | null)[]) {
  const rows: T[] = [];
  for (let offset = 0; offset < 200_000; offset += 500) {
    const result = await db.prepare(sql + " LIMIT 500 OFFSET ?").bind(...params,offset).all<T>();
    if (!result.success) throw Error("Karma snapshot unavailable");
    rows.push(...result.results);
    if (result.results.length < 500) return rows;
  }
  throw Error("Karma snapshot too large");
}

export async function loadD1Karma(db: D1Binding): Promise<{snapshot:KarmaSnapshot;ledger:ExistingEvent[]}> {
  const work = [
    () => read<KarmaSnapshot["orgs"][number]>(db,`SELECT id,website,email,profile_status AS profileStatus,status,
      is_demo AS isDemo,verified,created_at AS createdAt FROM organizations ORDER BY id`),
    () => read<KarmaSnapshot["members"][number]>(db,`SELECT m.user_id AS userId,m.organization_id AS orgId,u.email
      FROM organization_members m LEFT JOIN users_profile u ON u.id=m.user_id ORDER BY m.id`),
    () => read<KarmaSnapshot["forumProfiles"][number]>(db,`SELECT user_id AS userId,organization_id AS orgId,banned,
      handle=? AS system FROM forum_profiles ORDER BY user_id`,SYSTEM_HANDLE),
    () => read<KarmaSnapshot["votes"][number]>(db,`SELECT v.post_id AS postId,v.user_id AS voterId,
      p.author_id AS authorId,p.status AS postStatus,t.status AS threadStatus,v.created_at AS createdAt
      FROM forum_post_votes v JOIN forum_posts p ON p.id=v.post_id JOIN forum_threads t ON t.id=p.thread_id
      ORDER BY v.post_id,v.user_id`),
    () => read<KarmaSnapshot["ratings"][number]>(db,`SELECT r.thread_id AS threadId,r.user_id AS raterId,t.author_id AS authorId,
      r.score,t.status AS threadStatus,r.created_at AS createdAt FROM forum_thread_ratings r JOIN forum_threads t ON t.id=r.thread_id
      ORDER BY r.thread_id,r.user_id`),
    () => read<KarmaSnapshot["accepted"][number]>(db,`SELECT p.id AS postId,p.author_id AS answerAuthorId,t.author_id AS askerId,
      p.status AS postStatus,t.status AS threadStatus,p.created_at AS createdAt FROM forum_posts p JOIN forum_threads t ON t.id=p.thread_id
      WHERE p.is_accepted=1 ORDER BY p.id`),
    () => read<KarmaSnapshot["removed"][number]>(db,`SELECT l.target_type AS targetType,l.target_id AS targetId,h.author_id AS authorId,max(l.created_at) AS createdAt
      FROM forum_mod_log l JOIN (
        SELECT 'thread' AS kind,id,author_id FROM forum_threads WHERE status='hidden'
        UNION ALL SELECT 'post',id,author_id FROM forum_posts WHERE status='hidden'
      ) h ON h.kind=l.target_type AND h.id=l.target_id WHERE l.action='hide'
      GROUP BY l.target_type,l.target_id,h.author_id ORDER BY l.target_type,l.target_id`),
    () => read<KarmaSnapshot["caseStudies"][number]>(db,`SELECT id,organization_id AS orgId,status,published_at AS publishedAt,created_at AS createdAt
      FROM case_studies WHERE status='published' ORDER BY id`),
    () => read<KarmaSnapshot["reviews"][number]>(db,`SELECT id,organization_id AS orgId,case_study_id AS caseStudyId,status,
      verified_via AS verifiedVia,reviewer_email AS reviewerEmail,reviewer_user_id AS reviewerUserId,created_at AS createdAt
      FROM vendor_reviews WHERE case_study_id IS NOT NULL ORDER BY id`),
    () => read<KarmaSnapshot["rfps"][number]>(db,`SELECT id,posted_by_organization_id AS orgId,source_type AS sourceType,status,
      published_at AS publishedAt,awarded_rfp_id AS awardedRfpId,is_demo AS isDemo,created_at AS createdAt
      FROM rfp_posts WHERE source_type IN ('property_manager_direct','gc_package') AND posted_by_organization_id IS NOT NULL ORDER BY id`),
    () => read<KarmaSnapshot["interests"][number]>(db,`SELECT rfp_id AS rfpId,trade_organization_id AS orgId,created_at AS createdAt FROM rfp_interests ORDER BY id`),
    () => read<ExistingEvent>(db,`SELECT id,org_id AS orgId,kind,points,source_type AS sourceType,source_id AS sourceId,
      actor_id AS actorId,created_at AS createdAt,reversed_at AS reversedAt,reversed_reason AS reversedReason FROM karma_events ORDER BY id`),
  ] as const;
  const [orgs,members,forumProfiles] = await Promise.all([work[0](),work[1](),work[2]()]);
  const [votes,ratings,accepted] = await Promise.all([work[3](),work[4](),work[5]()]);
  const [removed,caseStudies,reviews] = await Promise.all([work[6](),work[7](),work[8]()]);
  const [rfps,interests,ledger] = await Promise.all([work[9](),work[10](),work[11]()]);
  return { snapshot:{
    orgs:orgs.map(row=>({ ...row,isDemo:Boolean(row.isDemo),verified:Boolean(row.verified) })),
    members,forumProfiles:forumProfiles.map(row=>({ ...row,banned:Boolean(row.banned),system:Boolean(row.system) })),
    votes,ratings,accepted,removed,caseStudies,reviews,rfps:rfps.map(row=>({ ...row,isDemo:Boolean(row.isDemo) })),interests,
  }, ledger:ledger.filter(row=>isKarmaKind(row.kind)) };
}

async function write(db: D1Binding, statements: D1Statement[]) {
  for (let offset=0;offset<statements.length;offset+=48) {
    const results=await db.batch(statements.slice(offset,offset+48));
    if(results.some(row=>!row.success)) throw Error("Karma writes unavailable");
  }
}

export async function applyD1KarmaPlan(db: D1Binding, plan: ReturnType<typeof planSync>, now: string) {
  await write(db,[
    ...plan.insert.map(row=>db.prepare(`INSERT INTO karma_events(id,org_id,user_id,kind,points,source_type,source_id,actor_id,created_at)
      VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(org_id,kind,source_type,source_id,actor_id) DO NOTHING`)
      .bind(randomUUID(),row.orgId,row.userId,row.kind,row.points,row.sourceType,row.sourceId,row.actorId,row.createdAt)),
    ...plan.reverse.map(row=>db.prepare("UPDATE karma_events SET reversed_at=?,reversed_reason=? WHERE id=? AND reversed_at IS NULL").bind(now,SYNC_REVERSAL,row.id)),
    ...plan.restore.map(row=>db.prepare("UPDATE karma_events SET reversed_at=NULL,reversed_reason=NULL,points=? WHERE id=? AND reversed_reason LIKE 'sync:%'").bind(row.points,row.id)),
    ...plan.update.map(row=>db.prepare("UPDATE karma_events SET points=? WHERE id=?").bind(row.points,row.id)),
  ]);
}

export async function storeD1KarmaScores(db: D1Binding, rows: {
  org_id:string;raw_points:number;score:number;level:number;decay:number;last_earned_at:string|null;updated_at:string;
}[]) {
  await write(db,rows.map(row=>db.prepare(`INSERT INTO org_karma(org_id,raw_points,score,level,decay,last_earned_at,updated_at)
    VALUES(?,?,?,?,?,?,?) ON CONFLICT(org_id) DO UPDATE SET raw_points=excluded.raw_points,score=excluded.score,
      level=excluded.level,decay=excluded.decay,last_earned_at=excluded.last_earned_at,updated_at=excluded.updated_at`)
    .bind(row.org_id,row.raw_points,row.score,row.level,row.decay,row.last_earned_at,row.updated_at)));
}

export async function linkD1ForumProfiles(db: D1Binding, snapshot: KarmaSnapshot) {
  const orgs = new Map(snapshot.orgs.map(row=>[row.id,row]));
  let linked = 0;
  for (const profile of snapshot.forumProfiles) {
    if (profile.orgId || profile.system) continue;
    const eligible=snapshot.members.filter(row=>row.userId===profile.userId&&isEligibleOrg(orgs.get(row.orgId)));
    if(eligible.length!==1) continue;
    const result=await db.prepare("UPDATE forum_profiles SET organization_id=? WHERE user_id=? AND organization_id IS NULL")
      .bind(eligible[0].orgId,profile.userId).run();
    linked+=result.meta.changes ?? 0;
  }
  return linked;
}
