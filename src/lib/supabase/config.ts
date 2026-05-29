/**
 * Whether real Supabase credentials are present. When false, the app runs
 * in DEMO MODE: public pages render from seeded fixtures (src/lib/demo-data)
 * so the whole site is browsable with zero setup. Auth, dashboards, payments,
 * and writes require a configured Supabase project.
 */
export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

export function isServiceConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
}
