import { isHostingerCloudflareStaging, isVpsLiveCustomerAuth } from "./staging-config";
import { createHmac } from "node:crypto";
import { isIP } from "node:net";

type Bucket = "auth-ip" | "auth-account" | "api-read" | "api-write" | "referral" | "rfp-email" | "form-recipient";
type Decision = { status: 204 } | { status: 429; retry: number } | { status: 503 };

export function stagingClientIp(headers: Headers, production = isVpsLiveCustomerAuth()): string | null {
  const value = isHostingerCloudflareStaging() || production
    ? headers.get("x-forwarded-for")?.split(",").at(-1)
    : headers.get("x-vercel-forwarded-for") ?? headers.get("x-forwarded-for");
  const ip = value?.trim() ?? "";
  return isIP(ip) ? ip : null;
}

export async function checkStagingRateLimit(bucket: Bucket, identity: string | null, live = isVpsLiveCustomerAuth()): Promise<Decision> {
  const secret = live ? process.env.PMRFP_AUTH_LIMITER_SECRET : process.env.PMRFP_STAGING_LIMITER_SECRET;
  if (!identity || !secret || !/^[a-f0-9]{64}$/.test(secret)) return { status: 503 };
  const key = createHmac("sha256", secret).update(bucket + ":" + identity).digest("hex");
  try {
    const host = live ? "pmrfp-production-rate-limit.pmrfp.workers.dev" : "pmrfp-staging-rate-limit.pmrfp.workers.dev";
    const response = await fetch(`https://${host}/v1/consume`, {
      method: "POST",
      headers: { "x-pmrfp-rate-limit-key": secret, "content-type": "application/json" },
      body: JSON.stringify({ bucket, key }),
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(4000),
    });
    if (response.status === 204) return { status: 204 };
    const retry = Number(response.headers.get("retry-after"));
    const maxRetry = bucket === "form-recipient" ? 86_400 : bucket === "referral" || bucket === "rfp-email" ? 600 : 60;
    if (response.status === 429 && Number.isInteger(retry) && retry >= 1 && retry <= maxRetry) return { status: 429, retry };
  } catch {
    // Staging auth and API requests are held when their shared limiter is unavailable.
  }
  return { status: 503 };
}
