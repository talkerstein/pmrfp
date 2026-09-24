/**
 * IP-based rate limiting for public POST endpoints.
 *
 * Uses Upstash Redis sliding-window via @upstash/ratelimit when these env vars
 * are present:
 *
 *   UPSTASH_REDIS_REST_URL
 *   UPSTASH_REDIS_REST_TOKEN
 *
 * If either is missing, it falls back to a fixed-window counter in Supabase
 * (see checkWithPostgres). With neither available it FAILS OPEN — dev and the
 * demo deploy keep working with no limiter at all.
 *
 * Limits per bucket (per IP, sliding window):
 *   - default: 30 / 60s
 *   - contact: 5 / 60s   (form spam protection)
 *   - rfp-interest: 10 / 60s
 *   - checkout: 10 / 60s
 *   - auth: 10 / 60s     (login/signup brute-force protection)
 */
import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { createServiceClient } from "@/lib/supabase/service";
import { isServiceConfigured } from "@/lib/supabase/config";

type BucketName =
  | "default" | "contact" | "rfp-interest" | "checkout" | "save-rfp" | "auth" | "ai"
  | "photo-upload" | "project-draft" | "review";

const BUCKETS: Record<BucketName, { tokens: number; window: `${number} s` | `${number} m` }> = {
  default: { tokens: 30, window: "60 s" },
  contact: { tokens: 5, window: "60 s" },
  "rfp-interest": { tokens: 10, window: "60 s" },
  checkout: { tokens: 10, window: "60 s" },
  "save-rfp": { tokens: 30, window: "60 s" },
  auth: { tokens: 10, window: "60 s" },
  // RFP Writer: each call can spend model tokens — keep it human-paced.
  ai: { tokens: 5, window: "10 m" },
  // Projects: a phone on site uploads a burst of photos, then drafts once
  // or twice. Review links: a client submits once; retries on a typo.
  "photo-upload": { tokens: 60, window: "10 m" },
  "project-draft": { tokens: 10, window: "10 m" },
  review: { tokens: 5, window: "10 m" },
};

let _redis: Redis | null = null;
const _limiters = new Map<BucketName, Ratelimit>();

function getRedis(): Redis | null {
  if (_redis) return _redis;
  // Upstash's own names, or the KV_* names Vercel's Marketplace integration sets.
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
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
  if (limiter) {
    const result = await limiter.limit(`${bucket}:${ip || "unknown"}`);
    if (result.success) return null;
    return { limit: result.limit, remaining: result.remaining, reset: result.reset };
  }
  return checkWithPostgres(ip, bucket);
}

function windowSeconds(window: string): number {
  const [n, unit] = window.split(" ");
  return Number(n) * (unit === "m" ? 60 : 1);
}

/**
 * No Upstash → fixed-window counter in Supabase (rate_limit_hit(), migration
 * 20260923000004). The key is a sha256 of bucket+IP, so no raw IPs are stored.
 * Fails open on any error so a database hiccup never blocks a real visitor.
 */
async function checkWithPostgres(ip: string, bucket: BucketName): Promise<RateLimitInfo | null> {
  if (!isServiceConfigured()) return null;
  const { tokens, window } = BUCKETS[bucket];
  try {
    const key = createHash("sha256").update(`${bucket}:${ip || "unknown"}`).digest("hex");
    const { data, error } = await createServiceClient().rpc("rate_limit_hit", {
      p_key: key,
      p_window_seconds: windowSeconds(window),
      p_limit: tokens,
    });
    const row = (Array.isArray(data) ? data[0] : data) as { allowed: boolean; hits: number; reset_at: string } | null;
    if (error || !row || row.allowed) return null;
    return { limit: tokens, remaining: 0, reset: Date.parse(row.reset_at) };
  } catch {
    return null;
  }
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
