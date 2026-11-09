import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { isServiceConfigured } from "@/lib/supabase/config";
import { purgeExpiredReports } from "@/lib/report-quotes/server";

/**
 * Daily (Vercel cron): delete stored inspection-report PDFs whose 90 days
 * (report_deleted_after) are up. The item list, the send log and the
 * report row stay; share links stop working. Protected with CRON_SECRET.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isServiceConfigured()) return NextResponse.json({ skipped: "no service client" });
  const result = await purgeExpiredReports(createServiceClient());
  return NextResponse.json(result);
}
