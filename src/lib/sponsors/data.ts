import { cache } from "react";
import { unstable_cache } from "next/cache";
import { createReadClient } from "@/lib/supabase/read";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { SPONSORS_TAG } from "@/lib/supabase/public-cache";
import { createSingleFlight } from "@/lib/concurrency";
import { isSponsorStatus, normalizeRegion, tradeSlug, type PaidSponsor } from "./model";
import { isSponsorTier } from "./pricing";

/**
 * ONE shared, server-cached copy of the sponsors that hold a slot (the
 * sponsors_public view), same rule as the board snapshot (PR #136): pages,
 * emails and /go read this, never the table per request. Tag "sponsors",
 * 5 minutes; admin writes expire it at once (lib/supabase/write-fetch).
 * The list is tiny (one row per sold slot), so one read fills it.
 */

export const SPONSORS_REVALIDATE = 300;
const READ_TIMEOUT_MS = 8_000;

export interface SponsorViewRow {
  id: string;
  slug: string;
  tier: string;
  country: string;
  trades: string[] | null;
  regions: string[] | null;
  start_date: string | null;
  end_date: string | null;
  status: string;
  name: string | null;
  logo_url: string | null;
  url: string | null;
  headline: string | null;
  message: string | null;
  cta: string | null;
  headline_fr: string | null;
  message_fr: string | null;
  cta_fr: string | null;
}

export const SPONSOR_VIEW_COLUMNS =
  "id,slug,tier,country,trades,regions,start_date,end_date,status,name,logo_url,url,headline,message,cta,headline_fr,message_fr,cta_fr";

/** A view/table row → PaidSponsor; null for a malformed row. */
export function fromSponsorRow(r: SponsorViewRow): PaidSponsor | null {
  if (!isSponsorTier(r.tier) || !isSponsorStatus(r.status) || (r.country !== "CA" && r.country !== "US")) return null;
  return {
    id: r.id,
    slug: r.slug,
    name: r.name ?? "",
    logoUrl: r.logo_url,
    url: r.url ?? "",
    headline: r.headline ?? "",
    message: r.message ?? "",
    cta: r.cta ?? "",
    headlineFr: r.headline_fr,
    messageFr: r.message_fr,
    ctaFr: r.cta_fr,
    tier: r.tier,
    country: r.country,
    trades: (r.trades ?? []).map(tradeSlug).filter(Boolean),
    regions: (r.regions ?? []).map((x) => normalizeRegion(x)).filter((x): x is string => !!x),
    startDate: r.start_date,
    endDate: r.end_date,
    status: r.status,
  };
}

const singleFlight = createSingleFlight();

async function fetchSponsors(): Promise<PaidSponsor[]> {
  const { data, error } = await createReadClient()
    .from("sponsors_public")
    .select(SPONSOR_VIEW_COLUMNS)
    .limit(1000)
    .abortSignal(AbortSignal.timeout(READ_TIMEOUT_MS));
  if (error) throw new Error(`sponsors_public: ${error.message}`);
  return ((data ?? []) as SponsorViewRow[]).map(fromSponsorRow).filter((s): s is PaidSponsor => !!s);
}

const cachedSponsors = unstable_cache(
  async (_projectUrl: string): Promise<PaidSponsor[]> => singleFlight("sponsors", fetchSponsors),
  ["sponsors-public-v1"],
  { tags: [SPONSORS_TAG], revalidate: SPONSORS_REVALIDATE },
);

/**
 * Sponsors holding a slot (pending, approved, paused), once per request and
 * from the data cache across requests. Empty without Supabase or before the
 * migration runs: pages then fall back to the house sponsors.
 */
export const getSponsorSnapshot = cache(async (): Promise<PaidSponsor[]> => {
  if (!isSupabaseConfigured()) return [];
  try {
    return await cachedSponsors(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
  } catch (e) {
    console.warn("[sponsors] snapshot unavailable", e instanceof Error ? e.message : e);
    return [];
  }
});
