/**
 * OPEN DATA: server reads for the pages. Every read is cached for 24 hours
 * (unstable_cache, tag "open-data") and the import crons mark the tag stale
 * after a write, so a page refreshes on its next visit instead of on a
 * timer. None of this creates a page: the data feeds blocks on pages that
 * already exist (tender pages, trade x city pages, buyer pages).
 *
 * Without the service client (build, previews) every loader returns [] and
 * the blocks simply do not render.
 */
import { unstable_cache } from "next/cache";
import { createServiceClient } from "@/lib/supabase/service";
import { isServiceConfigured } from "@/lib/supabase/config";
import type { AwardRow } from "@/lib/data/award-intel";
import { WINDOW_MONTHS, windowStart } from "@/lib/data/price-benchmarks";
import { getCategories } from "@/lib/data/taxonomy";
import { buyerKey } from "@/lib/contract-history/model";
import { ARCGIS_CITIES } from "./arcgis-permits";
import { CALGARY_TRADES } from "./calgary";
import { VANCOUVER_ATTRIBUTION, VANCOUVER_AWARDS_SOURCE } from "./vancouver";
import { isPublishableWinner } from "@/lib/data/winners";
import { attributionForSource } from "./sources";
import { isVpsLiveCustomerAuth } from "@/lib/d1/staging-config";
import { vpsAppDatabase } from "@/lib/d1/http-binding";
import { customerAppAuthority } from "../../../workers/d1-api/customer-signup";

export const OPEN_DATA_TAG = "open-data";
const DAY = 86_400;

/** Cities that have permit leads (so every other city skips the database). */
export const PERMIT_CITIES: ReadonlySet<string> = new Set(["Vancouver", ...ARCGIS_CITIES.filter((c) => c.enabled).map((c) => c.city)]);

export interface PermitRow {
  issued_on: string;
  contractor: string;
  value_cad: number;
  work_type: string | null;
  source: string;
}

export interface RecentPermits {
  rows: PermitRow[];
  credits: string[];
}

export const loadRecentPermits = (city: string, limit = 8): Promise<RecentPermits> => {
  const native = isVpsLiveCustomerAuth();
  if (!PERMIT_CITIES.has(city) || (!native && !isServiceConfigured())) return Promise.resolve({ rows: [], credits: [] });
  return unstable_cache(
    async (): Promise<RecentPermits> => {
      const data = native ? (await vpsAppDatabase().prepare(`SELECT issued_on,contractor,value_cad,work_type,source
        FROM permit_leads WHERE city=? AND ${customerAppAuthority}
        ORDER BY issued_on DESC,CAST(value_cad AS REAL) DESC,id LIMIT ?`).bind(city, limit).all<PermitRow>()).results
        : (await createServiceClient()
        .from("permit_leads")
        .select("issued_on,contractor,value_cad,work_type,source")
        .eq("city", city)
        .order("issued_on", { ascending: false })
        .order("value_cad", { ascending: false })
        .limit(limit)
        .returns<PermitRow[]>()).data;
      const rows = (data ?? []).map((r) => ({ ...r, value_cad: Number(r.value_cad) }));
      const credits = [...new Set(rows.map((r) => attributionForSource(r.source)).filter((c): c is string => Boolean(c)))];
      return { rows, credits };
    },
    ["open-data", "permits", city, String(limit), String(native)],
    { revalidate: DAY, tags: [OPEN_DATA_TAG] },
  )();
};

export interface ContractorRow {
  rank: number;
  contractor: string;
  permits: number;
}

export interface ContractorList {
  rows: ContractorRow[];
  windowStart: string | null;
  windowEnd: string | null;
}

export const loadContractorActivity = (city: string, tradeSlug: string, limit = 10): Promise<ContractorList> => {
  const native = isVpsLiveCustomerAuth();
  if (city !== "Calgary" || (!native && !isServiceConfigured())) return Promise.resolve({ rows: [], windowStart: null, windowEnd: null });
  return unstable_cache(
    async (): Promise<ContractorList> => {
      type Row = ContractorRow & { window_start: string; window_end: string };
      const data = native ? (await vpsAppDatabase().prepare(`SELECT rank,contractor,permits,window_start,window_end
        FROM contractor_activity WHERE city=? AND trade_slug=? AND ${customerAppAuthority} ORDER BY rank,id LIMIT ?`)
        .bind(city, tradeSlug, limit).all<Row>()).results : (await createServiceClient()
        .from("contractor_activity")
        .select("rank,contractor,permits,window_start,window_end")
        .eq("city", city)
        .eq("trade_slug", tradeSlug)
        .order("rank", { ascending: true })
        .limit(limit)
        .returns<Row[]>()).data;
      const rows = data ?? [];
      return { rows: rows.map(({ rank, contractor, permits }) => ({ rank, contractor, permits })), windowStart: rows[0]?.window_start ?? null, windowEnd: rows[0]?.window_end ?? null };
    },
    ["open-data", "contractors", city, tradeSlug, String(limit), String(native)],
    { revalidate: DAY, tags: [OPEN_DATA_TAG] },
  )();
};

/** Top contractors for each Calgary trade (the buyer page summary). */
export const loadCalgaryTop = async (limit = 5): Promise<{ trade: string; label: string; list: ContractorList }[]> =>
  Promise.all(CALGARY_TRADES.map(async (t) => ({ trade: t.trade, label: t.label, list: await loadContractorActivity("Calgary", t.trade, limit).catch((): ContractorList => ({ rows: [], windowStart: null, windowEnd: null })) })));

export interface PlannedRow {
  title: string;
  type_of_work: string | null;
  scope: string | null;
  division: string | null;
  sourcing_year: number | null;
  sourcing_type: string | null;
  estimated_range: string | null;
}

/** The buyer's planned procurements (City of Toronto only today), soonest sourcing year first. */
export const loadPlannedProcurements = (buyerName: string, limit = 12): Promise<PlannedRow[]> => {
  const key = buyerKey(buyerName);
  const native = isVpsLiveCustomerAuth();
  if (key !== "city of toronto" || (!native && !isServiceConfigured())) return Promise.resolve([]);
  return unstable_cache(
    async (): Promise<PlannedRow[]> => {
      if (native) return (await vpsAppDatabase().prepare(`SELECT title,type_of_work,scope,division,sourcing_year,sourcing_type,estimated_range
        FROM planned_procurements WHERE buyer_key=? AND ${customerAppAuthority} ORDER BY sourcing_year IS NULL,sourcing_year,id LIMIT ?`)
        .bind(key, limit).all<PlannedRow>()).results;
      const { data } = await createServiceClient()
        .from("planned_procurements")
        .select("title,type_of_work,scope,division,sourcing_year,sourcing_type,estimated_range")
        .eq("buyer_key", key)
        .order("sourcing_year", { ascending: true, nullsFirst: false })
        .order("id", { ascending: true })
        .limit(limit)
        .returns<PlannedRow[]>();
      return data ?? [];
    },
    ["open-data", "planned", key, String(limit), String(native)],
    { revalidate: DAY, tags: [OPEN_DATA_TAG] },
  )();
};

/**
 * Competitive awards from open-data history that may join the "what similar
 * work sold for" index: City of Vancouver contracts of the last 24 months
 * with a disclosed value and a trade. Sole-source rows are never included
 * (non_competitive), and the federal file has no province so it is not used
 * here. The boards' own award notices (CanadaBuys, SEAO, Toronto...) already
 * feed that index, so only sources the board does NOT carry are added.
 * Capped at 3,000 compact rows (well under the 2 MB cache entry limit).
 */
export const PRICE_SOURCES = [VANCOUVER_AWARDS_SOURCE] as const;

export const loadOpenDataAwardRows = (): Promise<AwardRow[]> => {
  const native = isVpsLiveCustomerAuth();
  if (!native && !isServiceConfigured()) return Promise.resolve([]);
  return unstable_cache(
    async (): Promise<AwardRow[]> => {
      const since = windowStart(new Date().toISOString().slice(0, 10), WINDOW_MONTHS);
      type PriceAward = { trade_slugs: string[]; province: string | null; city: string | null; value: number;
        winner_business_name: string | null; award_date: string };
      const data = native ? (await vpsAppDatabase().prepare(`SELECT trade_slugs,province,city,CAST(value AS REAL) AS value,
        CASE WHEN winner_is_individual=0 THEN winner_business_name END AS winner_business_name,award_date
        FROM award_history WHERE source IN (SELECT value FROM json_each(?)) AND non_competitive=0 AND country='CA'
          AND CAST(value AS REAL)>=1000 AND award_date>=? AND ${customerAppAuthority} ORDER BY award_date DESC,id LIMIT 3000`)
        .bind(JSON.stringify(PRICE_SOURCES), since).all<Omit<PriceAward, "trade_slugs"> & { trade_slugs: string }>())
        .results.map(row => ({ ...row, trade_slugs: JSON.parse(row.trade_slugs) as string[] })) : (await createServiceClient()
        .from("award_history")
        .select("trade_slugs,province,city,value,winner_business_name,award_date")
        .in("source", [...PRICE_SOURCES])
        .eq("non_competitive", false)
        .eq("country", "CA")
        .gte("value", 1000)
        .gte("award_date", since)
        .limit(3000)
        .returns<PriceAward[]>()).data;
      if (!data?.length) return [];
      const names = new Map((await getCategories().catch(() => [])).map((c) => [c.slug, c.name]));
      return data
        .map((r): AwardRow | null => {
          const categories = r.trade_slugs.map((s) => names.get(s)).filter((n): n is string => Boolean(n));
          if (!categories.length) return null;
          return { categories, regionName: r.city, province: r.province, market: "CA", amount: Number(r.value), winner: r.winner_business_name && isPublishableWinner(r.winner_business_name) ? r.winner_business_name : null, winnerSlug: null, date: r.award_date, credit: VANCOUVER_ATTRIBUTION };
        })
        .filter((r): r is AwardRow => r !== null);
    },
    ["open-data", "award-rows", String(native)],
    { revalidate: DAY, tags: [OPEN_DATA_TAG] },
  )();
};
