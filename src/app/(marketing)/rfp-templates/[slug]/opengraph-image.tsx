/**
 * Per-template Open Graph image. Templates get shared a lot — PMs pinging
 * peers, trade associations linking to scope examples, etc. Strong preview
 * card = more clicks.
 */
import { renderOgImage, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og/template";
import { getRfpTemplate } from "@/lib/seo/rfp-templates";

export const runtime = "nodejs";
export const contentType = OG_CONTENT_TYPE;
export const size = OG_SIZE;

export default async function OG({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const t = getRfpTemplate(slug);

  if (!t) {
    return renderOgImage({
      eyebrow: "RFP template",
      title: "Template not found",
      caption: "pmrfp.com",
    });
  }

  return renderOgImage({
    eyebrow: `RFP template · ${t.tradeName}`,
    title: t.name.replace(/ RFP Template$/, ""),
    subline: t.pitch,
    caption: "Free · ready-to-post",
  });
}
