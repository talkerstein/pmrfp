import { unstable_cache } from "next/cache";
import { listVendors } from "@/lib/data/directory";
import { listRfps } from "@/lib/data/rfps";
import { winnersFromRfps } from "@/lib/data/winners";
import { boardStats } from "@/lib/data/fomo";
import { listOpenJobs } from "@/lib/jobs/data";
import { listTalent } from "@/lib/talent/data";

export interface ListCounts {
  trades: number | null;
  suppliers: number | null;
  winners: number | null;
  jobs: number | null;
  talent: number | null;
  /** Board numbers for the sticky bars and closing bands. */
  open: number | null;
  closing7: number | null;
}

const settle = async <T,>(p: Promise<T>): Promise<T | null> => {
  try {
    return await p;
  } catch {
    return null;
  }
};

/**
 * Live counts for the five directory-list tabs and the board, cached hourly so
 * every list page can show them without re-reading five tables. A read that
 * fails is null and its pill is hidden (never a made-up number).
 */
export const getListCounts = unstable_cache(
  async (): Promise<ListCounts> => {
    const [trades, suppliers, rfps, jobs, talent] = await Promise.all([
      settle(listVendors()),
      settle(listVendors({ orgType: "supplier" })),
      settle(listRfps()),
      settle(listOpenJobs()),
      settle(listTalent()),
    ]);
    const stats = rfps?.length ? boardStats(rfps) : null;
    return {
      trades: trades ? trades.length : null,
      suppliers: suppliers ? suppliers.length : null,
      winners: rfps?.length ? winnersFromRfps(rfps).length : null,
      jobs: jobs?.ready ? jobs.jobs.length : null,
      talent: talent?.ready ? talent.people.length : null,
      open: stats ? stats.open : null,
      closing7: stats ? stats.closingThisWeek : null,
    };
  },
  ["v3-list-counts"],
  { revalidate: 3600 },
);

/** Open RFPs per trade and per region (display names), cached hourly for the sign-up chips. */
export const getOpenCountsByName = unstable_cache(
  async (): Promise<{ trades: Record<string, number>; regions: Record<string, number> }> => {
    const rfps = await settle(listRfps());
    const trades: Record<string, number> = {};
    const regions: Record<string, number> = {};
    for (const r of rfps ?? []) {
      if (r.status !== "open") continue;
      for (const c of r.categories) trades[c] = (trades[c] ?? 0) + 1;
      if (r.regionName) regions[r.regionName] = (regions[r.regionName] ?? 0) + 1;
    }
    return { trades, regions };
  },
  ["v3-open-counts-by-name"],
  { revalidate: 3600 },
);
