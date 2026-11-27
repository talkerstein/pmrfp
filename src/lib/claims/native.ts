import "server-only";
import { randomUUID } from "node:crypto";
import type { D1Binding } from "@/lib/d1/contracts";
import { UUID } from "@/lib/d1/contracts";
import { vpsAppDatabase } from "@/lib/d1/http-binding";
import { publicImageSource } from "@/lib/d1/public-asset-preview";
import { customerAppAuthority } from "../../../workers/d1-api/customer-signup";
import type { ClaimStatus, OwnClaim } from "./data";
import { claimMethod, hostOf, type ClaimMethod } from "./domain";

const slugPattern = /^[a-z0-9][a-z0-9-]{0,119}$/;
const staff = "EXISTS(SELECT 1 FROM users_profile u WHERE u.id=? AND u.status='active' AND u.primary_role IN ('admin','super_admin'))";
const canJoin = "o.is_demo=0 AND o.status='active' AND o.organization_type IN ('trade_company','supplier','builder')";
const member = `FROM users_profile u JOIN organization_members m ON m.user_id=u.id
  JOIN organizations o ON o.id=m.organization_id WHERE u.id=? AND o.id=? AND u.status='active'
    AND ${canJoin} AND ${customerAppAuthority}`;

export interface NativePublicClaim {
  winner_slug: string; name: string; org_slug: string; logo_url: string | null; short_description: string | null;
  website: string | null; phone: string | null; email: string | null; city: string | null; province: string | null;
  verified: number; claimed_at: string | null;
}

export async function getNativeWinnerClaim(slug: string, db: D1Binding = vpsAppDatabase()): Promise<NativePublicClaim | null> {
  if (!slugPattern.test(slug)) return null;
  const row = await db.prepare(`SELECT c.winner_slug,o.name,o.slug AS org_slug,o.logo_url,o.short_description,o.website,
    CASE WHEN o.public_contact_visibility='show_contact' THEN o.phone END AS phone,
    CASE WHEN o.public_contact_visibility='show_contact' THEN o.email END AS email,
    o.city,o.province,o.verified,c.reviewed_at AS claimed_at
    FROM winner_claims c JOIN organizations o ON o.id=c.organization_id
    WHERE c.winner_slug=? AND c.status='approved' AND o.is_demo=0 AND o.status='active' AND o.profile_status='approved' AND ${customerAppAuthority}`)
    .bind(slug).first<NativePublicClaim>();
  if (!row?.logo_url) return row;
  const { src, unoptimized } = publicImageSource(row.logo_url);
  const url = URL.parse(src);
  const image = unoptimized || (url?.protocol==="https:" && !url.username && !url.password && !url.hostname.endsWith(".supabase.co")) ? src : null;
  return { ...row, logo_url:image };
}

export async function getNativeOwnWinnerClaim(slug: string, actor: string, db: D1Binding = vpsAppDatabase()): Promise<OwnClaim | null> {
  if (!slugPattern.test(slug) || !UUID.test(actor)) return null;
  return db.prepare(`SELECT c.id,c.status,c.organization_id AS organizationId,c.website,c.note,c.created_at AS createdAt
    FROM winner_claims c JOIN users_profile u ON u.id=c.user_id
    WHERE c.user_id=? AND c.winner_slug=? AND u.status='active' AND ${customerAppAuthority}
    ORDER BY c.created_at DESC,c.id DESC LIMIT 1`).bind(actor,slug).first<OwnClaim>();
}

export interface AdminWinnerClaim {
  id: string;
  winner_slug: string;
  winner_name: string;
  organization_id: string;
  email: string;
  website: string | null;
  method: ClaimMethod;
  status: ClaimStatus;
  note: string | null;
  admin_note: string | null;
  created_at: string;
  reviewed_at: string | null;
  organizations: { name: string; slug: string; organization_type: string; website: string | null } | null;
}

export async function listNativeWinnerClaims(actor: string, db: D1Binding = vpsAppDatabase()): Promise<AdminWinnerClaim[]> {
  if (!UUID.test(actor)) return [];
  const rows = await db.prepare(`SELECT c.id,c.winner_slug,c.winner_name,c.organization_id,c.email,c.website,c.method,c.status,c.note,
    c.admin_note,c.created_at,c.reviewed_at,json_object('name',o.name,'slug',o.slug,'organization_type',o.organization_type,'website',o.website) AS org
    FROM winner_claims c JOIN organizations o ON o.id=c.organization_id
    WHERE ${staff} AND ${customerAppAuthority}
    ORDER BY CASE c.status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 WHEN 'rejected' THEN 2 ELSE 3 END,c.created_at DESC,c.id LIMIT 300`)
    .bind(actor).all<Omit<AdminWinnerClaim,"organizations"> & {org:string}>();
  return rows.results.map(({org,...row}) => ({...row,organizations:JSON.parse(org)}));
}

interface Submission {
  actor: string; org: string; slug: string; name: string; website: string; note: string | null;
}
type SubmitResult =
  | { result:"saved"; claimId:string; status:"approved"|"pending"; method:ClaimMethod }
  | { result:"approved"|"taken"|"failed" };

async function approvedStatus(input: Submission, db: D1Binding): Promise<"approved"|"taken"|"failed"> {
  const row = await db.prepare(`SELECT organization_id FROM winner_claims
    WHERE winner_slug=? AND status='approved' AND ${customerAppAuthority}`).bind(input.slug).first<{organization_id:string}>();
  return row ? row.organization_id===input.org ? "approved" : "taken" : "failed";
}

export async function submitNativeWinnerClaim(input: Submission, db: D1Binding = vpsAppDatabase()): Promise<SubmitResult> {
  const website = hostOf(input.website);
  if (!UUID.test(input.actor) || !UUID.test(input.org) || !slugPattern.test(input.slug) || !website || !input.name.trim()) return {result:"failed"};
  const actor = await db.prepare(`SELECT u.email ${member}`).bind(input.actor,input.org).first<{email:string}>();
  if (!actor) return {result:"failed"};
  const method = claimMethod({email:actor.email,website,winnerName:input.name});
  const status = method==="email_domain" ? "approved" : "pending";
  const now = new Date().toISOString();
  const id = randomUUID();
  try {
    const [saved] = await db.batch([
      db.prepare(`INSERT INTO winner_claims(id,winner_slug,winner_name,organization_id,user_id,email,website,method,status,note,reviewed_at)
        SELECT ?,?,?,o.id,u.id,u.email,?,?,?,?,? ${member}
          AND u.email=? AND NOT EXISTS(SELECT 1 FROM winner_claims c WHERE c.winner_slug=? AND c.status='approved')
        ON CONFLICT(winner_slug,user_id) WHERE status IN ('pending','approved') DO UPDATE SET
          winner_name=excluded.winner_name,organization_id=excluded.organization_id,email=excluded.email,website=excluded.website,
          method=excluded.method,status=excluded.status,note=excluded.note,reviewed_at=excluded.reviewed_at
          WHERE winner_claims.status='pending' RETURNING id`).bind(id,input.slug,input.name.slice(0,300),website,method,status,input.note,
        status==="approved" ? now : null,input.actor,input.org,actor.email,input.slug),
      db.prepare(`INSERT INTO audit_logs(id,actor_user_id,action,entity_type,entity_id,metadata)
        SELECT ?,user_id,?,'organization',organization_id,json_object('claimId',id,'winnerSlug',winner_slug,'method',method,'website',website)
        FROM winner_claims WHERE winner_slug=? AND user_id=? AND status=? AND changes()=1`)
        .bind(randomUUID(),status==="approved" ? "winner_claim.auto_approved" : "winner_claim.submitted",input.slug,input.actor,status),
      db.prepare(`UPDATE organizations SET website=? WHERE id=? AND nullif(trim(website),'') IS NULL
        AND changes()=1 AND EXISTS(SELECT 1 FROM winner_claims WHERE winner_slug=? AND user_id=? AND status='approved' AND reviewed_at=?)`)
        .bind("https://"+website,input.org,input.slug,input.actor,now),
    ]);
    const returned = saved.results[0] as {id:string} | undefined;
    if (returned) return {result:"saved",claimId:returned.id,status,method};
  } catch {
    return {result:await approvedStatus(input,db).catch(() => "failed")};
  }
  return {result:await approvedStatus(input,db)};
}

type ReviewResult = { result:"saved"; slug:string } | { result:"missing"|"conflict"|"failed" };

export async function reviewNativeWinnerClaim(actor: string, id: string, status: Exclude<ClaimStatus,"pending">,
  note: string | null, db: D1Binding = vpsAppDatabase()): Promise<ReviewResult> {
  if (!UUID.test(actor) || !UUID.test(id)) return {result:"missing"};
  const now = new Date().toISOString();
  try {
    const [before,saved] = await db.batch([
      db.prepare(`SELECT c.status,EXISTS(SELECT 1 FROM winner_claims a WHERE a.winner_slug=c.winner_slug AND a.id<>c.id
        AND a.status='approved') AS conflict FROM winner_claims c WHERE c.id=? AND ${staff} AND ${customerAppAuthority}`).bind(id,actor),
      db.prepare(`UPDATE winner_claims AS c SET status=?,admin_note=?,reviewed_by=?,reviewed_at=? WHERE c.id=?
        AND c.status=? AND ${staff} AND ${customerAppAuthority}
        AND (?<>'approved' OR (NOT EXISTS(SELECT 1 FROM winner_claims x WHERE x.winner_slug=c.winner_slug AND x.id<>c.id AND x.status='approved')
          AND EXISTS(SELECT 1 FROM organizations o WHERE o.id=c.organization_id AND ${canJoin})))
        RETURNING winner_slug`).bind(status,note,actor,now,id,status==="revoked" ? "approved" : "pending",actor,status),
      db.prepare(`INSERT INTO audit_logs(id,actor_user_id,action,entity_type,entity_id,metadata)
        SELECT ?,?,?,'organization',organization_id,json_object('claimId',id,'winnerSlug',winner_slug,'adminNote',admin_note)
        FROM winner_claims WHERE id=? AND changes()=1`).bind(randomUUID(),actor,"winner_claim."+status,id),
    ]);
    const claim = saved.results[0] as {winner_slug:string} | undefined;
    if (claim) return {result:"saved",slug:claim.winner_slug};
    if (status==="approved" && before.results[0]?.conflict) return {result:"conflict"};
    return {result:"missing"};
  } catch {
    return {result:"failed"};
  }
}
