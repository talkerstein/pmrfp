import type { Metadata } from "next";
import { requireRole, isDemoMode } from "@/lib/access/access";
import { createServiceClient } from "@/lib/supabase/service";
import { isServiceConfigured } from "@/lib/supabase/config";
import { PageHeader, DemoBanner, StatCard } from "@/components/dashboard/stat-card";
import { AdminTable } from "@/components/admin/admin-table";
import { TableCell, TableRow } from "@/components/ui/table";
import { OPEN_DATA_SOURCES, allEstimates, type OpenDataSource } from "@/lib/open-data/sources";
import { DB_BUDGET_BYTES, ROW_BYTES, estimateBytes, megabytes, totalEstimateBytes } from "@/lib/open-data/size-budget";
import { setLangFrom } from "@/i18n/server";

export const metadata: Metadata = { title: "Open Data · Admin · PMRFP" };

const SCHEDULE: Record<string, string> = {
  weekly: "Mondays 10:15 UTC (/api/cron/open-data/weekly)",
  monthly: "2nd of the month 10:50 UTC (/api/cron/open-data/monthly)",
  "award-history-weekly": "Mondays 10:05 UTC (/api/cron/award-history/weekly)",
};

interface RunRow {
  source: string;
  last_run_at: string;
  last_status: string;
  rows_read: number;
  rows_kept: number;
  rows_written: number;
  note: string | null;
}
interface Footprint {
  tables?: Record<string, { rows: number; bytes: number }>;
  award_history_by_source?: Record<string, { rows: number; heap_bytes: number }>;
  database_bytes?: number;
}

/** Rows we hold for a source: award_history by source (measured), else a head count on its own table. */
async function rowsFor(s: OpenDataSource, fp: Footprint | null): Promise<number | null> {
  const table = s.estimates[0].table;
  if (table === "award_history") return fp?.award_history_by_source?.[s.key]?.rows ?? 0;
  const db = createServiceClient();
  if (table === "permit_leads") return (await db.from("permit_leads").select("id", { count: "exact", head: true }).eq("source", s.key)).count ?? 0;
  if (table === "contractor_activity") return (await db.from("contractor_activity").select("id", { count: "exact", head: true }).eq("source", s.key)).count ?? 0;
  if (table === "planned_procurements") return (await db.from("planned_procurements").select("id", { count: "exact", head: true }).eq("source", s.key)).count ?? 0;
  return null;
}

/**
 * Admin: every open-data source added in batch 1, its licence and whether
 * the clause was read, how it refreshes, its last run, the rows it holds and
 * the space it uses (measured by open_data_footprint() against the size
 * estimate and the 150 MB budget). English only (admin screen).
 */
export default async function AdminOpenDataPage({ params }: { params: Promise<object> }) {
  await setLangFrom(params);
  await requireRole(["admin", "super_admin"]);
  const demo = isDemoMode() || !isServiceConfigured();
  const runs = new Map<string, RunRow>();
  const counts = new Map<string, number | null>();
  let fp: Footprint | null = null;
  let missing = false;
  if (!demo) {
    const db = createServiceClient();
    const [{ data: runData, error: runError }, { data: fpData, error: fpError }] = await Promise.all([
      db.from("open_data_runs").select("source,last_run_at,last_status,rows_read,rows_kept,rows_written,note").returns<RunRow[]>(),
      db.rpc("open_data_footprint"),
    ]);
    missing = Boolean(runError || fpError);
    for (const r of runData ?? []) runs.set(r.source, r);
    fp = (fpData as Footprint | null) ?? null;
    if (!missing) await Promise.all(OPEN_DATA_SOURCES.map(async (s) => counts.set(s.key, await rowsFor(s, fp).catch(() => null))));
  }
  const estimated = totalEstimateBytes(allEstimates());
  const measuredAdded = fp?.tables
    ? (fp.tables.permit_leads?.bytes ?? 0) + (fp.tables.contractor_activity?.bytes ?? 0) + (fp.tables.planned_procurements?.bytes ?? 0) +
      Object.entries(fp.award_history_by_source ?? {}).filter(([k]) => OPEN_DATA_SOURCES.some((s) => s.key === k)).reduce((n, [, v]) => n + v.heap_bytes, 0)
    : null;

  return (
    <>
      <PageHeader
        title="Open data"
        description="City, provincial and federal open-data imports (batch 1): permits, awards, a planning pipeline. Every source is filtered before it is stored; business names only; each carries its licence credit."
      />
      {demo && <DemoBanner />}
      {missing && <p className="mb-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">Run supabase/migrations/20261023000100_open_data_batch1.sql first.</p>}
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Estimated size of the whole batch" value={`${megabytes(estimated)} MB`} />
        <StatCard label="Budget" value={`${megabytes(DB_BUDGET_BYTES)} MB`} />
        <StatCard label="Measured so far (heap)" value={measuredAdded === null ? "–" : `${megabytes(measuredAdded)} MB`} />
      </div>
      <AdminTable columns={["Source", "Licence", "Refresh", "How", "Last run", "Rows held", "Est. MB (rows × bytes)"]}>
        {OPEN_DATA_SOURCES.map((s) => {
          const run = runs.get(s.key);
          const est = s.estimates.reduce((n, e) => n + estimateBytes(e.table, e.rows), 0);
          return (
            <TableRow key={s.key}>
              <TableCell className="max-w-[300px] font-medium">
                <a href={s.url} className="underline" target="_blank" rel="noreferrer">{s.label}</a>
                <div className="text-xs font-normal text-muted-foreground">{s.ref} · {s.key}</div>
                {s.note && <div className="mt-1 text-xs font-normal text-muted-foreground">{s.note}</div>}
              </TableCell>
              <TableCell className="max-w-[220px] text-xs">
                {s.licence}
                {!s.licenceChecked && <div className="font-medium text-amber-800">licence clause to confirm</div>}
              </TableCell>
              <TableCell className="max-w-[160px] text-xs">{s.refresh}</TableCell>
              <TableCell className="max-w-[240px] text-xs">{s.how === "local" ? "Local script (not a cron)" : SCHEDULE[s.group ?? ""] ?? s.group}</TableCell>
              <TableCell className="whitespace-nowrap text-xs">
                {run ? `${run.last_run_at.slice(0, 10)} · ${run.last_status} · kept ${run.rows_kept}` : "–"}
                {run?.note && <div className="max-w-[200px] truncate text-muted-foreground" title={run.note}>{run.note}</div>}
              </TableCell>
              <TableCell>{counts.get(s.key) ?? "–"}</TableCell>
              <TableCell className="whitespace-nowrap text-xs">{megabytes(est)} ({s.estimates.map((e) => `${e.rows.toLocaleString("en-CA")} × ${ROW_BYTES[e.table]} B`).join(" + ")})</TableCell>
            </TableRow>
          );
        })}
      </AdminTable>
      <h2 className="mb-2 mt-8 text-lg font-semibold">Loading the local sources</h2>
      <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
        <li>Every command is a dry run until you add --apply. The first thing a run prints is what it kept and the estimated database size.</li>
        <li>node scripts/run-open-data.mjs footprint measures the real size of everything this batch added.</li>
        <li>Cron dry runs: /api/cron/open-data/weekly?dry=1 and /api/cron/open-data/monthly?dry=1 (as an admin).</li>
      </ul>
    </>
  );
}
