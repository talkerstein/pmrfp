export function isHostingerCloudflareStaging(env: Record<string, string | undefined> = process.env) {
  return env.PMRFP_HOSTINGER_CLOUDFLARE_STAGING === "enabled";
}

export function isIsolatedD1Staging() {
  return (process.env.VERCEL_ENV === "preview" || isHostingerCloudflareStaging()) && process.env.PMRFP_ISOLATED_D1_STAGING === "enabled" &&
    !process.env.NEXT_PUBLIC_SUPABASE_URL && !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
    !process.env.SUPABASE_SERVICE_ROLE_KEY;
}

export const stagingEmail = "staging-rishon@example.invalid";
export const stagingUserId = "00000000-0000-4000-8000-000000000091";
export const stagingListingSlug = "synthetic-native-login";

export function isCustomerD1Staging() {
  return isIsolatedD1Staging() && process.env.PMRFP_STAGING_ACCOUNT_MODE === "customers";
}

export function isVpsLiveCustomerAuth() {
  return process.env.PMRFP_VPS_LIVE_AUTH === "enabled";
}

export function usesD1CustomerAuth() {
  return isVpsLiveCustomerAuth() || isCustomerD1Staging();
}

export function matchesCustomerOrigin(request: Request) {
  const origin = isVpsLiveCustomerAuth() ? "https://pmrfp.com" : new URL(request.url).origin;
  return request.headers.get("origin") === origin;
}

export function authTurnstileSiteKey() {
  return isVpsLiveCustomerAuth() ? process.env.PMRFP_AUTH_TURNSTILE_SITE_KEY : process.env.PMRFP_STAGING_TURNSTILE_SITE_KEY;
}

export function isVpsNativeAccountRecovery() {
  return (isVpsLiveCustomerAuth() || (isHostingerCloudflareStaging() && isCustomerD1Staging())) &&
    process.env.PMRFP_VPS_NATIVE_ACCOUNT_RECOVERY === "enabled";
}

export function isVpsNativeAccountSignup() {
  return isVpsNativeAccountRecovery() && process.env.PMRFP_VPS_NATIVE_ACCOUNT_SIGNUP === "enabled";
}
