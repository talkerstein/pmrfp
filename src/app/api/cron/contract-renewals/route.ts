import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { isServiceConfigured } from "@/lib/supabase/config";
import { runContractReminders } from "@/lib/contracts/server";

export const maxDuration = 300;

/**
 * Daily Contract Renewal Calendar reminders (Vercel cron): each PM company
 * gets one digest when its service contracts enter their renewal window,
 * reach 14 days or hit their end date, with "Re-tender on PMRFP" as the
 * main button. Once per stage per end date (lib/contracts/rules
 * needsRenewalReminder). Protect with CRON_SECRET if set. Before the
 * migration runs it reports ready: false and sends nothing.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isServiceConfigured()) return NextResponse.json({ skipped: "no service client" });
  return NextResponse.json(await runContractReminders(createServiceClient()));
}
