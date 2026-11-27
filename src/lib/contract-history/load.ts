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
import { isVpsLiveCustomerAuth, usesD1CustomerAuth } from "@/lib/d1/staging-config";
import { vpsAppDatabase } from "@/lib/d1/http-binding";
import { UUID, type D1Binding } from "@/lib/d1/contracts";
import { customerAppAuthority } from "../../../workers/d1-api/customer-signup";
import type { SessionContext } from "@/lib/access/access";

/** Rows per country merged into the intel pages (running contracts first, then the newest). */
export const INTEL_HISTORY_LIMIT = 30_000;
const TTL_MS = 30 * 60_000;

let memo: { at: number; rows: HistoryAwardRow[] } | null = null;
let pending: Promise<HistoryAwardRow[]> | null = null;

/** The session, once per request. */
export const intelSession = cache(async () => (usesD1CustomerAuth() || isSupabaseConfigured() ? getSession().catch(() => null) : null));

const nativeIntelScope = `${customerAppAuthority} AND EXISTS (
  SELECT 1 FROM users_profile u WHERE u.id=? AND u.status='active' AND (
    u.primary_role IN ('admin','super_admin') OR EXISTS (
      SELECT 1 FROM organization_members m JOIN organizations o ON o.id=m.organization_id
      JOIN intel_access i ON i.organization_id=o.id WHERE m.user_id=u.id AND o.id=? AND o.status<>'suspended'
      AND i.status IN ('active','comped','trialing') AND (i.expires_at IS NULL OR julianday(i.expires_at)>julianday('now'))
    )
  )
)`;
const historyColumns = `h.id,h.source,h.board_ref,h.title,h.buyer,
  CASE WHEN h.winner_is_individual=0 THEN h.winner_business_name END AS winner_business_name,
  h.winner_is_individual,h.value,h.currency,h.country,h.province,h.city,h.award_date,
  h.end_date,h.end_date_source,h.potential_end_date,h.number_of_bids,h.trade_slugs,h.notice_url,h.attribution`;
type NativeHistoryRow = Omit<HistoryAwardRow, "value" | "trade_slugs" | "winner_is_individual" | "has_bids"> & {
  value: string | number | null; trade_slugs: string; winner_is_individual: number; has_bids?: number;
};

function nativeHistory<T extends NativeHistoryRow>(row: T) {
  const { value, trade_slugs, winner_is_individual, has_bids, ...details } = row;
  return { ...details, value: value === null ? null : Number(value), trade_slugs: JSON.parse(trade_slugs) as string[],
    winner_is_individual: winner_is_individual === 1, has_bids: has_bids === 1 };
}

async function nativeIntelAllowed(session: SessionContext, db: D1Binding) {
  return Boolean(await db.prepare(`SELECT 1 AS allowed WHERE ${nativeIntelScope}`)
    .bind(session.userId, session.organization?.id ?? null).first());
}

export async function loadVpsHistorySlice(session: SessionContext, db: D1Binding = vpsAppDatabase(),
  today = new Date().toISOString().slice(0, 10)) {
  if (!session.hasIntelAccess) return [];
  const since = addMonths(today, -RADAR_MAX_AGE_YEARS * 12);
  const slices = await Promise.all((["CA", "US"] as const).map((country) => db.prepare(`WITH selected AS (
    SELECT ${historyColumns},h.non_competitive,h.procurement_method
    FROM award_history h WHERE h.country=? AND (h.award_date>=? OR h.end_date>=date(?,'-365 days'))
      AND ${nativeIntelScope}
    ORDER BY CASE WHEN h.end_date>=date(?,'-365 days') THEN 1 ELSE 0 END DESC,h.award_date DESC,h.id LIMIT ?
  )
  SELECT h.*,EXISTS(SELECT 1 FROM bid_results b WHERE b.award_history_id=h.id) AS has_bids FROM selected h
  ORDER BY h.award_date DESC,h.id`).bind(country, since, today, session.userId, session.organization?.id ?? null, today, INTEL_HISTORY_LIMIT)
    .all<NativeHistoryRow & { non_competitive: number; procurement_method: string | null }>()));
  if (slices.some(row => !row.success)) throw new Error("Award history unavailable");
  return slices.flatMap(row => row.results.map(item => ({ ...nativeHistory(item), non_competitive: item.non_competitive === 1 })));
}

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
  const native = isVpsLiveCustomerAuth();
  if (!native && !isServiceConfigured()) return [];
  const session = await intelSession();
  if (!session?.hasIntelAccess) return [];
  try {
    const database = native ? vpsAppDatabase() : undefined;
    if (database && !await nativeIntelAllowed(session, database)) return [];
    if (memo && Date.now() - memo.at < TTL_MS) return memo.rows;
    if (pending) return await pending;
    const refresh = native ? loadVpsHistorySlice(session, database) : fetchSlice();
    pending = refresh;
    try {
      const rows = await refresh;
      if (pending === refresh) memo = { at: Date.now(), rows };
      return rows;
    } finally {
      if (pending === refresh) pending = null;
    }
  } catch {
    return [];
  }
});

/** Drop the in-memory slice (after an import). */
export function forgetHistorySlice(): void {
  memo = null;
  pending = null;
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
  if (!UUID.test(id)) return null;
  if (isVpsLiveCustomerAuth()) {
    const session = await intelSession();
    if (!session?.hasIntelAccess) return null;
    return readVpsHistoryAward(id, session);
  }
  if (!isSupabaseConfigured()) return null;
  const db = await createClient();
  const { data } = await db
    .from("award_history")
    .select("id,source,board_ref,title,description,buyer,winner_business_name,winner_is_individual,value,currency,country,province,city,award_date,award_date_precision,start_date,end_date,end_date_source,potential_end_date,number_of_bids,trade_slugs,notice_url,licence,attribution,as_of")
    .eq("id", id)
    .maybeSingle<HistoryAwardDetail>();
  return data ?? null;
}

export async function readVpsHistoryAward(id: string, session: SessionContext, db: D1Binding = vpsAppDatabase()) {
  if (!session.hasIntelAccess) return null;
  const row = await db.prepare(`SELECT ${historyColumns},h.description,h.start_date,h.licence,h.as_of,h.award_date_precision
    FROM award_history h WHERE h.id=? AND ${nativeIntelScope}`).bind(id, session.userId, session.organization?.id ?? null)
    .first<NativeHistoryRow & Pick<HistoryAwardDetail, "description" | "start_date" | "licence" | "as_of" | "award_date_precision">>();
  return row ? nativeHistory(row) : null;
}

/** Bid results for an award history row, read as the viewer (RLS-gated). */
export async function getBidResults(historyId: string): Promise<BidResultRow[]> {
  if (!UUID.test(historyId)) return [];
  if (isVpsLiveCustomerAuth()) {
    const session = await intelSession();
    if (!session?.hasIntelAccess) return [];
    return readVpsHistoryBids(historyId, session);
  }
  if (!isSupabaseConfigured()) return [];
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

export async function readVpsHistoryBids(historyId: string, session: SessionContext, db: D1Binding = vpsAppDatabase()): Promise<BidResultRow[]> {
  if (!session.hasIntelAccess) return [];
  const result = await db.prepare(`SELECT CASE WHEN bidder_is_individual=0 THEN bidder_business_name END AS bidder_business_name,
    bidder_is_individual,bid_amount,currency,rank,status_label,as_of,source FROM bid_results
    WHERE award_history_id=? AND ${nativeIntelScope} ORDER BY rank IS NULL,rank,id LIMIT 200`)
    .bind(historyId, session.userId, session.organization?.id ?? null)
    .all<Omit<BidResultRow, "bid_amount" | "bidder_is_individual"> & { bidder_is_individual: number; bid_amount: string | null }>();
  return result.results.map(row => ({ ...row, bid_amount: row.bid_amount === null ? null : Number(row.bid_amount),
    bidder_is_individual: row.bidder_is_individual === 1 }));
}

/** The history row behind a board award listing ("qca-…" / "cba-…" suffix), read as the viewer. */
export async function getHistoryIdForBoardRef(boardRef: string): Promise<string | null> {
  if (isVpsLiveCustomerAuth()) {
    const session = await intelSession();
    if (!session?.hasIntelAccess || !boardRef || boardRef.length > 200) return null;
    const row = await vpsAppDatabase().prepare(`SELECT id FROM award_history WHERE board_ref=? AND ${nativeIntelScope}
      ORDER BY award_date DESC,id LIMIT 1`).bind(boardRef, session.userId, session.organization?.id ?? null).first<{ id: string }>();
    return row?.id ?? null;
  }
  if (!isSupabaseConfigured()) return null;
  const db = await createClient();
  const { data } = await db.from("award_history").select("id").eq("board_ref", boardRef).limit(1).maybeSingle<{ id: string }>();
  return data?.id ?? null;
}
