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
  | "photo-upload" | "project-draft" | "project-publish" | "review" | "public-read"
  | "forum-post" | "forum-vote" | "forum-search" | "correction" | "buyer-source" | "beacon" | "out-click";

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
  // Publishing from the mobile app (the web publishes via a server action).
  "project-publish": { tokens: 10, window: "10 m" },
  review: { tokens: 5, window: "10 m" },
  "public-read": { tokens: 120, window: "60 s" },
  // Forum: per-IP backstop on top of the per-account limits in lib/forum/rules.
  "forum-post": { tokens: 10, window: "10 m" },
  "forum-vote": { tokens: 60, window: "10 m" },
  // Forum title search (ILIKE): cheap but unindexed, so keep it human-paced.
  "forum-search": { tokens: 20, window: "60 s" },
  // "Report an error or request removal": a person files one or two, not dozens.
  correction: { tokens: 5, window: "10 m" },
  // "List your tenders free" (/for-public-buyers): one organization files once, maybe a retry.
  "buyer-source": { tokens: 5, window: "10 m" },
  // First-party analytics beacon (/api/t): about one call per page a person opens.
  beacon: { tokens: 60, window: "60 s" },
  // Click-out redirect (/out/<company>): a person follows a few links a minute.
  "out-click": { tokens: 30, window: "60 s" },
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

/** Public browsing must never add a Supabase counter query to every page. */
export async function checkPublicReadLimit(request: Request): Promise<RateLimitInfo | null> {
  const ip = clientIp(request);
  if (ip === "unknown") return null;
  const limiter = getLimiter("public-read");
  if (!limiter) return null;
  try {
    const key = createHash("sha256").update(ip).digest("hex");
    const result = await limiter.limit(key);
    return result.success ? null : { limit: result.limit, remaining: result.remaining, reset: result.reset };
  } catch {
    // Redis downtime must not take the website down. Public response caching
    // continues protecting database bandwidth independently of this limiter.
    console.warn("[public-read-limit] Redis unavailable; allowing request");
    return null;
  }
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

/** In-memory fallback for the beacon: per instance, fixed window, bounded. */
const beaconWindows = new Map<string, { start: number; hits: number }>();
const BEACON_KEYS_MAX = 10_000;

/**
 * Upstash when configured; otherwise a per-instance counter in memory. Never
 * the Supabase fallback: these routes must not add a database call to every
 * hit. The key is a hash of the IP; nothing is stored. Fails open.
 */
async function lightLimit(bucket: "beacon" | "out-click", ip: string, now: number): Promise<RateLimitInfo | null> {
  if (!ip || ip === "unknown") return null;
  const key = createHash("sha256").update(`${bucket}:${ip}`).digest("hex");
  const limiter = getLimiter(bucket);
  if (limiter) {
    try {
      const result = await limiter.limit(key);
      return result.success ? null : { limit: result.limit, remaining: result.remaining, reset: result.reset };
    } catch {
      // Redis unavailable: fall through to the in-memory counter.
    }
  }
  const { tokens, window } = BUCKETS[bucket];
  const span = windowSeconds(window) * 1000;
  let w = beaconWindows.get(key);
  if (!w || now - w.start >= span) {
    if (!w && beaconWindows.size >= BEACON_KEYS_MAX) beaconWindows.clear();
    w = { start: now, hits: 0 };
    beaconWindows.set(key, w);
  }
  w.hits += 1;
  return w.hits > tokens ? { limit: tokens, remaining: 0, reset: w.start + span } : null;
}

/** The /api/t beacon's limit (60 a minute per IP). */
export async function checkBeaconLimit(ip: string, now = Date.now()): Promise<RateLimitInfo | null> {
  return lightLimit("beacon", ip, now);
}

/** The /out/<company> click-out limit (30 a minute per IP). */
export async function checkOutLimit(ip: string, now = Date.now()): Promise<RateLimitInfo | null> {
  return lightLimit("out-click", ip, now);
}

/** Tests only. */
export function resetBeaconLimit(): void {
  beaconWindows.clear();
}

/** Best-effort client IP for a request (the beacon's rate-limit key). */
export function requestIp(request: Request): string {
  return clientIp(request);
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
