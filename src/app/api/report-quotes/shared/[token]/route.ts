import { NextResponse } from "next/server";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { createServiceClient } from "@/lib/supabase/service";
import { isServiceConfigured } from "@/lib/supabase/config";
import { resolveShare } from "@/lib/report-quotes/server";

/**
 * GET /api/report-quotes/shared/<token> — a trade opens the inspection
 * report a realtor attached to a quote request. Only the token's sha256 is
 * stored; the link works until the report's 90 days are up (or it's
 * deleted), and each open signs a fresh 2-minute URL. Not indexed, no referrer.
 */
export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const limited = await checkRateLimit(request, "public-read");
  if (limited) return rateLimitResponse(limited);
  const { token } = await params;
  const url = isServiceConfigured() ? await resolveShare(createServiceClient(), token) : null;
  if (!url) {
    return new NextResponse("This report link has expired or the report was deleted. Ask the sender for a new copy.", {
      status: 410,
      headers: { "Content-Type": "text/plain; charset=utf-8", "X-Robots-Tag": "noindex, nofollow", "Cache-Control": "no-store" },
    });
  }
  const res = NextResponse.redirect(url, 302);
  res.headers.set("Cache-Control", "private, no-store");
  res.headers.set("Referrer-Policy", "no-referrer");
  res.headers.set("X-Robots-Tag", "noindex, nofollow");
  return res;
}
