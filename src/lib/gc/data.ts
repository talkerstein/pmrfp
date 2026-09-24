import { createReadClient } from "@/lib/supabase/read";
import { isSupabaseConfigured } from "@/lib/supabase/config";
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

/** A published public award notice by slug, or null if it isn't one. */
export async function getLinkableAward(slug: string | null): Promise<LinkedAward | null> {
  if (!slug || !isSupabaseConfigured()) return null;
  const { data, error } = await createReadClient().from("rfp_public").select(COLS).eq("slug", slug).maybeSingle();
  return error ? null : toLinked(data as AwardRow | null);
}

/** Region slug for a region id — to preselect the award's region on the form. */
export async function regionSlugById(id: string | null): Promise<string | null> {
  if (!id || !isSupabaseConfigured()) return null;
  const { data } = await createReadClient().from("regions").select("slug").eq("id", id).maybeSingle();
  return (data as { slug: string } | null)?.slug ?? null;
}

/** The award a package belongs to (by awarded_rfp_id). */
export async function getAwardById(id: string | null | undefined): Promise<LinkedAward | null> {
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
