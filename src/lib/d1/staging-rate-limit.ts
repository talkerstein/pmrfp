import { createHmac } from "node:crypto";
import { isIP } from "node:net";

type Bucket = "auth-ip" | "auth-account" | "api-read" | "api-write";
type Decision = { status: 204 } | { status: 429; retry: number } | { status: 503 };

export function stagingClientIp(headers: Headers): string | null {
  const value = headers.get("x-vercel-forwarded-for") ?? headers.get("x-forwarded-for");
  const ip = value?.trim() ?? "";
  return isIP(ip) ? ip : null;
}

export async function checkStagingRateLimit(bucket: Bucket, identity: string | null): Promise<Decision> {
  const secret = process.env.PMRFP_STAGING_LIMITER_SECRET;
  if (!identity || !secret || !/^[a-f0-9]{64}$/.test(secret)) return { status: 503 };
  const key = createHmac("sha256", secret).update(bucket + ":" + identity).digest("hex");
  try {
    const response = await fetch("https://pmrfp-staging-rate-limit.pmrfp.workers.dev/v1/consume", {
      method: "POST",
      headers: { "x-pmrfp-rate-limit-key": secret, "content-type": "application/json" },
      body: JSON.stringify({ bucket, key }),
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(4000),
    });
    if (response.status === 204) return { status: 204 };
    const retry = Number(response.headers.get("retry-after"));
    if (response.status === 429 && Number.isInteger(retry) && retry >= 1 && retry <= 60) return { status: 429, retry };
  } catch {
    // Staging auth and API requests are held when their shared limiter is unavailable.
  }
  return { status: 503 };
}
