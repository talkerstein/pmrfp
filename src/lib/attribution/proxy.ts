import { after, type NextRequest, type NextResponse } from "next/server";
import { FT_COOKIE, buildFirstTouch, parseFirstTouch, remainingMaxAge, serializeFirstTouch, withLastTouch } from "./cookie";
import { classifyChannel } from "./channel";
import { countLanding, flushLandings } from "./landings";

/**
 * First-touch attribution in the proxy (lib/attribution/cookie). Called only
 * for page navigations by people (the proxy filters bots, prefetches and
 * client-side route fetches). No database work on the request path:
 *  - no cookie yet → set pmrfp_ft once, and count the landing in the
 *    in-memory daily aggregate (flushed in a batch after the response);
 *  - cookie present → left alone, unless this visit carries new utm_* tags,
 *    which are kept as the last-touch campaign (first-touch fields unchanged).
 */
export function withAttribution(request: NextRequest, response: NextResponse, lang: string): NextResponse {
  try {
    if (request.headers.get("next-router-prefetch") || /prefetch|prerender/i.test(request.headers.get("sec-purpose") ?? request.headers.get("purpose") ?? "")) {
      return response;
    }
    const existing = parseFirstTouch(request.cookies.get(FT_COOKIE)?.value);
    const opts = { path: "/", sameSite: "lax" as const, httpOnly: true, secure: request.nextUrl.protocol === "https:" };
    if (existing) {
      const updated = withLastTouch(existing, request.nextUrl.searchParams);
      if (updated) response.cookies.set(FT_COOKIE, serializeFirstTouch(updated), { ...opts, maxAge: remainingMaxAge(existing.first) });
      return response;
    }
    const ft = buildFirstTouch({
      path: request.nextUrl.pathname,
      referer: request.headers.get("referer"),
      params: request.nextUrl.searchParams,
      lang,
      country: request.headers.get("x-vercel-ip-country"),
    });
    response.cookies.set(FT_COOKIE, serializeFirstTouch(ft), { ...opts, maxAge: remainingMaxAge(ft.first) });
    countLanding(classifyChannel(ft, [request.nextUrl.hostname]), ft.path);
    after(() => flushLandings());
  } catch {
    // Attribution must never break a page.
  }
  return response;
}
