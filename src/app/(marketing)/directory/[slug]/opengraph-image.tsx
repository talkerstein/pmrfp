/**
 * Per-vendor Open Graph image. Renders the trade's name, location, and trades
 * so Slack/LinkedIn/X previews of a directory profile look pro and communicate
 * what the company does. Reuses the shared brand OG template.
 */
import { renderOgImage, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og/template";
import { getVendor } from "@/lib/data/directory";

export const runtime = "nodejs";
export const contentType = OG_CONTENT_TYPE;
export const size = OG_SIZE;
export const alt = "Trade profile on PMRFP";

export default async function OG({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const v = await getVendor(slug);

  if (!v) {
    return renderOgImage({
      eyebrow: "PMRFP Directory",
      title: "Trade not found",
      caption: "pmrfp.com",
    });
  }

  const region = [v.city, v.province].filter(Boolean).join(", ") || "Ontario";
  const eyebrow = `${v.verified ? "Verified trade" : "Trade"} · ${region}`;
  const subline = v.categories.slice(0, 3).join(" · ") || v.shortDescription || undefined;
  const caption =
    v.yearsInBusiness && v.yearsInBusiness > 0 ? `${v.yearsInBusiness} years in business` : undefined;

  return renderOgImage({ eyebrow, title: v.name, subline, caption });
}
