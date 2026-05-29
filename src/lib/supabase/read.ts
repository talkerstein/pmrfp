import { createClient as createSbClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Cookieless anon client for PUBLIC, read-only data (directory, RFP teasers,
 * taxonomy, resources). Unlike the cookie-bound server client, this never
 * calls `cookies()`, so it is safe inside `generateStaticParams` and during
 * static prerendering at build time. RLS still applies — the anon role can
 * only read public rows (approved orgs, the rfp_public view, published
 * resources, active taxonomy). Auth-gated reads must still use the cookie
 * client from `@/lib/supabase/server`.
 */
let cached: SupabaseClient | null = null;

export function createReadClient(): SupabaseClient {
  if (!cached) {
    cached = createSbClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
  }
  return cached;
}
