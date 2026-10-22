/**
 * Per-RFP Open Graph image. Renders the RFP title, region, and deadline so
 * Slack/LinkedIn/X previews of an RFP link actually communicate the opportunity.
 */
import { renderOgImage, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og/template";
import { getRfpTeaser } from "@/lib/data/rfps";
import { getDictionary } from "@/i18n/dictionaries";
import { hasLocale, type Locale } from "@/i18n/config";
import { metaBuyer, metaKindOf } from "@/lib/rfp-detail/meta";
import { cleanTenderTitle } from "@/lib/seo/rfp-meta";
import { publicTenderSource } from "@/lib/tenders/sources";
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
  // "Public tender · Ontario", "Award notice · Ontario": not "RFP" on a tender or an award.
  const dict = getDictionary(lang);
  const kind = metaKindOf(rfp);
  const eyebrow = `${dict.rfpDepth.og.kinds[kind]} · ${region}`;
  const src = rfp.sourceType === "public_source" ? publicTenderSource(rfp.slug) : null;
  const sourceCopy = src ? (dict.board.detail.sources as Record<string, { issuer?: string } | undefined>)[src.key] : undefined;
  const buyer = metaBuyer(rfp, sourceCopy?.issuer ?? src?.issuer, src?.key);
  const closes = fmtDate(rfp.deadline, lang);
  const subline = closes ? fmt(t.closes, { date: closes }) : undefined;
  const caption =
    buyer ??
    (rfp.propertyTypeName ? `${propertyTypeName(rfp.propertyTypeName, lang)}${rfp.city ? ` · ${rfp.city}` : ""}` : rfp.city ?? undefined);

  return renderOgImage({
    eyebrow,
    title: cleanTenderTitle(rfp.title),
    subline,
    caption,
  });
}
