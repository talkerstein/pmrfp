export function isIsolatedD1Staging() {
  return process.env.VERCEL_ENV === "preview" && process.env.PMRFP_ISOLATED_D1_STAGING === "enabled" &&
    !process.env.NEXT_PUBLIC_SUPABASE_URL && !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
    !process.env.SUPABASE_SERVICE_ROLE_KEY;
}

export const stagingEmail = "staging-rishon@example.invalid";
export const stagingUserId = "00000000-0000-4000-8000-000000000091";
export const stagingListingSlug = "synthetic-native-login";
