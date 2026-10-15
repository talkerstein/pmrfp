import { winnerFacts } from "@/lib/badge/winner-facts";
import { parseBadgeLang, renderWinnerBadge } from "@/lib/badge/svg";
import { badgeResponse } from "@/lib/badge/respond";

// No `dynamic = "force-dynamic"`: it would switch off the data cache behind the
// board snapshot. Reading the Referer header already makes every request run.

/**
 * "Public contract winner · N public awards · years" for a contract-winner
 * page. The count and years are the published award notices on PMRFP, nothing
 * else; an unknown slug gets the plain PMRFP seal.
 */
export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const url = new URL(request.url);
  const theme = url.searchParams.get("theme") === "dark" ? "dark" : "light";
  const lang = parseBadgeLang(url.searchParams.get("lang"));
  const facts = await winnerFacts(slug).catch(() => null);
  const svg = renderWinnerBadge(
    { found: Boolean(facts), awards: facts?.awards ?? 0, from: facts?.from ?? null, to: facts?.to ?? null },
    theme,
    lang,
  );
  return badgeResponse(request, "winner", slug, svg, Boolean(facts));
}
