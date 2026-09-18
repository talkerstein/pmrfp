import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import type { Organization, UserProfile, UserRole } from "@/types/db";

export interface SessionContext {
  userId: string;
  profile: UserProfile;
  organization: Organization | null;
  hasTradeAccess: boolean;
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
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const user = auth.user;
  if (!user) return null;

  const { data: profile } = await supabase
    .from("users_profile")
    .select("*")
    .eq("id", user.id)
    .maybeSingle<UserProfile>();
  if (!profile) {
    return { userId: user.id, profile: fallbackProfile(user.id, user.email), organization: null, hasTradeAccess: false };
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

  const hasTradeAccess = await computeTradeAccess(supabase, organization);
  return { userId: user.id, profile, organization, hasTradeAccess };
}

/**
 * Mirror of the SQL has_active_trade_access(): active|comped sub, tier
 * pro/featured, org not suspended.
 *
 * The tier check matters as much as the status check: the SEO Listing tier
 * is directory-only (see PRICING.seoNote), so an active SEO subscription
 * must NOT satisfy this — otherwise the cheapest paid tier would silently
 * unlock the RFP dashboard this function gates (dashboard/rfps, rfp-interest,
 * save-rfp). Keep this in lockstep with the SQL function of the same name.
 */
async function computeTradeAccess(
  supabase: Awaited<ReturnType<typeof createClient>>,
  organization: Organization | null,
): Promise<boolean> {
  if (!organization) return false;
  if (organization.organization_type !== "trade_company" && organization.organization_type !== "supplier") return false;
  if (organization.status === "suspended") return false;
  let { data: sub, error } = await supabase
    .from("subscriptions")
    .select("status,tier")
    .eq("organization_id", organization.id)
    .maybeSingle<{ status: string; tier: string }>();
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
  const activeStatus = sub?.status === "active" || sub?.status === "comped";
  const paidTier = sub?.tier === "pro" || sub?.tier === "featured";
  return activeStatus && paidTier;
}

/**
 * Any active/comped paid tier — seo, pro, or featured. Unlike
 * computeTradeAccess (RFP-gate specific), this is for perks every paid tier
 * shares, e.g. the unlimited portfolio gallery advertised on SEO Listing.
 */
export async function hasAnyPaidTier(organizationId: string | null): Promise<boolean> {
  if (!organizationId || !isSupabaseConfigured()) return false;
  const supabase = await createClient();
  const { data: sub } = await supabase
    .from("subscriptions")
    .select("status")
    .eq("organization_id", organizationId)
    .maybeSingle<{ status: string }>();
  return sub?.status === "active" || sub?.status === "comped";
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
  if (!session) redirect("/sign-in");
  if (session.profile.status === "suspended") redirect("/suspended");
  return session;
}

/** Require one of the given roles; otherwise redirect appropriately. */
export async function requireRole(roles: UserRole[]): Promise<SessionContext> {
  // Demo mode: no auth backend — return a synthetic session so the
  // authenticated areas are previewable. Live mode enforces real roles.
  if (!isSupabaseConfigured()) return demoSession(roles[0]);
  const session = await requireUser();
  if (!roles.includes(session.profile.primary_role)) {
    redirect(roleHome(session.profile.primary_role));
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
