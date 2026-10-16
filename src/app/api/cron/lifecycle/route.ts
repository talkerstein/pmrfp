import { NextResponse } from "next/server";
import { runLifecycle } from "@/lib/lifecycle/server";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * The lifecycle email sequence (Vercel cron, hourly at :33). Each run picks
 * every member with a step due, sends at most one email per member, and only
 * between 9:00 and 17:00 Monday to Friday in the member's own time zone, so
 * the hourly runs spread the day's sends across the time zones.
 *
 * Guard rails (lib/lifecycle):
 *  - Sends NOTHING unless LIFECYCLE_EMAILS_ENABLED is on (and Resend is
 *    configured). `?dry=1` reports who would get what, without sending or
 *    writing anything, flag or not. The report has no email addresses
 *    (those are on /admin/lifecycle's dry run, admins only).
 *  - Idempotent: a (member, step) row is written before the send and is
 *    unique, so a step never goes twice. Missed windows are never sent late.
 *  - Stops on upgrade, unsubscribe, bounce or complaint; one lifecycle email
 *    a day; not on a day the weekly email went out to that member.
 * Protect with CRON_SECRET if set.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const dry = new URL(request.url).searchParams.get("dry") === "1";
  const r = await runLifecycle({ dry });
  if (r.skipped) return NextResponse.json({ skipped: r.skipped, dry, enabled: r.enabled });
  const summary = {
    enabled: r.enabled,
    dry,
    considered: r.considered,
    waits: r.waits,
    stops: r.stops,
    skips: r.skips.length,
  };
  if (dry) {
    return NextResponse.json({
      ...summary,
      wouldSend: r.sends.map((s) => ({ org: s.org, step: s.step, lang: s.lang, country: s.country, subject: s.subject })),
      wouldSkip: r.skips.map((s) => ({ org: s.org, step: s.step, reason: s.reason })),
    });
  }
  return NextResponse.json({ ...summary, sent: r.sent, failed: r.failed });
}
