/**
 * OPEN DATA: the database size budget.
 *
 * Supabase Pro includes 8 GB of disk with the spend cap ON: going over makes
 * the project read-only. 2 GB is provisioned today. This batch must add less
 * than DB_BUDGET_BYTES (150 MB) in total, so every importer is filtered
 * before it writes and declares an estimate here.
 *
 * Per-row byte figures are conservative: heap tuple (24 B header + columns)
 * plus every index on the table. They are checked against real data by the
 * admin footprint (open_data_footprint() in the migration measures real
 * pg_total_relation_size / pg_column_size) after a load.
 */

export const DB_BUDGET_BYTES = 150_000_000;

export type BudgetTable = "award_history" | "bid_results" | "permit_leads" | "contractor_activity" | "planned_procurements";

/** Heap + index bytes per row, by table (rounded up). */
export const ROW_BYTES: Record<BudgetTable, number> = {
  // 24 B header + ~15 columns of text (title/description/buyer/winner...) ~ 700 B + 6 indexes (one GIN) ~ 450 B.
  award_history: 1_400,
  bid_results: 300,
  // 24 B header + city/province/contractor/key/work type/dates/value ~ 230 B + unique + city index ~ 140 B.
  permit_leads: 400,
  contractor_activity: 260,
  planned_procurements: 900,
};

export interface SourceEstimate {
  /** The source key (see sources.ts). */
  key: string;
  table: BudgetTable;
  /** Rows the filtered import is expected to keep. */
  rows: number;
}

export const estimateBytes = (table: BudgetTable, rows: number): number => Math.ceil(rows * ROW_BYTES[table]);

/** Total estimated bytes of a set of source estimates. */
export function totalEstimateBytes(estimates: readonly SourceEstimate[]): number {
  return estimates.reduce((n, e) => n + estimateBytes(e.table, e.rows), 0);
}

export const megabytes = (bytes: number): number => Math.round((bytes / 1_000_000) * 10) / 10;

/** Throws when the estimates exceed the budget; returns the total otherwise. */
export function assertWithinBudget(estimates: readonly SourceEstimate[], budget = DB_BUDGET_BYTES): number {
  const total = totalEstimateBytes(estimates);
  if (total > budget) {
    const biggest = [...estimates].sort((a, b) => estimateBytes(b.table, b.rows) - estimateBytes(a.table, a.rows))[0];
    throw new Error(`Open-data batch is over its size budget: ${megabytes(total)} MB > ${megabytes(budget)} MB (largest: ${biggest?.key})`);
  }
  return total;
}

/** A row's own size from its content: UTF-8 bytes of its values + header + the table's index share. Used to sanity-check ROW_BYTES on real rows. */
export function measureRowBytes(row: Record<string, unknown>, indexBytes = 110): number {
  let n = 24;
  for (const v of Object.values(row)) {
    if (v == null) continue;
    n += typeof v === "string" ? Buffer.byteLength(v, "utf8") + 1 : Array.isArray(v) ? v.reduce((m: number, x) => m + Buffer.byteLength(String(x), "utf8") + 1, 4) : 8;
  }
  return n + indexBytes;
}

/** Fail a run before it writes when the filtered result is larger than its declared estimate allows (x2 headroom). */
export function assertRunWithinEstimate(key: string, table: BudgetTable, actualRows: number, estimatedRows: number, headroom = 2): void {
  if (actualRows > estimatedRows * headroom) {
    throw new Error(`${key}: ${actualRows} rows kept, more than ${headroom}x the ${estimatedRows} estimated (${megabytes(estimateBytes(table, actualRows))} MB). Tighten the filter before loading.`);
  }
}
