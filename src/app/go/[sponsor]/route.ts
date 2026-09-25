import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { isServiceConfigured } from "@/lib/supabase/config";
import { PLACEMENTS, sponsorById, sponsorDestination, tradeSlug, type Placement } from "@/lib/sponsors/registry";

/**
 * Tracked sponsor link: count the click, then send the reader to the
 * sponsor with UTM tags. Unknown sponsors go home; a failed count never
 * blocks the redirect.
 */
export async function GET(request: Request, { params }: { params: Promise<{ sponsor: string }> }) {
  const { sponsor: id } = await params;
  const sponsor = sponsorById(id);
  const url = new URL(request.url);
  if (!sponsor) return NextResponse.redirect(new URL("/", url), 302);

  const p = url.searchParams.get("p") ?? "";
  const placement: Placement = (PLACEMENTS as readonly string[]).includes(p) ? (p as Placement) : "trade_page";
  const trade = tradeSlug(url.searchParams.get("t") ?? "").slice(0, 60);

  if (isServiceConfigured()) {
    try {
      await createServiceClient().rpc("record_sponsor_click", { p_sponsor: sponsor.id, p_placement: placement, p_trade: trade });
    } catch {
      // Counting is best-effort.
    }
  }
  const res = NextResponse.redirect(sponsorDestination(sponsor, placement, trade || null), 302);
  res.headers.set("X-Robots-Tag", "noindex, nofollow");
  res.headers.set("Cache-Control", "no-store");
  return res;
}
