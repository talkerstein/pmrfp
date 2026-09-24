import { unstable_cache } from "next/cache";
import { listRfps } from "@/lib/data/rfps";
import { boardStats, daysUntil } from "@/lib/data/fomo";
import type { RfpListItem } from "@/lib/data/types";
import { rfpMarket } from "@/lib/visitor-geo";

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
 * ?role, ?plan …), so the board read is cached here instead, hourly like the
 * home page.
 */
export const getJoinProof = unstable_cache(
  async (): Promise<JoinProof> => {
    const rfps = await listRfps();
    const { open, awardedValue, pastContracts } = boardStats(rfps);
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
  ["join-proof"],
  { revalidate: 3600 },
);
