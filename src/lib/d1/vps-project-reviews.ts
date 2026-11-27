import "server-only";
import { randomUUID } from "node:crypto";
import type { ProjectSession } from "@/lib/projects/server";
import { hashReviewToken, isWellFormedToken } from "@/lib/projects/tokens";
import { nativeProjectHero, nativeStoredProjectPhotos } from "@/lib/projects/photos";
import type { InviteLookup } from "@/lib/reviews/invite";
import { vpsAppDatabase } from "./http-binding";
import { vpsProjectActiveMember, vpsProjectAuthority } from "./vps-project-uploads";
import type { D1Binding } from "./contracts";

export async function reserveVpsReviewInvite(session:ProjectSession, input:{caseStudyId:string;clientName:string;clientEmail:string},token:string,limit:number) {
  const org=session.organization.id;
  const row=await vpsAppDatabase().prepare(`INSERT INTO review_invites(id,token_hash,case_study_id,organization_id,client_name,client_email,created_by_user_id)
    SELECT ?,?,c.id,c.organization_id,?,?,? FROM case_studies c
    WHERE c.id=? AND c.organization_id=? AND c.status='published' AND ${vpsProjectAuthority} AND ${vpsProjectActiveMember}
      AND (EXISTS(SELECT 1 FROM subscriptions s WHERE s.organization_id=c.organization_id AND s.status IN ('active','comped') AND s.tier IN ('pro','featured'))
        OR EXISTS(SELECT 1 FROM trade_trials t WHERE t.organization_id=c.organization_id AND julianday(t.started_at)<=julianday('now') AND julianday(t.ends_at)>julianday('now')))
      AND NOT EXISTS(SELECT 1 FROM review_invites i WHERE i.case_study_id=c.id AND lower(i.client_email)=?)
      AND NOT EXISTS(SELECT 1 FROM email_suppressions e WHERE e.email_key=?)
      AND (SELECT count(*) FROM review_invites i WHERE i.case_study_id=c.id)<?
    RETURNING (SELECT title FROM case_studies WHERE id=?) AS title`).bind(randomUUID(),hashReviewToken(token),input.clientName,
    input.clientEmail,session.userId,input.caseStudyId,org,org,session.userId,input.clientEmail,input.clientEmail,limit,input.caseStudyId)
    .first<{title:string}>();
  return row;
}

async function lookupReviewProject(hash: string, db: D1Binding) {
  return db.prepare(`SELECT i.client_name,i.used_at,c.id,c.organization_id,c.photos,c.title,c.hero_url,o.name,o.slug,o.profile_status
    FROM review_invites i JOIN case_studies c ON c.id=i.case_study_id AND c.organization_id=i.organization_id
    JOIN organizations o ON o.id=i.organization_id AND o.status='active'
    WHERE i.token_hash=? AND c.status='published' AND ${vpsProjectAuthority}`).bind(hash)
    .first<{ client_name: string; used_at: string | null; id: string; organization_id: string; photos: string;
      title: string; hero_url: string | null; name: string; slug: string | null; profile_status: string }>();
}

function reviewProjectHero(row: { id: string; organization_id: string; photos: string; hero_url: string | null }) {
  return nativeProjectHero(nativeStoredProjectPhotos(JSON.parse(row.photos), row.id, row.organization_id), row.hero_url);
}

export async function readVpsReviewInvite(token: string): Promise<InviteLookup> {
  const row = await lookupReviewProject(hashReviewToken(token), vpsAppDatabase());
  if (!row) return {state:"invalid"};
  if (row.used_at) return {state:"used"};
  return {state:"open",clientName:row.client_name,tradeName:row.name,projectTitle:row.title,
    tradeSlug:row.profile_status==="approved"?row.slug:null,
    heroUrl: reviewProjectHero(row) ? `/api/projects/reviewer-photo/${token}` : null };
}

export async function resolveVpsReviewPhoto(token: string, db: D1Binding) {
  if (!isWellFormedToken(token)) return null;
  const hash = hashReviewToken(token);
  const row = await lookupReviewProject(hash, db);
  if (!row || row.used_at) return null;
  const file = reviewProjectHero(row)?.path.split("/")[1];
  return file ? { projectId: row.id, file, hash } : null;
}

export async function submitVpsProjectReview(token:string,input:{
  rating:number;body:string;name:string;company:string;showBuilding:boolean;referenceOk:boolean;
}) {
  const db=vpsAppDatabase();
  const hash=hashReviewToken(token);
  const [claim,insert]=await db.batch([
    db.prepare(`UPDATE review_invites SET used_at=? WHERE token_hash=? AND used_at IS NULL AND ${vpsProjectAuthority}
      AND EXISTS(SELECT 1 FROM case_studies c JOIN organizations o ON o.id=c.organization_id AND o.status='active'
        WHERE c.id=review_invites.case_study_id AND c.organization_id=review_invites.organization_id AND c.status='published')`)
      .bind(new Date().toISOString(),hash),
    db.prepare(`INSERT INTO vendor_reviews(id,organization_id,case_study_id,reviewer_name,reviewer_company,reviewer_email,rating,
      body,project_context,status,verified_via,show_building,reference_ok)
      SELECT ?,i.organization_id,i.case_study_id,?,?,i.client_email,?,?,c.title,'pending_review','project_invite',?,?
      FROM review_invites i JOIN case_studies c ON c.id=i.case_study_id WHERE i.token_hash=? AND changes()=1
      RETURNING project_context,(SELECT name FROM organizations WHERE id=organization_id) AS company`)
      .bind(randomUUID(),input.name,input.company || null,input.rating,input.body,Number(input.showBuilding),Number(input.referenceOk),hash),
  ]);
  return claim.meta.changes===1 ? insert.results[0] as {project_context:string;company:string} : null;
}
