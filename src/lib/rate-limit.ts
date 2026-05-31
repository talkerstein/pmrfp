/**
 * IP-based rate limiting for public POST endpoints.
 *
 * Uses Upstash Redis sliding-window via @upstash/ratelimit when these env vars
 * are present:
 *
 *   UPSTASH_REDIS_REST_URL
 *   UPSTASH_REDIS_REST_TOKEN
 *
 * If either is missing, this module FAILS OPEN — no limiting happens. That's
 * deliberate: dev environments and the demo deploy should keep working without
 * an Upstash account. In production, set both env vars in Vercel and the limits
 * activate automatically.
 *
 * Limits per bucket (per IP, sliding window):
 *   - default: 30 / 60s
 *   - contact: 5 / 60s   (form spam protection)
 *   - rfp-interest: 10 / 60s
 *   - checkout: 10 / 60s
 *   - auth: 10 / 60s     (login/signup brute-force protection)
 */
import { NextResponse } from "next/server";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

type BucketName = "default" | "contact" | "rfp-interest" | "checkout" | "save-rfp" | "auth";

const BUCKETS: Record<BucketName, { tokens: number; window: `${number} s` | `${number} m` }> = {
  default: { tokens: 30, window: "60 s" },
  contact: { tokens: 5, window: "60 s" },
  "rfp-interest": { tokens: 10, window: "60 s" },
  checkout: { tokens: 10, window: "60 s" },
  "save-rfp": { tokens: 30, window: "60 s" },
  auth: { tokens: 10, window: "60 s" },
};

let _redis: Redis | null = null;
const _limiters = new Map<BucketName, Ratelimit>();

function getRedis(): Redis | null {
  if (_redis) return _redis;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  _redis = new Redis({ url, token });
  return _redis;
}

function getLimiter(bucket: BucketName): Ratelimit | null {
  const redis = getRedis();
  if (!redis) return null;
  let limiter = _limiters.get(bucket);
  if (limiter) return limiter;
  const { tokens, window } = BUCKETS[bucket];
  limiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(tokens, window),
    analytics: true,
    prefix: `rl:pmrfp:${bucket}`,
  });
  _limiters.set(bucket, limiter);
  return limiter;
}

/** Best-effort client IP — prefers Vercel's forwarded headers. */
function clientIp(request: Request): string {
  const h = request.headers;
  return (
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    h.get("x-real-ip") ||
    h.get("cf-connecting-ip") ||
    "unknown"
  );
}

export interface RateLimitInfo {
  limit: number;
  remaining: number;
  reset: number; // ms epoch
}

/**
 * Check the rate limit for a request. Returns null if allowed (or limiter
 * disabled). Returns RateLimitInfo if BLOCKED — pass to rateLimitResponse().
 */
export async function checkRateLimit(
  request: Request,
  bucket: BucketName = "default",
): Promise<RateLimitInfo | null> {
  return checkRateLimitByIp(clientIp(request), bucket);
}

/**
 * Check the rate limit by IP directly. Use from server actions where you don't
 * have a Request — call `headers()` from `next/headers` to derive the IP.
 */
export async function checkRateLimitByIp(
  ip: string,
  bucket: BucketName = "default",
): Promise<RateLimitInfo | null> {
  const limiter = getLimiter(bucket);
  if (!limiter) return null;
  const result = await limiter.limit(`${bucket}:${ip || "unknown"}`);
  if (result.success) return null;
  return { limit: result.limit, remaining: result.remaining, reset: result.reset };
}

export function rateLimitResponse(info: RateLimitInfo): NextResponse {
  const retryAfterSec = Math.max(1, Math.ceil((info.reset - Date.now()) / 1000));
  return NextResponse.json(
    { error: "Too many requests. Please slow down." },
    {
      status: 429,
      headers: {
        "Retry-After": String(retryAfterSec),
        "X-RateLimit-Limit": String(info.limit),
        "X-RateLimit-Remaining": String(info.remaining),
        "X-RateLimit-Reset": String(info.reset),
      },
    },
  );
}
