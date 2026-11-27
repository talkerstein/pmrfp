/**
 * OPEN DATA: writes (service role). Every writer is idempotent (upsert on
 * the source's stable id), runs in batches of 500, and never writes without
 * a client: dry runs pass `db = null` and only report.
 *
 * permit_leads is a rolling window, so rows that fell out of it are removed
 * (pruneStale). contractor_activity is replaced per (source, trade) each
 * refresh. award_history rows are never deleted (see contract-history/load.ts).
 */
import type { D1Binding } from "@/lib/d1/contracts";
import { upsertD1Import } from "@/lib/d1/import-rows";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ContractorActivity } from "./calgary";
import type { PermitLead } from "./permits";
import type { PlannedProcurement } from "./toronto";
import { permitWindowStart } from "./permits";

export const WRITE_BATCH = 500;
export type ImportDb = SupabaseClient | D1Binding;

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
export async function writePermitLeads(db: ImportDb, source: string, leads: PermitLead[], today: string): Promise<{ written: number; pruned: number }> {
  if ("prepare" in db) {
    await upsertD1Import(db, "permit_leads", leads);
    const pruning = await db.prepare("DELETE FROM permit_leads WHERE source=? AND issued_on<?").bind(source,permitWindowStart(today)).run();
    return {written:leads.length,pruned:pruning.meta.changes ?? 0};
  }
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
export async function writeContractorActivity(db: ImportDb, rows: ContractorActivity[], today: string): Promise<{ written: number; pruned: number }> {
  if ("prepare" in db) {
    await upsertD1Import(db, "contractor_activity", rows);
    let pruned = 0;
    const trades = new Map(rows.map(r => [JSON.stringify([r.source,r.city,r.trade_slug]),r]));
    for (const scope of trades.values()) {
      const result = await db.prepare("DELETE FROM contractor_activity WHERE source=? AND city=? AND trade_slug=? AND as_of<?")
        .bind(scope.source,scope.city,scope.trade_slug,today).run();
      pruned += result.meta.changes ?? 0;
    }
    return {written:rows.length,pruned};
  }
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
export async function writePlannedProcurements(db: ImportDb, rows: PlannedProcurement[], today: string): Promise<{ written: number; pruned: number }> {
  if ("prepare" in db) {
    await upsertD1Import(db, "planned_procurements", rows);
    let pruned = 0;
    for (const source of new Set(rows.map(r => r.source))) {
      const result = await db.prepare("DELETE FROM planned_procurements WHERE source=? AND as_of<?").bind(source,today).run();
      pruned += result.meta.changes ?? 0;
    }
    return {written:rows.length,pruned};
  }
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
export async function recordRun(db: ImportDb | null, r: RunNote): Promise<void> {
  if (!db) return;
  const row = { source: r.source, last_run_at: new Date().toISOString(), last_status: r.status,
    rows_read: r.read, rows_kept: r.kept, rows_written: r.written, note: r.note?.slice(0, 500) ?? null };
  if ("prepare" in db) await upsertD1Import(db, "open_data_runs", [row]).catch(() => undefined);
  else await db.from("open_data_runs").upsert(row, { onConflict: "source" });
}
