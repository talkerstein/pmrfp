import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { isServiceConfigured } from "@/lib/supabase/config";
import { classifyNcEvp, fetchNcEvpOpen, ncEvpToRfpInsert } from "@/lib/tenders/nc-evp";
import { classifyLaCity, fetchLaCityOpenBids, laCityToRfpInsert } from "@/lib/tenders/la-city";
import { syncPublicSources, type Candidate, type Source } from "@/lib/tenders/sync";

/** Each source gets its own time budget; a slow one fails alone (sync skips it). */
const SOURCE_BUDGET_MS = 25_000;

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
    // North Carolina eVP: state agencies, UNC, community colleges, school boards, counties, towns.
    key: "nc-evp",
    minMatchesToArchive: 10,
    fallbackRegion: "united-states",
    collect: async (today) =>
      withBudget("nc-evp", async (signal) =>
        (await fetchNcEvpOpen(signal)).flatMap((b): Candidate[] => {
          const categories = classifyNcEvp(b, today);
          const insert = categories.length ? ncEvpToRfpInsert(b, today) : null;
          return insert ? [{ insert, categories, regionSlug: "us-north-carolina" }] : [];
        }),
      ),
  },
  {
    // City of Los Angeles RAMP open bids (LA Open Data, CC0) — City, LAUSD, HACLA, LAWA, Port.
    key: "la-city",
    minMatchesToArchive: 1,
    fallbackRegion: "united-states",
    collect: async (today) =>
      withBudget("la-city", async (signal) =>
        (await fetchLaCityOpenBids(today, signal)).flatMap((r): Candidate[] => {
          const categories = classifyLaCity(r, today);
          const insert = categories.length ? laCityToRfpInsert(r, today) : null;
          return insert ? [{ insert, categories, regionSlug: "us-california" }] : [];
        }),
      ),
  },
];

export const maxDuration = 60;

/**
 * Daily U.S. local public-tender import (Vercel cron, 12:40 UTC — after
 * us-state-tenders, before the 13:00 rfp-alerts run). One polite pass per
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
