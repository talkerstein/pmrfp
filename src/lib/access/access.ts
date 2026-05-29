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

/** Mirror of the SQL has_active_trade_access(): active|comped sub + not suspended. */
async function computeTradeAccess(
  supabase: Awaited<ReturnType<typeof createClient>>,
  organization: Organization | null,
): Promise<boolean> {
  if (!organization || organization.organization_type !== "trade_company") return false;
  if (organization.status === "suspended") return false;
  const { data: sub } = await supabase
    .from("subscriptions")
    .select("status")
    .eq("organization_id", organization.id)
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
  const session = await getSession();
  if (!session) redirect("/sign-in");
  if (session.profile.status === "suspended") redirect("/suspended");
  return session;
}

/** Require one of the given roles; otherwise redirect appropriately. */
export async function requireRole(roles: UserRole[]): Promise<SessionContext> {
  const session = await requireUser();
  if (!roles.includes(session.profile.primary_role)) {
    redirect(roleHome(session.profile.primary_role));
  }
  return session;
}

export function isAdminRole(role: UserRole): boolean {
  return role === "admin" || role === "super_admin";
}

/** Where a given role lands by default. */
export function roleHome(role: UserRole): string {
  if (role === "admin" || role === "super_admin") return "/admin";
  if (role === "property_manager") return "/pm-dashboard";
  if (role === "trade") return "/dashboard";
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
