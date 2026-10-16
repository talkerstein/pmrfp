/**
 * The three CanadaBuys feeds as sync sources, built from a row provider so
 * the cron (download, only when CANADABUYS_DIRECT_FETCH=1) and the admin
 * upload (/admin/canadabuys) run exactly the same classification and sync.
 */
import type { Source } from "./sync";
import { classifyTender, regionForTender, toRfpInsert, type TenderRow } from "./canadabuys";
import { awardToRfpInsert, classifyAward, type AwardRow } from "./awards";
import { awardForTender, classifyClosedTender, closedTenderToRfpInsert, indexAwards, latestAmendments, type ClosedRow } from "./canadabuys-closed";

export function openTendersSource(rows: (today: string) => Promise<TenderRow[]>): Source {
  return {
    key: "canadabuys",
    minMatchesToArchive: 10,
    collect: async (today) =>
      (await rows(today)).flatMap((row) => {
        const categories = classifyTender(row, today);
        const insert = categories.length ? toRfpInsert(row, today) : null;
        return insert ? [{ insert, categories, regionSlug: regionForTender(row).regionSlug }] : [];
      }),
  };
}

/** Past contracts: the "feed" is every trade award in the last 365 days, so anything that ages out is archived by the same rule. */
export function pastAwardsSource(rows: (today: string) => Promise<AwardRow[]>): Source {
  return {
    key: "awards",
    minMatchesToArchive: 20,
    collect: async (today) =>
      (await rows(today)).flatMap((row) => {
        const categories = classifyAward(row, today);
        const insert = categories.length ? awardToRfpInsert(row, today) : null;
        return insert ? [{ insert, categories, regionSlug: regionForTender(row).regionSlug }] : [];
      }),
  };
}

/** Real federal building-trade tenders that closed in the last ~18 months, with the winner where the award file has one. */
export function closedTendersSource(data: (today: string) => Promise<{ tenders: ClosedRow[]; awards: ClosedRow[] }>): Source {
  return {
    key: "canadabuys-closed",
    history: true,
    minMatchesToArchive: 100,
    collect: async (today) => {
      const { tenders, awards } = await data(today);
      const byAward = indexAwards(awards, today);
      return latestAmendments(tenders).flatMap((row) => {
        const categories = classifyClosedTender(row, today);
        const insert = categories.length ? closedTenderToRfpInsert(row, awardForTender(row, byAward)) : null;
        return insert ? [{ insert, categories, regionSlug: regionForTender(row).regionSlug }] : [];
      });
    },
  };
}
