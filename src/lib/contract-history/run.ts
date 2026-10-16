import { NextResponse } from "next/server";
import { getSession, isAdminRole } from "@/lib/access/access";
import { createServiceClient } from "@/lib/supabase/service";
import { isServiceConfigured } from "@/lib/supabase/config";
import { addMonths } from "@/lib/intel/model";
import { coverageOf } from "./coverage";
import { isoDay } from "./model";
import { historySourcesFor, type HistoryGroup, type RunParams } from "./registry";
import { applyHistory, dedupeBids, prepareAwards } from "./sync";
import { forgetHistorySlice } from "./load";

/** Default look-back: five years, the renewal radar's reach. */
export const HISTORY_YEARS = 5;

/**
 * One award-history import run (Vercel cron), shared by
 * /api/cron/award-history/<group>. Each source is fetched once (politely:
 * named User-Agent, robots.txt crawl delays), parsed into award_history /
 * bid_results rows, then upserted in batches of 500. Nothing is deleted.
 *
 *   ?dry=1              fetch + parse + coverage report, write nothing
 *                       (works without the service key)
 *   ?source=<key>       one source only (any group)
 *   ?since=YYYY-MM-DD   look-back (default five years)
 *   ?files=a,b          SEAO: those files (or YYYY-MM monthly roll-ups) — the backfill
 *   ?weeks=N            SEAO: the newest N weekly files (default 1)
 *   ?from=&to=          USAspending: activity window (backfill a fiscal year)
 *   ?file=<name>        USAspending: pick up a download job that wasn't ready
 *   ?url=<link>         SEAO: one /download/ JSON link copied from the dataset page
 *   ?limit=N            federal: stop after N CSV records
 * Protect with CRON_SECRET if set (signed-in admins may also call it).
 */
export async function runAwardHistory(request: Request, group: HistoryGroup): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    // Admins can run a backfill or a dry run from the browser (/admin/award-history lists the links).
    const session = await getSession().catch(() => null);
    if (!session || !isAdminRole(session.profile.primary_role) || session.profile.status === "suspended") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }
  const q = new URL(request.url).searchParams;
  const dry = q.get("dry") === "1";
  const service = isServiceConfigured();
  if (!service && !dry) return NextResponse.json({ skipped: "no service client" });

  const today = new Date().toISOString().slice(0, 10);
  const params: RunParams = {
    today,
    since: isoDay(q.get("since")) ?? addMonths(today, -HISTORY_YEARS * 12),
    files: q.get("files")?.split(",").map((s) => s.trim()).filter(Boolean),
    weeks: Number(q.get("weeks")) || undefined,
    from: isoDay(q.get("from")) ?? undefined,
    to: isoDay(q.get("to")) ?? undefined,
    file: q.get("file"),
    url: q.get("url"),
    limit: Number(q.get("limit")) || undefined,
  };
  const sources = historySourcesFor(group, q.get("source"));
  const db = service && !dry ? createServiceClient() : null;
  const report: Record<string, unknown>[] = [];
  let failed = 0;

  for (const source of sources) {
    const started = Date.now();
    try {
      const batch = await source.collect!(params);
      const { rows, invalid } = prepareAwards(batch.awards);
      const bids = dedupeBids(batch.bids);
      const { awards: _a, bids: _b, ...extra } = batch;
      const entry: Record<string, unknown> = {
        source: source.key,
        licence: source.licence,
        ...extra,
        kept: rows.length,
        invalid,
        bidRows: bids.length,
        coverage: coverageOf(rows, bids, today),
      };
      if (db) {
        entry.written = await applyHistory(db, rows, bids);
      } else {
        entry.sample = rows.slice(0, 3).map((r) => ({
          title: r.title,
          buyer: r.buyer,
          winner: r.winner_business_name ?? "(individual, not named)",
          value: r.value,
          award_date: r.award_date,
          end_date: r.end_date,
          end_date_source: r.end_date_source,
          bids: r.number_of_bids,
          trades: r.trade_slugs,
        }));
      }
      entry.ms = Date.now() - started;
      report.push(entry);
    } catch (e) {
      failed++;
      report.push({ source: source.key, error: e instanceof Error ? e.message : String(e), ms: Date.now() - started });
    }
  }
  if (db) forgetHistorySlice();
  return NextResponse.json({ dry, group, today, since: params.since, sources: report }, { status: failed && failed === sources.length ? 500 : 200 });
}
