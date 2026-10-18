import { cache } from "react";
import { listRfps } from "@/lib/data/rfps";
import { daysUntil } from "@/lib/data/fomo";
import { boardStats } from "@/lib/data/site-counters";
import type { RfpListItem } from "@/lib/data/types";
import { inCountry, rfpMarket, type CountryCode } from "@/lib/visitor-geo";

export type ProofRow = Pick<RfpListItem, "slug" | "title" | "categories" | "regionName" | "deadline">;

export interface JoinProof {
  open: number;
  awardedValue: number;
  pastContracts: number;
  /** Three open listings in three different trades, Canadian and soonest first. */
  rows: ProofRow[];
}

/**
 * Live board numbers for the sign-up page. The page is dynamic (it reads
 * ?role, ?plan …); the board comes from the shared snapshot, so this is just
 * computed in memory once per request.
 */
export const getJoinProof = cache(
  async (country: CountryCode = "CA"): Promise<JoinProof> => {
    const rfps = await listRfps();
    // Country-first: the headline numbers are one country's, never Canada + U.S.
    const { open, awardedValue, pastContracts } = boardStats(inCountry(rfps, country));
    const seen = new Set<string>();
    const rows: ProofRow[] = [];
    const candidates = rfps
      // English notices only (SEAO's are in French) that are still biddable tomorrow.
      .filter((r) => r.status === "open" && !/-qca?-/.test(r.slug) && (daysUntil(r.deadline) ?? -1) >= 1 && r.categories[0])
      // Canadian listings first (most visitors are Canadian), then soonest deadline.
      .sort(
        (a, b) =>
          Number(rfpMarket(a) !== "CA") - Number(rfpMarket(b) !== "CA") || (a.deadline ?? "").localeCompare(b.deadline ?? ""),
      );
    for (const r of candidates) {
      if (seen.has(r.categories[0])) continue;
      seen.add(r.categories[0]);
      rows.push({ slug: r.slug, title: r.title, categories: r.categories, regionName: r.regionName, deadline: r.deadline });
      if (rows.length === 3) break;
    }
    return { open, awardedValue, pastContracts, rows };
  },
);
