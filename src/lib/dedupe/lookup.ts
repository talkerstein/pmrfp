/**
 * Database lookups for duplicate checks. Every function takes the client,
 * so tests pass a fake; callers pass the service client (users_profile and
 * organizations are RLS-protected). They fail open: a lookup error never
 * blocks a sign-up or an onboarding, it just finds nothing.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { emailLookupPatterns, escapeLike, sameMailbox } from "./email";
import {
  companyEmailDomain,
  nameSearchToken,
  phoneLikePattern,
  rankCompanyMatches,
  websiteDomain,
  type CompanyCandidate,
  type CompanyFacts,
  type CompanyMatch,
} from "./company";

export interface ExistingAccount {
  id: string;
  email: string;
}

/**
 * The account that already owns this mailbox (same normalized email), or
 * null. `excludeId` skips the caller's own row (a just-created Google user).
 */
export async function findAccountByEmail(db: SupabaseClient, email: string, excludeId?: string): Promise<ExistingAccount | null> {
  for (const pattern of emailLookupPatterns(email)) {
    const { data, error } = await db.from("users_profile").select("id,email").ilike("email", pattern).limit(50);
    if (error) {
      console.error("[dedupe:email]", error.message);
      return null;
    }
    const hit = ((data ?? []) as ExistingAccount[]).find((r) => r.id !== excludeId && sameMailbox(r.email, email));
    if (hit) return hit;
  }
  return null;
}

const CANDIDATE_COLUMNS = "id,slug,name,website,phone,email,city,province,organization_type,profile_status,created_at,status,is_demo";

/**
 * Existing listings that look like the company being created, best first.
 * A few cheap ILIKE prefilters (name word, website domain, phone digits,
 * company email domain), then scored in code.
 */
export async function findCompanyMatches(db: SupabaseClient, input: CompanyFacts, limit = 3): Promise<CompanyMatch[]> {
  const queries: PromiseLike<{ data: unknown; error: { message: string } | null }>[] = [];
  const like = (column: string, pattern: string) =>
    db.from("organizations").select(CANDIDATE_COLUMNS).neq("status", "deleted").ilike(column, pattern).limit(25);
  const token = nameSearchToken(input.name);
  if (token) queries.push(like("name", `%${escapeLike(token)}%`));
  const domain = websiteDomain(input.website);
  if (domain) queries.push(like("website", `%${escapeLike(domain)}%`));
  const phone = phoneLikePattern(input.phone);
  if (phone) queries.push(like("phone", phone));
  const mailDomain = companyEmailDomain(input.email);
  if (mailDomain) {
    queries.push(like("email", `%@${escapeLike(mailDomain)}`));
    queries.push(like("website", `%${escapeLike(mailDomain)}%`));
  }
  if (!queries.length) return [];
  const results = await Promise.all(queries);
  const rows: (CompanyCandidate & { is_demo?: boolean })[] = [];
  for (const r of results) {
    if (r.error) {
      console.error("[dedupe:company]", r.error.message);
      continue;
    }
    rows.push(...((r.data ?? []) as (CompanyCandidate & { is_demo?: boolean })[]));
  }
  return rankCompanyMatches(input, rows.filter((r) => !r.is_demo), limit);
}
