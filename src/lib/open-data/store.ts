/**
 * OPEN DATA: writes (service role). Every writer is idempotent (upsert on
 * the source's stable id), runs in batches of 500, and never writes without
 * a client: dry runs pass `db = null` and only report.
 *
 * permit_leads is a rolling window, so rows that fell out of it are removed
 * (pruneStale). contractor_activity is replaced per (source, trade) each
 * refresh. award_history rows are never deleted (see contract-history/load.ts).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ContractorActivity } from "./calgary";
import type { PermitLead } from "./permits";
import type { PlannedProcurement } from "./toronto";
import { permitWindowStart } from "./permits";

export const WRITE_BATCH = 500;

async function upsertAll<T extends object>(db: SupabaseClient, table: string, rows: T[], onConflict: string): Promise<number> {
  let n = 0;
  for (let i = 0; i < rows.length; i += WRITE_BATCH) {
    const chunk = rows.slice(i, i + WRITE_BATCH);
    const { error } = await db.from(table).upsert(chunk, { onConflict });
    if (error) throw new Error(`${table} upsert: ${error.message}`);
    n += chunk.length;
  }
  return n;
}

/** Upsert leads for one source, then drop that source's leads older than the 24-month window. */
export async function writePermitLeads(db: SupabaseClient, source: string, leads: PermitLead[], today: string): Promise<{ written: number; pruned: number }> {
  const written = await upsertAll(db, "permit_leads", leads, "source,source_key");
  const { count, error } = await db
    .from("permit_leads")
    .delete({ count: "exact" })
    .eq("source", source)
    .lt("issued_on", permitWindowStart(today));
  if (error) throw new Error(`permit_leads prune: ${error.message}`);
  return { written, pruned: count ?? 0 };
}

/** Replace one trade's list: upsert the new top N, delete rows of that trade from an older refresh. */
export async function writeContractorActivity(db: SupabaseClient, rows: ContractorActivity[], today: string): Promise<{ written: number; pruned: number }> {
  const written = await upsertAll(db, "contractor_activity", rows, "source,city,trade_slug,contractor_key");
  let pruned = 0;
  for (const key of new Set(rows.map((r) => `${r.source}|${r.city}|${r.trade_slug}`))) {
    const [source, city, trade] = key.split("|");
    const { count, error } = await db
      .from("contractor_activity")
      .delete({ count: "exact" })
      .eq("source", source)
      .eq("city", city)
      .eq("trade_slug", trade)
      .lt("as_of", today);
    if (error) throw new Error(`contractor_activity prune: ${error.message}`);
    pruned += count ?? 0;
  }
  return { written, pruned };
}

/** Replace the pipeline: upsert every planned procurement, drop ones the City no longer lists. */
export async function writePlannedProcurements(db: SupabaseClient, rows: PlannedProcurement[], today: string): Promise<{ written: number; pruned: number }> {
  const written = await upsertAll(db, "planned_procurements", rows, "source,source_key");
  let pruned = 0;
  for (const source of new Set(rows.map((r) => r.source))) {
    const { count, error } = await db.from("planned_procurements").delete({ count: "exact" }).eq("source", source).lt("as_of", today);
    if (error) throw new Error(`planned_procurements prune: ${error.message}`);
    pruned += count ?? 0;
  }
  return { written, pruned };
}

export interface RunNote {
  source: string;
  status: "ok" | "dry" | "error";
  read: number;
  kept: number;
  written: number;
  note?: string;
}

/** One row per source for the admin page. Never throws (a missing table must not fail an import). */
export async function recordRun(db: SupabaseClient | null, r: RunNote): Promise<void> {
  if (!db) return;
  await db
    .from("open_data_runs")
    .upsert({ source: r.source, last_run_at: new Date().toISOString(), last_status: r.status, rows_read: r.read, rows_kept: r.kept, rows_written: r.written, note: r.note?.slice(0, 500) ?? null }, { onConflict: "source" });
}
