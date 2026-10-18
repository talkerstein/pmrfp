import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { isServiceConfigured } from "@/lib/supabase/config";
import { classifyOntn, fetchOntnNotices, ontnToRfpInsert } from "@/lib/tenders/ontario-northland";
import { FVRD, SAANICH, bcTableToRfpInsert, classifyBcTableRow, fetchBcTenderTable, type BcTableSite } from "@/lib/tenders/bc-tenders-table";
import { classifySk, fetchSkOpen, skToRfpInsert } from "@/lib/tenders/sasktenders";
import { classifyPlap, fetchPlapTenders, plapToRfpInsert } from "@/lib/tenders/portage-la-prairie";
import { classifyGete, fetchGeteBids, geteToRfpInsert } from "@/lib/tenders/guelph-eramosa";
import { syncPublicSources, type Candidate, type Source } from "@/lib/tenders/sync";

/** Each source gets its own time budget; a slow one fails alone (sync skips it). */
const SOURCE_BUDGET_MS = 30_000;

async function withBudget<T>(key: string, run: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const signal = AbortSignal.timeout(SOURCE_BUDGET_MS);
  try {
    return await run(signal);
  } catch (err) {
    if (signal.aborted) throw new Error(`${key} exceeded its ${SOURCE_BUDGET_MS / 1000}s budget`);
    throw err;
  }
}

const bcTable = (site: BcTableSite): Source => ({
  key: site.key,
  // Small lists: a single match is a valid day; zero means "don't archive".
  minMatchesToArchive: 1,
  collect: async (today) =>
    withBudget(site.key, async (signal) =>
      (await fetchBcTenderTable(site, signal)).flatMap((r): Candidate[] => {
        const categories = classifyBcTableRow(r, today);
        const insert = categories.length ? bcTableToRfpInsert(r, site, today) : null;
        return insert ? [{ insert, categories, regionSlug: "british-columbia" }] : [];
      }),
    ),
});

const SOURCES: Source[] = [
  {
    // Ontario Northland (provincial agency) — its own "Doing Business" page.
    key: "ontario-northland",
    minMatchesToArchive: 1,
    collect: async (today) =>
      withBudget("ontario-northland", async (signal) =>
        (await fetchOntnNotices(signal)).flatMap((n): Candidate[] => {
          const categories = classifyOntn(n, today);
          const insert = categories.length ? ontnToRfpInsert(n, today) : null;
          return insert ? [{ insert, categories, regionSlug: "ontario" }] : [];
        }),
      ),
  },
  bcTable(SAANICH),
  bcTable(FVRD),
  {
    // City of Portage la Prairie (MB) — tender posts in its own news feed.
    key: "portage-la-prairie",
    minMatchesToArchive: 1,
    collect: async (today) =>
      withBudget("portage-la-prairie", async (signal) =>
        (await fetchPlapTenders(signal)).flatMap((t): Candidate[] => {
          const categories = classifyPlap(t, today);
          const insert = categories.length ? plapToRfpInsert(t, today) : null;
          return insert ? [{ insert, categories, regionSlug: "manitoba" }] : [];
        }),
      ),
  },
  {
    // Township of Guelph/Eramosa (ON) — the bid table on its own site.
    key: "guelph-eramosa",
    minMatchesToArchive: 1,
    collect: async (today) =>
      withBudget("guelph-eramosa", async (signal) =>
        (await fetchGeteBids(signal)).flatMap((b): Candidate[] => {
          const categories = classifyGete(b, today);
          const insert = categories.length ? geteToRfpInsert(b, today) : null;
          return insert ? [{ insert, categories, regionSlug: "ontario" }] : [];
        }),
      ),
  },
  {
    // SaskTenders: province, Sask Housing, school divisions, health, cities, towns, RMs.
    // OFF until SaskBuilds answers our 2026-10-09 permission request: set
    // SASKTENDERS_ENABLED=1 in Vercel once a yes is logged in briefs/outreach/buyer-permissions.csv.
    key: "sasktenders",
    minMatchesToArchive: 10,
    collect: async (today) =>
      withBudget("sasktenders", async (signal) =>
        (await fetchSkOpen(signal)).flatMap((c): Candidate[] => {
          const categories = classifySk(c, today);
          const insert = categories.length ? skToRfpInsert(c, today) : null;
          return insert ? [{ insert, categories, regionSlug: "saskatchewan" }] : [];
        }),
      ),
  },
];

/** Sources that run today. SaskTenders stays off until permission is granted. */
function activeSources(env: NodeJS.ProcessEnv = process.env): Source[] {
  return SOURCES.filter((s) => s.key !== "sasktenders" || env.SASKTENDERS_ENABLED === "1");
}

export const maxDuration = 60;

/**
 * Daily Canadian buyer-website tender import (Vercel cron, 12:48 UTC — after
 * the other tender crons, before the 13:00 rfp-alerts run). Every source is
 * the buyer's or province's own site (not a commercial bid platform), read
 * once a day, politely, as "PMRFP tender indexer". Rows stay Canadian: each
 * candidate carries a Canadian region and sync falls back to "canada".
 * `?dry=1` reports what would change without writing. CRON_SECRET-protected.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isServiceConfigured()) return NextResponse.json({ skipped: "no service client" });

  const { status, body } = await syncPublicSources(createServiceClient(), activeSources(), {
    today: new Date().toISOString().slice(0, 10),
    dry: new URL(request.url).searchParams.get("dry") === "1",
  });
  return NextResponse.json(body, { status });
}
