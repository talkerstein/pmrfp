import type { SessionContext } from "@/lib/access/access";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { DEFAULT_SIGNUP_ROLE, type RolePickState } from "@/lib/auth/oauth";

/**
 * Is Google switched on in Supabase (Authentication → Providers → Google)?
 * Reads the project's public auth settings with the anon key, cached for five
 * minutes, so the button appears by itself soon after the owner enables it.
 * Any failure means no button: email sign-in always works.
 */
export async function isGoogleAuthEnabled(): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;
  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/settings`, {
      headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! },
      next: { revalidate: 300 },
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return false;
    const body = (await res.json()) as { external?: { google?: unknown } } | null;
    return body?.external?.google === true;
  } catch {
    return false;
  }
}

/** primary_role in the signed-in user's auth metadata (fresh from Supabase Auth), or null. */
export async function getMetadataRole(): Promise<unknown> {
  if (!isSupabaseConfigured()) return null;
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  const meta = (data.user?.user_metadata ?? {}) as Record<string, unknown>;
  return meta.primary_role ?? null;
}

/** Role-pick state for this session. Only asks Supabase Auth when a pick is possible. */
export async function rolePickStateFor(session: SessionContext): Promise<RolePickState> {
  const primaryRole = session.profile.primary_role;
  const onboardingCompleted = session.profile.onboarding_completed;
  const possible = !onboardingCompleted && primaryRole === DEFAULT_SIGNUP_ROLE;
  return { primaryRole, onboardingCompleted, metadataRole: possible ? await getMetadataRole() : null };
}
