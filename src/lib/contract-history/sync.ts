/**
 * Writes for the history importers (service role). Rows are upserted on
 * (source, source_key) and never deleted: a source that drops old records
 * (TxDOT keeps 24 months, Toronto 18) leaves them in award_history, which
 * is how history accumulates. Bid rows are upserted on (award, bidder).
 * Sequential batches of 500, so a run never floods the database.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { dedupeAwards, validateAward, type AwardHistoryInput, type BidResultInput } from "./model";

export const BATCH = 500;

export interface SyncResult {
  upserted: number;
  invalid: Record<string, number>;
  bidRows: number;
  bidsSkipped: number;
}

/** Valid rows only, last one per key; the reasons the rest were dropped. */
export function prepareAwards(rows: AwardHistoryInput[]): { rows: AwardHistoryInput[]; invalid: Record<string, number> } {
  const invalid: Record<string, number> = {};
  const ok: AwardHistoryInput[] = [];
  for (const r of rows) {
    const why = validateAward(r);
    if (why) invalid[why] = (invalid[why] ?? 0) + 1;
    else ok.push(r);
  }
  return { rows: dedupeAwards(ok), invalid };
}

/** Last row per (award, bidder). */
export function dedupeBids(bids: BidResultInput[]): BidResultInput[] {
  const m = new Map<string, BidResultInput>();
  for (const b of bids) m.set(`${b.award_source}|${b.award_source_key}|${b.bidder_key}`, b);
  return [...m.values()];
}

export async function applyHistory(db: SupabaseClient, awards: AwardHistoryInput[], bids: BidResultInput[]): Promise<SyncResult> {
  const { rows, invalid } = prepareAwards(awards);
  const now = new Date().toISOString();
  const ids = new Map<string, string>();
  let upserted = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH).map((r) => ({ ...r, updated_at: now }));
    const { data, error } = await db.from("award_history").upsert(chunk, { onConflict: "source,source_key" }).select("id,source,source_key");
    if (error) throw new Error(`award_history upsert: ${error.message}`);
    for (const d of (data ?? []) as { id: string; source: string; source_key: string }[]) ids.set(`${d.source}|${d.source_key}`, d.id);
    upserted += chunk.length;
  }
  let bidRows = 0;
  let bidsSkipped = 0;
  const ready = dedupeBids(bids).flatMap((b) => {
    const id = ids.get(`${b.award_source}|${b.award_source_key}`);
    if (!id) {
      bidsSkipped++;
      return [];
    }
    const { award_source: _s, award_source_key: _k, ...row } = b;
    return [{ ...row, award_history_id: id, updated_at: now }];
  });
  for (let i = 0; i < ready.length; i += BATCH) {
    const chunk = ready.slice(i, i + BATCH);
    const { error } = await db.from("bid_results").upsert(chunk, { onConflict: "award_history_id,bidder_key" });
    if (error) throw new Error(`bid_results upsert: ${error.message}`);
    bidRows += chunk.length;
  }
  return { upserted, invalid, bidRows, bidsSkipped };
}
