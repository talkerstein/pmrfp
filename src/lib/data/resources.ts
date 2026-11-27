import { createReadClient } from "@/lib/supabase/read";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { DEMO_RESOURCES } from "@/lib/demo-data";
import type { ResourceDetail, ResourceItem } from "@/lib/data/types";
import { vpsAppDatabase } from "@/lib/d1/http-binding";
import { isVpsLiveCustomerAuth } from "@/lib/d1/staging-config";
import { readD1 } from "@/lib/lifecycle/d1";

type PublicResource = { slug: string; title: string; excerpt: string | null; published_at: string | null };
type PublicDetail = PublicResource & { body: string | null; seo_title: string | null; meta_description: string | null };

export async function listResources(): Promise<ResourceItem[]> {
  if (isVpsLiveCustomerAuth()) {
    const data = await readD1<PublicResource>(vpsAppDatabase(), `SELECT slug,title,excerpt,published_at FROM resources
      WHERE status='published' AND is_demo=0 ORDER BY published_at DESC,slug LIMIT 1000`);
    return data.map((r) => ({ slug: r.slug, title: r.title, excerpt: r.excerpt, publishedAt: r.published_at }));
  }
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
  if (isVpsLiveCustomerAuth()) {
    const data = await vpsAppDatabase().prepare(`SELECT slug,title,excerpt,body,seo_title,meta_description,published_at
      FROM resources WHERE slug=? AND status='published' AND is_demo=0`).bind(slug).first<PublicDetail>();
    return data ? { slug: data.slug, title: data.title, excerpt: data.excerpt, body: data.body, seoTitle: data.seo_title,
      metaDescription: data.meta_description, publishedAt: data.published_at } : null;
  }
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
