import { NextResponse, after } from "next/server";
import { checkOutLimit, rateLimitResponse, requestIp } from "@/lib/rate-limit";
import { isBotUserAgent } from "@/lib/tracking/privacy";
import { isNonHumanAgent } from "@/lib/bot-guard";
import { getOutTarget } from "@/lib/links/data";
import { countOutClick, flushOutClicks } from "@/lib/links/clicks";
import { withUtm } from "@/lib/links/policy";

/**
 * Click-out from a PMRFP page to a company's own website: /out/<profile slug>.
 *
 * Used for every website link that is not earned yet (lib/links/policy), so
 * the company can see how many visits PMRFP sent it. Rules:
 *  - No open redirect. The destination is NEVER taken from the request: the
 *    slug is looked up and the website stored on that company's profile is
 *    used (cached an hour per slug; a profile edit purges it). Query strings
 *    are ignored. Only live (approved, active) companies resolve.
 *  - 302, X-Robots-Tag noindex, nofollow, and Disallow: /out/ in robots.txt.
 *  - Bots and crawlers get a bare 404: they never learn the destination and
 *    are never counted. People are rate limited per IP (30 a minute).
 *  - One indexed lookup at most (none on a cache hit). The count is added in
 *    memory and written in one batch a minute (lib/links/clicks); the route
 *    is outside the proxy (see proxy.ts matcher), so no session refresh.
 *  - An unknown or not-live slug goes to the directory.
 *
 * The destination gets utm_source=pmrfp.com so the company sees PMRFP in its
 * own analytics (links from here carry noreferrer).
 */
const HEADERS = { "X-Robots-Tag": "noindex, nofollow", "Cache-Control": "no-store" } as const;

async function respond(request: Request, slugParam: string, count: boolean): Promise<NextResponse> {
  const ua = request.headers.get("user-agent");
  if (isBotUserAgent(ua) || isNonHumanAgent(ua)) {
    return new NextResponse("Not found", { status: 404, headers: { ...HEADERS, "Content-Type": "text/plain; charset=utf-8" } });
  }

  const blocked = await checkOutLimit(requestIp(request));
  if (blocked) return rateLimitResponse(blocked);

  const target = await getOutTarget(slugParam);
  if (!target) {
    return new NextResponse(null, { status: 302, headers: { ...HEADERS, Location: new URL("/directory", request.url).toString() } });
  }

  if (count) {
    countOutClick(slugParam.toLowerCase());
    after(() => flushOutClicks());
  }
  return new NextResponse(null, { status: 302, headers: { ...HEADERS, Location: withUtm(target) } });
}

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  return respond(request, (await params).slug, true);
}

/** A HEAD request is never a visit. */
export async function HEAD(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  return respond(request, (await params).slug, false);
}
