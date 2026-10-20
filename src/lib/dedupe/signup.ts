/**
 * "Unique emails only": the sign-up side of duplicate prevention.
 *
 * Email / magic-link sign-up: existingAccountFor() runs before Supabase is
 * asked to create anything. Google: Supabase creates the user before we
 * see it, so blockDuplicateOAuthUser() removes a brand-new, empty Google
 * account whose mailbox already has a PMRFP account (only Gmail dot / +tag
 * variants get this far: an identical address is linked by Supabase).
 *
 * Both answer the same "You already have an account — sign in or reset"
 * and never say which sign-in method the existing account uses.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import { isServiceConfigured } from "@/lib/supabase/config";
import { logAudit } from "@/lib/audit";
import { findAccountByEmail, type ExistingAccount } from "./lookup";

/** Where a blocked duplicate is sent: sign-in, with the "already have an account" notice. */
export function existingAccountPath(next?: string | null): string {
  const q = new URLSearchParams({ notice: "exists" });
  if (next) q.set("next", next);
  return `/sign-in?${q.toString()}`;
}

/** The account that already owns this mailbox, or null (also null when the check can't run). */
export async function existingAccountFor(email: string, db?: SupabaseClient): Promise<ExistingAccount | null> {
  if (!db && !isServiceConfigured()) return null;
  try {
    return await findAccountByEmail(db ?? createServiceClient(), email);
  } catch (e) {
    console.error("[dedupe:signup]", e instanceof Error ? e.message : e);
    return null;
  }
}

/** A Google account this new is still "being created": safe to undo. */
export const FRESH_OAUTH_MS = 15 * 60_000;

interface AuthUserLite {
  id: string;
  email?: string | null;
  created_at: string;
  identities?: { provider: string }[] | null;
}

/**
 * Decides whether a just-signed-in OAuth user is a duplicate to undo.
 * Pure: the caller loads the facts.
 */
export function shouldBlockOAuthUser(
  user: AuthUserLite,
  facts: { existing: ExistingAccount | null; memberships: number; onboardingCompleted: boolean },
  now = Date.now(),
): boolean {
  if (!facts.existing || facts.existing.id === user.id) return false;
  if (now - Date.parse(user.created_at) > FRESH_OAUTH_MS) return false;
  const providers = (user.identities ?? []).map((i) => i.provider);
  if (!providers.length || providers.includes("email")) return false;
  return facts.memberships === 0 && !facts.onboardingCompleted;
}

/**
 * Runs after the OAuth code exchange. True when the user was a duplicate and
 * has been removed (the caller signs them out and shows the notice).
 * Only ever removes an auth user created in the last 15 minutes with no
 * company and no finished onboarding: nothing anyone has used.
 */
export async function blockDuplicateOAuthUser(
  userId: string,
  opts: { db?: SupabaseClient; beforeRemove?: () => Promise<unknown> } = {},
): Promise<boolean> {
  const { db, beforeRemove } = opts;
  if (!db && !isServiceConfigured()) return false;
  const admin = db ?? createServiceClient();
  try {
    const { data } = await admin.auth.admin.getUserById(userId);
    const user = data.user as AuthUserLite | null;
    if (!user?.email) return false;
    if (Date.now() - Date.parse(user.created_at) > FRESH_OAUTH_MS) return false;
    const existing = await findAccountByEmail(admin, user.email, user.id);
    if (!existing) return false;
    const [{ count }, { data: profile }] = await Promise.all([
      admin.from("organization_members").select("user_id", { count: "exact", head: true }).eq("user_id", userId),
      admin.from("users_profile").select("onboarding_completed").eq("id", userId).maybeSingle<{ onboarding_completed: boolean }>(),
    ]);
    if (!shouldBlockOAuthUser(user, { existing, memberships: count ?? 0, onboardingCompleted: !!profile?.onboarding_completed })) return false;
    // Sign them out first (their session cookie belongs to the user being removed).
    if (beforeRemove) await beforeRemove();
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) {
      console.error("[dedupe:oauth] could not remove duplicate", error.message);
      return false;
    }
    await logAudit({
      actorUserId: null,
      action: "signup.duplicate_blocked",
      entityType: "user",
      entityId: existing.id,
      metadata: { method: "oauth", blockedUserId: userId },
    });
    return true;
  } catch (e) {
    console.error("[dedupe:oauth]", e instanceof Error ? e.message : e);
    return false;
  }
}
