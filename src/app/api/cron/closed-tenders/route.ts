import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { isServiceConfigured } from "@/lib/supabase/config";
import { regionForTender } from "@/lib/tenders/canadabuys";
import {
  awardForTender,
  classifyClosedTender,
  closedTenderToRfpInsert,
  fetchClosedTenderData,
  indexAwards,
  latestAmendments,
} from "@/lib/tenders/canadabuys-closed";
import { classifyYukonClosed, fetchYukonClosedTenders, yukonClosedToRfpInsert } from "@/lib/tenders/yukon-closed";
import { syncPublicSources, type Source } from "@/lib/tenders/sync";

const SOURCES: Source[] = [
  {
    // ~700 real federal building-trade tenders that closed in the last 18
    // months, with the winner where the award file has one.
    key: "canadabuys-closed",
    history: true,
    minMatchesToArchive: 100,
    collect: async (today) => {
      const { tenders, awards } = await fetchClosedTenderData(today);
      const byAward = indexAwards(awards, today);
      return latestAmendments(tenders).flatMap((row) => {
        const categories = classifyClosedTender(row, today);
        const insert = categories.length ? closedTenderToRfpInsert(row, awardForTender(row, byAward)) : null;
        return insert ? [{ insert, categories, regionSlug: regionForTender(row).regionSlug }] : [];
      });
    },
  },
  {
    key: "yukon-closed",
    history: true,
    minMatchesToArchive: 20,
    collect: async (today) =>
      (await fetchYukonClosedTenders()).flatMap((row) => {
        const categories = classifyYukonClosed(row, today);
        const insert = categories.length ? yukonClosedToRfpInsert(row) : null;
        return insert ? [{ insert, categories, regionSlug: "yukon" }] : [];
      }),
  },
];

// Four to six large CSVs (CanadaBuys tender + award files per fiscal year).
export const maxDuration = 300;

/**
 * Weekly closed-tender archive (Vercel cron). Real Canadian tenders that have
 * closed, from the buyers' own historical open data, listed as "Closed on
 * <date>" with the official notice link. Separate from the daily open import
 * so the big historical files never eat its time budget. Rows have past
 * deadlines and real (old) publish dates, so no alert, digest, open count or
 * forum auto-thread ever picks them up.
 * `?dry=1` reports what would change without writing anything.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isServiceConfigured()) return NextResponse.json({ skipped: "no service client" });

  const dry = new URL(request.url).searchParams.get("dry") === "1";
  const { status, body } = await syncPublicSources(createServiceClient(), SOURCES, {
    today: new Date().toISOString().slice(0, 10),
    dry,
  });
  return NextResponse.json(body, { status });
}
