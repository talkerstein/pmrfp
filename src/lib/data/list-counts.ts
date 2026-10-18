import { cache } from "react";
import { unstable_cache } from "next/cache";
import { listVendors } from "@/lib/data/directory";
import { listRfps } from "@/lib/data/rfps";
import { boardStatsByCountry, repeatWinnerTotals } from "@/lib/data/site-counters";
import { listOpenJobs } from "@/lib/jobs/data";
import { listTalent } from "@/lib/talent/data";
import type { CountryCode } from "@/lib/visitor-geo";

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

/** Country-first: every count per country; pick one with countsFor(). Talent is people, not tied to a country. */
export interface ListCountsByCountry {
  CA: ListCounts;
  US: ListCounts;
}

const settle = async <T,>(p: Promise<T>): Promise<T | null> => {
  try {
    return await p;
  } catch {
    return null;
  }
};

type DirectoryCounts = Record<CountryCode, Pick<ListCounts, "trades" | "suppliers" | "jobs" | "talent">>;

/** Directory, jobs and talent counts per country, cached hourly (these tables are small). */
const getDirectoryCounts = unstable_cache(
  async (): Promise<DirectoryCounts> => {
    const [trades, suppliers, jobs, talent] = await Promise.all([
      settle(listVendors()),
      settle(listVendors({ orgType: "supplier" })),
      settle(listOpenJobs()),
      settle(listTalent()),
    ]);
    const one = (c: CountryCode) => ({
      trades: trades ? trades.filter((v) => (v.countries ?? ["CA"]).includes(c)).length : null,
      suppliers: suppliers ? suppliers.filter((v) => (v.countries ?? ["CA"]).includes(c)).length : null,
      jobs: jobs?.ready ? jobs.jobs.filter((j) => j.country === c).length : null,
      talent: talent?.ready ? talent.people.length : null,
    });
    return { CA: one("CA"), US: one("US") };
  },
  ["v3-directory-counts-by-country"],
  { revalidate: 3600 },
);

/**
 * Live counts for the five directory-list tabs and the board, per country.
 * Board numbers come from the shared board snapshot (it must NOT be read inside
 * unstable_cache: Next bypasses nested caches, so that re-read the whole board
 * from the database). A read that fails is null and its pill is hidden (never
 * a made-up number). Canada and the U.S. are never added together.
 */
export const getListCounts = cache(async (): Promise<ListCountsByCountry> => {
  const [dir, rfps] = await Promise.all([settle(getDirectoryCounts()), settle(listRfps())]);
  const stats = rfps?.length ? boardStatsByCountry(rfps) : null;
  const one = (c: CountryCode): ListCounts => ({
    trades: dir?.[c].trades ?? null,
    suppliers: dir?.[c].suppliers ?? null,
    winners: rfps?.length ? repeatWinnerTotals(rfps, c).companies : null,
    jobs: dir?.[c].jobs ?? null,
    talent: dir?.[c].talent ?? null,
    open: stats ? stats[c].open : null,
    closing7: stats ? stats[c].closingThisWeek : null,
  });
  return { CA: one("CA"), US: one("US") };
});

/** The visitor's country's counts. */
export function countsFor(all: ListCountsByCountry, country: CountryCode): ListCounts {
  return all[country];
}

/** Open RFPs per trade and per region (display names) in one country, for the sign-up chips. From the snapshot. */
export const getOpenCountsByName = cache(
  async (country: CountryCode = "CA"): Promise<{ trades: Record<string, number>; regions: Record<string, number> }> => {
    const rfps = await settle(listRfps({ country }));
    const trades: Record<string, number> = {};
    const regions: Record<string, number> = {};
    for (const r of rfps ?? []) {
      if (r.status !== "open") continue;
      for (const c of r.categories) trades[c] = (trades[c] ?? 0) + 1;
      if (r.regionName) regions[r.regionName] = (regions[r.regionName] ?? 0) + 1;
    }
    return { trades, regions };
  },
);

/** The visitor's country's counts (resolver: lib/visitor-geo.server getVisitorCountry). Makes the page dynamic. */
export async function getVisitorListCounts(country?: CountryCode): Promise<ListCounts> {
  const { getVisitorCountry } = await import("@/lib/visitor-geo.server");
  return countsFor(await getListCounts(), country ?? (await getVisitorCountry()).country);
}
