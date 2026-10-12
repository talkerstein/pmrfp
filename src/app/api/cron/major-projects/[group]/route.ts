import { NextResponse } from "next/server";
import { runMajorProjectImport } from "@/lib/major-projects/run";

// Up to six feeds, one after another; PQI waits 10 s between its two requests (Crawl-Delay).
export const maxDuration = 300;

/**
 * Weekly major-projects import, wave-2 groups (Vercel cron, Sundays):
 *   /api/cron/major-projects/funding  09:41 UTC  Québec PQI, Edmonton capital projects, Manitoba capital plans
 *   /api/cron/major-projects/local    09:56 UTC  Halifax + Surrey permits, Toronto / Edmonton / Calgary / York applications
 * ?dry=1 and ?source=<key> as described in lib/major-projects/run.ts.
 */
export async function GET(request: Request, { params }: { params: Promise<{ group: string }> }) {
  const { group } = await params;
  if (group !== "funding" && group !== "local") return NextResponse.json({ error: "Unknown group" }, { status: 404 });
  return runMajorProjectImport(request, group);
}
