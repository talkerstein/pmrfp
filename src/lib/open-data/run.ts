/**
 * OPEN DATA: the jobs behind /api/cron/open-data/<group> and the local CLI.
 *
 *   weekly   city permit leads (ArcGIS pilot: Surrey, Maple Ridge, Airdrie,
 *            Grande Prairie, Kitchener): ~12 requests per city at most
 *   monthly  Calgary contractor activity (3 requests), Toronto capital
 *            project pipeline (1 request)
 *
 * (Toronto non-competitive contracts run in the existing award-history
 * weekly cron; Vancouver and the federal file are local scripts, never
 * crons.) Dry run by default in the CLI; the cron writes unless ?dry=1.
 * After a write the cached pages that show this data are revalidated by
 * tag ("open-data"), so they keep a 24 h cache and still update on a refresh.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { ARCGIS_CITIES, arcgisCity, collectArcgisCity } from "./arcgis-permits";
import { collectCalgary } from "./calgary";
import { recordRun, writeContractorActivity, writePermitLeads, writePlannedProcurements } from "./store";
import { assertRunWithinEstimate } from "./size-budget";
import { collectTorontoPipeline, TORONTO_PIPELINE_SOURCE } from "./toronto";
import { CALGARY_SOURCE } from "./calgary";
import { sourceByKey } from "./sources";

export interface JobCtx {
  today: string;
  /** null = dry run: fetch, parse, report, write nothing. */
  db: SupabaseClient | null;
  only?: string | null;
  limit?: number;
}

export interface Job {
  key: string;
  group: "weekly" | "monthly";
  run: (ctx: JobCtx) => Promise<Record<string, unknown>>;
}

const estimatedRows = (key: string) => sourceByKey(key)?.estimates.reduce((n, e) => n + e.rows, 0) ?? 0;

export const OPEN_DATA_JOBS: Job[] = [
  ...ARCGIS_CITIES.filter((c) => c.enabled).map(
    (c): Job => ({
      key: c.source,
      group: "weekly",
      run: async ({ today, db, limit }) => {
        const r = await collectArcgisCity(c, today, { limit });
        assertRunWithinEstimate(c.source, "permit_leads", r.leads.length, estimatedRows(c.source));
        const written = db ? await writePermitLeads(db, c.source, r.leads, today) : null;
        await recordRun(db, { source: c.source, status: db ? "ok" : "dry", read: r.read, kept: r.leads.length, written: written?.written ?? 0 });
        return {
          city: c.city,
          serverCountValue100kLast24mo: r.serverCount,
          read: r.read,
          kept: r.leads.length,
          skipped: r.skipped,
          requests: r.requests,
          written,
          sample: r.leads.slice(0, 3).map((l) => ({ issued: l.issued_on, value: l.value_cad, contractor: l.contractor, work: l.work_type })),
        };
      },
    }),
  ),
  {
    key: CALGARY_SOURCE,
    group: "monthly",
    run: async ({ today, db }) => {
      const r = await collectCalgary(today);
      const written = db ? await writeContractorActivity(db, r.rows, today) : null;
      await recordRun(db, { source: CALGARY_SOURCE, status: db ? "ok" : "dry", read: r.read, kept: r.rows.length, written: written?.written ?? 0 });
      const byTrade: Record<string, string[]> = {};
      for (const row of r.rows) (byTrade[row.trade_slug] ??= []).push(`${row.contractor} (${row.permits})`);
      return { read: r.read, kept: r.rows.length, droppedNotBusiness: r.dropped, requests: r.requests, written, top5: Object.fromEntries(Object.entries(byTrade).map(([k, v]) => [k, v.slice(0, 5)])) };
    },
  },
  {
    key: TORONTO_PIPELINE_SOURCE,
    group: "monthly",
    run: async ({ today, db }) => {
      const r = await collectTorontoPipeline(today);
      const written = db ? await writePlannedProcurements(db, r.rows, today) : null;
      await recordRun(db, { source: TORONTO_PIPELINE_SOURCE, status: db ? "ok" : "dry", read: r.read, kept: r.rows.length, written: written?.written ?? 0 });
      return { read: r.read, kept: r.rows.length, skipped: r.skipped, written, sample: r.rows.slice(0, 3).map((x) => ({ title: x.title, sourcing: x.sourcing_year, range: x.estimated_range })) };
    },
  },
];

export const jobsFor = (group: "weekly" | "monthly", only?: string | null): Job[] => {
  if (only) {
    const c = arcgisCity(only);
    return OPEN_DATA_JOBS.filter((j) => j.key === only || (c && j.key === c.source));
  }
  return OPEN_DATA_JOBS.filter((j) => j.group === group);
};

/** Run jobs one after another; one failing never stops the rest. */
export async function runJobs(jobs: Job[], ctx: JobCtx): Promise<{ reports: Record<string, unknown>[]; failed: number }> {
  const reports: Record<string, unknown>[] = [];
  let failed = 0;
  for (const job of jobs) {
    const started = Date.now();
    try {
      reports.push({ source: job.key, ...(await job.run(ctx)), ms: Date.now() - started });
    } catch (e) {
      failed++;
      const message = e instanceof Error ? e.message : String(e);
      await recordRun(ctx.db, { source: job.key, status: "error", read: 0, kept: 0, written: 0, note: message }).catch(() => undefined);
      reports.push({ source: job.key, error: message, ms: Date.now() - started });
    }
  }
  return { reports, failed };
}
