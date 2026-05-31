/**
 * Per-RFP Open Graph image. Renders the RFP title, region, and deadline so
 * Slack/LinkedIn/X previews of an RFP link actually communicate the opportunity.
 */
import { renderOgImage, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og/template";
import { getRfpTeaser } from "@/lib/data/rfps";

export const runtime = "nodejs";
export const contentType = OG_CONTENT_TYPE;
export const size = OG_SIZE;

function fmtDate(d: string | null): string | undefined {
  if (!d) return undefined;
  try {
    return new Date(d).toLocaleDateString("en-CA", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return undefined;
  }
}

export default async function OG({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const rfp = await getRfpTeaser(slug);

  if (!rfp) {
    return renderOgImage({
      eyebrow: "RFP",
      title: "Opportunity not found",
      caption: "pmrfp.com",
    });
  }

  const region = rfp.regionName ?? rfp.province ?? "Canada";
  const eyebrow = `RFP · ${region}`;
  const closes = fmtDate(rfp.deadline);
  const subline = closes ? `Closes ${closes}` : undefined;
  const caption = rfp.propertyTypeName
    ? `${rfp.propertyTypeName}${rfp.city ? ` · ${rfp.city}` : ""}`
    : rfp.city ?? undefined;

  return renderOgImage({
    eyebrow,
    title: rfp.title,
    subline,
    caption,
  });
}
