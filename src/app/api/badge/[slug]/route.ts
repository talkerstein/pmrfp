import { getBadgeInfo } from "@/lib/badge/data";
import { renderListedBadge } from "@/lib/badge/svg";
import { badgeResponse } from "@/lib/badge/respond";

// No `dynamic = "force-dynamic"`: it would switch off the data cache for the read
// below. Reading the Referer header already makes every request run.

/** "Listed on / ✓ Verified on PMRFP" for a directory company. Unknown slugs get the plain seal. */
export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const url = new URL(request.url);
  const theme = url.searchParams.get("theme") === "dark" ? "dark" : "light";
  const variant = url.searchParams.get("variant") === "compact" ? "compact" : "standard";
  const info = await getBadgeInfo(slug).catch(() => null);
  const svg = renderListedBadge(info?.tier ?? { label: "Listed Vendor", verified: false, insured: false }, Boolean(info?.found), theme, variant);
  return badgeResponse(request, "listed", slug, svg, Boolean(info?.found));
}
