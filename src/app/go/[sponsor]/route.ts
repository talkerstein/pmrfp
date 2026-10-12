import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { isServiceConfigured } from "@/lib/supabase/config";
import { getSponsorSnapshot } from "@/lib/sponsors/data";
import { isPlacement, tradeSlug, type Placement } from "@/lib/sponsors/model";
import { sponsorById, sponsorDestination } from "@/lib/sponsors/registry";

/**
 * Tracked sponsor link: count the click, then send the reader to the
 * sponsor with UTM tags. House sponsors come from the registry, paid ones
 * from the cached sponsor snapshot (live sponsors only). Unknown or
 * no-longer-live sponsors go home; a failed count never blocks the redirect.
 */
export async function GET(request: Request, { params }: { params: Promise<{ sponsor: string }> }) {
  const { sponsor: id } = await params;
  const url = new URL(request.url);
  const house = sponsorById(id);
  const paid = house ? null : (await getSponsorSnapshot()).find((s) => s.slug === id && s.status === "approved" && s.url);
  const target = house ?? paid;
  if (!target) return NextResponse.redirect(new URL("/", url), 302);

  const p = url.searchParams.get("p") ?? "";
  const placement: Placement = isPlacement(p) ? p : "trade_page";
  const trade = tradeSlug(url.searchParams.get("t") ?? "").slice(0, 60);
  const region = tradeSlug(url.searchParams.get("r") ?? "").slice(0, 60);

  if (isServiceConfigured()) {
    try {
      await createServiceClient().rpc("record_sponsor_click", {
        p_sponsor: house ? house.id : id,
        p_placement: placement,
        p_trade: trade,
        p_region: region,
      });
    } catch {
      // Counting is best-effort.
    }
  }
  const res = NextResponse.redirect(sponsorDestination(target, placement, trade || null), 302);
  res.headers.set("X-Robots-Tag", "noindex, nofollow");
  res.headers.set("Cache-Control", "no-store");
  return res;
}
