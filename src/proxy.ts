import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { GEO_COOKIE, encodeGeo } from "@/lib/visitor-geo";

// Next.js 16 "proxy" convention (formerly middleware). Refreshes the Supabase
// session on each request; route-level role protection is added in Phase 3.
export async function proxy(request: NextRequest) {
  const response = await updateSession(request);

  // Copy Vercel's IP geolocation into a readable cookie so cached pages can
  // show U.S. visitors U.S. tenders and prices (see lib/visitor-geo).
  const geo = encodeGeo(request.headers.get("x-vercel-ip-country"), request.headers.get("x-vercel-ip-country-region"));
  if (geo && request.cookies.get(GEO_COOKIE)?.value !== geo) {
    response.cookies.set(GEO_COOKIE, geo, { path: "/", maxAge: 60 * 60 * 24 * 30, sameSite: "lax" });
  }
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
