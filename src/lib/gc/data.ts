import { createReadClient } from "@/lib/supabase/read";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { isVpsLiveCustomerAuth } from "@/lib/d1/staging-config";
import { vpsAppDatabase } from "@/lib/d1/http-binding";
import type { D1Binding } from "@/lib/d1/contracts";
import { customerAppAuthority } from "../../../workers/d1-api/customer-signup";
import { parseAward } from "@/lib/data/fomo";
import { GC_PACKAGE, isLinkableAward } from "@/lib/gc/packages";

/**
 * Public reads that tie GC packages to the award notices they came from. All
 * go through the rfp_public view, and every one returns "nothing" on error —
 * before migration 20260924000002 the package columns don't exist, and a page
 * must never fail because of that.
 */

export interface LinkedAward {
  id: string;
  slug: string;
  title: string;
  winner: string | null;
  value: string | null;
  regionId: string | null;
  province: string | null;
}

interface AwardRow {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  source_type: string | null;
  region_id: string | null;
  province: string | null;
}

function toLinked(r: AwardRow | null): LinkedAward | null {
  if (!r || !isLinkableAward({ slug: r.slug, sourceType: r.source_type })) return null;
  const { winner, value } = parseAward(r.summary);
  return { id: r.id, slug: r.slug, title: r.title, winner, value, regionId: r.region_id, province: r.province };
}

const COLS = "id,slug,title,summary,source_type,region_id,province";
const publicRfp = `status='published' AND is_demo=0 AND ${customerAppAuthority}`;

export async function readNativeAward(value: string, field: "id" | "slug", db: D1Binding = vpsAppDatabase()) {
  const row = await db.prepare(`SELECT ${COLS} FROM rfp_posts WHERE ${field}=? AND source_type='public_source' AND ${publicRfp}`)
    .bind(value).first<AwardRow>();
  return toLinked(row);
}

/** A published public award notice by slug, or null if it isn't one. */
export async function getLinkableAward(slug: string | null): Promise<LinkedAward | null> {
  if (slug && isVpsLiveCustomerAuth()) return readNativeAward(slug,"slug").catch(() => null);
  if (!slug || !isSupabaseConfigured()) return null;
  const { data, error } = await createReadClient().from("rfp_public").select(COLS).eq("slug", slug).maybeSingle();
  return error ? null : toLinked(data as AwardRow | null);
}

/** Region slug for a region id — to preselect the award's region on the form. */
export async function regionSlugById(id: string | null): Promise<string | null> {
  if (id && isVpsLiveCustomerAuth()) {
    const row = await vpsAppDatabase().prepare(`SELECT slug FROM regions WHERE id=? AND ${customerAppAuthority}`)
      .bind(id).first<{slug:string}>().catch(() => null);
    return row?.slug ?? null;
  }
  if (!id || !isSupabaseConfigured()) return null;
  const { data } = await createReadClient().from("regions").select("slug").eq("id", id).maybeSingle();
  return (data as { slug: string } | null)?.slug ?? null;
}

/** The award a package belongs to (by awarded_rfp_id). */
export async function getAwardById(id: string | null | undefined): Promise<LinkedAward | null> {
  if (id && isVpsLiveCustomerAuth()) return readNativeAward(id,"id").catch(() => null);
  if (!id || !isSupabaseConfigured()) return null;
  const { data, error } = await createReadClient().from("rfp_public").select(COLS).eq("id", id).maybeSingle();
  return error ? null : toLinked(data as AwardRow | null);
}

export interface AwardPackage {
  slug: string;
  title: string;
  deadline: string | null;
}

/** Published sub-trade packages posted against one award notice. */
export async function listPackagesForAward(awardSlug: string): Promise<AwardPackage[]> {
  if (isVpsLiveCustomerAuth()) return readNativePackages([awardSlug],20).catch(() => []);
  if (!isSupabaseConfigured()) return [];
  const supabase = createReadClient();
  const { data: award } = await supabase.from("rfp_public").select("id").eq("slug", awardSlug).maybeSingle();
  const id = (award as { id: string } | null)?.id;
  if (!id) return [];
  const { data, error } = await supabase
    .from("rfp_public")
    .select("slug,title,deadline")
    .eq("source_type", GC_PACKAGE)
    .eq("awarded_rfp_id", id)
    .order("deadline", { ascending: true })
    .limit(20);
  return error || !data ? [] : (data as AwardPackage[]);
}

export interface AwardSlugPackage extends AwardPackage {
  /** Slug of the award notice the package was posted against. */
  awardSlug: string;
}

export async function readNativePackages(slugs: string[], limit: number, db: D1Binding = vpsAppDatabase()): Promise<AwardSlugPackage[]> {
  const awards = [...new Set(slugs)].filter((slug) => isLinkableAward({slug,sourceType:"public_source"})).slice(0,150);
  if (!awards.length) return [];
  const rows = await db.prepare(`SELECT p.slug,p.title,p.deadline,a.slug AS awardSlug FROM rfp_posts p
    JOIN rfp_posts a ON a.id=p.awarded_rfp_id WHERE p.source_type=? AND p.status='published' AND p.is_demo=0
      AND a.source_type='public_source' AND a.status='published' AND a.is_demo=0 AND ${customerAppAuthority}
      AND a.slug IN (SELECT value FROM json_each(?)) ORDER BY p.deadline IS NULL,p.deadline,p.slug LIMIT ?`)
    .bind(GC_PACKAGE,JSON.stringify(awards),limit).all<AwardSlugPackage>();
  return rows.results;
}

/**
 * Published sub-trade packages posted against any of these award notices —
 * for a contractor's profile, which lists several awards. Empty on any error.
 */
export async function listPackagesForAwardSlugs(awardSlugs: string[]): Promise<AwardSlugPackage[]> {
  if (isVpsLiveCustomerAuth()) return readNativePackages(awardSlugs,50).catch(() => []);
  if (!awardSlugs.length || !isSupabaseConfigured()) return [];
  const supabase = createReadClient();
  const { data: awards, error } = await supabase.from("rfp_public").select("id,slug").in("slug", awardSlugs.slice(0, 150));
  if (error || !awards?.length) return [];
  const slugById = new Map((awards as { id: string; slug: string }[]).map((a) => [a.id, a.slug]));
  const { data, error: pkgErr } = await supabase
    .from("rfp_public")
    .select("slug,title,deadline,awarded_rfp_id")
    .eq("source_type", GC_PACKAGE)
    .in("awarded_rfp_id", [...slugById.keys()])
    .order("deadline", { ascending: true })
    .limit(50);
  if (pkgErr || !data) return [];
  return (data as (AwardPackage & { awarded_rfp_id: string })[]).map((p) => ({
    slug: p.slug,
    title: p.title,
    deadline: p.deadline,
    awardSlug: slugById.get(p.awarded_rfp_id) ?? "",
  }));
}
