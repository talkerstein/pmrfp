import { NextResponse } from "next/server";
import { createReadClient } from "@/lib/supabase/read";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { submitIndexNow } from "@/lib/seo/indexnow";

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
  if (!isSupabaseConfigured()) return NextResponse.json({ skipped: "no supabase" });

  const params = new URL(request.url).searchParams;
  const hours = Math.min(Math.max(Number(params.get("hours")) || 26, 1), 24 * 14);
  const since = new Date(Date.now() - hours * 3600_000).toISOString();
  const today = new Date().toISOString().slice(0, 10);

  const { data, error } = await createReadClient()
    .from("rfp_public")
    .select("slug")
    .eq("is_demo", false)
    .gte("published_at", since)
    .or(`deadline.is.null,deadline.gte.${today}`)
    .limit(5000);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const slugs = (data ?? []).map((r: { slug: string }) => r.slug);
  const urls = slugs.length ? ["/", "/rfps", ...slugs.map((s) => `/rfps/${s}`)] : [];
  if (params.get("dry") === "1") return NextResponse.json({ count: urls.length, urls });

  const result = await submitIndexNow(urls);
  return NextResponse.json(result);
}
