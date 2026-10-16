/**
 * Server reads of award history for Award Intelligence. The gate is the
 * caller's: loadHistoryForIntel() only ever runs for a viewer who has Intel
 * (session.hasIntelAccess) — never for free, Trade Pro or signed-out
 * viewers, so no history row can reach their HTML. Bid lists are read with
 * the VIEWER's own client, so row level security (has_intel_access) gates
 * them a second time.
 */
import { cache } from "react";
import { getSession } from "@/lib/access/access";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { isServiceConfigured, isSupabaseConfigured } from "@/lib/supabase/config";
import type { BidResultRow } from "@/lib/bid-results/model";
import type { HistoryAwardRow } from "@/lib/intel/history";
import { addMonths, RADAR_MAX_AGE_YEARS } from "@/lib/intel/model";

/** Rows per country merged into the intel pages (running contracts first, then the newest). */
export const INTEL_HISTORY_LIMIT = 30_000;
const TTL_MS = 30 * 60_000;

let memo: { at: number; rows: HistoryAwardRow[] } | null = null;

/** The session, once per request. */
export const intelSession = cache(async () => (isSupabaseConfigured() ? getSession().catch(() => null) : null));

async function fetchSlice(): Promise<HistoryAwardRow[]> {
  const db = createServiceClient();
  const since = addMonths(new Date().toISOString().slice(0, 10), -RADAR_MAX_AGE_YEARS * 12);
  const out: HistoryAwardRow[] = [];
  for (const country of ["CA", "US"] as const) {
    const { data, error } = await db.rpc("award_history_intel_slice", { p_country: country, p_since: since, p_limit: INTEL_HISTORY_LIMIT });
    // Missing migration or a failed read: the pages fall back to board awards only.
    if (error || !Array.isArray(data)) continue;
    out.push(...(data as HistoryAwardRow[]));
  }
  return out;
}

/**
 * The history slice for an Intel viewer, or [] for everyone else (and when
 * the service role isn't configured). Cached in memory for 30 minutes per
 * server instance: the slice is a few MB and changes once a week.
 */
export const loadHistoryForIntel = cache(async (): Promise<HistoryAwardRow[]> => {
  if (!isServiceConfigured()) return [];
  const session = await intelSession();
  if (!session?.hasIntelAccess) return [];
  if (memo && Date.now() - memo.at < TTL_MS) return memo.rows;
  const rows = await fetchSlice().catch(() => [] as HistoryAwardRow[]);
  memo = { at: Date.now(), rows };
  return rows;
});

/** Drop the in-memory slice (after an import). */
export function forgetHistorySlice(): void {
  memo = null;
}

export interface HistoryAwardDetail extends HistoryAwardRow {
  description: string | null;
  start_date: string | null;
  licence: string;
  as_of: string;
  award_date_precision: "day" | "month" | "half_year";
}

/** One award history row, read as the viewer (RLS: Intel subscribers and admins only). */
export async function getHistoryAward(id: string): Promise<HistoryAwardDetail | null> {
  if (!isSupabaseConfigured() || !/^[0-9a-f-]{36}$/i.test(id)) return null;
  const db = await createClient();
  const { data } = await db
    .from("award_history")
    .select("id,source,board_ref,title,description,buyer,winner_business_name,winner_is_individual,value,currency,country,province,city,award_date,award_date_precision,start_date,end_date,end_date_source,potential_end_date,number_of_bids,trade_slugs,notice_url,licence,attribution,as_of")
    .eq("id", id)
    .maybeSingle<HistoryAwardDetail>();
  return data ?? null;
}

/** Bid results for an award history row, read as the viewer (RLS-gated). */
export async function getBidResults(historyId: string): Promise<BidResultRow[]> {
  if (!isSupabaseConfigured() || !/^[0-9a-f-]{36}$/i.test(historyId)) return [];
  const db = await createClient();
  const { data } = await db
    .from("bid_results")
    .select("bidder_business_name,bidder_is_individual,bid_amount,currency,rank,status_label,as_of,source")
    .eq("award_history_id", historyId)
    .order("rank", { ascending: true, nullsFirst: false })
    .limit(200)
    .returns<BidResultRow[]>();
  return data ?? [];
}

/** The history row behind a board award listing ("qca-…" / "cba-…" suffix), read as the viewer. */
export async function getHistoryIdForBoardRef(boardRef: string): Promise<string | null> {
  if (!isSupabaseConfigured()) return null;
  const db = await createClient();
  const { data } = await db.from("award_history").select("id").eq("board_ref", boardRef).limit(1).maybeSingle<{ id: string }>();
  return data?.id ?? null;
}
