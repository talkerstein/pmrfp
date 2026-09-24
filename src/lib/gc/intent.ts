import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { parseAwardRef } from "@/lib/gc/packages";

/**
 * What a general contractor told us at sign-up, kept in auth metadata so it
 * survives the email-confirmation round trip: they want a 'builder'
 * organization, and (maybe) which public award they came from.
 */
export async function getSignupGcIntent(): Promise<{ builder: boolean; award: string | null }> {
  if (!isSupabaseConfigured()) return { builder: false, award: null };
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  const meta = (data.user?.user_metadata ?? {}) as Record<string, unknown>;
  return {
    builder: meta.org_kind === "builder",
    award: parseAwardRef(typeof meta.gc_award === "string" ? meta.gc_award : null),
  };
}
