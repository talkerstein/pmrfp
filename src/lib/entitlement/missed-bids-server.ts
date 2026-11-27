import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { vpsAppDatabase } from "@/lib/d1/http-binding";
import { isVpsLiveCustomerAuth } from "@/lib/d1/staging-config";
import { customerAppAuthority } from "../../../workers/d1-api/customer-signup";
import type { SessionContext } from "@/lib/access/access";
import { expandRegionIds, type RegionNode } from "@/lib/data/region-tree";
import { orgCountries, regionCountryMap } from "@/lib/alerts/country";
import { displayTitle } from "@/lib/tenders/title";
import { MISSED_WINDOW_DAYS, computeMissedBids, type MissedBids, type MissedRfp } from "./missed-bids";

interface Row {
  id: string;
  title: string;
  slug: string;
  deadline: string | null;
  region_id: string | null;
  province: string | null;
  source_type: string | null;
  rfp_categories: { category_id: string }[];
}

/**
 * The member's own "bids you missed" numbers, read as the member (row level
 * security) from the same tables the weekly roundup reads. Null when there
 * is nothing real to say or anything can't be read (the card is simply not
 * drawn).
 */
export async function loadMissedBids(session: SessionContext, now: Date = new Date(), db?: SupabaseClient): Promise<MissedBids | null> {
  const org = session.organization;
  if (!org || org.organization_type !== "trade_company" || session.hasTradeAccess) return null;
  const native = !db && isVpsLiveCustomerAuth();
  if (!native && !db && !isSupabaseConfigured()) return null;
  try {
    const today = now.toISOString().slice(0, 10);
    const since = new Date(now.getTime() - MISSED_WINDOW_DAYS * 86_400_000).toISOString();
    const sources = native ? await readMissedCandidates(org.id, session.userId, since)
      : await readLegacyCandidates(db ?? (await createClient()), org.id, since);
    if (!sources) return null;
    const { categories, own, regionRows, candidates } = sources;
    const nationalIds = new Set(regionRows.filter((r) => r.slug === "canada" || r.slug === "united-states").map((r) => r.id));
    const byRegion = regionCountryMap(regionRows);
    const items: MissedRfp[] = candidates.map((r) => ({
      id: r.id,
      title: displayTitle(r.title, r.source_type).title,
      slug: r.slug,
      deadline: r.deadline,
      region_id: r.region_id,
      province: r.province,
      rfp_categories: r.rfp_categories ?? [],
    }));
    return computeMissedBids(
      items,
      { categories, regions: expandRegionIds(own, regionRows as RegionNode[]), countries: orgCountries(org, own, byRegion) },
      nationalIds,
      byRegion,
      today,
    );
  } catch (e) {
    console.warn("[missed-bids] unavailable", e instanceof Error ? e.message : e);
    return null;
  }
}

type Region = { id: string; slug: string; parent_id: string | null; country: string | null };

async function readMissedCandidates(orgId: string, userId: string, since: string) {
  const db = vpsAppDatabase();
  const allowed = `EXISTS(SELECT 1 FROM organization_members m JOIN users_profile u ON u.id=m.user_id
    WHERE m.organization_id=? AND m.user_id=? AND u.status='active') AND ${customerAppAuthority}`;
  const [categories, own, regionRows, candidates] = await Promise.all([
    db.prepare(`SELECT category_id FROM organization_categories WHERE organization_id=? AND ${allowed}`)
      .bind(orgId,orgId,userId).all<{ category_id: string }>(),
    db.prepare(`SELECT region_id FROM organization_regions WHERE organization_id=? AND ${allowed}`)
      .bind(orgId,orgId,userId).all<{ region_id: string }>(),
    db.prepare("SELECT id,slug,parent_id,country FROM regions ORDER BY id LIMIT 5000").all<Region>(),
    db.prepare(`SELECT r.id,r.title,r.slug,r.deadline,r.region_id,r.province,r.source_type,
      (SELECT json_group_array(json_object('category_id',category_id)) FROM rfp_categories WHERE rfp_id=r.id) AS categories
      FROM rfp_posts r WHERE r.status='published' AND r.is_demo=0 AND julianday(r.published_at)>=julianday(?)
      AND ${allowed} ORDER BY r.deadline ASC NULLS LAST,r.id LIMIT 500`)
      .bind(since,orgId,userId).all<Omit<Row,"rfp_categories"> & { categories: string }>(),
  ]);
  return { categories: new Set(categories.results.map((r) => r.category_id)), own: own.results.map((r) => r.region_id),
    regionRows: regionRows.results, candidates: candidates.results.map((r) => ({ ...r, rfp_categories: JSON.parse(r.categories) })) as Row[] };
}

async function readLegacyCandidates(supabase: SupabaseClient, orgId: string, since: string) {
    const [cats, regs, regions, rfps] = await Promise.all([
      supabase.from("organization_categories").select("category_id").eq("organization_id", orgId),
      supabase.from("organization_regions").select("region_id").eq("organization_id", orgId),
      supabase.from("regions").select("id,slug,parent_id,country"),
      supabase
        .from("rfp_posts")
        .select("id,title,slug,deadline,region_id,province,source_type,rfp_categories(category_id)")
        .eq("status", "published")
        .eq("is_demo", false)
        .gte("published_at", since)
        .order("deadline", { ascending: true, nullsFirst: false })
        .limit(500),
    ]);
    if (cats.error || regs.error || regions.error || rfps.error) return null;
    return { categories: new Set(((cats.data ?? []) as { category_id: string }[]).map((c) => c.category_id)),
      own: ((regs.data ?? []) as { region_id: string }[]).map((r) => r.region_id),
      regionRows: (regions.data ?? []) as Region[], candidates: (rfps.data ?? []) as unknown as Row[] };
}
