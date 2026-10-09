import { cache } from "react";
import { createReadClient } from "@/lib/supabase/read";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { isOwnPhotoUrl } from "@/lib/projects/photos";
import { isSchemaMissing } from "@/lib/projects/compat";
import type { GalleryItem } from "@/lib/projects/gallery";

/**
 * Public reads for the /projects gallery: every PUBLIC published project,
 * newest first. Trade / region / company filters run in memory (they are
 * joined slugs), over a window wide enough for this stage of the site.
 * Before the portfolio migration there's no visibility column and every
 * published project is public, so the query steps back one migration at a
 * time instead of failing.
 */

const WINDOW = 500;

interface Row {
  slug: string;
  title: string;
  city: string | null;
  province: string | null;
  published_at: string | null;
  summary?: string | null;
  hero_url?: string | null;
  client_type?: string | null;
  scope?: string | null;
  organizations: { name: string; slug: string; verified: boolean } | null;
  trade_categories: { name: string; slug: string } | null;
  regions: { name: string; slug: string } | null;
}

const BASE =
  "slug,title,city,province,published_at," +
  "organizations(name,slug,verified),trade_categories(name,slug),regions(name,slug)";

export const listPublicProjects = cache(async function listPublicProjects(): Promise<GalleryItem[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = createReadClient();
  const run = (cols: string, publicOnly: boolean) => {
    let q = supabase.from("case_studies").select(cols).eq("status", "published");
    if (publicOnly) q = q.eq("visibility", "public");
    return q.order("published_at", { ascending: false }).limit(WINDOW);
  };
  try {
    let { data, error } = await run(`${BASE},summary,hero_url,client_type,scope`, true);
    if (isSchemaMissing(error)) ({ data, error } = await run(`${BASE},summary,hero_url`, false));
    if (isSchemaMissing(error)) ({ data, error } = await run(BASE, false));
    if (error || !data) return [];
    const sb = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
    return (data as unknown as Row[])
      // A project whose company isn't publicly listed (RLS hides the org) has no profile to link to.
      .filter((r) => r.organizations?.slug)
      .map((r) => ({
        slug: r.slug,
        title: r.title,
        summary: r.summary?.trim() || null,
        city: r.city,
        province: r.province,
        heroUrl: r.hero_url && isOwnPhotoUrl(r.hero_url, sb) ? r.hero_url : null,
        publishedAt: r.published_at,
        orgName: r.organizations!.name,
        orgSlug: r.organizations!.slug,
        orgVerified: r.organizations!.verified,
        categoryName: r.trade_categories?.name ?? null,
        categorySlug: r.trade_categories?.slug ?? null,
        regionName: r.regions?.name ?? null,
        regionSlug: r.regions?.slug ?? null,
        clientType: r.client_type ?? null,
        isCaseStudy: Boolean(r.client_type && r.scope?.trim()),
      }));
  } catch {
    return [];
  }
});
