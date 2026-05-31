/**
 * Per-cost-guide Open Graph image. Cost-guide pages target high-intent search
 * traffic ("commercial roof replacement cost") — strong preview card drives
 * social shares from researchers + procurement folks.
 */
import { renderOgImage, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og/template";
import { COST_GUIDES } from "@/lib/seo/cost-guides";

export const runtime = "nodejs";
export const contentType = OG_CONTENT_TYPE;
export const size = OG_SIZE;

export default async function OG({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const g = COST_GUIDES.find((c) => c.slug === slug);

  if (!g) {
    return renderOgImage({
      eyebrow: "Cost guide",
      title: "Cost guide not found",
      caption: "pmrfp.com",
    });
  }

  return renderOgImage({
    eyebrow: `Cost guide · ${g.tradeName}`,
    title: g.name,
    subline: `Typical range: ${g.typicalRange}`,
    caption: g.rangeUnit,
  });
}
