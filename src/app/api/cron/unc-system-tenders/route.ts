import { NextResponse } from "next/server";
import { syncPublicSources, tenderSyncDatabase } from "@/lib/tenders/sync";
import { uncSystemSource } from "@/lib/tenders/unc-system";

export const maxDuration = 60;

/**
 * Daily UNC System Office open-bid import (Vercel cron, 12:42 UTC — after
 * us-local-tenders, whose NC eVP feed it checks for duplicates, before the
 * 13:00 rfp-alerts run). One list read plus one detail read per NEW listing,
 * robots.txt first. `?dry=1` reports what would change without writing.
 * CRON_SECRET-protected.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const db = tenderSyncDatabase();
  if (!db) return NextResponse.json({ skipped: "no service client" });

  const { status, body } = await syncPublicSources(db, [uncSystemSource()], {
    today: new Date().toISOString().slice(0, 10),
    dry: new URL(request.url).searchParams.get("dry") === "1",
  });
  return NextResponse.json(body, { status });
}
