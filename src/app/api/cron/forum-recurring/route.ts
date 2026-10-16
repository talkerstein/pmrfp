import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { isServiceConfigured } from "@/lib/supabase/config";
import { recurringEnabled, isRecurringKind, type RecurringKind } from "@/lib/forum/recurring";
import { runRecurringThreads } from "@/lib/forum/recurring-server";

/**
 * Daily (Vercel cron): post the recurring forum threads that are due.
 * Each series posts once per period (week, month, winter), so running every
 * day is safe and catches up after a missed run:
 *   - weekly (Monday's ISO week): Open bids this week (trade rooms per
 *     country + regional rooms), Who won public work, What are you working on
 *   - monthly: What jobs sold for (price benchmarks, n ≥ 5), Post a picture
 *     of your current job, the monthly poll
 *   - once per winter (Nov–Mar): Weather & storm thread per regional room
 * Data threads only post when there is real data.
 *
 *   GET /api/cron/forum-recurring            post what's due
 *   GET /api/cron/forum-recurring?dry=1      preview, nothing written
 *   GET /api/cron/forum-recurring?kind=open-bids,poll   only these series
 *
 * Protected with CRON_SECRET (Authorization: Bearer <secret>) when set.
 * FORUM_RECURRING=0 turns it off.
 */
export const maxDuration = 120;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!recurringEnabled()) return NextResponse.json({ ok: true, skipped: "FORUM_RECURRING is off" });
  if (!isServiceConfigured()) return NextResponse.json({ error: "Supabase service role isn't configured." }, { status: 503 });
  const url = new URL(request.url);
  const dry = ["1", "true"].includes(url.searchParams.get("dry") ?? "");
  const kinds = (url.searchParams.get("kind") ?? "").split(",").map((k) => k.trim()).filter(isRecurringKind) as RecurringKind[];
  const result = await runRecurringThreads(createServiceClient(), { dry, kinds: kinds.length ? kinds : undefined });
  return NextResponse.json(result, { status: result.ready ? 200 : 503 });
}
