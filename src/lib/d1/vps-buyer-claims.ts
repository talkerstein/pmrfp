import { randomUUID } from "node:crypto";
import type { ClaimableBuyer } from "@/lib/towns/claimable";
import { PROVINCE_NAME, type ClaimantInput, type ClaimResult, type DecideResult } from "@/lib/towns/claims";
import { decideClaim, isFreeMail, registrableOf } from "@/lib/towns/domains";
import { customerAppAuthority } from "../../../workers/d1-api/customer-signup";
import { D1ApiError, type D1Binding, type D1Statement } from "./contracts";
import { activeRequestAdmin } from "./customer-requests";
import { vpsAppDatabase } from "./http-binding";

interface ClaimRow {
  id: string;
  buyer_key: string;
  buyer_name: string;
  province_code: string;
  user_id: string;
  organization_id: string | null;
  email: string;
  email_domain: string | null;
  status: string;
}

type Buyer = Pick<ClaimableBuyer, "key" | "name" | "provinceCode" | "province">;
type Organization = { id: string; organization_type: string; manages: string | null; status: string; is_demo: number };

const activeBuyer = `EXISTS(SELECT 1 FROM users_profile WHERE id=? AND status='active' AND primary_role='public_buyer')`;
const verifiedBuyer = `EXISTS(SELECT 1 FROM organization_members m JOIN organizations o ON o.id=m.organization_id
  WHERE m.user_id=? AND o.id=? AND o.organization_type='public_buyer' AND o.status='active' AND o.is_demo=0)`;
const idSql = "lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-a'||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6)))";

function currentOrganization(db: D1Binding, userId: string) {
  return db.prepare(`SELECT o.id,o.organization_type,o.status,o.is_demo,p.buyer_key AS manages FROM organization_members m
    JOIN organizations o ON o.id=m.organization_id LEFT JOIN buyer_pages p ON p.organization_id=o.id
    WHERE m.user_id=? ORDER BY m.created_at,m.id LIMIT 1`).bind(userId).first<Organization>();
}

async function apply(db: D1Binding, writes: D1Statement[]) {
  const results = await db.batch(writes);
  if (results.length !== writes.length || results.some(row => !row.success)) {
    throw new D1ApiError(503, "buyer_claim_unavailable");
  }
}

function newOrganization(db: D1Binding, id: string, buyer: Buyer, userId: string, email: string, now: string) {
  const name = buyer.name.slice(0, 200);
  const nameSlug = name.toLowerCase().normalize("NFKD").replace(/\p{M}/gu, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 60);
  return [
    db.prepare(`INSERT INTO organizations(id,name,slug,organization_type,email,province,country,profile_status,created_at,updated_at)
      VALUES(?,?,?,'public_buyer',?,?,'Canada','draft',?,?)`)
      .bind(id, name, `${nameSlug || "public-buyer"}-${id.slice(0, 8)}`, email, buyer.province, now, now),
    db.prepare(`INSERT INTO organization_members(id,organization_id,user_id,role,created_at)
      VALUES(?,?,?,'owner',?)`).bind(randomUUID(), id, userId, now),
  ];
}

function reviewerJoin(db: D1Binding, buyer: Buyer, userId: string, nextOrg: string, mine: Organization | null, match: boolean, now: string) {
  const joinId = randomUUID();
  const writes = [
    db.prepare(`SELECT CASE WHEN EXISTS(SELECT 1 FROM buyer_pages p JOIN organizations o ON o.id=p.organization_id
      WHERE p.buyer_key=? AND p.organization_id=? AND o.status='active' AND o.organization_type='public_buyer'
      AND o.is_demo=0) THEN 1 ELSE json('buyer_claim_manager_changed') END`).bind(buyer.key, nextOrg),
    db.prepare(`INSERT INTO organization_join_requests(id,organization_id,user_id,match_reasons,created_at)
      VALUES(?,?,?,?,?) ON CONFLICT(organization_id,user_id) WHERE status='pending' DO NOTHING`)
      .bind(joinId, nextOrg, userId, JSON.stringify(match ? ["buyer_claim", "email_domain"] : ["buyer_claim"]), now),
    db.prepare(`INSERT INTO notifications(id,user_id,type,title,message,link_url)
      SELECT ${idSql},m.user_id,'join_request','Someone asked to join your buyer page',
        'Review the request from your dashboard.','/buyer-dashboard'
      FROM organization_members m JOIN users_profile u ON u.id=m.user_id
      JOIN organization_join_requests j ON j.organization_id=m.organization_id AND j.id=?
      WHERE m.role IN ('owner','admin') AND u.status='active'`).bind(joinId),
    db.prepare(`UPDATE users_profile SET onboarding_completed=0,updated_at=? WHERE id=?`).bind(now, userId),
  ];
  if (mine) {
    writes.push(db.prepare(`DELETE FROM organization_members WHERE organization_id=? AND user_id=?
      AND NOT EXISTS(SELECT 1 FROM buyer_pages p WHERE p.organization_id=?)`).bind(mine.id, userId, mine.id));
  }
  return writes;
}

export async function submitVpsBuyerClaim(
  { who, buyer, owners, now }: { who: ClaimantInput; buyer: ClaimableBuyer; owners: ReadonlyMap<string, ReadonlySet<string>>; now: string },
  db: D1Binding = vpsAppDatabase(),
): Promise<ClaimResult> {
  const [mine, manager, pending] = await db.batch([
    db.prepare(`SELECT o.id,o.organization_type,o.status,o.is_demo,p.buyer_key AS manages FROM organization_members m
      JOIN organizations o ON o.id=m.organization_id LEFT JOIN buyer_pages p ON p.organization_id=o.id
      WHERE m.user_id=? AND ${customerAppAuthority} ORDER BY m.created_at,m.id LIMIT 1`).bind(who.userId),
    db.prepare(`SELECT organization_id FROM buyer_pages WHERE buyer_key=? AND ${customerAppAuthority}`).bind(buyer.key),
    db.prepare(`SELECT id FROM buyer_claims WHERE buyer_key=? AND user_id=? AND status='pending' AND ${customerAppAuthority}`).bind(buyer.key, who.userId),
  ]);
  const myOrg = (mine.results[0] as Organization | undefined) ?? null;
  const managingId = (manager.results[0]?.organization_id as string | undefined) ?? null;
  const pendingId = (pending.results[0]?.id as string | undefined) ?? null;
  if (myOrg && (myOrg.organization_type !== "public_buyer" || myOrg.status !== "active" || myOrg.is_demo)) {
    return { status: "error", reason: "other_org" };
  }
  if (myOrg?.manages && myOrg.manages !== buyer.key) return { status: "error", reason: "already_managing" };
  if (myOrg?.manages === buyer.key) return { status: "verified", organizationId: myOrg.id, claimId: null };
  const decision = decideClaim({ email: who.email, emailConfirmed: who.emailConfirmed, buyer: buyer.holder, owners, managedBy: managingId });
  const joining = decision.kind === "join";
  const orgId = joining ? decision.organizationId : myOrg?.id ?? randomUUID();
  const id = pendingId ?? randomUUID();
  const status = joining ? "join_requested" : decision.kind;
  const reason = joining ? "managed" : decision.kind === "pending" ? decision.reason : "email_domain";
  const email = who.email.toLowerCase();
  const writes = [
    db.prepare(`SELECT CASE WHEN ${customerAppAuthority} AND ${activeBuyer}
      AND EXISTS(SELECT 1 FROM users_profile WHERE id=? AND lower(email)=? COLLATE NOCASE)
      AND (SELECT organization_id FROM organization_members WHERE user_id=? ORDER BY created_at,id LIMIT 1) IS ?
      AND NOT EXISTS(SELECT 1 FROM buyer_pages WHERE organization_id=?)
      AND (SELECT organization_id FROM buyer_pages WHERE buyer_key=?) IS ?
      AND (SELECT id FROM buyer_claims WHERE buyer_key=? AND user_id=? AND status='pending') IS ?
      THEN 1 ELSE json('buyer_claim_changed') END`)
      .bind(who.userId, who.userId, email, who.userId, myOrg?.id ?? null, myOrg?.id ?? null, buyer.key, managingId,
        buyer.key, who.userId, pendingId),
  ];
  if (joining) {
    writes.push(...reviewerJoin(db, buyer, who.userId, orgId, myOrg, decision.domainMatch, now));
  } else {
    if (myOrg) {
      writes.push(db.prepare("UPDATE organizations SET name=?,province=?,updated_at=? WHERE id=?")
        .bind(buyer.name, buyer.province, now, orgId));
    } else {
      writes.push(...newOrganization(db, orgId, buyer, who.userId, email, now));
    }
    if (decision.kind === "verified") {
      writes.push(db.prepare(`INSERT INTO buyer_pages(buyer_key,buyer_name,province_code,organization_id,verified_method,verified_domain,verified_at)
        VALUES(?,?,?,?,'email_domain',?,?)`).bind(buyer.key, buyer.name.slice(0, 200), buyer.provinceCode, orgId, decision.domain, now),
      db.prepare("UPDATE organizations SET verified=1,updated_at=? WHERE id=?").bind(now, orgId));
    }
    writes.push(db.prepare(`UPDATE users_profile SET onboarding_completed=1,full_name=coalesce(?,full_name),
      phone=coalesce(?,phone),updated_at=? WHERE id=?`).bind(who.fullName, who.phone, now, who.userId));
  }
  writes.push(db.prepare(`INSERT INTO buyer_claims(id,buyer_key,buyer_name,province_code,user_id,organization_id,email,email_domain,
    full_name,job_title,phone,note,status,method,reason,decided_at,updated_at,join_request_id)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,
      (SELECT id FROM organization_join_requests WHERE organization_id=? AND user_id=? AND status='pending' AND ?=1))
    ON CONFLICT(id) DO UPDATE SET buyer_name=excluded.buyer_name,organization_id=excluded.organization_id,
      email=excluded.email,email_domain=excluded.email_domain,full_name=excluded.full_name,job_title=excluded.job_title,
      phone=excluded.phone,note=excluded.note,status=excluded.status,method=excluded.method,reason=excluded.reason,
      decided_at=excluded.decided_at,updated_at=excluded.updated_at,join_request_id=excluded.join_request_id`)
    .bind(id, buyer.key, buyer.name.slice(0, 200), buyer.provinceCode, who.userId, orgId, email, registrableOf(email),
      who.fullName, who.jobTitle, who.phone, who.note, status, decision.kind === "verified" ? "email_domain" : null,
      reason, decision.kind === "pending" ? null : now, now, orgId, who.userId, Number(joining)),
  db.prepare(`INSERT INTO audit_logs(id,actor_user_id,action,entity_type,entity_id,metadata) VALUES(?,?,?,'buyer_claims',?,?)`)
    .bind(randomUUID(), who.userId, `buyer_claim.${status}`, id, JSON.stringify({ buyerKey: buyer.key, ...(decision.kind === "pending" ? { reason } : {}) })));
  await apply(db, writes);
  if (decision.kind === "pending") return { status: "pending", organizationId: orgId, claimId: id, reason: decision.reason };
  return { status: joining ? "join_requested" : "verified", organizationId: orgId, claimId: id };
}

type ReviewResult = DecideResult & { buyerKey?: string };
export async function decideVpsBuyerClaim(
  input: { claimId: string; adminId: string; approve: boolean; trustDomain: boolean; notes: string | null; now: string },
  db: D1Binding = vpsAppDatabase(),
): Promise<ReviewResult> {
  const { claimId, adminId, approve, trustDomain, notes, now } = input;
  const claim = await db.prepare(`SELECT id,buyer_key,buyer_name,province_code,user_id,organization_id,email,email_domain,status
    FROM buyer_claims WHERE id=? AND ${customerAppAuthority} AND ${activeRequestAdmin}`)
    .bind(claimId, adminId).first<ClaimRow>();
  if (!claim) return { ok: false, reason: "not_found" };
  if (claim.status !== "pending") return { ok: false, reason: "not_pending" };
  const buyer = { key: claim.buyer_key, name: claim.buyer_name, provinceCode: claim.province_code,
    province: PROVINCE_NAME[claim.province_code] ?? claim.province_code };
  const writes = [db.prepare(`SELECT CASE WHEN ${customerAppAuthority} AND ${activeRequestAdmin}
    AND EXISTS(SELECT 1 FROM buyer_claims WHERE id=? AND status='pending') THEN 1 ELSE json('buyer_claim_changed') END`)
    .bind(adminId, claimId)];
  let status: "verified" | "join_requested" | "rejected" = "rejected";
  let orgId = claim.organization_id;
  if (approve) {
    const [mine, managed] = await Promise.all([
      currentOrganization(db, claim.user_id),
      db.prepare("SELECT organization_id FROM buyer_pages WHERE buyer_key=?").bind(buyer.key).first<{ organization_id: string }>(),
    ]);
    if (mine && (mine.organization_type !== "public_buyer" || mine.status !== "active" || mine.is_demo ||
        (mine.manages && mine.manages !== buyer.key))) return { ok: false, reason: "failed" };
    writes.push(db.prepare(`SELECT CASE WHEN ${activeBuyer}
      AND (SELECT organization_id FROM organization_members WHERE user_id=? ORDER BY created_at,id LIMIT 1) IS ?
      AND (SELECT organization_id FROM buyer_pages WHERE buyer_key=?) IS ?
      THEN 1 ELSE json('buyer_claim_changed') END`)
      .bind(claim.user_id, claim.user_id, mine?.id ?? null, buyer.key, managed?.organization_id ?? null));
    if (managed && managed.organization_id !== mine?.id) {
      orgId = managed.organization_id;
      status = "join_requested";
      writes.push(...reviewerJoin(db, buyer, claim.user_id, orgId, mine, false, now));
    } else {
      status = "verified";
      orgId = mine?.id ?? randomUUID();
      if (!mine) writes.push(...newOrganization(db, orgId, buyer, claim.user_id, claim.email, now));
      const trusted = trustDomain && claim.email_domain && !isFreeMail(claim.email) ? claim.email_domain : null;
      if (!managed) writes.push(db.prepare(`INSERT INTO buyer_pages
        (buyer_key,buyer_name,province_code,organization_id,verified_method,verified_domain,verified_by,verified_at)
        VALUES(?,?,?,?,'admin',?,?,?)`).bind(buyer.key, buyer.name, buyer.provinceCode, orgId, trusted, adminId, now));
      writes.push(db.prepare(`UPDATE organizations SET verified=1,updated_at=? WHERE id=? AND ${verifiedBuyer}`)
        .bind(now, orgId, claim.user_id, orgId),
      db.prepare("UPDATE users_profile SET onboarding_completed=1,updated_at=? WHERE id=?").bind(now, claim.user_id));
      if (trusted) writes.push(db.prepare(`INSERT INTO buyer_domains(id,buyer_key,domain,added_by,note)
        VALUES(?,?,?,?,?) ON CONFLICT(buyer_key,domain) DO NOTHING`)
        .bind(randomUUID(), buyer.key, trusted, adminId, `Trusted when approving ${claim.email}`));
    }
  }
  writes.push(db.prepare(`UPDATE buyer_claims SET status=?,organization_id=?,method=?,decided_by=?,decided_at=?,updated_at=?,admin_notes=?,
    reason=CASE WHEN ?=1 THEN 'managed' ELSE reason END,
    join_request_id=(SELECT id FROM organization_join_requests WHERE organization_id=? AND user_id=? AND status='pending' AND ?=1)
    WHERE id=?`).bind(status, orgId, status === "verified" ? "admin" : null, adminId, now, now, notes,
    Number(status === "join_requested"), orgId, claim.user_id, Number(status === "join_requested"), claimId),
  db.prepare(`INSERT INTO audit_logs(id,actor_user_id,action,entity_type,entity_id,metadata) VALUES(?,?,?,'buyer_claims',?,?)`)
    .bind(randomUUID(), adminId, `buyer_claim.admin_${approve ? "approve" : "reject"}`, claimId,
      JSON.stringify({ result: status, trustDomain, buyerKey: buyer.key })));
  await apply(db, writes);
  return { ok: true, status, buyerKey: buyer.key };
}
