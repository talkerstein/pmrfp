import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { isServiceConfigured } from "@/lib/supabase/config";
import { classifyFloridaVbs, fetchFloridaVbsOpenBids, floridaVbsToRfpInsert } from "@/lib/tenders/florida-vbs";
import { classifyDelaware, delawareToRfpInsert, fetchDelawareOpenBids } from "@/lib/tenders/delaware";
import { classifyLaCounty, fetchLaCountyOpenBids, laCountyToRfpInsert } from "@/lib/tenders/la-county";
import { syncPublicSources, type Candidate, type Source } from "@/lib/tenders/sync";

/** Each source gets its own time budget; a slow one fails alone (sync skips it). */
const SOURCE_BUDGET_MS = 20_000;

async function withBudget<T>(key: string, run: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const signal = AbortSignal.timeout(SOURCE_BUDGET_MS);
  try {
    return await run(signal);
  } catch (err) {
    if (signal.aborted) throw new Error(`${key} exceeded its ${SOURCE_BUDGET_MS / 1000}s budget`);
    throw err;
  }
}

const SOURCES: Source[] = [
  {
    // State of Florida solicitations (Vendor Bid System public search API).
    key: "florida-vbs",
    minMatchesToArchive: 3,
    fallbackRegion: "united-states",
    collect: async (today) =>
      withBudget("florida-vbs", async (signal) =>
        (await fetchFloridaVbsOpenBids(signal)).flatMap((ad): Candidate[] => {
          const categories = classifyFloridaVbs(ad, today);
          const insert = categories.length ? floridaVbsToRfpInsert(ad, today) : null;
          return insert ? [{ insert, categories, regionSlug: "us-florida" }] : [];
        }),
      ),
  },
  {
    // Los Angeles County open solicitations (official CSV export).
    key: "la-county",
    minMatchesToArchive: 3,
    fallbackRegion: "united-states",
    collect: async (today) =>
      withBudget("la-county", async (signal) =>
        (await fetchLaCountyOpenBids(signal)).flatMap((bid): Candidate[] => {
          const categories = classifyLaCounty(bid, today);
          const insert = categories.length ? laCountyToRfpInsert(bid, today) : null;
          return insert ? [{ insert, categories, regionSlug: "us-california" }] : [];
        }),
      ),
  },
  {
    // State of Delaware open bids (data.delaware.gov Socrata dataset 2hnj-zwix).
    // Small feed (~50 open bids), so a single match is enough to trust it.
    key: "delaware",
    minMatchesToArchive: 1,
    fallbackRegion: "united-states",
    collect: async (today) =>
      withBudget("delaware", async (signal) =>
        (await fetchDelawareOpenBids(signal)).flatMap((bid): Candidate[] => {
          const categories = classifyDelaware(bid, today);
          const insert = categories.length ? delawareToRfpInsert(bid, today) : null;
          return insert ? [{ insert, categories, regionSlug: "us-delaware" }] : [];
        }),
      ),
  },
];

export const maxDuration = 60;

/**
 * Daily U.S. state/local public-tender import (Vercel cron, 12:30 UTC —
 * after us-tenders, before the 13:00 rfp-alerts run). One polite pass per
 * source per day. `?dry=1` reports what would change without writing.
 * CRON_SECRET-protected.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isServiceConfigured()) return NextResponse.json({ skipped: "no service client" });

  const { status, body } = await syncPublicSources(createServiceClient(), SOURCES, {
    today: new Date().toISOString().slice(0, 10),
    dry: new URL(request.url).searchParams.get("dry") === "1",
  });
  return NextResponse.json(body, { status });
}
