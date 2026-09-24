/**
 * "Continue with Google": role choice and redirect paths.
 *
 * An email sign-up picks a role on the form, and handle_new_user() copies it
 * from auth metadata into users_profile. A Google sign-up carries no role, so
 * the trigger gives it the default ('trade') and onboarding asks once. The
 * role a sign-up page hands over in `?role=` only pre-selects that question;
 * resolveRolePick() is the guard that decides what may actually be saved.
 *
 * Pure and client-safe: no server imports.
 */
import type { UserRole } from "@/types/db";
import { safeNextPath } from "@/lib/auth/next";

/** What handle_new_user() assigns when auth metadata has no primary_role. */
export const DEFAULT_SIGNUP_ROLE: UserRole = "trade";

/** The roles someone can pick for themselves. A GC is a property_manager with a builder org. */
export const ROLE_CHOICES = ["trade", "property_manager", "general_contractor", "supplier"] as const;
export type RoleChoice = (typeof ROLE_CHOICES)[number];

/** `?role=` → a pickable choice, or null. `?role=property_manager&kind=gc` means a GC. */
export function parseRoleChoice(role: unknown, kind?: unknown): RoleChoice | null {
  if (role === "general_contractor" || (role === "property_manager" && kind === "gc")) {
    return "general_contractor";
  }
  return role === "trade" || role === "property_manager" || role === "supplier" ? role : null;
}

export interface RolePickState {
  primaryRole: UserRole;
  onboardingCompleted: boolean;
  /** primary_role in auth user metadata: set by email sign-up, or by an earlier pick. */
  metadataRole: unknown;
}

/**
 * True for someone who signed in with Google and hasn't chosen a role yet.
 * Email sign-ups always have a metadata role, so they never see the question.
 */
export function needsRolePick(s: RolePickState): boolean {
  const hasMetadataRole = typeof s.metadataRole === "string" && s.metadataRole !== "";
  return !s.onboardingCompleted && s.primaryRole === DEFAULT_SIGNUP_ROLE && !hasMetadataRole;
}

export type RolePickResult =
  | { ok: true; role: "trade" | "property_manager" | "supplier"; builder: boolean }
  | { ok: false; reason: "already_set" | "invalid_role" };

/**
 * The guard for saving a picked role. Only once (default role, not onboarded,
 * never chosen) and only to a self-serve role. Admin roles can't be reached.
 */
export function resolveRolePick(s: RolePickState, choice: unknown): RolePickResult {
  if (!needsRolePick(s)) return { ok: false, reason: "already_set" };
  const picked = parseRoleChoice(choice);
  if (!picked) return { ok: false, reason: "invalid_role" };
  if (picked === "general_contractor") return { ok: true, role: "property_manager", builder: true };
  return { ok: true, role: picked, builder: false };
}

/** Where Google sends people back to, carrying a safe `next`. */
export function oauthCallbackPath(next?: string | null): string {
  const safe = safeNextPath(next);
  return safe ? `/auth/callback?next=${encodeURIComponent(safe)}` : "/auth/callback";
}

/** `/onboarding` with the sign-up page's role (and award, for a GC) pre-selected. */
export function onboardingPath(opts: {
  role?: RoleChoice | null;
  award?: string | null;
  next?: string | null;
}): string {
  const params = new URLSearchParams();
  if (opts.role) params.set("role", opts.role);
  if (opts.role === "general_contractor" && opts.award) params.set("award", opts.award);
  const next = safeNextPath(opts.next);
  if (next) params.set("next", next);
  const qs = params.toString();
  return qs ? `/onboarding?${qs}` : "/onboarding";
}

const ONBOARDING = /^\/onboarding(?:[?#]|$)/;

/**
 * Where to land after Google hands back a session. Mirrors email sign-in: not
 * set up yet → onboarding (keeping `next`); set up → `next`, or their home.
 * A member who already has an account never goes back through onboarding.
 */
export function postOAuthRedirect(
  rawNext: string | null | undefined,
  profile: { onboardingCompleted: boolean; home: string } | null,
): string {
  const next = safeNextPath(rawNext);
  const toOnboarding = !!next && ONBOARDING.test(next);
  if (!profile || !profile.onboardingCompleted) {
    if (!next || toOnboarding) return next ?? "/onboarding";
    return `/onboarding?next=${encodeURIComponent(next)}`;
  }
  if (next && !toOnboarding) return next;
  if (next) {
    // A sign-up page sends /onboarding?…&next=/somewhere — keep the /somewhere.
    const inner = safeNextPath(new URL(next, "http://x").searchParams.get("next"));
    if (inner && !ONBOARDING.test(inner)) return inner;
  }
  return profile.home;
}
