import "server-only";
import { stagingTurnstileAction, stagingTurnstileHostname } from "./staging-turnstile";

export async function verifyStagingTurnstile(token: FormDataEntryValue | null, ip: string | null) {
  const secret = process.env.PMRFP_STAGING_TURNSTILE_SECRET;
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
    return data.success === true && data.hostname === stagingTurnstileHostname && data.action === stagingTurnstileAction;
  } catch {
    return false;
  }
}
