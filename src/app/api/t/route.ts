import { NextResponse, type NextRequest } from "next/server";
import { checkBeaconLimit, rateLimitResponse, requestIp } from "@/lib/rate-limit";
import { checkBeaconRequest, parseBeacon } from "@/lib/tracking/beacon";
import { ingestBeacon } from "@/lib/tracking/ingest";
import { requestFacts } from "@/lib/tracking/request";
import { flushAfterResponse } from "@/lib/tracking/server";

/**
 * POST /api/t: the first-party analytics beacon (lib/tracking/client).
 * Page views, listing views and a few browser-side funnel events, batched.
 *
 * Same-origin only (Sec-Fetch-Site / Origin), 4 KB cap, bots refused,
 * Do-Not-Track and Global Privacy Control honoured (204, nothing kept), and
 * 60 calls a minute per IP (hashed; Upstash or in memory, never the
 * database). Nothing touches the database on this request: rows are
 * buffered and written in one batch after the response. The proxy skips
 * this path, so no session refresh runs either. Always answers with no body.
 */

const NO_STORE = { "Cache-Control": "no-store" };
const empty = (status: number) => new NextResponse(null, { status, headers: NO_STORE });

export async function POST(request: NextRequest) {
  const check = checkBeaconRequest(request);
  if (!check.ok) return empty(check.status);

  const limited = await checkBeaconLimit(requestIp(request));
  if (limited) return rateLimitResponse(limited);

  let text: string;
  try {
    text = await request.text();
  } catch {
    return empty(400);
  }
  const parsed = parseBeacon(text);
  if (!parsed.ok) return empty(parsed.status);

  if (parsed.items.length) {
    const facts = requestFacts(request.headers, request.cookies.getAll());
    ingestBeacon(parsed.items, facts);
    flushAfterResponse();
  }
  return empty(204);
}
