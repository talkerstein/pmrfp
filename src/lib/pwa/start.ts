/**
 * Where the installed app opens. The manifest's start_url is /app, and this
 * picks the right home for whoever is signed in, using the same rules as
 * sign-in: suspended → /suspended, not set up → onboarding, else their role's
 * dashboard (roleHome). Signed out → sign-in, coming back to /app afterwards.
 *
 * Pure (no request or cookie access) so it can be unit tested.
 */
import { roleHome } from "@/lib/access/access";
import type { UserRole, UserStatus } from "@/types/db";

/** The manifest start route. Sign-in returns here, then on to the right home. */
export const APP_START_PATH = "/app";
export const SIGNED_OUT_START = `/sign-in?next=${encodeURIComponent(APP_START_PATH)}`;

export interface AppStartProfile {
  primaryRole: UserRole;
  status: UserStatus;
  onboardingCompleted: boolean;
}

export function appStartPath(profile: AppStartProfile | null): string {
  if (!profile) return SIGNED_OUT_START;
  if (profile.status === "suspended") return "/suspended";
  if (!profile.onboardingCompleted) return "/onboarding";
  return roleHome(profile.primaryRole);
}
