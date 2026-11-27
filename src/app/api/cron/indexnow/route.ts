import { NextResponse } from "next/server";
import { createReadClient } from "@/lib/supabase/read";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { submitIndexNow } from "@/lib/seo/indexnow";
import { vpsAppDatabase } from "@/lib/d1/http-binding";
import { isVpsLiveCustomerAuth } from "@/lib/d1/staging-config";

export const maxDuration = 30;

/**
 * Daily IndexNow ping (Vercel cron, after the Canadian and U.S. tender imports).
 * Sends the RFP pages published in the last ~26 hours that are still open,
 * plus the hubs that list them, so Bing and friends recrawl them today.
 * Only open, non-demo tenders: closed ones are noindexed (isIndexableRfp).
 * `?dry=1` lists the URLs without sending. Protect with CRON_SECRET if set.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const native = isVpsLiveCustomerAuth();
  if (!native && !isSupabaseConfigured()) return NextResponse.json({ skipped: "no supabase" });

  const params = new URL(request.url).searchParams;
  const hours = Math.min(Math.max(Number(params.get("hours")) || 26, 1), 24 * 14);
  const since = new Date(Date.now() - hours * 3600_000).toISOString();
  const today = new Date().toISOString().slice(0, 10);

  let rows: { slug: string }[];
  if (native) {
    try {
      const result = await vpsAppDatabase().prepare(`SELECT slug FROM rfp_posts
        WHERE status='published' AND is_demo=0 AND julianday(published_at)>=julianday(?)
          AND (deadline IS NULL OR deadline>=?) ORDER BY published_at DESC,id LIMIT 5000`)
        .bind(since, today).all<{ slug: string }>();
      rows = result.results;
    } catch {
      return NextResponse.json({ error: "Tender index unavailable" }, { status: 503 });
    }
  } else {
    const { data, error } = await createReadClient()
      .from("rfp_public")
      .select("slug")
      .eq("is_demo", false)
      .gte("published_at", since)
      .or(`deadline.is.null,deadline.gte.${today}`)
      .limit(5000);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    rows = data ?? [];
  }

  const slugs = rows.map(row => row.slug);
  const urls = slugs.length ? ["/", "/rfps", ...slugs.map((s) => `/rfps/${s}`)] : [];
  if (params.get("dry") === "1") return NextResponse.json({ count: urls.length, urls });

  const result = await submitIndexNow(urls);
  return NextResponse.json(result);
}
