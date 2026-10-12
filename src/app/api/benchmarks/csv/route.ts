import { benchmarkCsv } from "@/lib/data/price-benchmarks";
import { loadBenchmark } from "@/lib/data/price-benchmarks-load";
import { hasActiveTradeAccess } from "@/lib/access/access";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { SITE } from "@/lib/site";

/**
 * /api/benchmarks/csv?trade=<slug>&province=<slug>: every award behind a price
 * benchmark, for Trade Pro members only (same gate as the RFP dashboard).
 */
const text = (body: string, status: number) =>
  new Response(body, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "X-Robots-Tag": "noindex", "Cache-Control": "private, no-store" } });

export async function GET(req: Request) {
  const url = new URL(req.url);
  const trade = url.searchParams.get("trade") ?? "";
  const province = url.searchParams.get("province") ?? "";
  if (isSupabaseConfigured() && !(await hasActiveTradeAccess())) return text("Trade Pro required\n", 403);
  const r = await loadBenchmark(trade, province);
  if (!r) return text("Not found\n", 404);
  return new Response(benchmarkCsv(r.benchmark, SITE.url.replace(/\/$/, "")), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="pmrfp-price-benchmark-${r.category.slug}-${province.replace(/[^a-z0-9-]/gi, "")}.csv"`,
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}
