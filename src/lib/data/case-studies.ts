import { createReadClient } from "@/lib/supabase/read";
import { isSupabaseConfigured } from "@/lib/supabase/config";

/**
 * Vendor case studies — the UGC content engine. Each published study is a
 * real completed project written up by the vendor (challenge → approach →
 * outcome), moderated before publish. They deepen the gated trade×city pages
 * and give AI answer engines concrete, citable project evidence — which is
 * the AEO half of the SEO pitch.
 */
export interface CaseStudyListItem {
  slug: string;
  title: string;
  city: string | null;
  province: string | null;
  propertyType: string | null;
  challenge: string;
  publishedAt: string | null;
  orgName: string;
  orgSlug: string;
  categoryName: string | null;
  categorySlug: string | null;
  regionSlug: string | null;
}

export interface CaseStudyDetail extends CaseStudyListItem {
  id: string;
  approach: string;
  outcome: string;
  timeline: string | null;
  budgetBand: string | null;
  orgVerified: boolean;
}

interface Row {
  id: string;
  slug: string;
  title: string;
  city: string | null;
  province: string | null;
  property_type: string | null;
  challenge: string;
  approach: string;
  outcome: string;
  timeline: string | null;
  budget_band: string | null;
  published_at: string | null;
  organizations: { name: string; slug: string; verified: boolean } | null;
  trade_categories: { name: string; slug: string } | null;
  regions: { slug: string } | null;
}

const SELECT =
  "id,slug,title,city,province,property_type,challenge,approach,outcome,timeline,budget_band,published_at," +
  "organizations(name,slug,verified),trade_categories(name,slug),regions(slug)";

function toList(r: Row): CaseStudyListItem {
  return {
    slug: r.slug,
    title: r.title,
    city: r.city,
    province: r.province,
    propertyType: r.property_type,
    challenge: r.challenge,
    publishedAt: r.published_at,
    orgName: r.organizations?.name ?? "PMRFP member",
    orgSlug: r.organizations?.slug ?? "",
    categoryName: r.trade_categories?.name ?? null,
    categorySlug: r.trade_categories?.slug ?? null,
    regionSlug: r.regions?.slug ?? null,
  };
}

export async function listCaseStudies(filters?: {
  categorySlug?: string;
  regionSlug?: string;
  limit?: number;
}): Promise<CaseStudyListItem[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = createReadClient();
  const { data } = await supabase
    .from("case_studies")
    .select(SELECT)
    .eq("status", "published")
    .order("published_at", { ascending: false })
    .limit(filters?.limit ?? 60);
  let rows = ((data as unknown as Row[]) ?? []).map(toList);
  if (filters?.categorySlug) rows = rows.filter((r) => r.categorySlug === filters.categorySlug);
  if (filters?.regionSlug) rows = rows.filter((r) => r.regionSlug === filters.regionSlug);
  return rows;
}

export async function getCaseStudy(slug: string): Promise<CaseStudyDetail | null> {
  if (!isSupabaseConfigured()) return null;
  const supabase = createReadClient();
  const { data } = await supabase
    .from("case_studies")
    .select(SELECT)
    .eq("status", "published")
    .eq("slug", slug)
    .maybeSingle();
  const r = data as unknown as Row | null;
  if (!r) return null;
  return {
    ...toList(r),
    id: r.id,
    approach: r.approach,
    outcome: r.outcome,
    timeline: r.timeline,
    budgetBand: r.budget_band,
    orgVerified: r.organizations?.verified ?? false,
  };
}
