import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { D1Binding } from "@/lib/d1/contracts";
import { vpsAppDatabase } from "@/lib/d1/http-binding";
import { isVpsLiveCustomerAuth } from "@/lib/d1/staging-config";
import { customerAppAuthority } from "../../../workers/d1-api/customer-signup";
import { fromSponsorRow, type SponsorViewRow } from "./data";
import type { PaidSponsor, SponsorCountry, SponsorStatus } from "./model";
import type { SponsorTier } from "./pricing";
import { buildReport, type CounterRow, type SponsorReport } from "./report";

/**
 * Admin reads for /admin/sponsors (full rows, contact and Stripe ids).
 * Admin-only by RLS; callers have already passed requireRole(admin).
 */

export interface AdminSponsorRow extends SponsorViewRow {
  tier: SponsorTier;
  country: SponsorCountry;
  status: SponsorStatus;
  name: string;
  url: string;
  headline: string;
  message: string;
  cta: string;
  monthly_price: number | string | null;
  currency: string | null;
  contact_name: string | null;
  contact_email: string | null;
  notes: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}

export const ADMIN_SPONSOR_COLUMNS =
  "id,slug,tier,country,trades,regions,start_date,end_date,status,name,logo_url,url,headline,message,cta,headline_fr,message_fr,cta_fr,monthly_price,currency,contact_name,contact_email,notes,stripe_customer_id,stripe_subscription_id,reviewed_at,created_at,updated_at";

export type SponsorAdminDb = SupabaseClient | D1Binding;
type D1Sponsor = Omit<AdminSponsorRow, "trades" | "regions"> & { trades: string; regions: string };
const fromD1 = (row: D1Sponsor): AdminSponsorRow => ({ ...row, trades: JSON.parse(row.trades), regions: JSON.parse(row.regions) });

export async function sponsorAdminDatabase(): Promise<SponsorAdminDb> {
  return isVpsLiveCustomerAuth() ? vpsAppDatabase() : await createClient();
}

export async function loadAdminSponsors(supabase: SponsorAdminDb): Promise<{ rows: AdminSponsorRow[]; ready: boolean }> {
  if ("prepare" in supabase) {
    const result = await supabase.prepare(`SELECT ${ADMIN_SPONSOR_COLUMNS} FROM sponsors WHERE ${customerAppAuthority}
      ORDER BY created_at DESC LIMIT 500`).all<D1Sponsor>();
    return { rows: result.results.map(fromD1), ready: result.success };
  }
  const { data, error } = await supabase.from("sponsors").select(ADMIN_SPONSOR_COLUMNS).order("created_at", { ascending: false }).limit(500);
  return { rows: (data as AdminSponsorRow[] | null) ?? [], ready: !error };
}

export async function loadAdminSponsor(supabase: SponsorAdminDb, id: string): Promise<AdminSponsorRow | null> {
  if ("prepare" in supabase) {
    const row = await supabase.prepare(`SELECT ${ADMIN_SPONSOR_COLUMNS} FROM sponsors WHERE id=? AND ${customerAppAuthority}`)
      .bind(id).first<D1Sponsor>();
    return row ? fromD1(row) : null;
  }
  const { data } = await supabase.from("sponsors").select(ADMIN_SPONSOR_COLUMNS).eq("id", id).maybeSingle();
  return (data as AdminSponsorRow | null) ?? null;
}

/** Every sponsor as the slot model sees it (for the exclusivity check). */
export function asPaid(rows: readonly AdminSponsorRow[]): PaidSponsor[] {
  return rows.map(fromSponsorRow).filter((s): s is PaidSponsor => !!s);
}

interface ImpRow { day: string; placement: string; trade: string; region: string; impressions: number }
interface ClickRow { day: string; placement: string; trade: string; region?: string | null; clicks: number }

/** Impressions and clicks for some sponsors (by slug/id) between two days, inclusive. */
export async function loadCounters(
  supabase: SponsorAdminDb,
  sponsors: string[],
  from: string,
  to: string,
): Promise<{ impressions: (CounterRow & { sponsor: string })[]; clicks: (CounterRow & { sponsor: string })[] }> {
  if (!sponsors.length) return { impressions: [], clicks: [] };
  if ("prepare" in supabase) {
    type Row = CounterRow & { sponsor: string };
    const read = (counter: "clicks" | "impressions") => supabase.prepare(`SELECT day,sponsor,placement,trade,region,${counter} AS n
      FROM sponsor_${counter} WHERE day BETWEEN ? AND ? AND sponsor IN (SELECT value FROM json_each(?))
      AND ${customerAppAuthority} ORDER BY day,sponsor LIMIT 10000`)
      .bind(from, to, JSON.stringify(sponsors)).all<Row>();
    const [imp, clk] = await Promise.all([read("impressions"), read("clicks")]);
    return { impressions: imp.results, clicks: clk.results };
  }
  const [imp, clk] = await Promise.all([
    supabase.from("sponsor_impressions").select("day,sponsor,placement,trade,region,impressions").in("sponsor", sponsors).gte("day", from).lte("day", to).limit(10000),
    supabase.from("sponsor_clicks").select("day,sponsor,placement,trade,region,clicks").in("sponsor", sponsors).gte("day", from).lte("day", to).limit(10000),
  ]);
  return {
    impressions: ((imp.data ?? []) as (ImpRow & { sponsor: string })[]).map((r) => ({ sponsor: r.sponsor, day: r.day, placement: r.placement, trade: r.trade, region: r.region, n: r.impressions })),
    clicks: ((clk.data ?? []) as (ClickRow & { sponsor: string })[]).map((r) => ({ sponsor: r.sponsor, day: r.day, placement: r.placement, trade: r.trade, region: r.region ?? "", n: r.clicks })),
  };
}

export async function loadSponsorReport(supabase: SponsorAdminDb, slug: string, month: string, from: string, to: string): Promise<SponsorReport> {
  const c = await loadCounters(supabase, [slug], from, to);
  return buildReport(month, c.impressions, c.clicks);
}
