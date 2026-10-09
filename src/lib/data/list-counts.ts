import { unstable_cache } from "next/cache";
import { listVendors } from "@/lib/data/directory";
import { listRfps } from "@/lib/data/rfps";
import { winnersFromRfps } from "@/lib/data/winners";
import { boardStatsByCountry } from "@/lib/data/fomo";
import { listOpenJobs } from "@/lib/jobs/data";
import { listTalent } from "@/lib/talent/data";
import { inCountry, type CountryCode } from "@/lib/visitor-geo";

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

/**
 * Live counts for the five directory-list tabs and the board, per country,
 * cached hourly so every list page can show them without re-reading five
 * tables. A read that fails is null and its pill is hidden (never a made-up
 * number). Canada and the U.S. are never added together.
 */
export const getListCounts = unstable_cache(
  async (): Promise<ListCountsByCountry> => {
    const [trades, suppliers, rfps, jobs, talent] = await Promise.all([
      settle(listVendors()),
      settle(listVendors({ orgType: "supplier" })),
      settle(listRfps()),
      settle(listOpenJobs()),
      settle(listTalent()),
    ]);
    const stats = rfps?.length ? boardStatsByCountry(rfps) : null;
    const one = (c: CountryCode): ListCounts => ({
      trades: trades ? trades.filter((v) => (v.countries ?? ["CA"]).includes(c)).length : null,
      suppliers: suppliers ? suppliers.filter((v) => (v.countries ?? ["CA"]).includes(c)).length : null,
      winners: rfps?.length ? winnersFromRfps(inCountry(rfps, c)).length : null,
      jobs: jobs?.ready ? jobs.jobs.filter((j) => j.country === c).length : null,
      talent: talent?.ready ? talent.people.length : null,
      open: stats ? stats[c].open : null,
      closing7: stats ? stats[c].closingThisWeek : null,
    });
    return { CA: one("CA"), US: one("US") };
  },
  ["v3-list-counts-by-country"],
  { revalidate: 3600 },
);

/** The visitor's country's counts. */
export function countsFor(all: ListCountsByCountry, country: CountryCode): ListCounts {
  return all[country];
}

/** Open RFPs per trade and per region (display names) in one country, cached hourly for the sign-up chips. */
export const getOpenCountsByName = unstable_cache(
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
  ["v3-open-counts-by-name-country"],
  { revalidate: 3600 },
);

/** The visitor's country's counts (resolver: lib/visitor-geo.server getVisitorCountry). Makes the page dynamic. */
export async function getVisitorListCounts(country?: CountryCode): Promise<ListCounts> {
  const { getVisitorCountry } = await import("@/lib/visitor-geo.server");
  return countsFor(await getListCounts(), country ?? (await getVisitorCountry()).country);
}
