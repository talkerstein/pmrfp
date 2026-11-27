import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { isServiceConfigured } from "@/lib/supabase/config";
import { cronAuthFailure } from "@/lib/cron-auth";
import { vpsAppDatabase } from "@/lib/d1/http-binding";
import { purgeD1SiteTracking } from "@/lib/d1/site-tracking-retention";

/**
 * Weekly retention for first-party tracking (lib/tracking): deletes funnel
 * events, daily visitor hashes, page-view and referrer counts, and
 * per-visitor listing views older than 13 months (purge_site_tracking(),
 * migration 20261021000200; the function never accepts less than 13).
 * Vercel cron Sundays 08:40 UTC. CRON_SECRET-protected, like the others.
 */
export async function GET(request: Request) {
  const status = cronAuthFailure(request.headers.get("authorization"));
  if (status) {
    return NextResponse.json({ error: status === 401 ? "Unauthorized" : "Cron unavailable" }, { status });
  }
  const dry = new URL(request.url).searchParams.get("dry") === "1";
  if (process.env.PMRFP_VPS_CUSTOMER_ENGINE === "d1") {
    try {
      const counts = await purgeD1SiteTracking(vpsAppDatabase(), new Date(), dry);
      return NextResponse.json(dry ? { dry: true, wouldPurge: counts } : { purged: counts });
    } catch {
      return NextResponse.json({ error: "Tracking retention unavailable" }, { status: 503 });
    }
  }
  if (dry) return NextResponse.json({ dry: true, skipped: "Preview requires D1" }, { status: 503 });
  if (!isServiceConfigured()) return NextResponse.json({ skipped: "no service client" });
  const { data, error } = await createServiceClient().rpc("purge_site_tracking", { p_months: 13 });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ purged: data });
}
