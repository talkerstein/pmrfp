import { randomUUID } from "node:crypto";
import type { ProjectSession } from "@/lib/projects/server";
import { generateReviewToken, isWellFormedToken } from "@/lib/projects/tokens";
import { MAX_SHARE_LINKS_PER_PROJECT } from "@/lib/projects/visibility";
import type { D1Binding } from "./contracts";
import { vpsAppDatabase } from "./http-binding";
import { vpsProjectActiveMember, vpsProjectAuthority } from "./vps-project-uploads";

export async function createVpsShareLink(session: ProjectSession, projectId: string, label: string, db: D1Binding = vpsAppDatabase()) {
  if (!session.hasTradeAccess) return null;
  const org = session.organization.id;
  const token = generateReviewToken();
  return db.prepare(`INSERT INTO case_study_share_links(id,case_study_id,organization_id,token,label,created_by_user_id)
    SELECT ?,c.id,c.organization_id,?,?,? FROM case_studies c
    WHERE c.id=? AND c.organization_id=? AND c.status='published' AND ${vpsProjectAuthority} AND ${vpsProjectActiveMember}
      AND (SELECT count(*) FROM case_study_share_links l WHERE l.case_study_id=c.id AND l.revoked_at IS NULL)<?
    RETURNING token`).bind(randomUUID(), token, label || null, session.userId, projectId, org, org,
      session.userId, MAX_SHARE_LINKS_PER_PROJECT).first<{ token: string }>();
}

export async function revokeVpsShareLink(session: ProjectSession, id: string, db: D1Binding = vpsAppDatabase()) {
  const org = session.organization.id;
  return db.prepare(`UPDATE case_study_share_links SET revoked_at=? WHERE id=? AND organization_id=?
    AND revoked_at IS NULL AND ${vpsProjectAuthority} AND ${vpsProjectActiveMember} RETURNING id`)
    .bind(new Date().toISOString(), id, org, org, session.userId).first<{ id: string }>();
}

export async function resolveVpsShareLink(db: D1Binding, token: string) {
  if (!isWellFormedToken(token)) return null;
  return db.prepare(`SELECT l.id,l.case_study_id,l.organization_id
    FROM case_study_share_links l JOIN case_studies c ON c.id=l.case_study_id AND c.organization_id=l.organization_id
    JOIN organizations o ON o.id=c.organization_id
    WHERE l.token=? AND l.revoked_at IS NULL AND c.status='published' AND o.status<>'suspended' AND ${vpsProjectAuthority}`)
    .bind(token).first<{id: string; case_study_id: string; organization_id: string}>();
}
