import type { User } from "@supabase/supabase-js";
import { isAdminRole, type SessionContext } from "@/lib/access/access";
import { createServiceClient } from "@/lib/supabase/service";
import { isServiceConfigured } from "@/lib/supabase/config";
import { canPost } from "./rules";

export function isGoogleUser(user: Pick<User, "app_metadata" | "identities"> | null | undefined): boolean {
  if (!user) return false;
  const providers = (user.app_metadata?.providers as string[] | undefined) ?? [];
  return user.app_metadata?.provider === "google" || providers.includes("google") || (user.identities ?? []).some((i) => i.provider === "google");
}

/** Is this user a moderator of any forum category? */
export async function isAnyMod(userId: string): Promise<boolean> {
  if (!isServiceConfigured()) return false;
  const { data } = await createServiceClient().from("forum_category_mods").select("user_id").eq("user_id", userId).limit(1);
  return Boolean(data?.length);
}

/** The single posting gate, from the session + auth user. */
export async function sessionCanPost(session: SessionContext, user: User | null): Promise<boolean> {
  const isAdmin = isAdminRole(session.profile.primary_role);
  const base = {
    isAdmin,
    orgProfileStatus: session.organization?.profile_status,
    google: isGoogleUser(user),
    emailVerified: Boolean(user?.email_confirmed_at),
    onboarded: Boolean(session.profile.onboarding_completed),
  };
  if (canPost({ ...base, isMod: false })) return true;
  return canPost({ ...base, isMod: await isAnyMod(session.userId) });
}
