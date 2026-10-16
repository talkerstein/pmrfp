import { NextResponse } from "next/server";
import { runInsightsBrief } from "@/lib/insights/server";

export const maxDuration = 60;

/**
 * The weekly personal insights brief for Trade Pro and trial members
 * (Vercel cron, Mondays 13:40 UTC, after the Monday imports). One email a
 * week per member, merged with the weekly lead alert (lib/insights/email
 * explains the rule). Sends NOTHING unless INSIGHTS_EMAIL_ENABLED is on;
 * `?dry=1` reports who would get what without sending or writing, flag or
 * not. AI polish only with INSIGHTS_LLM=1 (validator-guarded).
 * Protect with CRON_SECRET if set.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const dry = new URL(request.url).searchParams.get("dry") === "1";
  const run = await runInsightsBrief({ dry });
  if (run.skipped && !run.sends.length) return NextResponse.json({ skipped: run.skipped, dry, enabled: run.enabled });
  return NextResponse.json(
    dry
      ? { dry: true, enabled: run.enabled, llm: run.llm, week: run.week, considered: run.considered, members: run.sends, skips: run.skips, rejections: run.rejections.length }
      : { sent: run.sent, week: run.week, skips: run.skips, rejections: run.rejections.length, stopped: run.skipped },
  );
}
