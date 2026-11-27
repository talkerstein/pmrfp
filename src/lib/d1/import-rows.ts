import { randomUUID } from "node:crypto";
import type { D1Binding, D1Statement } from "./contracts";

const keys = {
  award_history: ["source", "source_key"],
  bid_results: ["award_history_id", "bidder_key"],
  permit_leads: ["source", "source_key"],
  contractor_activity: ["source", "city", "trade_slug", "contractor_key"],
  planned_procurements: ["source", "source_key"],
  open_data_runs: ["source"],
  major_projects: ["source_key"],
} as const;

type Table = keyof typeof keys;
const uuidTables = new Set<Table>(["award_history", "bid_results", "major_projects"]);
type Value = string | number | null;

function serialize(value: unknown): Value {
  if (value === null || value === undefined) return null;
  if (typeof value === "boolean") return Number(value);
  if (typeof value === "string" || typeof value === "number") return value;
  return JSON.stringify(value);
}

/** Bulk importer row keys are defined by their TypeScript collectors. Row
 * values, including public feed text and JSON, always pass as parameters. */
export async function upsertD1Import<T extends Record<string, unknown>>(
  db: D1Binding, table: Table, rows: readonly object[], options: { keepExisting?: boolean; returnAwards?: boolean } = {},
): Promise<T[]> {
  const conflict = keys[table] as readonly string[];
  const result: T[] = [];
  let batch: D1Statement[] = [];
  let bytes = 0;
  const flush = async () => {
    if (!batch.length) return;
    const written = await db.batch<T>(batch);
    if (written.some(row => !row.success)) throw Error(`${table} write failed`);
    for (const row of written) result.push(...row.results);
    batch = [];
    bytes = 0;
  };
  for (const row of rows) {
    const fields = Object.entries(row).filter(([, value]) => value !== undefined);
    const columns = fields.map(([name]) => name);
    if (columns.some(name => !/^[a-z][a-z0-9_]*$/.test(name)) || conflict.some(name => !columns.includes(name))) {
      throw Error(`Invalid ${table} import columns`);
    }
    const assignments = columns.filter(column => column !== "id" && !conflict.includes(column));
    if (uuidTables.has(table) && !columns.includes("id")) fields.unshift(["id", randomUUID()]);
    const sql = `INSERT INTO ${table}(${fields.map(([name]) => name).join(",")}) VALUES(${fields.map(() => "?").join(",")})
      ON CONFLICT(${conflict.join(",")}) ${options.keepExisting || !assignments.length ? "DO NOTHING" :
      "DO UPDATE SET " + assignments.map(column => `${column}=excluded.${column}`).join(",")}
      ${options.returnAwards && table === "award_history" ? "RETURNING id,source,source_key" : ""}`;
    const params = fields.map(([, value]) => serialize(value));
    const size = Buffer.byteLength(sql) + Buffer.byteLength(JSON.stringify(params)) + 80;
    if (size > 256_000) throw Error(`${table} import row too large`);
    if (batch.length >= 32 || bytes + size > 256_000) await flush();
    batch.push(db.prepare(sql).bind(...params));
    bytes += size;
  }
  await flush();
  return result;
}
