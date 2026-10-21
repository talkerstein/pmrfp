import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { isServiceConfigured } from "@/lib/supabase/config";
import { pmJobAlertsEnabled } from "@/lib/pm-jobs/alerts";
import { PM_JOB_SOURCES } from "@/lib/pm-jobs/rules";
import { runPmJobAlerts, type AlertRunResult } from "@/lib/pm-jobs/server";

export const maxDuration = 60;

/**
 * Hourly catch-up for same-day PM job alerts (lib/pm-jobs/server). Publishing
 * a PM job at /admin/rfps already emails matching trades right away; this
 * finishes any run that timed out or failed, for PM jobs published in the
 * last 36 hours. lead_alert_log makes it safe to run any number of times:
 * nobody gets the same job twice.
 *
 * Behind PM_JOB_ALERTS_ENABLED (default off: reports, sends nothing).
 * `?dry=1` lists who each recent job would email. Protect with CRON_SECRET.
 */
const WINDOW_HOURS = 36;
const BUDGET_MS = 50_000;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isServiceConfigured()) return NextResponse.json({ skipped: "no service client" });
  const dry = new URL(request.url).searchParams.get("dry") === "1";
  const enabled = pmJobAlertsEnabled();
  if (!dry && !enabled) return NextResponse.json({ skipped: "PM_JOB_ALERTS_ENABLED is off", enabled });

  const db = createServiceClient();
  const since = new Date(Date.now() - WINDOW_HOURS * 3_600_000).toISOString();
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await db
    .from("rfp_posts")
    .select("id,title")
    .eq("status", "published")
    .eq("is_demo", false)
    .in("source_type", [...PM_JOB_SOURCES])
    .not("posted_by_user_id", "is", null)
    .gte("published_at", since)
    .or(`deadline.is.null,deadline.gte.${today}`)
    .order("published_at", { ascending: true })
    .limit(50);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const started = Date.now();
  const jobs: { id: string; title: string; result: AlertRunResult }[] = [];
  for (const job of (data ?? []) as { id: string; title: string }[]) {
    const left = BUDGET_MS - (Date.now() - started);
    if (left < 5_000) break;
    const result = await runPmJobAlerts(db, job.id, { dry, budgetMs: left - 2_000 });
    jobs.push({ id: job.id, title: job.title, result: dry ? result : { ...result, orgs: [] } });
  }
  return NextResponse.json({
    dry,
    enabled,
    jobs: jobs.map((j) => ({ id: j.id, title: j.title, state: j.result.state, reason: j.result.reason, wouldEmail: j.result.wouldEmail, sent: j.result.sent, ...(dry ? { companies: j.result.orgs } : {}) })),
    sent: jobs.reduce((s, j) => s + j.result.sent, 0),
  });
}
