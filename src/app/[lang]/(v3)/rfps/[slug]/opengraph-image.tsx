/**
 * Per-RFP Open Graph image. Renders the RFP title, region, and deadline so
 * Slack/LinkedIn/X previews of an RFP link actually communicate the opportunity.
 */
import { renderOgImage, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og/template";
import { getRfpTeaser } from "@/lib/data/rfps";
import { getDictionary } from "@/i18n/dictionaries";
import { hasLocale, type Locale } from "@/i18n/config";
import { fmt, formatDate } from "@/i18n/format";
import { propertyTypeName, regionName } from "@/i18n/terms";

export const runtime = "nodejs";
export const contentType = OG_CONTENT_TYPE;
export const size = OG_SIZE;

function fmtDate(d: string | null, lang: Locale): string | undefined {
  if (!d) return undefined;
  try {
    return formatDate(d, lang, {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return undefined;
  }
}

export default async function OG({ params }: { params: Promise<{ lang: string; slug: string }> }) {
  const { lang: raw, slug } = await params;
  const lang: Locale = hasLocale(raw) ? raw : "en";
  const t = getDictionary(lang).board.og;
  const rfp = await getRfpTeaser(slug);

  if (!rfp) {
    return renderOgImage({
      eyebrow: t.eyebrow,
      title: t.notFound,
      caption: "pmrfp.com",
    });
  }

  const region =
    rfp.regionName != null ? regionName(rfp.regionName, lang) : rfp.province != null ? regionName(rfp.province, lang) : t.regionFallback;
  const eyebrow = fmt(t.eyebrowRegion, { region });
  const closes = fmtDate(rfp.deadline, lang);
  const subline = closes ? fmt(t.closes, { date: closes }) : undefined;
  const caption = rfp.propertyTypeName
    ? `${propertyTypeName(rfp.propertyTypeName, lang)}${rfp.city ? ` · ${rfp.city}` : ""}`
    : rfp.city ?? undefined;

  return renderOgImage({
    eyebrow,
    title: rfp.title,
    subline,
    caption,
  });
}
