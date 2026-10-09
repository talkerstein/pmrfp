import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { isServiceConfigured } from "@/lib/supabase/config";
import { classifyScbo, fetchScboAds, scboToRfpInsert } from "@/lib/tenders/scbo";
import { syncPublicSources, type Candidate, type Source } from "@/lib/tenders/sync";

/** SCBO asks for 10 s between requests (robots.txt), so one pass takes ~40 s. */
const SCBO_BUDGET_MS = 50_000;

const SOURCES: Source[] = [
  {
    // South Carolina Business Opportunities: state, universities, school districts, counties, towns.
    key: "scbo",
    minMatchesToArchive: 15,
    fallbackRegion: "united-states",
    collect: async (today) => {
      const signal = AbortSignal.timeout(SCBO_BUDGET_MS);
      return (await fetchScboAds(signal)).flatMap((ad): Candidate[] => {
        const categories = classifyScbo(ad, today);
        const insert = categories.length ? scboToRfpInsert(ad, today) : null;
        return insert ? [{ insert, categories, regionSlug: "us-south-carolina" }] : [];
      });
    },
  },
];

export const maxDuration = 60;

/**
 * Daily South Carolina (SCBO) public-tender import (Vercel cron, 12:20 UTC).
 * Its own route because the crawl delay uses most of a 60 s budget.
 * `?dry=1` reports what would change without writing. CRON_SECRET-protected.
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
