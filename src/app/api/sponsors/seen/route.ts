import { after } from "next/server";
import { getSponsorSnapshot } from "@/lib/sponsors/data";
import { countImpression, flushImpressions } from "@/lib/sponsors/impressions";
import { EMAIL_PLACEMENTS, isPlacement, tradeSlug } from "@/lib/sponsors/model";
import { sponsorById } from "@/lib/sponsors/registry";

/**
 * "A sponsor unit was on screen": one tiny first-party POST from the unit
 * itself (components/sponsors/sponsor-seen) when it's half visible, once
 * per page view. No cookies read or set, no identifiers stored: the count
 * goes into an in-memory daily counter that's written in batches
 * (lib/sponsors/impressions). Unknown sponsors and placements are ignored.
 */

const PER_IP_PER_MINUTE = 60;
const seenByIp = new Map<string, { n: number; at: number }>();

function overLimit(ip: string, now = Date.now()): boolean {
  const e = seenByIp.get(ip);
  if (!e || now - e.at > 60_000) {
    if (seenByIp.size > 5000) seenByIp.clear();
    seenByIp.set(ip, { n: 1, at: now });
    return false;
  }
  e.n++;
  return e.n > PER_IP_PER_MINUTE;
}

const NO_CONTENT = () => new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });

export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
  if (overLimit(ip)) return NO_CONTENT();
  const body = (await request.json().catch(() => null)) as { s?: unknown; p?: unknown; t?: unknown; r?: unknown } | null;
  const sponsor = typeof body?.s === "string" ? body.s.slice(0, 40) : "";
  const placement = body?.p;
  if (!sponsor || !isPlacement(placement) || EMAIL_PLACEMENTS.includes(placement)) return NO_CONTENT();
  const known = sponsorById(sponsor) || (await getSponsorSnapshot()).some((s) => s.slug === sponsor && s.status === "approved");
  if (!known) return NO_CONTENT();
  countImpression({
    sponsor,
    placement,
    trade: typeof body?.t === "string" ? tradeSlug(body.t).slice(0, 60) : "",
    region: typeof body?.r === "string" ? tradeSlug(body.r).slice(0, 60) : "",
  });
  after(() => flushImpressions());
  return NO_CONTENT();
}
