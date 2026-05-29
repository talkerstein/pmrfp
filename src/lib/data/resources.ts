import { createReadClient } from "@/lib/supabase/read";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { DEMO_RESOURCES } from "@/lib/demo-data";
import type { ResourceDetail, ResourceItem } from "@/lib/data/types";

export async function listResources(): Promise<ResourceItem[]> {
  if (!isSupabaseConfigured()) {
    return DEMO_RESOURCES.map((r) => ({
      slug: r.slug,
      title: r.title,
      excerpt: r.excerpt,
      publishedAt: r.publishedAt,
    }));
  }
  const supabase = createReadClient();
  const { data } = await supabase
    .from("resources")
    .select("slug,title,excerpt,published_at")
    .eq("status", "published")
    .order("published_at", { ascending: false });
  return ((data as { slug: string; title: string; excerpt: string | null; published_at: string | null }[] | null) ?? []).map(
    (r) => ({ slug: r.slug, title: r.title, excerpt: r.excerpt, publishedAt: r.published_at }),
  );
}

export async function getResource(slug: string): Promise<ResourceDetail | null> {
  if (!isSupabaseConfigured()) {
    const r = DEMO_RESOURCES.find((x) => x.slug === slug);
    return r
      ? {
          slug: r.slug,
          title: r.title,
          excerpt: r.excerpt,
          body: r.body,
          seoTitle: r.title,
          metaDescription: r.excerpt,
          publishedAt: r.publishedAt,
        }
      : null;
  }
  const supabase = createReadClient();
  const { data } = await supabase
    .from("resources")
    .select("slug,title,excerpt,body,seo_title,meta_description,published_at,status")
    .eq("slug", slug)
    .maybeSingle<{
      slug: string; title: string; excerpt: string | null; body: string | null;
      seo_title: string | null; meta_description: string | null; published_at: string | null; status: string;
    }>();
  if (!data || data.status !== "published") return null;
  return {
    slug: data.slug,
    title: data.title,
    excerpt: data.excerpt,
    body: data.body,
    seoTitle: data.seo_title,
    metaDescription: data.meta_description,
    publishedAt: data.published_at,
  };
}
