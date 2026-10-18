import { redirect } from "next/navigation";
import { localizePath } from "@/i18n/config";
import { getLang } from "@/i18n/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import type { Organization, UserProfile, UserRole } from "@/types/db";
import { NO_TRIAL, isMissingTableError, isProEntitled, trialState, type TrialState } from "@/lib/entitlement/trial";
import { intelEntitled, type IntelAccessRow } from "@/lib/entitlement/intel";
import { VISITOR_UPGRADE_PATH } from "@/lib/auth/visitor-upgrade";

export interface SessionContext {
  userId: string;
  profile: UserProfile;
  organization: Organization | null;
  /** Trade Pro right now: paying, or a 14-day trial that hasn't ended. */
  hasTradeAccess: boolean;
  /** Paying for Trade Pro (or Featured). False during a trial. */
  paid?: boolean;
  /** The organization's trial, if it ever started one (lib/entitlement/trial). */
  trial?: TrialState;
  /** Award Intelligence (lib/entitlement/intel): its own paid add-on, separate from Trade Pro. */
  hasIntelAccess?: boolean;
}

/** The authenticated auth user id, or null (also null in demo mode). */
export async function getSessionUserId(): Promise<string | null> {
  if (!isSupabaseConfigured()) return null;
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

/** Full session context (profile + org + access) for the current user, or null. */
export async function getSession(): Promise<SessionContext | null> {
  if (!isSupabaseConfigured()) return null;
  return loadSessionContext(await createClient());
}

/**
 * Session context for whoever `supabase` is signed in as. Every read goes
 * through that client, so RLS sees the same user. Pass `accessToken` when
 * the client carries a bearer token (the mobile app) rather than cookies:
 * getUser(token) checks it with Supabase Auth, so an expired or revoked
 * token gets null.
 */
export async function loadSessionContext(
  supabase: SupabaseClient,
  accessToken?: string,
): Promise<SessionContext | null> {
  const { data: auth } = await supabase.auth.getUser(accessToken);
  const user = auth.user;
  if (!user) return null;

  const { data: profile } = await supabase
    .from("users_profile")
    .select("*")
    .eq("id", user.id)
    .maybeSingle<UserProfile>();
  if (!profile) {
    return { userId: user.id, profile: fallbackProfile(user.id, user.email), organization: null, hasTradeAccess: false, paid: false, trial: NO_TRIAL, hasIntelAccess: false };
  }

  const { data: membership } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", user.id)
    .maybeSingle<{ organization_id: string }>();

  let organization: Organization | null = null;
  if (membership?.organization_id) {
    const { data: org } = await supabase
      .from("organizations")
      .select("*")
      .eq("id", membership.organization_id)
      .maybeSingle<Organization>();
    organization = org ?? null;
  }

  const admin = isAdminRole(profile.primary_role);
  const [{ paid, trial }, intelRow] = await Promise.all([
    computeTradeAccess(supabase, organization),
    admin || !organization ? Promise.resolve(null) : readIntelAccess(supabase, organization.id),
  ]);
  const hasIntelAccess = intelEntitled({ admin, organizationStatus: organization?.status, row: intelRow });
  return { userId: user.id, profile, organization, hasTradeAccess: isProEntitled({ paid, trial }), paid, trial, hasIntelAccess };
}

/**
 * The organization's Award Intelligence row, read as the member (RLS).
 * A missing table (migration 20261017000001 not applied) or any error = no Intel.
 */
async function readIntelAccess(supabase: SupabaseClient, organizationId: string): Promise<IntelAccessRow | null> {
  const { data, error } = await supabase
    .from("intel_access")
    .select("status,expires_at")
    .eq("organization_id", organizationId)
    .maybeSingle<IntelAccessRow>();
  if (error) {
    if (!isMissingTableError(error)) console.warn("[access] intel read failed", error.message);
    return null;
  }
  return data ?? null;
}

/**
 * Mirror of the SQL has_active_trade_access(): active|comped sub, tier
 * pro/featured, org not suspended — OR (trade companies) a 14-day trial that
 * hasn't ended (trade_trials, migration 20261016000001). This is THE Trade
 * Pro check: gates read session.hasTradeAccess, never their own query.
 *
 * The tier check matters as much as the status check: the SEO Listing tier
 * (retired, still honoured for grandfathered subscribers) is directory-only,
 * so an active SEO subscription
 * must NOT satisfy this — otherwise the cheapest paid tier would silently
 * unlock the RFP dashboard this function gates (dashboard/rfps, rfp-interest,
 * save-rfp). Keep this in lockstep with the SQL function of the same name.
 */
async function computeTradeAccess(
  supabase: SupabaseClient,
  organization: Organization | null,
): Promise<{ paid: boolean; trial: TrialState }> {
  const none = { paid: false, trial: NO_TRIAL };
  if (!organization) return none;
  if (organization.organization_type !== "trade_company" && organization.organization_type !== "supplier") return none;
  if (organization.status === "suspended") return none;
  const [paid, trial] = await Promise.all([
    paidTradeAccess(supabase, organization),
    organization.organization_type === "trade_company" ? readTrial(supabase, organization.id) : Promise.resolve(NO_TRIAL),
  ]);
  return { paid, trial };
}

/** The organization's trial, read as the member (RLS). A missing table or any error = no trial. */
async function readTrial(supabase: SupabaseClient, organizationId: string): Promise<TrialState> {
  const { data, error } = await supabase
    .from("trade_trials")
    .select("started_at,ends_at")
    .eq("organization_id", organizationId)
    .maybeSingle<{ started_at: string; ends_at: string }>();
  if (error) {
    if (!isMissingTableError(error)) console.warn("[access] trial read failed", error.message);
    return NO_TRIAL;
  }
  return data ? trialState({ startedAt: data.started_at, endsAt: data.ends_at }) : NO_TRIAL;
}

async function paidTradeAccess(supabase: SupabaseClient, organization: Organization): Promise<boolean> {
  const { data, error } = await supabase
    .from("subscriptions")
    .select("status,tier")
    .eq("organization_id", organization.id)
    .maybeSingle<{ status: string; tier: string }>();
  let sub = data;
  if (error) {
    // subscriptions.tier ships with migration 20260819000001. Until it is
    // applied, that select errors, and treating the error as "no
    // subscription" would lock EVERY paying member out of the RFP board.
    // Pre-migration every subscription is Pro-equivalent (the SEO tier cannot
    // be sold before the column exists — see the checkout guard), so fall
    // back to status alone.
    const legacy = await supabase
      .from("subscriptions")
      .select("status")
      .eq("organization_id", organization.id)
      .maybeSingle<{ status: string }>();
    sub = legacy.data ? { status: legacy.data.status, tier: "pro" } : null;
  }
  return tierGrantsTradeAccess(sub);
}

/** active or comped: the statuses that count as a live paid plan. */
export function isPaidStatus(status: string | null | undefined): boolean {
  return status === "active" || status === "comped";
}

/**
 * Pure core of paidTradeAccess: a live pro/featured subscription. A
 * grandfathered SEO Listing row (tier "seo") is a live paid plan for the
 * shared perks (isPaidStatus) but never Trade Pro access.
 */
export function tierGrantsTradeAccess(sub: { status: string; tier: string } | null | undefined): boolean {
  return isPaidStatus(sub?.status) && (sub?.tier === "pro" || sub?.tier === "featured");
}

/**
 * Any active/comped paid tier — seo, pro, or featured. Unlike
 * computeTradeAccess (RFP-gate specific), this is for perks every paid tier
 * shares, e.g. the 12-photo portfolio gallery (PROFILE_PHOTOS.paid). This is
 * also what keeps grandfathered SEO Listing subscribers' gallery working.
 */
export async function hasAnyPaidTier(organizationId: string | null): Promise<boolean> {
  if (!organizationId || !isSupabaseConfigured()) return false;
  const supabase = await createClient();
  const { data: sub } = await supabase
    .from("subscriptions")
    .select("status")
    .eq("organization_id", organizationId)
    .maybeSingle<{ status: string }>();
  return isPaidStatus(sub?.status);
}

/** Convenience: does the current user have paid trade access right now? */
export async function hasActiveTradeAccess(): Promise<boolean> {
  const session = await getSession();
  return session?.hasTradeAccess ?? false;
}

/** Require a logged-in user; otherwise redirect to sign-in. */
export async function requireUser(): Promise<SessionContext> {
  if (!isSupabaseConfigured()) return demoSession("trade");
  const session = await getSession();
  // Keep the visitor's language on the way out (pages set it via setLangFrom).
  if (!session) redirect(localizePath("/sign-in", getLang()));
  if (session.profile.status === "suspended") redirect(localizePath("/suspended", getLang()));
  return session;
}

/** Require one of the given roles; otherwise redirect appropriately. */
export async function requireRole(roles: UserRole[]): Promise<SessionContext> {
  // Demo mode: no auth backend — return a synthetic session so the
  // authenticated areas are previewable. Live mode enforces real roles.
  if (!isSupabaseConfigured()) return demoSession(roles[0]);
  const session = await requireUser();
  const role = session.profile.primary_role;
  if (!roles.includes(role)) {
    // A "just looking" account opening a business area (/dashboard): offer to
    // list the business instead of bouncing them to the directory.
    const business = roles.includes("trade") || roles.includes("supplier");
    redirect(localizePath(role === "visitor" && business ? VISITOR_UPGRADE_PATH : roleHome(role), getLang()));
  }
  return session;
}

/** Are we running without a Supabase backend (demo preview)? */
export function isDemoMode(): boolean {
  return !isSupabaseConfigured();
}

/** Synthetic session for demo-mode previews of the authenticated areas. */
function demoSession(role: UserRole): SessionContext {
  const now = new Date().toISOString();
  const isTrade = role === "trade";
  const isSupplier = role === "supplier";
  const isListing = isTrade || isSupplier;
  return {
    userId: "demo-user",
    profile: {
      id: "demo-user",
      email: "demo@pmrfp.com",
      full_name: "Demo User",
      phone: null,
      avatar_url: null,
      primary_role: role,
      onboarding_completed: true,
      status: "active",
      created_at: now,
      updated_at: now,
    },
    organization: isListing || role === "property_manager"
      ? {
          id: "demo-org",
          name: isSupplier ? "Maple Building Supply Co." : isTrade ? "Northline Electrical Ltd." : "Demo Property Group",
          slug: isSupplier ? "maple-building-supply" : isTrade ? "northline-electrical" : "demo-property-group",
          organization_type: isSupplier ? "supplier" : isTrade ? "trade_company" : "property_manager",
          website: null, phone: null, email: "demo@pmrfp.com",
          logo_url: null, address_line_1: null, address_line_2: null,
          city: "Toronto", province: "Ontario", postal_code: null, country: "Canada",
          short_description: null, full_description: null, years_in_business: 18,
          employee_count_range: "11-50", insurance_status: "Fully insured", wsib_status: "Active",
          emergency_service: true, verified: true, featured: true, is_demo: true,
          profile_status: "approved", profile_completion_score: 88,
          public_contact_visibility: "request_intro", status: "active",
          created_at: now, updated_at: now,
        }
      : null,
    hasTradeAccess: isListing,
    paid: isListing,
    trial: NO_TRIAL,
    hasIntelAccess: isListing,
  };
}

export function isAdminRole(role: UserRole): boolean {
  return role === "admin" || role === "super_admin";
}

/** Where a given role lands by default. */
export function roleHome(role: UserRole): string {
  if (role === "admin" || role === "super_admin") return "/admin";
  // REAs share the PM-side surface (post RFPs for clients, browse trades).
  if (role === "property_manager" || role === "real_estate_agent") return "/pm-dashboard";
  if (role === "trade" || role === "supplier") return "/dashboard";
  if (role === "talent") return "/talent/edit";
  return "/directory";
}

function fallbackProfile(id: string, email?: string): UserProfile {
  return {
    id,
    email: email ?? "",
    full_name: null,
    phone: null,
    avatar_url: null,
    primary_role: "trade",
    onboarding_completed: false,
    status: "active",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}
