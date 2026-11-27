import "server-only";
import type { AttachedProject } from "@/lib/projects/attach";
import type { InterestStatus } from "@/types/db";
import { UUID, D1ApiError, type D1Binding } from "./contracts";
import { vpsAppDatabase } from "./http-binding";
import { canManageBidJob } from "./vps-bid-decisions";
import { customerAppAuthority } from "../../../workers/d1-api/customer-signup";

export interface AdminInterestRow {
  id: string;
  status: InterestStatus;
  created_at: string;
  organizations: { name: string | null } | null;
  rfp_posts: { title: string | null } | null;
}

export async function readVpsAdminInterests(actorId: string, db: D1Binding = vpsAppDatabase()): Promise<AdminInterestRow[]> {
  if (!UUID.test(actorId)) return [];
  const rows = await db.prepare(`SELECT i.id,i.status,i.created_at,o.name AS organization_name,r.title AS rfp_title
    FROM rfp_interests i JOIN rfp_posts r ON r.id=i.rfp_id
    LEFT JOIN organizations o ON o.id=i.trade_organization_id WHERE r.is_demo=0 AND ${customerAppAuthority}
      AND (r.sealed=0 OR EXISTS(SELECT 1 FROM _town_sealed_openings s WHERE s.rfp_id=r.id AND s.status='opened'))
      AND EXISTS(SELECT 1 FROM users_profile u WHERE u.id=? AND u.status='active' AND u.primary_role IN ('admin','super_admin'))
    ORDER BY i.created_at DESC,i.id DESC LIMIT 1000`).bind(actorId)
    .all<Omit<AdminInterestRow,"organizations"|"rfp_posts"> & { organization_name: string | null; rfp_title: string | null }>();
  return rows.results.map(({ organization_name,rfp_title,...interest }) => ({
    ...interest,organizations:{name:organization_name},rfp_posts:{title:rfp_title},
  }));
}

export interface BidInboxInterest {
  id: string;
  status: string;
  message: string | null;
  relevant_experience: string | null;
  availability: string | null;
  created_at: string;
  contact_revealed: boolean;
  trade_organization_id: string;
  submitted_by_user_id: string | null;
  case_study_ids?: string[] | null;
  quote_amount?: number | null;
  quote_kind?: "estimate" | "firm" | null;
  quote_notes?: string | null;
  start_date?: string | null;
  pm_contact_shared?: boolean | null;
  decision_note?: string | null;
}

export interface BidInboxCompany {
  id: string;
  name: string;
  slug: string;
  city: string | null;
  province: string | null;
  verified: boolean | null;
  years_in_business: number | null;
  insurance_status: string | null;
  wsib_status: string | null;
  short_description: string | null;
  public_contact_visibility: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  profile_status: string | null;
}

export interface BidInboxJob {
  id: string;
  title: string;
  slug: string;
  status: string;
  province: string | null;
}

interface Submitter {
  full_name: string | null;
  email: string | null;
  phone: string | null;
}

export async function readVpsBidInbox(actorId: string, rfpId: string, db: D1Binding = vpsAppDatabase()) {
  const interests: BidInboxInterest[] = [];
  const orgs = new Map<string, BidInboxCompany>();
  const attached = new Map<string, AttachedProject[]>();
  const people = new Map<string, Submitter>();
  const empty = { job: null, interests, orgs, attached, people };
  if (!UUID.test(actorId) || !UUID.test(rfpId)) return empty;
  const gate = `r.id=? AND r.is_demo=0 AND (r.sealed=0 OR EXISTS(SELECT 1 FROM town_job_log l WHERE l.rfp_id=r.id AND l.event='quotes_opened')) AND ${canManageBidJob} AND ${customerAppAuthority}`;
  const reveal = "(i.status='picked' OR i.contact_revealed=1 OR c.public_contact_visibility='show_contact')";
  const results = await db.batch([
    db.prepare(`SELECT r.id,r.title,r.slug,r.status,r.province FROM rfp_posts r WHERE ${gate}`).bind(rfpId, actorId),
    db.prepare(`SELECT i.id,i.status,i.message,i.relevant_experience,i.availability,i.created_at,
      i.contact_revealed,i.trade_organization_id,i.submitted_by_user_id,CAST(i.quote_amount AS REAL) AS quote_amount,
      i.quote_kind,i.quote_notes,i.start_date,i.pm_contact_shared,i.decision_note,
      json_object('id',c.id,'name',c.name,'slug',c.slug,'city',c.city,'province',c.province,'verified',c.verified,
        'years_in_business',c.years_in_business,'insurance_status',c.insurance_status,'wsib_status',c.wsib_status,
        'short_description',c.short_description,'public_contact_visibility',c.public_contact_visibility,
        'profile_status',c.profile_status,'email',CASE WHEN ${reveal} THEN c.email END,
        'phone',CASE WHEN ${reveal} THEN c.phone END,'website',CASE WHEN ${reveal} THEN c.website END) AS company,
      CASE WHEN ${reveal} AND p.id IS NOT NULL THEN json_object('full_name',p.full_name,'email',p.email,'phone',p.phone) END AS person
      FROM rfp_posts r JOIN rfp_interests i ON i.rfp_id=r.id JOIN organizations c ON c.id=i.trade_organization_id
      LEFT JOIN users_profile p ON p.id=i.submitted_by_user_id
      WHERE ${gate} ORDER BY i.created_at DESC, i.id`).bind(rfpId, actorId),
    db.prepare(`SELECT i.id AS interest_id,p.id,p.slug,p.title,p.visibility,p.client_type,p.scope,
      (SELECT l.token FROM case_study_share_links l WHERE l.case_study_id=p.id AND l.organization_id=p.organization_id
       AND l.revoked_at IS NULL ORDER BY l.created_at,l.id LIMIT 1) AS share_token
      FROM rfp_posts r JOIN rfp_interests i ON i.rfp_id=r.id JOIN json_each(i.case_study_ids) a
      JOIN case_studies p ON p.id=a.value AND p.organization_id=i.trade_organization_id AND p.status='published'
      WHERE ${gate} ORDER BY i.id,a.key`).bind(rfpId, actorId),
  ]);
  if (results.length !== 3 || results.some(result => !result.success)) throw new D1ApiError(503, "bid_inbox_unavailable");
  const job = results[0].results[0] as unknown as BidInboxJob | undefined;
  if (!job) return empty;
  for (const row of results[1].results as (Omit<BidInboxInterest, "contact_revealed" | "pm_contact_shared"> &
    { contact_revealed: number; pm_contact_shared: number; company: string; person: string | null })[]) {
    const { company, person, ...interest } = row;
    const org = JSON.parse(company) as BidInboxCompany;
    orgs.set(org.id, { ...org, verified: Boolean(org.verified) });
    if (person && row.submitted_by_user_id) people.set(row.submitted_by_user_id, JSON.parse(person));
    interests.push({ ...interest, contact_revealed: Boolean(interest.contact_revealed), pm_contact_shared: Boolean(interest.pm_contact_shared) });
  }
  for (const project of results[2].results as { interest_id: string; id: string; slug: string; title: string;
    visibility: string | null; client_type: string | null; scope: string | null; share_token: string | null }[]) {
    if (project.visibility === "private" && !project.share_token) continue;
    const href = project.visibility === "private" ? `/shared/${encodeURIComponent(project.share_token!)}`
      : `/case-studies/${encodeURIComponent(project.slug)}`;
    const list = attached.get(project.interest_id) ?? [];
    list.push({ id: project.id, title: project.title, href, heroUrl: null, isCaseStudy: Boolean(project.client_type && project.scope?.trim()) });
    attached.set(project.interest_id, list);
  }
  return { job, interests, orgs, attached, people };
}
