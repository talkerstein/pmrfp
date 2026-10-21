import { NextResponse } from "next/server";
import { getSession } from "@/lib/access/access";
import { isServiceConfigured, isSupabaseConfigured } from "@/lib/supabase/config";
import { createServiceClient } from "@/lib/supabase/service";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { loadBuyers } from "@/lib/buyers/load";
import { findBuyerPage } from "@/lib/buyers/model";
import { canFollowBuyers, followUsage, parseFollowKey } from "@/lib/follows/rules";
import { followBuyer, myFollows, unfollowBuyer } from "@/lib/follows/server";
import { EVENT, trackEvent } from "@/lib/analytics";

/**
 * Follow / unfollow a buyer or town (PMRFP for Towns, Part B1).
 *
 *   GET  ?buyer=<key>   who's asking: signed in or not, can they follow,
 *                       do they follow <key>, every key they follow and
 *                       how many free follows are used. Private, never cached.
 *   POST {buyer, action: "follow" | "unfollow"}
 *                       same-origin, rate-limited. Signed-out → 401 (the
 *                       button sends them to sign-up with the follow kept).
 *                       Trade and supplier accounts (and Trade Pro) only.
 *                       Free accounts stop at 3 (follow_buyer() enforces it
 *                       in the database); Trade Pro and trial are unlimited.
 *
 * Writes use the service role after these checks: RLS lets a person read
 * their own follows, never write them directly.
 */

const PRIVATE = { "Cache-Control": "private, no-store" };
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: PRIVATE });

export async function GET(request: Request) {
  if (!isSupabaseConfigured()) return json({ signedIn: false, demo: true });
  const session = await getSession().catch(() => null);
  if (!session) return json({ signedIn: false });
  const key = parseFollowKey(new URL(request.url).searchParams.get("buyer"));
  const canFollow = canFollowBuyers({ primaryRole: session.profile.primary_role, hasTradeAccess: session.hasTradeAccess });
  if (!isServiceConfigured()) return json({ signedIn: true, canFollow, following: false, keys: [], usage: followUsage(0, session.hasTradeAccess) });
  const { rows, missing } = await myFollows(createServiceClient(), session.userId);
  const keys = rows.map((r) => r.key);
  return json({
    signedIn: true,
    canFollow,
    pro: session.hasTradeAccess,
    following: key ? keys.includes(key) : false,
    keys,
    usage: followUsage(keys.length, session.hasTradeAccess),
    ...(missing ? { unavailable: true } : {}),
  });
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && new URL(origin).host !== new URL(request.url).host) return json({ error: "Forbidden" }, 403);
  const limited = await checkRateLimit(request, "save-rfp");
  if (limited) return rateLimitResponse(limited);

  let body: { buyer?: unknown; action?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid request" }, 400);
  }
  const key = parseFollowKey(body.buyer);
  const action = body.action === "unfollow" ? "unfollow" : body.action === "follow" ? "follow" : null;
  if (!key || !action) return json({ error: "Invalid request" }, 400);
  if (!isSupabaseConfigured()) return json({ ok: true, demo: true });

  const session = await getSession().catch(() => null);
  if (!session) return json({ error: "Sign in required", signUp: true }, 401);
  if (session.profile.status === "suspended") return json({ error: "Account suspended" }, 403);
  const pro = session.hasTradeAccess;
  if (!canFollowBuyers({ primaryRole: session.profile.primary_role, hasTradeAccess: pro })) return json({ error: "A trade or supplier account is required", reason: "role" }, 403);
  if (!isServiceConfigured()) return json({ error: "Not available" }, 503);
  const db = createServiceClient();

  if (action === "unfollow") {
    const r = await unfollowBuyer(db, { userId: session.userId, key, pro });
    if (r.status === "unavailable" || r.status === "error") return json({ error: "Could not unfollow" }, r.status === "unavailable" ? 503 : 500);
    return json({ ok: true, following: false, usage: r.usage });
  }

  // Only real pages (the shared buyer snapshot: the directory, every municipality, board buyers).
  const [provinceSlug, slug] = key.split("/");
  if (!findBuyerPage((await loadBuyers()).pages, provinceSlug, slug)) return json({ error: "Not found" }, 404);
  const r = await followBuyer(db, { userId: session.userId, orgId: session.organization?.id ?? null, key, pro });
  if (r.status === "unavailable" || r.status === "error") return json({ error: "Could not follow" }, r.status === "unavailable" ? 503 : 500);
  if (r.status === "limit") return json({ ok: false, reason: "limit", following: false, usage: r.usage }, 409);
  await trackEvent(EVENT.FOLLOW_BUYER, { buyer: key, pro }, { userId: session.userId, role: session.profile.primary_role });
  return json({ ok: true, following: true, usage: r.usage });
}
