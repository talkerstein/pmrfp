/**
 * "Claim this page free": the claim itself and the admin's decision.
 * Every function takes the (service) client, so tests pass a fake
 * (test/unit/towns-claims.test.ts). In-app only: no emails.
 *
 * One public-buyer organization per page. The first verified claimant's
 * organization manages the page (buyer_pages, primary key = page). Anyone
 * claiming a page that already has one becomes a join request to that
 * organization (organization_join_requests, from the dedupe work): its
 * owner, or a PMRFP admin, approves them. A person belongs to one
 * organization, so an unverified organization of their own is removed when
 * their claim turns into a join request.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { createJoinRequest } from "@/lib/dedupe/join";
import { isMissingRelation } from "@/lib/dedupe/review";
import { decideClaim, isFreeMail, registrableOf, type PendingReason } from "./domains";
import type { ClaimableBuyer } from "./claimable";

type Db = Pick<SupabaseClient, "from">;

export interface ClaimantInput {
  userId: string;
  email: string;
  emailConfirmed: boolean;
  fullName: string | null;
  jobTitle: string | null;
  phone: string | null;
  note: string | null;
}

export type ClaimResult =
  | { status: "verified"; organizationId: string; claimId: string | null }
  | { status: "pending"; organizationId: string; claimId: string | null; reason: PendingReason }
  | { status: "join_requested"; organizationId: string; claimId: string | null }
  | { status: "error"; reason: "missing_table" | "other_org" | "already_managing" | "failed" };

const PROVINCE_NAME: Record<string, string> = {
  ON: "Ontario", BC: "British Columbia", AB: "Alberta", NS: "Nova Scotia", MB: "Manitoba", SK: "Saskatchewan", QC: "Quebec",
  NB: "New Brunswick", PE: "Prince Edward Island", NL: "Newfoundland and Labrador", YT: "Yukon", NT: "Northwest Territories", NU: "Nunavut",
};

const orgSlug = (name: string) =>
  `${name.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 60) || "public-buyer"}-${Math.random().toString(36).slice(2, 6)}`;

interface MyOrg {
  id: string;
  type: string;
  /** The page this organization manages, if any. */
  managesKey: string | null;
  members: number;
}

/** The claimant's own organization (a person has at most one). */
async function myOrganization(db: Db, userId: string): Promise<MyOrg | null> {
  const { data: m } = await db.from("organization_members").select("organization_id").eq("user_id", userId).limit(1).maybeSingle<{ organization_id: string }>();
  if (!m) return null;
  const [{ data: org }, { data: page }, { data: members }] = await Promise.all([
    db.from("organizations").select("id,organization_type").eq("id", m.organization_id).maybeSingle<{ id: string; organization_type: string }>(),
    db.from("buyer_pages").select("buyer_key").eq("organization_id", m.organization_id).maybeSingle<{ buyer_key: string }>(),
    db.from("organization_members").select("user_id").eq("organization_id", m.organization_id),
  ]);
  if (!org) return null;
  return { id: org.id, type: org.organization_type, managesKey: page?.buyer_key ?? null, members: (members ?? []).length };
}

/** Leave an unverified public-buyer organization of one's own (deleted when nobody else is in it). */
async function leaveOwnPendingOrg(db: Db, org: MyOrg, userId: string): Promise<void> {
  if (org.type !== "public_buyer" || org.managesKey) return;
  await db.from("organization_members").delete().eq("organization_id", org.id).eq("user_id", userId);
  if (org.members <= 1) await db.from("organizations").delete().eq("id", org.id);
}

async function managingOrg(db: Db, key: string): Promise<{ organizationId: string | null; missing: boolean }> {
  const { data, error } = await db.from("buyer_pages").select("organization_id").eq("buyer_key", key).maybeSingle<{ organization_id: string }>();
  if (error && isMissingRelation(error)) return { organizationId: null, missing: true };
  return { organizationId: data?.organization_id ?? null, missing: false };
}

function claimRow(buyer: ClaimableBuyer, who: ClaimantInput, fields: Record<string, unknown>) {
  return {
    buyer_key: buyer.key,
    buyer_name: buyer.name.slice(0, 200),
    province_code: buyer.provinceCode,
    user_id: who.userId,
    email: who.email.toLowerCase().slice(0, 254),
    email_domain: registrableOf(who.email),
    full_name: who.fullName,
    job_title: who.jobTitle,
    phone: who.phone,
    note: who.note,
    ...fields,
  };
}

/** Turn a claim into a join request to the organization that manages the page. */
async function joinInstead(db: Db, buyer: ClaimableBuyer, who: ClaimantInput, organizationId: string, domainMatch: boolean, now: string, mine: MyOrg | null, claimId: string | null): Promise<ClaimResult> {
  if (mine?.id === organizationId) return { status: "verified", organizationId, claimId };
  if (mine) await leaveOwnPendingOrg(db, mine, who.userId);
  const join = await createJoinRequest(db as SupabaseClient, { organizationId, userId: who.userId, reasons: ["buyer_claim", ...(domainMatch ? ["email_domain"] : [])] });
  if (!join.ok && join.reason !== "already_pending") return { status: "error", reason: join.reason === "missing_table" ? "missing_table" : "failed" };
  const fields = { status: "join_requested", reason: "managed", join_request_id: join.ok ? join.id : null, organization_id: organizationId, decided_at: now, updated_at: now };
  let id = claimId;
  if (id) await db.from("buyer_claims").update(fields).eq("id", id);
  else {
    const { data } = await db.from("buyer_claims").insert(claimRow(buyer, who, fields)).select("id").single<{ id: string }>();
    id = data?.id ?? null;
  }
  // Onboarding shows "Request sent" until the organization (or PMRFP) approves.
  await db.from("users_profile").update({ onboarding_completed: false }).eq("id", who.userId);
  return { status: "join_requested", organizationId, claimId: id };
}

/**
 * The claim (onboarding, or the dashboard after a rejection). Verified on
 * the spot by email domain (lib/towns/domains), else waits for an admin,
 * else becomes a join request when the page already has an organization.
 */
export async function submitBuyerClaim(
  db: Db,
  input: { who: ClaimantInput; buyer: ClaimableBuyer; owners: ReadonlyMap<string, ReadonlySet<string>>; now: string },
): Promise<ClaimResult> {
  const { who, buyer, now } = input;
  const managed = await managingOrg(db, buyer.key);
  if (managed.missing) return { status: "error", reason: "missing_table" };
  const mine = await myOrganization(db, who.userId);
  if (mine && mine.type !== "public_buyer") return { status: "error", reason: "other_org" };
  if (mine?.managesKey && mine.managesKey !== buyer.key) return { status: "error", reason: "already_managing" };
  if (mine?.managesKey === buyer.key) return { status: "verified", organizationId: mine.id, claimId: null };

  const decision = decideClaim({ email: who.email, emailConfirmed: who.emailConfirmed, buyer: buyer.holder, owners: input.owners, managedBy: managed.organizationId });
  if (decision.kind === "join") return joinInstead(db, buyer, who, decision.organizationId, decision.domainMatch, now, mine, null);

  // Their own public-buyer organization: reuse the unverified one, else create it.
  let orgId = mine?.id ?? null;
  if (orgId) {
    await db.from("organizations").update({ name: buyer.name, province: PROVINCE_NAME[buyer.provinceCode] ?? null }).eq("id", orgId);
  } else {
    const { data: org, error } = await db
      .from("organizations")
      .insert({
        name: buyer.name,
        slug: orgSlug(buyer.name),
        organization_type: "public_buyer",
        email: who.email.toLowerCase(),
        province: PROVINCE_NAME[buyer.provinceCode] ?? null,
        country: "Canada",
        // Never listed in the trade directory: public buyers have their page under /buyers.
        profile_status: "draft",
      })
      .select("id")
      .single<{ id: string }>();
    if (error || !org) return { status: "error", reason: "failed" };
    orgId = org.id;
    await db.from("organization_members").insert({ organization_id: orgId, user_id: who.userId, role: "owner" });
  }

  let status: "verified" | "pending" = decision.kind;
  if (decision.kind === "verified") {
    const { error } = await db.from("buyer_pages").insert({
      buyer_key: buyer.key,
      province_code: buyer.provinceCode,
      buyer_name: buyer.name.slice(0, 200),
      organization_id: orgId,
      verified_method: "email_domain",
      verified_domain: decision.domain,
      verified_at: now,
    });
    if (error?.code === "23505") {
      // Someone verified the same page a moment ago: join them instead.
      const winner = await managingOrg(db, buyer.key);
      if (winner.organizationId && winner.organizationId !== orgId) {
        return joinInstead(db, buyer, who, winner.organizationId, true, now, { id: orgId, type: "public_buyer", managesKey: null, members: 1 }, null);
      }
    } else if (error) return { status: "error", reason: "failed" };
    await db.from("organizations").update({ verified: true }).eq("id", orgId);
  }
  if (decision.kind === "pending") status = "pending";

  const fields = {
    organization_id: orgId,
    status,
    method: status === "verified" ? "email_domain" : null,
    reason: decision.kind === "pending" ? decision.reason : "email_domain",
    decided_at: status === "verified" ? now : null,
    updated_at: now,
  };
  // One open claim per person per page: update it rather than file a second.
  const { data: open } = await db.from("buyer_claims").select("id").eq("buyer_key", buyer.key).eq("user_id", who.userId).eq("status", "pending").maybeSingle<{ id: string }>();
  let claimId: string | null = open?.id ?? null;
  if (claimId) await db.from("buyer_claims").update(claimRow(buyer, who, fields)).eq("id", claimId);
  else {
    const { data } = await db.from("buyer_claims").insert(claimRow(buyer, who, fields)).select("id").single<{ id: string }>();
    claimId = data?.id ?? null;
  }
  await db
    .from("users_profile")
    .update({ onboarding_completed: true, ...(who.fullName ? { full_name: who.fullName } : {}), ...(who.phone ? { phone: who.phone } : {}) })
    .eq("id", who.userId);
  return decision.kind === "pending"
    ? { status: "pending", organizationId: orgId, claimId, reason: decision.reason }
    : { status: "verified", organizationId: orgId, claimId };
}

interface ClaimRow {
  id: string;
  buyer_key: string;
  buyer_name: string;
  province_code: string;
  user_id: string;
  organization_id: string | null;
  email: string;
  email_domain: string | null;
  full_name: string | null;
  job_title: string | null;
  phone: string | null;
  note: string | null;
  status: string;
}

export type DecideResult =
  | { ok: true; status: "verified" | "rejected" | "join_requested" }
  | { ok: false; reason: "not_found" | "not_pending" | "failed" };

/**
 * Admin: approve or reject a waiting claim (/admin/buyer-sources).
 * Approving a page that someone else already manages turns the claim into a
 * join request instead (one organization per page). `trustDomain` also
 * trusts the claimant's email domain for this buyer, so the next clerk from
 * there is verified on the spot (never a free mailbox).
 */
export async function decideBuyerClaim(
  db: Db,
  input: { claimId: string; adminId: string; approve: boolean; trustDomain: boolean; notes: string | null; now: string },
): Promise<DecideResult> {
  const { data: claim } = await db
    .from("buyer_claims")
    .select("id,buyer_key,buyer_name,province_code,user_id,organization_id,email,email_domain,full_name,job_title,phone,note,status")
    .eq("id", input.claimId)
    .maybeSingle<ClaimRow>();
  if (!claim) return { ok: false, reason: "not_found" };
  if (claim.status !== "pending") return { ok: false, reason: "not_pending" };
  const decided = { decided_by: input.adminId, decided_at: input.now, updated_at: input.now, admin_notes: input.notes };

  if (!input.approve) {
    await db.from("buyer_claims").update({ status: "rejected", ...decided }).eq("id", claim.id);
    return { ok: true, status: "rejected" };
  }

  const [provinceSlug, slug] = claim.buyer_key.split("/");
  const buyer: ClaimableBuyer = {
    key: claim.buyer_key,
    provinceSlug,
    slug,
    path: `/buyers/${claim.buyer_key}`,
    name: claim.buyer_name,
    provinceCode: claim.province_code,
    province: PROVINCE_NAME[claim.province_code] ?? claim.province_code,
    holder: { identity: claim.buyer_key, website: null, domains: [] },
  };
  const who: ClaimantInput = {
    userId: claim.user_id,
    email: claim.email,
    emailConfirmed: true,
    fullName: claim.full_name,
    jobTitle: claim.job_title,
    phone: claim.phone,
    note: claim.note,
  };

  const managed = await managingOrg(db, claim.buyer_key);
  const mine = await myOrganization(db, claim.user_id);
  if (managed.organizationId && managed.organizationId !== claim.organization_id) {
    const r = await joinInstead(db, buyer, who, managed.organizationId, false, input.now, mine, claim.id);
    if (r.status === "error") return { ok: false, reason: "failed" };
    await db.from("buyer_claims").update(decided).eq("id", claim.id);
    return { ok: true, status: "join_requested" };
  }

  let orgId = claim.organization_id ?? (mine?.type === "public_buyer" ? mine.id : null);
  if (!orgId) {
    const { data: org } = await db
      .from("organizations")
      .insert({ name: claim.buyer_name, slug: orgSlug(claim.buyer_name), organization_type: "public_buyer", email: claim.email, province: buyer.province, country: "Canada", profile_status: "draft" })
      .select("id")
      .single<{ id: string }>();
    if (!org) return { ok: false, reason: "failed" };
    orgId = org.id;
    await db.from("organization_members").insert({ organization_id: orgId, user_id: claim.user_id, role: "owner" });
  }
  const trusted = input.trustDomain && claim.email_domain && !isFreeMail(claim.email) ? claim.email_domain : null;
  if (!managed.organizationId) {
    const { error } = await db.from("buyer_pages").insert({
      buyer_key: claim.buyer_key,
      province_code: claim.province_code,
      buyer_name: claim.buyer_name,
      organization_id: orgId,
      verified_method: "admin",
      verified_domain: trusted,
      verified_by: input.adminId,
      verified_at: input.now,
    });
    if (error) return { ok: false, reason: "failed" };
  }
  await db.from("organizations").update({ verified: true }).eq("id", orgId);
  await db.from("buyer_claims").update({ status: "verified", method: "admin", organization_id: orgId, ...decided }).eq("id", claim.id);
  await db.from("users_profile").update({ onboarding_completed: true }).eq("id", claim.user_id);
  if (trusted) {
    await db.from("buyer_domains").upsert({ buyer_key: claim.buyer_key, domain: trusted, added_by: input.adminId, note: `Trusted when approving ${claim.email}` }, { onConflict: "buyer_key,domain", ignoreDuplicates: true });
  }
  return { ok: true, status: "verified" };
}
