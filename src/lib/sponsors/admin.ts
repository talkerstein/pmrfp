import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fromSponsorRow, type SponsorViewRow } from "./data";
import type { PaidSponsor } from "./model";
import { buildReport, type CounterRow, type SponsorReport } from "./report";

/**
 * Admin reads for /admin/sponsors (full rows, contact and Stripe ids).
 * Admin-only by RLS; callers have already passed requireRole(admin).
 */

export interface AdminSponsorRow extends SponsorViewRow {
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

export async function loadAdminSponsors(supabase: SupabaseClient): Promise<{ rows: AdminSponsorRow[]; ready: boolean }> {
  const { data, error } = await supabase.from("sponsors").select(ADMIN_SPONSOR_COLUMNS).order("created_at", { ascending: false }).limit(500);
  return { rows: (data as AdminSponsorRow[] | null) ?? [], ready: !error };
}

export async function loadAdminSponsor(supabase: SupabaseClient, id: string): Promise<AdminSponsorRow | null> {
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
  supabase: SupabaseClient,
  sponsors: string[],
  from: string,
  to: string,
): Promise<{ impressions: (CounterRow & { sponsor: string })[]; clicks: (CounterRow & { sponsor: string })[] }> {
  if (!sponsors.length) return { impressions: [], clicks: [] };
  const [imp, clk] = await Promise.all([
    supabase.from("sponsor_impressions").select("day,sponsor,placement,trade,region,impressions").in("sponsor", sponsors).gte("day", from).lte("day", to).limit(10000),
    supabase.from("sponsor_clicks").select("day,sponsor,placement,trade,region,clicks").in("sponsor", sponsors).gte("day", from).lte("day", to).limit(10000),
  ]);
  return {
    impressions: ((imp.data ?? []) as (ImpRow & { sponsor: string })[]).map((r) => ({ sponsor: r.sponsor, day: r.day, placement: r.placement, trade: r.trade, region: r.region, n: r.impressions })),
    clicks: ((clk.data ?? []) as (ClickRow & { sponsor: string })[]).map((r) => ({ sponsor: r.sponsor, day: r.day, placement: r.placement, trade: r.trade, region: r.region ?? "", n: r.clicks })),
  };
}

export async function loadSponsorReport(supabase: SupabaseClient, slug: string, month: string, from: string, to: string): Promise<SponsorReport> {
  const c = await loadCounters(supabase, [slug], from, to);
  return buildReport(month, c.impressions, c.clicks);
}
