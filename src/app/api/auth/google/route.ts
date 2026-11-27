import { NextResponse } from "next/server";
import { checkStagingRateLimit, stagingClientIp } from "@/lib/d1/staging-rate-limit";
import { beginGoogleSignIn, googleStateCookie, googleStateOptions, nativeGoogleConfigured } from "@/lib/auth/vps-google";

export async function GET(request: Request) {
  if (!nativeGoogleConfigured()) return new Response(null, { status: 404 });
  const limit = await checkStagingRateLimit("auth-ip", stagingClientIp(request.headers, true), true);
  if (limit.status !== 204) {
    return new Response(null, { status: limit.status, headers: { "cache-control": "no-store" } });
  }
  const params = new URL(request.url).searchParams;
  const { authorization, cookie } = beginGoogleSignIn(params.get("next"), params.get("l"), params.get("intent") === "signup");
  const result = NextResponse.redirect(authorization, { headers: { "cache-control": "no-store", "referrer-policy": "no-referrer" } });
  result.cookies.set(googleStateCookie, cookie, googleStateOptions);
  return result;
}
