import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { isServiceConfigured } from "@/lib/supabase/config";

/**
 * Weekly retention for first-party tracking (lib/tracking): deletes funnel
 * events, daily visitor hashes, page-view and referrer counts, and
 * per-visitor listing views older than 13 months (purge_site_tracking(),
 * migration 20261021000200; the function never accepts less than 13).
 * Vercel cron Sundays 08:40 UTC. CRON_SECRET-protected, like the others.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isServiceConfigured()) return NextResponse.json({ skipped: "no service client" });
  const { data, error } = await createServiceClient().rpc("purge_site_tracking", { p_months: 13 });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ purged: data });
}
