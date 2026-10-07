/**
 * Share card for /sign-up — the link Rishon blasts to trades over WhatsApp.
 * Bold, audience-neutral (image routes can't read query params), with the
 * free/no-card promise front and centre. Reuses the brand OG template.
 * Per language, like the default card in app/[lang]/opengraph-image.
 */
import { renderOgImage, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og/template";
import { getDictionary } from "@/i18n/dictionaries";
import { hasLocale } from "@/i18n/config";

export const runtime = "nodejs";
export const contentType = OG_CONTENT_TYPE;
export const size = OG_SIZE;
export const alt = "Join PMRFP — free, no credit card";

export default async function OG({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  const t = getDictionary(hasLocale(lang) ? lang : "en").auth.og;
  return renderOgImage({
    eyebrow: t.eyebrow,
    title: t.title,
    subline: t.subline,
    caption: t.caption,
  });
}
