import "server-only";
import { after } from "next/server";
import { countBadgeHit, flushBadgeHits } from "./hits";
import { referrerDomain } from "./referrer";
import type { BadgeKind } from "./snippet";

/**
 * The SVG response every badge route returns, and the install count.
 *
 * Caching: browsers keep the image for a day, but the CDN does not cache it,
 * so the first load per visitor per day reaches the function and we learn the
 * embedding domain. The work per load is a cached read plus an in-memory
 * counter (flushed in batches by lib/badge/hits) — no database write per load.
 */
export function badgeResponse(request: Request, kind: BadgeKind, slug: string, svg: string, counted: boolean): Response {
  if (counted) {
    const domain = referrerDomain(request.headers.get("referer"));
    if (domain !== null) {
      countBadgeHit(kind, slug, domain);
      after(() => flushBadgeHits());
    }
  }
  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "public, max-age=86400",
      "CDN-Cache-Control": "no-store",
      "Vercel-CDN-Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
