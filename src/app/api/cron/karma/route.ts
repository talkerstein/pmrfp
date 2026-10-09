import { NextResponse } from "next/server";
import { syncKarma } from "@/lib/karma/sync";

/**
 * Nightly reputation sync (Vercel cron). Re-derives every company's ledger
 * from real data (new points, clawbacks for deleted/retracted sources), then
 * recomputes scores with decay. Idempotent.
 *
 *   GET /api/cron/karma          apply
 *   GET /api/cron/karma?dry=1    dry run: what would change + projected
 *                                level distribution, nothing written
 *
 * Protected with CRON_SECRET (Authorization: Bearer <secret>) when set.
 */
export const maxDuration = 300;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const dry = new URL(request.url).searchParams.get("dry");
  const report = await syncKarma({ dryRun: dry === "1" || dry === "true" });
  return NextResponse.json(report, { status: report.ready ? 200 : 503 });
}
