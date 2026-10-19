/**
 * Data for /admin/duplicates: suspected duplicate accounts and companies
 * (computed on read from users_profile / organizations), minus pairs an
 * admin already dismissed, merged or disabled (duplicate_reviews), plus the
 * join-request queue. Read-only. Works before migration 20261019000001:
 * decisions and join requests are just empty then (`ready` says so).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { findAccountDuplicates, type AccountFacts, type AccountPair } from "./people";
import { findCompanyDuplicates, type CompanyCandidate, type CompanyPair } from "./company";
import { isMissingRelation, pairKey, type ReviewRow } from "./review";

function logUnexpected(label: string, error: { code?: string; message: string } | null) {
  if (error && !isMissingRelation(error)) console.error(`[dedupe:admin] ${label}`, error.message);
}
import { normalizeEmail } from "./email";

export interface DuplicatesData {
  accounts: (AccountPair & { normalizedEmail: string; flagged: ReviewRow | null })[];
  companies: (CompanyPair & { flagged: ReviewRow | null })[];
  joinRequests: {
    id: string;
    created_at: string;
    company: { id: string; name: string; slug: string } | null;
    requester: { id: string; name: string | null; email: string } | null;
    hasApprover: boolean;
  }[];
  /** False when duplicate_reviews / organization_join_requests aren't there yet. */
  ready: { reviews: boolean; joins: boolean };
  /** Decisions already made (for the "resolved" count). */
  resolved: number;
}

interface ProfileRow {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  created_at: string;
  status: string;
}

interface MemberRow {
  user_id: string;
  organization_id: string;
  role: string;
}

export async function loadDuplicates(db: SupabaseClient): Promise<DuplicatesData> {
  const [users, members, orgs, reviews, joins] = await Promise.all([
    db.from("users_profile").select("id,email,full_name,phone,created_at,status").order("created_at", { ascending: false }).limit(5000),
    db.from("organization_members").select("user_id,organization_id,role").limit(20000),
    db
      .from("organizations")
      .select("id,slug,name,website,phone,email,city,province,organization_type,profile_status,status,created_at,is_demo")
      .neq("status", "deleted")
      .limit(10000),
    db.from("duplicate_reviews").select("kind,a_id,b_id,status,source,reasons,note,created_at").limit(5000),
    db
      .from("organization_join_requests")
      .select("id,created_at,organization_id,user_id")
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(200),
  ]);

  logUnexpected("reviews", reviews.error);
  logUnexpected("join requests", joins.error);
  const orgRows = ((orgs.data ?? []) as (CompanyCandidate & { is_demo?: boolean })[]).filter((o) => !o.is_demo);
  const orgById = new Map(orgRows.map((o) => [o.id, o]));
  const memberRows = (members.data ?? []) as MemberRow[];
  const orgsOfUser = new Map<string, CompanyCandidate[]>();
  for (const m of memberRows) {
    const o = orgById.get(m.organization_id);
    if (!o) continue;
    orgsOfUser.set(m.user_id, [...(orgsOfUser.get(m.user_id) ?? []), o]);
  }

  const profiles = (users.data ?? []) as ProfileRow[];
  const facts: AccountFacts[] = profiles.map((u) => ({
    ...u,
    cities: (orgsOfUser.get(u.id) ?? []).map((o) => o.city ?? "").filter(Boolean),
    orgPhones: (orgsOfUser.get(u.id) ?? []).map((o) => o.phone ?? "").filter(Boolean),
  }));

  const reviewRows = reviews.error ? [] : ((reviews.data ?? []) as ReviewRow[]);
  const byKey = new Map(reviewRows.map((r) => [`${r.kind}:${pairKey(r.a_id, r.b_id)}`, r]));
  const closed = (kind: string, key: string) => {
    const r = byKey.get(`${kind}:${key}`);
    return r && r.status !== "open" ? r : null;
  };

  const accounts = findAccountDuplicates(facts)
    .filter((p) => !closed("account", p.key))
    .map((p) => ({ ...p, normalizedEmail: normalizeEmail(p.b.email), flagged: byKey.get(`account:${p.key}`) ?? null }));

  // Company pairs: computed ones, plus any pair a new member flagged as "different" that scoring no longer finds.
  const computed = findCompanyDuplicates(orgRows);
  const seen = new Set(computed.map((p) => p.key));
  for (const r of reviewRows) {
    if (r.kind !== "company" || r.status !== "open") continue;
    const key = pairKey(r.a_id, r.b_id);
    const a = orgById.get(r.a_id);
    const b = orgById.get(r.b_id);
    if (seen.has(key) || !a || !b) continue;
    const [older, newer] = String(a.created_at ?? "") <= String(b.created_at ?? "") ? [a, b] : [b, a];
    computed.push({ key, a: older, b: newer, score: 0, reasons: [] });
    seen.add(key);
  }
  const companies = computed
    .filter((p) => !closed("company", p.key))
    .map((p) => ({ ...p, flagged: byKey.get(`company:${p.key}`) ?? null }));

  const approverOrgs = new Set(memberRows.filter((m) => m.role === "owner" || m.role === "admin").map((m) => m.organization_id));
  const profileById = new Map(profiles.map((u) => [u.id, u]));
  const joinRows = joins.error ? [] : ((joins.data ?? []) as { id: string; created_at: string; organization_id: string; user_id: string }[]);
  const joinRequests = joinRows.map((j) => {
    const o = orgById.get(j.organization_id);
    const u = profileById.get(j.user_id);
    return {
      id: j.id,
      created_at: j.created_at,
      company: o ? { id: o.id, name: o.name, slug: o.slug } : null,
      requester: u ? { id: u.id, name: u.full_name, email: u.email } : null,
      hasApprover: approverOrgs.has(j.organization_id),
    };
  });
  // Companies nobody can approve for first: those are the admin's job.
  joinRequests.sort((x, y) => Number(x.hasApprover) - Number(y.hasApprover) || x.created_at.localeCompare(y.created_at));

  return {
    accounts,
    companies,
    joinRequests,
    ready: { reviews: !reviews.error, joins: !joins.error },
    resolved: reviewRows.filter((r) => r.status !== "open").length,
  };
}
