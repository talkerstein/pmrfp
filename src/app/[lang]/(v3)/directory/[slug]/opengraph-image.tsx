/**
 * Per-company Open Graph image. Leads with the company's logo (initials when it
 * has none), then its name, location and trades, so Slack/LinkedIn/X previews
 * of a directory profile show whose profile it is.
 */
import { renderCompanyOgImage, renderOgImage, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og/template";
import { companyInitials, loadOgLogo } from "@/lib/og/logo";
import { getVendor } from "@/lib/data/directory";
import { getDictionary } from "@/i18n/dictionaries";
import { hasLocale } from "@/i18n/config";
import { plural } from "@/i18n/format";
import { regionName, tradeName } from "@/i18n/terms";

export const runtime = "nodejs";
export const contentType = OG_CONTENT_TYPE;
export const size = OG_SIZE;
export const alt = "Company logo and profile on PMRFP";

export default async function OG({ params }: { params: Promise<{ lang: string; slug: string }> }) {
  const { lang, slug } = await params;
  const l = hasLocale(lang) ? lang : "en";
  const t = getDictionary(l).directory.og;
  const v = await getVendor(slug);

  if (!v) {
    return renderOgImage({
      eyebrow: t.eyebrow,
      title: t.notFound,
      caption: "pmrfp.com",
    });
  }

  const region = [v.city, v.province]
    .filter((x): x is string => Boolean(x))
    .map((x) => regionName(x, l))
    .join(", ");
  const label = v.isSupplier ? (v.verified ? t.verifiedSupplier : t.supplier) : v.verified ? t.verifiedTrade : t.trade;
  const eyebrow = region ? `${label} · ${region}` : label;
  const subline = v.categories.slice(0, 3).map((c) => tradeName(c, l)).join(" · ") || v.shortDescription || undefined;
  const caption =
    v.yearsInBusiness && v.yearsInBusiness > 0 ? plural(v.yearsInBusiness, t.years) : undefined;

  return renderCompanyOgImage({
    name: v.name,
    logo: await loadOgLogo(v.logoUrl),
    initials: companyInitials(v.name),
    eyebrow,
    subline,
    caption,
  });
}
