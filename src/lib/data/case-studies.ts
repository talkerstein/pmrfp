import { createReadClient } from "@/lib/supabase/read";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { sanitizeResults, type CaseStudyResult } from "@/lib/projects/case-study";
import { normalizeVisibility, type Visibility } from "@/lib/projects/visibility";
import { isSchemaMissing } from "@/lib/projects/compat";

/**
 * Vendor case studies — the UGC content engine. Each published study is a
 * real completed project written up by the vendor (challenge → approach →
 * outcome), moderated before publish. They deepen the gated trade×city pages
 * and give AI answer engines concrete, citable project evidence — which is
 * the AEO half of the SEO pitch.
 *
 * Visibility (migration 20261009000002): lists only ever show PUBLIC
 * studies. An unlisted study still opens by its slug (noindexed); a private
 * one never reaches the anon client at all. Before the migration there is
 * no visibility column, every study is public, and each query retries
 * without the new columns.
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
  organizationId: string;
  approach: string;
  outcome: string;
  timeline: string | null;
  budgetBand: string | null;
  orgVerified: boolean;
  regionName: string | null;
  visibility: Visibility;
  clientType: string | null;
  scope: string | null;
  results: CaseStudyResult[];
  startedOn: string | null;
  completedOn: string | null;
  updatedAt: string | null;
  aiAssisted: boolean;
}

interface Row {
  id: string;
  organization_id?: string;
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
  updated_at?: string | null;
  visibility?: string | null;
  client_type?: string | null;
  scope?: string | null;
  results?: unknown;
  started_on?: string | null;
  ai_assisted?: boolean | null;
  completed_on?: string | null;
  organizations: { name: string; slug: string; verified: boolean } | null;
  trade_categories: { name: string; slug: string } | null;
  regions: { slug: string; name?: string } | null;
}

const SELECT =
  "id,organization_id,slug,title,city,province,property_type,challenge,approach,outcome,timeline,budget_band,published_at,updated_at," +
  "organizations(name,slug,verified),trade_categories(name,slug),regions(slug,name)";
/** Builder columns from migration 20261009000002. */
export const BUILDER_COLS = "visibility,client_type,scope,results,started_on,completed_on,ai_assisted";

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

export function toDetail(r: Row): CaseStudyDetail {
  return {
    ...toList(r),
    id: r.id,
    organizationId: r.organization_id ?? "",
    approach: r.approach,
    outcome: r.outcome,
    timeline: r.timeline,
    budgetBand: r.budget_band,
    orgVerified: r.organizations?.verified ?? false,
    regionName: r.regions?.name ?? null,
    visibility: normalizeVisibility(r.visibility),
    clientType: r.client_type ?? null,
    scope: r.scope?.trim() || null,
    results: sanitizeResults(r.results),
    startedOn: r.started_on ?? null,
    completedOn: r.completed_on ?? null,
    updatedAt: r.updated_at ?? null,
    aiAssisted: Boolean(r.ai_assisted),
  };
}

export async function listCaseStudies(filters?: {
  categorySlug?: string;
  regionSlug?: string;
  limit?: number;
}): Promise<CaseStudyListItem[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = createReadClient();
  const filtered = Boolean(filters?.categorySlug || filters?.regionSlug);
  const limit = filters?.limit ?? 60;
  const run = (publicOnly: boolean) => {
    let q = supabase.from("case_studies").select(SELECT).eq("status", "published");
    if (publicOnly) q = q.eq("visibility", "public");
    return (
      q
        .order("published_at", { ascending: false })
        // Trade / region are filtered below (they're joined slugs), so a filtered
        // call reads a wider window first. Limiting before the filter would only
        // ever match among the newest few studies site-wide.
        .limit(filtered ? 500 : limit)
    );
  };
  let { data, error } = await run(true);
  // Pre-migration: no visibility column, so every study is public.
  if (isSchemaMissing(error)) ({ data, error } = await run(false));
  if (error) return [];
  let rows = ((data as unknown as Row[]) ?? []).map(toList);
  if (filters?.categorySlug) rows = rows.filter((r) => r.categorySlug === filters.categorySlug);
  if (filters?.regionSlug) rows = rows.filter((r) => r.regionSlug === filters.regionSlug);
  return rows.slice(0, limit);
}

/**
 * One study by slug, for its page. Public or unlisted (RLS keeps private
 * studies from this anon client); the page noindexes unlisted ones.
 */
export async function getCaseStudy(slug: string): Promise<CaseStudyDetail | null> {
  if (!isSupabaseConfigured()) return null;
  const supabase = createReadClient();
  const run = (cols: string) =>
    supabase.from("case_studies").select(cols).eq("status", "published").eq("slug", slug).maybeSingle();
  let { data, error } = await run(`${SELECT},${BUILDER_COLS}`);
  if (isSchemaMissing(error)) ({ data, error } = await run(SELECT));
  const r = data as unknown as Row | null;
  if (error || !r) return null;
  // Belt and braces: never render a private row from the public route.
  if (normalizeVisibility(r.visibility) === "private") return null;
  return toDetail(r);
}
