import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { isServiceConfigured } from "@/lib/supabase/config";
import { buyerFollowAlertsEnabled } from "@/lib/follows/rules";
import { runBuyerFollowAlerts } from "@/lib/follows/alerts-server";

export const maxDuration = 60;

/**
 * Hourly same-day "New from buyers you follow" emails (PMRFP for Towns,
 * Part B1) for Trade Pro and trial members: new listings in the last 36
 * hours (imported public tenders, permission imports, public-buyer posts)
 * from the buyers and towns they follow, one email per person per run.
 * Free followers get these in the Monday roundup instead (cron/tender-digest).
 *
 * Never twice: lead_alert_log "follow:<id>" per person and listing, and
 * nothing the daily category digest or a PM job alert already sent them
 * (notifications 'rfp_alert'). Runs at :17, clear of the 13:00 digest.
 *
 * Behind BUYER_FOLLOW_ALERTS_ENABLED (default off: reports, sends nothing).
 * `?dry=1` reports who would get what. Protect with CRON_SECRET.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isServiceConfigured()) return NextResponse.json({ skipped: "no service client" });
  const dry = new URL(request.url).searchParams.get("dry") === "1";
  const enabled = buyerFollowAlertsEnabled();
  if (!dry && !enabled) return NextResponse.json({ skipped: "BUYER_FOLLOW_ALERTS_ENABLED is off", enabled });
  const result = await runBuyerFollowAlerts(createServiceClient(), { dry, enabled, budgetMs: 45_000 });
  return NextResponse.json({ dry, ...result });
}
