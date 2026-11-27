import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { isVpsLiveCustomerAuth } from "@/lib/d1/staging-config";
import { vpsAppDatabase } from "@/lib/d1/http-binding";
import type { D1Binding } from "@/lib/d1/contracts";
import { customerAppAuthority } from "../../../workers/d1-api/customer-signup";
import { listRfps } from "@/lib/data/rfps";
import { getTaxonomyRows } from "@/lib/data/taxonomy";
import { torontoToday } from "@/lib/data/monthly-winners-load";
import { getMajorProjects, readNativeProjectProFields } from "@/lib/major-projects/data";
import type { SessionContext } from "@/lib/access/access";
import type { CountryCode } from "@/lib/visitor-geo";
import { buildLeadProfile, marketCounts, matchLeads, type Lead, type LeadProfile, type MarketCounts } from "./match";
import { attachProjectPro, leadsForViewer, projectIdsNeedingPro, type LeadView } from "./view";

/**
 * The dashboard's lead feed for the signed-in company. Everything big comes
 * from the shared cached snapshots (the board, major projects, taxonomy) —
 * the per-request reads are two tiny ones (this company's trades and
 * regions) plus, for Trade Pro only, the Pro fields of the ≤25 projects on
 * screen, read under the member's own session so RLS decides.
 */

export interface MemberMarket {
  profile: LeadProfile;
  counts: MarketCounts;
  leads: LeadView[];
  /** Trade names (display) and the area label, for headings. */
  tradeNames: string[];
  areaLabel: string | null;
  /** True when the company hasn't picked trades / areas yet. */
  missing: { trades: boolean; areas: boolean };
}

export async function getMemberMarket(session: SessionContext, country: CountryCode): Promise<MemberMarket | null> {
  const org = session.organization;
  const native = isVpsLiveCustomerAuth();
  if (!org || (!native && !isSupabaseConfigured())) return null;
  const supabase = native ? null : await createClient();
  const db = native ? vpsAppDatabase() : null;
  const [own, regions, trades, rfps, projects] = await Promise.all([
    supabase ? orgTradesAndRegions(supabase,org.id) : nativeLeadSettings(session.userId,org.id,db!),
    getTaxonomyRows("regions").catch(() => []),
    getTaxonomyRows("trade_categories").catch(() => []),
    listRfps({ country }).catch(() => []),
    country === "CA" ? getMajorProjects().catch(() => []) : Promise.resolve([]),
  ]);
  const profile = buildLeadProfile({
    country,
    org: { city: org.city, province: org.province },
    tradeSlugs: own.tradeSlugs,
    regionIds: own.regionIds,
    regions: regions.map((r) => ({ id: r.id, slug: r.slug, name: r.name, province: r.province ?? null, country: r.country ?? null, parent_id: r.parent_id ?? null })),
    trades: trades.map((t) => ({ id: t.id, slug: t.slug, name: t.name })),
  });
  const today = torontoToday();
  let leads: Lead[] = matchLeads({
    profile,
    rfps,
    projects,
    regionNameById: new Map(regions.map((r) => [r.id, r.name])),
    today,
  });
  const counts = marketCounts(leads, today);
  if (session.hasTradeAccess) {
    const ids = projectIdsNeedingPro(leads);
    if (ids.length) leads = attachProjectPro(leads,supabase ? await projectProFields(supabase,ids)
      : await readNativeProjectProFields(session.userId,ids,db!).catch(() => new Map()));
  }
  return {
    profile,
    counts,
    leads: leadsForViewer(leads, session.hasTradeAccess),
    tradeNames: [...profile.nameBySlug.values()],
    areaLabel: org.city || [...profile.provinces][0] || null,
    missing: { trades: own.tradeSlugs.length === 0, areas: profile.provinces.size === 0 && profile.cities.size === 0 },
  };
}

export async function nativeLeadSettings(actor: string, org: string, db: D1Binding = vpsAppDatabase()) {
  const allowed = `SELECT m.organization_id FROM organization_members m JOIN users_profile u ON u.id=m.user_id
    JOIN organizations o ON o.id=m.organization_id WHERE m.user_id=? AND m.organization_id=? AND u.status='active'
      AND o.status='active' AND o.is_demo=0 AND ${customerAppAuthority}`;
  const [trades, regions] = await db.batch([
    db.prepare(`SELECT DISTINCT t.slug FROM organization_categories c JOIN trade_categories t ON t.id=c.category_id
      WHERE c.organization_id IN (${allowed}) ORDER BY t.slug`).bind(actor,org),
    db.prepare(`SELECT DISTINCT region_id FROM organization_regions WHERE organization_id IN (${allowed})
      ORDER BY region_id`).bind(actor,org),
  ]);
  return { tradeSlugs:trades.results.map(r=>String(r.slug)),regionIds:regions.results.map(r=>String(r.region_id)) };
}

async function orgTradesAndRegions(supabase: SupabaseClient, orgId: string): Promise<{ tradeSlugs: string[]; regionIds: string[] }> {
  const [cats, regs] = await Promise.all([
    supabase.from("organization_categories").select("trade_categories(slug)").eq("organization_id", orgId),
    supabase.from("organization_regions").select("region_id").eq("organization_id", orgId),
  ]);
  return {
    tradeSlugs: ((cats.data as unknown as { trade_categories: { slug: string } | null }[] | null) ?? [])
      .map((r) => r.trade_categories?.slug)
      .filter((s): s is string => Boolean(s)),
    regionIds: ((regs.data as { region_id: string }[] | null) ?? []).map((r) => r.region_id),
  };
}

/**
 * Pro fields for a handful of projects, under the member's session: RLS
 * returns them only to Trade Pro / trial members. Any error (tables not
 * migrated yet) = none.
 */
async function projectProFields(
  supabase: SupabaseClient,
  ids: string[],
): Promise<Map<string, { generalContractor: string | null; bidListUrl: string | null; bidRoute: string | null }>> {
  const { data, error } = await supabase
    .from("major_projects")
    .select("id,general_contractor,bid_list_url,bid_route")
    .in("id", ids.slice(0, 25));
  if (error || !data) return new Map();
  return new Map(
    (data as { id: string; general_contractor: string | null; bid_list_url: string | null; bid_route: string | null }[]).map((r) => [
      r.id,
      { generalContractor: r.general_contractor, bidListUrl: r.bid_list_url, bidRoute: r.bid_route },
    ]),
  );
}
