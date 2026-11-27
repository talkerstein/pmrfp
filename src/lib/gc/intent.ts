import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { parseAwardRef } from "@/lib/gc/packages";
import { isVpsNativeAccountSignup } from "@/lib/d1/staging-config";

/**
 * What a general contractor told us at sign-up, kept in auth metadata so it
 * survives the email-confirmation round trip: they want a 'builder'
 * organization, and (maybe) which public award they came from.
 */
export async function getSignupGcIntent(): Promise<{ builder: boolean; landlord: boolean; award: string | null }> {
  const native = isVpsNativeAccountSignup();
  if (!native && !isSupabaseConfigured()) return { builder: false, landlord: false, award: null };
  const meta = native
    ? await (await import("@/lib/d1/customer-staging-session")).customerStagingSignupPreferences()
    : (await (await createClient()).auth.getUser()).data.user?.user_metadata ?? {};
  return {
    builder: meta.org_kind === "builder",
    landlord: meta.org_kind === "landlord",
    award: parseAwardRef(typeof meta.gc_award === "string" ? meta.gc_award : null),
  };
}
