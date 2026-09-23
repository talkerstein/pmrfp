/**
 * Cached platform stats — used for social-proof counters on home / pricing / etc.
 *
 * Currently exposes:
 *  - rfpsPostedLast30Days: count of approved RFPs created in the last 30 days
 *  - tradesListed:         count of approved trade-company organizations
 *
 * Numbers are computed via Supabase HEAD count queries (no row payload, fast).
 * In demo mode (no Supabase) we return honest demo numbers from the fixture
 * data so the marketing pages still render meaningful proof.
 *
 * Callers should treat these as approximate (we don't bust cache on every
 * write — the page is ISR'd / revalidated periodically).
 */
import { createReadClient } from "@/lib/supabase/read";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { DEMO_RFPS } from "@/lib/demo-data";

export interface PlatformStats {
  rfpsPostedLast30Days: number;
  tradesListed: number;
}

export async function getPlatformStats(): Promise<PlatformStats> {
  if (!isSupabaseConfigured()) {
    return {
      rfpsPostedLast30Days: DEMO_RFPS.length,
      tradesListed: 12,
    };
  }

  const supabase = createReadClient();
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  // HEAD-count both queries in parallel. RLS on rfp_public + the trade-company
  // RLS already constrain to publicly visible rows, so anon-context counts are
  // safe. is_demo=false filter on the RFP counter keeps the public number
  // honest — sample/seed RFPs don't count toward the "last 30 days" social
  // proof number that visitors see on /rfps + /pricing.
  const [rfpCount, tradeCount] = await Promise.all([
    supabase
      .from("rfp_public")
      .select("*", { count: "exact", head: true })
      .eq("is_demo", false)
      // published_at, not created_at: imported public tenders carry the
      // issuer's real posting date, so a backlog import can't inflate this.
      .gte("published_at", since)
      // Past public contracts (award notices) were never "posted" as work.
      .not("slug", "like", "%-cba-%")
      .not("slug", "like", "%-qca-%"),
    supabase
      .from("organizations")
      .select("*", { count: "exact", head: true })
      .eq("organization_type", "trade_company")
      .eq("profile_status", "approved")
      .eq("is_demo", false),
  ]);

  return {
    rfpsPostedLast30Days: rfpCount.count ?? 0,
    tradesListed: tradeCount.count ?? 0,
  };
}
