import type { NextRequest } from "next/server";
import { cookies } from "next/headers";
import {
  canaryCookie, canaryCookieOptions, cloudflareCanaryConfig, cloudflareCanarySession, cloudflareCanarySignOut,
} from "@/lib/auth/cloudflare-canary";

const headers = { "cache-control": "private, no-store", "x-robots-tag": "noindex" };

export async function GET(request: NextRequest) {
  const config = cloudflareCanaryConfig();
  if (!config) return new Response(null, { status: 404, headers });
  const token = request.cookies.get(canaryCookie)?.value ?? "";
  if (!await cloudflareCanarySession(config, token)) return new Response(null, { status: 401, headers });
  return Response.json({ authenticated: true, provider: "cloudflare" }, { headers });
}

export async function POST(request: NextRequest) {
  const config = cloudflareCanaryConfig();
  if (!config) return new Response(null, { status: 404, headers });
  if (request.headers.get("origin") !== request.nextUrl.origin) return new Response(null, { status: 403, headers });
  const token = request.cookies.get(canaryCookie)?.value;
  if (!token) return new Response(null, { status: 401, headers });
  if (!await cloudflareCanarySignOut(config, token)) return new Response(null, { status: 503, headers });
  (await cookies()).set(canaryCookie, "", { ...canaryCookieOptions, maxAge: 0 });
  return new Response(null, { status: 204, headers });
}
