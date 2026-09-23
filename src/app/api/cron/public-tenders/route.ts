import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { isServiceConfigured } from "@/lib/supabase/config";
import {
  classifyTender,
  fetchOpenTenders,
  regionForTender,
  toRfpInsert,
} from "@/lib/tenders/canadabuys";
import {
  classifyToronto,
  classifyTorontoAward,
  fetchTorontoAwards,
  fetchTorontoSolicitations,
  torontoAwardToRfpInsert,
  torontoToRfpInsert,
} from "@/lib/tenders/toronto";
import { classifyNsAward, fetchNsAwards, nsAwardToRfpInsert } from "@/lib/tenders/nova-scotia";
import { classifyYukon, fetchYukonOpenTenders, yukonToRfpInsert } from "@/lib/tenders/yukon";
import { syncPublicSources, type Source } from "@/lib/tenders/sync";
import { awardToRfpInsert, classifyAward, fetchAwards } from "@/lib/tenders/awards";
import {
  classifySeao,
  classifySeaoAward,
  fetchSeaoReleases,
  regionForSeao,
  seaoAwardToRfpInsert,
  seaoToRfpInsert,
} from "@/lib/tenders/seao";

const SOURCES: Source[] = [
  {
    key: "canadabuys",
    minMatchesToArchive: 10,
    collect: async (today) =>
      (await fetchOpenTenders()).flatMap((row) => {
        const categories = classifyTender(row, today);
        const insert = categories.length ? toRfpInsert(row, today) : null;
        return insert ? [{ insert, categories, regionSlug: regionForTender(row).regionSlug }] : [];
      }),
  },
  {
    key: "toronto",
    minMatchesToArchive: 3,
    collect: async (today) =>
      (await fetchTorontoSolicitations()).flatMap((row) => {
        const categories = classifyToronto(row, today);
        const insert = categories.length ? torontoToRfpInsert(row, today) : null;
        return insert ? [{ insert, categories, regionSlug: "toronto" }] : [];
      }),
  },
  {
    // Quebec: six weekly OCDS files, newest release per tender, open calls only.
    key: "seao",
    minMatchesToArchive: 25,
    // Same files, two outputs: open calls, and past contracts (who won,
    // for how much) from award releases.
    collect: async (today) =>
      (await fetchSeaoReleases()).flatMap((r) => {
        const open = classifySeao(r, today);
        if (open.length) {
          const insert = seaoToRfpInsert(r, today);
          return insert ? [{ insert, categories: open, regionSlug: regionForSeao(r) }] : [];
        }
        const past = classifySeaoAward(r, today);
        const insert = past.length ? seaoAwardToRfpInsert(r, today) : null;
        return insert ? [{ insert, categories: past, regionSlug: regionForSeao(r) }] : [];
      }),
  },
  {
    // Toronto past contracts (winner; value on a minority of rows).
    key: "toronto-awards",
    minMatchesToArchive: 10,
    collect: async (today) =>
      (await fetchTorontoAwards()).flatMap((row) => {
        const categories = classifyTorontoAward(row, today);
        const insert = categories.length ? torontoAwardToRfpInsert(row, today) : null;
        return insert ? [{ insert, categories, regionSlug: "toronto" }] : [];
      }),
  },
  {
    // Nova Scotia past contracts — the whole NS public sector.
    key: "ns-awards",
    minMatchesToArchive: 20,
    collect: async (today) =>
      (await fetchNsAwards()).flatMap((row) => {
        const categories = classifyNsAward(row, today);
        const insert = categories.length ? nsAwardToRfpInsert(row, today) : null;
        return insert ? [{ insert, categories, regionSlug: "nova-scotia" }] : [];
      }),
  },
  {
    // Yukon open tenders — tiny but live and biddable.
    key: "yukon",
    minMatchesToArchive: 1,
    collect: async (today) =>
      (await fetchYukonOpenTenders()).flatMap((row) => {
        const categories = classifyYukon(row, today);
        const insert = categories.length ? yukonToRfpInsert(row, today) : null;
        return insert ? [{ insert, categories, regionSlug: "yukon" }] : [];
      }),
  },
  {
    // Past contracts: the "feed" is every trade award in the last 180 days,
    // so anything that ages out of the window is archived by the same rule.
    key: "awards",
    minMatchesToArchive: 20,
    collect: async (today) =>
      (await fetchAwards(today)).flatMap((row) => {
        const categories = classifyAward(row, today);
        const insert = categories.length ? awardToRfpInsert(row, today) : null;
        return insert ? [{ insert, categories, regionSlug: regionForTender(row).regionSlug }] : [];
      }),
  },
];

export const maxDuration = 60;

/**
 * Daily Canadian public-tender import (Vercel cron, 12:00 UTC — an hour before
 * the rfp-alerts digest so today's new tenders alert the same day). U.S.
 * tenders import separately in /api/cron/us-tenders, with their own budget.
 *
 * Keeps only the work PMRFP trades actually bid on and publishes it as
 * source_type='public_source' with the official notice link and the matching
 * Open Government Licence attribution. See syncPublicSources for the rules.
 * `?dry=1` reports what would change without writing anything.
 * Protect with CRON_SECRET if set.
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
