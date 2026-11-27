import { D1ApiError, UUID, type D1Binding } from "../../src/lib/d1/contracts";
import { intelEntitled, type IntelAccessRow } from "../../src/lib/entitlement/intel";
import { isProEntitled, NO_TRIAL, trialState } from "../../src/lib/entitlement/trial";
import type { SessionContext } from "../../src/lib/access/access";
import type { Organization, UserProfile } from "../../src/types/db";

const orgFlags = [
  "emergency_service", "verified", "featured", "is_demo", "link_trusted", "link_paid",
  "link_badge", "risk_flagged", "email_domain_verified", "profile_indexable",
] as const;
type OrgFlag = typeof orgFlags[number];
type ProfileRow = Omit<UserProfile, "onboarding_completed"> & { onboarding_completed: 0 | 1 };
type OrgRow = Omit<Organization, OrgFlag | "review_changes"> &
  Record<OrgFlag, 0 | 1> & { review_changes: string | null };
type MemberRow = OrgRow & {
  subscription_status: string | null;
  subscription_tier: string | null;
  trial_start: string | null;
  trial_end: string | null;
  intel_status: string | null;
  intel_expires: string | null;
};

function decodeOrganization(row: MemberRow): Organization {
  const {
    subscription_status, subscription_tier, trial_start, trial_end, intel_status, intel_expires,
    review_changes, ...organization
  } = row;
  const flags = Object.fromEntries(orgFlags.map(key => [key, organization[key] === 1])) as Record<OrgFlag, boolean>;
  return {
    ...organization, ...flags,
    review_changes: review_changes === null ? null : JSON.parse(review_changes),
  };
}

/** The caller supplies an identity from a verified Auth session, never from request input. */
export async function readCustomerSession(
  db: D1Binding, userId: string, now = new Date(),
): Promise<SessionContext> {
  if (!UUID.test(userId)) throw new D1ApiError(401, "sign_in_required");
  const [profiles, memberships] = await db.batch([
    db.prepare(`SELECT id, email, full_name, phone, avatar_url, primary_role,
      onboarding_completed, status, created_at, updated_at
      FROM users_profile WHERE id = ?`).bind(userId),
    db.prepare(`SELECT o.id, o.name, o.slug, o.organization_type, o.website, o.phone, o.email, o.logo_url,
      o.address_line_1, o.address_line_2, o.city, o.province, o.postal_code, o.country,
      o.short_description, o.full_description, o.years_in_business, o.employee_count_range,
      o.insurance_status, o.wsib_status, o.emergency_service, o.verified, o.featured, o.is_demo,
      o.profile_status, o.profile_completion_score, o.public_contact_visibility, o.status,
      o.approved_at, o.review_flagged_at, o.review_changes, o.link_trusted, o.link_paid, o.link_badge,
      o.link_earned_at, o.risk_flagged, o.email_domain_verified, o.profile_indexable, o.created_at, o.updated_at,
      s.status AS subscription_status, s.tier AS subscription_tier,
      t.started_at AS trial_start, t.ends_at AS trial_end, i.status AS intel_status, i.expires_at AS intel_expires
      FROM organization_members m
      JOIN organizations o ON o.id = m.organization_id
      LEFT JOIN subscriptions s ON s.organization_id = o.id
      LEFT JOIN trade_trials t ON t.organization_id = o.id
      LEFT JOIN intel_access i ON i.organization_id = o.id
      WHERE m.user_id = ? AND o.merged_into IS NULL LIMIT 2`).bind(userId),
  ]);
  if (!profiles?.success || !memberships?.success) throw new D1ApiError(503, "authorization_unavailable");
  const profile = profiles.results[0] as unknown as ProfileRow | undefined;
  if (!profile || profile.id !== userId) throw new D1ApiError(409, "profile_not_synced");
  if (profile.status !== "active") throw new D1ApiError(403, "account_inactive");

  // Production's session reader requires an unambiguous membership. Never
  // select an arbitrary company when a customer belongs to multiple companies.
  const member = memberships.results.length === 1 ? memberships.results[0] as unknown as MemberRow : null;
  const organization = member ? decodeOrganization(member) : null;
  const tradeOrg = member?.status === "active" &&
    (member.organization_type === "trade_company" || member.organization_type === "supplier");
  const paid = tradeOrg && (member.subscription_status === "active" || member.subscription_status === "comped") &&
    (member.subscription_tier === "pro" || member.subscription_tier === "featured");
  const trial = tradeOrg && member.organization_type === "trade_company" && member.trial_start && member.trial_end
    ? trialState({ startedAt: member.trial_start, endsAt: member.trial_end }, now) : NO_TRIAL;
  const intel: IntelAccessRow | null = member?.status === "active" && member.intel_status &&
    (member.intel_expires === null || Number.isFinite(Date.parse(member.intel_expires)))
    ? { status: member.intel_status, expires_at: member.intel_expires } : null;
  return {
    userId,
    profile: { ...profile, onboarding_completed: profile.onboarding_completed === 1 },
    organization,
    paid,
    trial,
    hasTradeAccess: isProEntitled({ paid, trial }),
    hasIntelAccess: intelEntitled({
      admin: profile.primary_role === "admin" || profile.primary_role === "super_admin",
      organizationStatus: organization?.status, row: intel, now,
    }),
  };
}
