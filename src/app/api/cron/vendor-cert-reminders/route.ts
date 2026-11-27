import { isVpsLiveCustomerAuth } from "@/lib/d1/staging-config";
import { runD1CertReminders } from "@/lib/vendor-certs/d1-reminders";
import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { isServiceConfigured } from "@/lib/supabase/config";
import { runCertReminders } from "@/lib/vendor-certs/server";

export const maxDuration = 300;

/**
 * Daily Vendor Insurance Tracker reminders (Vercel cron): each PM company
 * gets one digest when its vendors' certificates reach 30, 14 or 0 days,
 * and vendors the PM opted in get their renewal link at 14 and 0 days.
 * Once per stage per expiry date (lib/vendor-certs/rules needsReminder).
 * Protect with CRON_SECRET if set. Before the migration runs it reports
 * ready: false and sends nothing.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const dry = new URL(request.url).searchParams.get("dry") === "1";
  if (isVpsLiveCustomerAuth()) {
    try {
      const report = await runD1CertReminders(dry);
      return NextResponse.json(report, { status: report.failed ? 503 : 200 });
    } catch {
      return NextResponse.json({ error: "Certificate reminders unavailable" }, { status: 503 });
    }
  }
  if (dry) return NextResponse.json({ ready: false, dry }, { status: 503 });
  if (!isServiceConfigured()) return NextResponse.json({ skipped: "no service client" });
  return NextResponse.json(await runCertReminders(createServiceClient()));
}
