import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { isServiceConfigured } from "@/lib/supabase/config";
import { classifySam, fetchSamOpenTenders, samToRfpInsert, usStateRegionSlug } from "@/lib/tenders/sam";
import { syncPublicSources, type Source } from "@/lib/tenders/sync";

const SOURCES: Source[] = [
  {
    // U.S. federal building and property solicitations (SAM.gov daily CSV).
    key: "sam",
    minMatchesToArchive: 100,
    fallbackRegion: "united-states",
    collect: async (today) =>
      (await fetchSamOpenTenders(today)).flatMap((row) => {
        const categories = classifySam(row, today);
        const insert = categories.length ? samToRfpInsert(row, today) : null;
        return insert
          ? [{ insert, categories, regionSlug: usStateRegionSlug(row.PopState) ?? "united-states" }]
          : [];
      }),
  },
];

// The SAM.gov file is ~240 MB; streaming + filtering takes a few seconds, the
// first import's inserts a few more. Own route = own 60 s budget.
export const maxDuration = 60;

/**
 * Daily U.S. public-tender import (Vercel cron, 12:15 UTC — before the
 * 13:00 rfp-alerts run). SAM.gov refreshes its extract around 03:30 UTC.
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
