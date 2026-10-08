import { monthCsv } from "@/lib/data/monthly-winners";
import { loadMonthReport } from "@/lib/data/monthly-winners-load";
import { SITE } from "@/lib/site";

export const revalidate = 86400;

/**
 * /reports/contract-winners/<yyyy-mm>.csv (rewritten here by the proxy): the
 * month's award table for journalists. Individuals are never named; each row
 * carries its source licence.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ month: string }> }) {
  const { month } = await params;
  const r = await loadMonthReport(month);
  if (!r) {
    return new Response("Not found\n", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8", "X-Robots-Tag": "noindex" },
    });
  }
  return new Response(monthCsv(r, SITE.url.replace(/\/$/, "")), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="pmrfp-contract-winners-${month}.csv"`,
      "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=86400",
    },
  });
}
