import { NextResponse } from "next/server";
import { isHistoryGroup } from "@/lib/contract-history/registry";
import { runAwardHistory } from "@/lib/contract-history/run";

// The federal file is ~640 MB, streamed and filtered; SEAO monthly roll-ups are ~70 MB.
export const maxDuration = 300;

/**
 * Award-history imports (Vercel cron). Groups:
 *   weekly   SEAO newest weekly file, Toronto awards, TxDOT bid tabs, USAspending (last ~45 days)
 *   monthly  Montréal contracts, Ottawa contracts
 *   federal  Government of Canada contracts over $10,000 (quarterly data)
 * Options (?dry=1, ?source=, ?since=, ?files=, ?from=&to=, …): lib/contract-history/run.ts.
 */
export async function GET(request: Request, { params }: { params: Promise<{ group: string }> }) {
  const { group } = await params;
  if (!isHistoryGroup(group)) return NextResponse.json({ error: "Unknown group" }, { status: 404 });
  return runAwardHistory(request, group);
}
