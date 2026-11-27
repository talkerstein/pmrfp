import "server-only";
import { isHostingerCloudflareStaging, isVpsLiveCustomerAuth } from "./staging-config";
import { stagingTurnstileAction, stagingTurnstileHostname } from "./staging-turnstile";

export async function verifyStagingTurnstile(token: FormDataEntryValue | null, ip: string | null, action = stagingTurnstileAction) {
  const live = isVpsLiveCustomerAuth();
  const secret = live ? process.env.PMRFP_AUTH_TURNSTILE_SECRET : process.env.PMRFP_STAGING_TURNSTILE_SECRET;
  if (!secret || !ip || typeof token !== "string" || !token || token.length > 2048) return false;
  try {
    const result = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body: new URLSearchParams({ secret, response: token, remoteip: ip }),
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    if (!result.ok) return false;
    const data = await result.json();
    const expectedHost = live ? "pmrfp.com" : isHostingerCloudflareStaging()
      ? new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "").hostname
      : stagingTurnstileHostname;
    return data.success === true && data.hostname === expectedHost && data.action === action;
  } catch {
    return false;
  }
}
